-- Staff on jobs + payment plans (20261114000100_team_payment_plans.sql): only the company's own people can be
-- put on a job, crew leads can't change the team, instalment invoices, pay methods, the public plan (upcoming
-- parts without a pay link), cash to the crew (own jobs only, never more than owing), tenant isolation.
--   psql -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/team_plan_test.sql
-- Every check raises on failure; a clean run ends with TEAM + PLAN TESTS PASSED.
\set QUIET on
begin;

select gen_random_uuid() as ua, gen_random_uuid() as ub, gen_random_uuid() as uc, gen_random_uuid() as ux \gset
insert into auth.users (id, email) values
  (:'ua', 'tp-owner-' || :'ua' || '@test.dev'), (:'ub', 'tp-crew-' || :'ub' || '@test.dev'),
  (:'uc', 'tp-office-' || :'uc' || '@test.dev'), (:'ux', 'tp-other-' || :'ux' || '@test.dev');

create temp table ids (k text primary key, v uuid);
create temp table t (k text primary key, v text);
grant all on ids, t to authenticated, anon;
insert into ids values ('ux', :'ux');

set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ux', true);
insert into ids values ('x_org', public.create_organization('Other Roofing', 'X'));
select null from set_config('request.jwt.claim.sub', :'ua', true);
insert into ids values ('a_org', public.create_organization('Augusta Roofing', 'A'));
insert into crews (org_id, name) select v, 'Crew A' from ids where k = 'a_org' returning id \gset crew_
insert into crews (org_id, name) select v, 'Crew B' from ids where k = 'a_org' returning id \gset crewb_
insert into customers (org_id, name, state) select v, 'Pat Sample', 'QLD' from ids where k = 'a_org' returning id \gset cust_
insert into jobs (org_id, customer_id, title, state, crew_id) select (select v from ids where k = 'a_org'), :'cust_id', 'New roof', 'QLD', :'crew_id' returning id, public_token \gset job_
insert into jobs (org_id, customer_id, title, state, crew_id) select (select v from ids where k = 'a_org'), :'cust_id', 'Other roof', 'QLD', :'crewb_id' returning id \gset job2_

-- People: a crew lead on Crew A and an office member.
reset role;
insert into memberships (org_id, user_id, role, full_name, crew_id) select v, :'ub', 'crew_lead', 'Matt Ryan', :'crew_id' from ids where k = 'a_org';
insert into memberships (org_id, user_id, role, full_name) select v, :'uc', 'member', 'Sarah Lee' from ids where k = 'a_org';
set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ua', true);

-- 1. Team: add office + crew lead; someone from another company is refused.
insert into job_members (org_id, job_id, user_id, role, added_by) select v, :'job_id', :'uc', 'office', :'ua' from ids where k = 'a_org';
insert into job_members (org_id, job_id, user_id, role) select v, :'job_id', :'ub', 'crew_lead' from ids where k = 'a_org';
do $$ begin
  begin
    insert into job_members (org_id, job_id, user_id, role)
      select (select v from ids where k = 'a_org'), (select id from jobs where title = 'New roof'), (select v from ids where k = 'ux'), 'crew';
    raise exception 'outsider added to a job';
  exception when raise_exception then
    if sqlerrm not like '%not on this company%' then raise; end if;
  end;
  begin
    insert into job_members (org_id, job_id, user_id, role)
      select (select v from ids where k = 'a_org'), (select id from jobs where title = 'New roof'), (select user_id from memberships where role = 'member' and org_id = (select v from ids where k = 'a_org')), 'boss';
    raise exception 'bad role accepted';
  exception when check_violation or unique_violation then null;
  end;
end $$;
do $$ begin
  if (select count(*) from job_members where job_id = (select id from jobs where title = 'New roof')) <> 2 then raise exception 'team count'; end if;
end $$;

-- 2. Crew lead can see the team but not change it.
select null from set_config('request.jwt.claim.sub', :'ub', true);
do $$ begin
  if (select count(*) from job_members) <> 2 then raise exception 'crew lead cannot see the team'; end if;
  delete from job_members where role = 'office';
  if (select count(*) from job_members) <> 2 then raise exception 'crew lead removed someone'; end if;
  begin
    insert into job_members (org_id, job_id, user_id, role)
      select org_id, id, (select user_id from memberships where role = 'owner' and org_id = jobs.org_id), 'sales' from jobs where title = 'Other roof';
    raise exception 'crew lead added someone';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 3. Other company sees nothing.
select null from set_config('request.jwt.claim.sub', :'ux', true);
do $$ begin
  if (select count(*) from job_members) <> 0 then raise exception 'team leaked to another company'; end if;
end $$;

-- 4. Payment plan: deposit (issued) + instalment (draft, due on a date); pay methods.
select null from set_config('request.jwt.claim.sub', :'ua', true);
insert into invoices (org_id, job_id, kind, milestone_label, milestone_trigger, status, amounts_include_gst, tax_rate)
  select v, :'job_id', 'deposit', 'Deposit', 'signed', 'sent', true, 10 from ids where k = 'a_org' returning id, public_token \gset dep_
insert into invoice_items (org_id, invoice_id, description, quantity, unit_price) select v, :'dep_id', 'Deposit (5%)', 1, 1000 from ids where k = 'a_org';
insert into invoices (org_id, job_id, kind, milestone_label, milestone_trigger, due_date, status, amounts_include_gst, tax_rate)
  select v, :'job_id', 'instalment', 'Instalment 1 of 3', 'date', date '2026-12-20', 'draft', true, 10 from ids where k = 'a_org' returning id \gset inst_
insert into invoice_items (org_id, invoice_id, description, quantity, unit_price) select v, :'inst_id', 'Instalment 1 of 3', 1, 500 from ids where k = 'a_org';
do $$ begin
  begin
    update invoices set milestone_trigger = 'whenever' where kind = 'instalment';
    raise exception 'bad trigger accepted';
  exception when check_violation then null;
  end;
  begin
    update jobs set pay_methods = array['bitcoin'] where title = 'New roof';
    raise exception 'bad pay method accepted';
  exception when check_violation then null;
  end;
  begin
    update jobs set pay_methods = array[]::text[] where title = 'New roof';
    raise exception 'empty pay methods accepted';
  exception when check_violation then null;
  end;
end $$;

-- 5. Public plan: by job token and by invoice token; upcoming draft has no link.
set local role anon;
select public.get_public_payment_plan(:'job_public_token') as plan \gset
select public.get_public_payment_plan(:'dep_public_token') as plan2 \gset
insert into t values ('plan', :'plan'), ('plan2', :'plan2');
do $$
declare p jsonb := (select v::jsonb from t where k = 'plan');
begin
  if jsonb_array_length(p->'parts') <> 2 then raise exception 'plan parts: %', p; end if;
  if p->'parts'->1->>'public_token' is not null then raise exception 'draft part has a pay link'; end if;
  if p->'parts'->0->>'public_token' is null then raise exception 'issued part has no pay link'; end if;
  if (p->'parts'->1->>'total')::numeric <> 500 or p->'parts'->1->>'kind' <> 'instalment' then raise exception 'instalment wrong'; end if;
  if p->'methods' <> '["bank", "card", "cash"]'::jsonb then raise exception 'methods: %', p->'methods'; end if;
  if (select v::jsonb from t where k = 'plan2') <> p then raise exception 'invoice token gives a different plan'; end if;
  if public.get_public_payment_plan('nope') is not null then raise exception 'unknown token returned a plan'; end if;
end $$;

-- 6. Cash: crew lead on their own job; not more than owing; not on drafts; not on other crews' jobs; not when cash is off.
set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ub', true);
do $$
declare dep uuid := (select id from invoices where kind = 'deposit'); inst uuid := (select id from invoices where kind = 'instalment');
begin
  begin perform public.record_cash_payment(dep, 1000.01); raise exception 'overpaid'; exception when raise_exception then if sqlerrm not like '%still owing%' then raise; end if; end;
  begin perform public.record_cash_payment(inst, 10); raise exception 'paid a draft'; exception when raise_exception then if sqlerrm not like '%issued%' then raise; end if; end;
  perform public.record_cash_payment(dep, 400, null);
  if (select status from invoices where id = dep) <> 'partial' then raise exception 'cash did not make the deposit partial'; end if;
  if (select method from payments where invoice_id = dep) <> 'cash' then raise exception 'method not cash'; end if;
  if (select reference from payments where invoice_id = dep) <> 'Cash to Matt Ryan' then raise exception 'reference: %', (select reference from payments where invoice_id = dep); end if;
end $$;
select null from set_config('request.jwt.claim.sub', :'ua', true);
insert into invoices (org_id, job_id, kind, status, amounts_include_gst, tax_rate) select v, :'job2_id', 'standard', 'sent', true, 10 from ids where k = 'a_org' returning id \gset other_
insert into invoice_items (org_id, invoice_id, description, quantity, unit_price) select v, :'other_id', 'Repair', 1, 300 from ids where k = 'a_org';
select null from set_config('request.jwt.claim.sub', :'ub', true);
do $$ begin
  begin perform public.record_cash_payment((select id from invoices where kind = 'standard'), 50); raise exception 'cash on another crew''s job'; exception when raise_exception then if sqlerrm not like '%Not your job%' then raise; end if; end;
end $$;
select null from set_config('request.jwt.claim.sub', :'ua', true);
update jobs set pay_methods = array['bank'] where title = 'New roof';
do $$ begin
  begin perform public.record_cash_payment((select id from invoices where kind = 'deposit'), 10); raise exception 'cash when off'; exception when raise_exception then if sqlerrm not like '%Cash isn%' then raise; end if; end;
end $$;
select null from set_config('request.jwt.claim.sub', :'ux', true);
do $$ begin
  begin perform public.record_cash_payment((select id from invoices limit 1), 10); raise exception 'outsider recorded cash'; exception when raise_exception then if sqlerrm not like '%not issued%' and sqlerrm not like '%issued%' and sqlerrm not like '%Not allowed%' then raise; end if; end;
end $$;

select 'TEAM + PLAN TESTS PASSED' as result;
rollback;
