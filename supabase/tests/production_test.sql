-- Production & operations (builder D) DB tests.
--   psql -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/production_test.sql
-- Every check raises on failure; a clean run prints PASSED. Everything is rolled back.
\set QUIET on
begin;

select gen_random_uuid() as alice, gen_random_uuid() as ray, gen_random_uuid() as bob \gset
insert into auth.users (id, email) values
  (:'alice', 'alice-' || :'alice' || '@prod-test.local'),
  (:'ray', 'ray-' || :'ray' || '@prod-test.local'),
  (:'bob', 'bob-' || :'bob' || '@prod-test.local');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'alice', true);
select public.create_organization('Prod Test Roofing', 'Alice') as org_a \gset
select null from set_config('request.jwt.claim.sub', :'bob', true);
select public.create_organization('Other Roofing', 'Bob') as org_b \gset
reset role;

-- Ray joins Alice's company as a sales rep (direct insert as superuser for setup).
insert into memberships (org_id, user_id, role, full_name, email) values (:'org_a', :'ray', 'sales_rep', 'Ray Rep', 'ray@prod-test.local');

set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'alice', true);
insert into crews (org_id, name, pay_rate_m2, pay_steep_m2, pay_strip_m2, pay_gutter_lm) values (:'org_a', 'Crew One', 12, 3, 4.5, 9)
  returning id as crew1, public_token as tok1 \gset
insert into crews (org_id, name) values (:'org_a', 'Crew Two') returning id as crew2, public_token as tok2 \gset
insert into customers (org_id, name, phone) values (:'org_a', 'Pat Homeowner', '0412 345 678') returning id as cust \gset
insert into jobs (org_id, customer_id, title, site_address, crew_id, scheduled_start, scheduled_end, gate_code, sales_rep_id)
  values (:'org_a', :'cust', 'Crew one job', '1 Main St, Ballarat VIC 3350', :'crew1', current_date + 2, current_date + 3, '4321', :'ray') returning id as j1 \gset
insert into jobs (org_id, customer_id, title, crew_id, scheduled_start, scheduled_end)
  values (:'org_a', :'cust', 'Crew two job', :'crew2', current_date + 2, current_date + 2) returning id as j2 \gset
insert into jobs (org_id, customer_id, title, crew_id) values (:'org_a', :'cust', 'Unscheduled crew one job', :'crew1') returning id as j3 \gset
insert into jobs (org_id, customer_id, title, crew_id, scheduled_start, scheduled_end)
  values (:'org_a', :'cust', 'Old crew one job', :'crew1', current_date - 30, current_date - 29) returning id as j4 \gset

-- Accepted estimate with a priced material line: the portal must show quantity but never price.
insert into estimates (org_id, job_id, status, accepted_at) values (:'org_a', :'j1', 'accepted', now()) returning id as est \gset
insert into estimate_items (org_id, estimate_id, description, quantity, unit, unit_price, unit_cost, category)
  values (:'org_a', :'est', 'COLORBOND Trimdek 0.42 BMT', 75, 'lm', 42, 30, 'material');
insert into job_files (org_id, job_id, kind, storage_path, category, slope, test_square_hits)
  values (:'org_a', :'j1', 'photo', :'org_a' || '/' || :'j1' || '/broken.jpg', 'broken_tiles', 'front', 14),
         (:'org_a', :'j1', 'photo', :'org_a' || '/' || :'j1' || '/progress.jpg', 'progress', 'front', null);

-- Metric pay sheet: negative rates are rejected.
do $$ begin
  begin
    update crews set pay_rate_m2 = -1 where name = 'Crew One';
    raise exception 'negative pay rate accepted';
  exception when check_violation then null; end;
end $$;

-- ---------------------------------------------------------------------------
-- Crew portal RPC only returns that crew's (scheduled, current) jobs
-- ---------------------------------------------------------------------------
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
select public.get_crew_portal(:'tok1') as portal1 \gset
select (:'portal1'::jsonb -> 'jobs') as jobs1 \gset
select jsonb_array_length(:'jobs1'::jsonb) = 1 and (:'jobs1'::jsonb -> 0 ->> 'id') = :'j1' as only_own \gset
\if :only_own \else \echo 'FAIL crew portal returned other jobs' \quit \endif
select not (:'portal1'::jsonb -> 'crew' ? 'language') as no_lang \gset
\if :no_lang \else \echo 'FAIL crew portal still returns a language' \quit \endif
select public.get_crew_portal('not-a-real-token-at-all-000') is null as bad_tok \gset
\if :bad_tok \else \echo 'FAIL bad token returned data' \quit \endif

select public.get_crew_job(:'tok1', :'j2') is null as other_hidden \gset
\if :other_hidden \else \echo 'FAIL crew one can read crew two job' \quit \endif
select public.get_crew_job(:'tok1', :'j1') as job1 \gset
select (:'job1'::jsonb -> 'job' ->> 'gate_code') = '4321'
   and (:'job1'::jsonb -> 'estimate_items' -> 0 ->> 'quantity')::numeric = 75
   and not (:'job1'::jsonb -> 'estimate_items' -> 0 ? 'unit_price')
   and not (:'job1'::jsonb -> 'estimate_items' -> 0 ? 'unit_cost')
   and jsonb_array_length(:'job1'::jsonb -> 'photos') = 1
   and (:'job1'::jsonb -> 'photos' -> 0 ->> 'category') = 'broken_tiles'
   and (:'job1'::jsonb -> 'photos' -> 0 ->> 'count')::int = 14 as job_ok \gset
\if :job_ok \else \echo 'FAIL crew job detail wrong or leaks prices' \quit \endif
do $$ begin
  if (select count(*) from jobs) <> 0 then raise exception 'anon reads jobs directly'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Problem RPC: job note + notification, only for the crew's own jobs
-- ---------------------------------------------------------------------------
do $$ begin
  begin
    perform public.report_crew_problem((select v::text from ids where k = 'x'), gen_random_uuid(), 'other', 'x');
    raise exception 'null token accepted';
  exception when raise_exception then if sqlerrm = 'null token accepted' then raise; end if; end;
end $$;
select null from set_config('t.tok1', :'tok1', true);
select null from set_config('t.j2', :'j2', true);
do $$ begin
  begin
    perform public.report_crew_problem(current_setting('t.tok1'), current_setting('t.j2')::uuid, 'missing_material', 'no nails');
    raise exception 'problem on other crew job accepted';
  exception when raise_exception then if sqlerrm like 'problem on other%' then raise; end if; end;
end $$;
select (public.report_crew_problem(:'tok1', :'j1', 'missing_material', 'Short 2 lengths of ridge capping', 'Miguel') ->> 'job_id') = :'j1' as reported \gset
\if :reported \else \echo 'FAIL problem report' \quit \endif
select (public.report_crew_problem(:'tok1', :'j1', 'damage_found', 'Rotten battens on rear slope') ->> 'label') = 'Damage found (battens, sarking, etc.)' as au_label \gset
\if :au_label \else \echo 'FAIL crew problem label not Australian' \quit \endif

set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'alice', true);
do $$ begin
  if not exists (select 1 from job_notes where body like '[Crew report] Missing material: Short 2 lengths%' and author_name like 'Miguel (Crew One)') then
    raise exception 'problem note missing';
  end if;
  if not exists (select 1 from notifications where kind = 'crew_problem' and url like '%/production') then raise exception 'problem notification missing'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Commission payouts: rep sees only their own, cannot write
-- ---------------------------------------------------------------------------
insert into commission_plans (org_id, name, kind, rate) values (:'org_a', '10/50/50', 'split_10_50_50', 40) returning id as plan \gset
insert into commission_payouts (org_id, user_id, job_id, kind, amount) values (:'org_a', :'ray', :'j1', 'advance', 320);
insert into commission_payouts (org_id, user_id, kind, amount) values (:'org_a', :'alice', 'draw', 1000);
select public.set_member_settings(:'org_a', :'ray', null, :'plan', '555-0199');
select public.set_member_settings(:'org_a', :'alice', null, :'plan', null);  -- owner row via RPC
do $$ begin
  if (select count(*) from memberships where commission_plan_id is not null) <> 2 then raise exception 'set_member_settings failed'; end if;
end $$;
-- cross-org crew assignment is rejected
insert into ids values ('org_b', :'org_b');
select null from set_config('request.jwt.claim.sub', :'bob', true);
insert into crews (org_id, name) values (:'org_b', 'Bob crew') returning id as bobcrew \gset
select null from set_config('request.jwt.claim.sub', :'alice', true);
select null from set_config('t.bobcrew', :'bobcrew', true);
select null from set_config('t.org_a', :'org_a', true);
select null from set_config('t.ray', :'ray', true);
do $$ begin
  begin
    perform public.set_member_settings(current_setting('t.org_a')::uuid, current_setting('t.ray')::uuid, current_setting('t.bobcrew')::uuid, null, null);
    raise exception 'cross-org crew accepted';
  exception when raise_exception then if sqlerrm = 'cross-org crew accepted' then raise; end if; end;
end $$;

select null from set_config('request.jwt.claim.sub', :'ray', true);
do $$ begin
  if (select count(*) from commission_payouts) <> 1 then raise exception 'rep sees % payouts (expected only own)', (select count(*) from commission_payouts); end if;
  if exists (select 1 from commission_payouts where user_id <> auth.uid()) then raise exception 'rep can read other payouts'; end if;
  begin
    insert into commission_payouts (org_id, user_id, kind, amount) values (current_setting('t.org_a')::uuid, auth.uid(), 'final', 99999);
    raise exception 'rep wrote a payout';
  exception when insufficient_privilege then null; end;
  begin
    perform public.set_member_settings(current_setting('t.org_a')::uuid, auth.uid(), null, null, '1');
    raise exception 'rep changed member settings';
  exception when raise_exception then if sqlerrm = 'rep changed member settings' then raise; end if; end;
end $$;

-- ---------------------------------------------------------------------------
-- Orders, returns and job costs are tenant-isolated
-- ---------------------------------------------------------------------------
select null from set_config('request.jwt.claim.sub', :'alice', true);
insert into material_orders (org_id, job_id, supplier, branch_email) values (:'org_a', :'j1', 'SRS Distribution', 'branch@example.com') returning id as ord \gset
insert into material_order_items (org_id, order_id, description, quantity, unit_cost) values (:'org_a', :'ord', 'Shingles', 75, 30);
insert into material_returns (org_id, order_id, description, quantity, credit_amount, restocking_fee) values (:'org_a', :'ord', 'Leftover Trimdek sheets', 4, 120, 18);
insert into job_costs (org_id, job_id, category, amount, source, source_id) values (:'org_a', :'j1', 'materials', 2250, 'order', :'ord');
insert into job_costs (org_id, job_id, category, amount, source) values (:'org_a', :'j1', 'materials', -102, 'return');
do $$ begin
  if (select sum(amount) from job_costs) <> 2148 then raise exception 'job cost with credit wrong'; end if;
end $$;
select null from set_config('request.jwt.claim.sub', :'bob', true);
do $$ begin
  if (select count(*) from material_orders) + (select count(*) from material_order_items) + (select count(*) from material_returns) + (select count(*) from job_costs) <> 0 then
    raise exception 'bob sees acme orders/costs';
  end if;
  if (select count(*) from crews) <> 1 then raise exception 'bob sees other crews'; end if;
  begin
    insert into job_costs (org_id, job_id, category, amount) select (select v from ids where k = 'org_b'), current_setting('t.j2')::uuid, 'other', 1;
    raise exception 'cross-org job cost allowed';
  exception when raise_exception then if sqlerrm = 'cross-org job cost allowed' then raise; end if; end;
end $$;

\echo 'PASSED production_test'
rollback;
