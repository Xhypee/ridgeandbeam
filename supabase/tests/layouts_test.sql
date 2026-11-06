-- Desktop layouts (Today, Jobs pipeline, job page Next step): no migration, but these screens read a
-- wide set of tables and views in one go. This checks every one of them is tenant-isolated for a
-- member of another company, including the security_invoker totals views and the !inner claim join
-- used by "waiting on insurers".
--   psql -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/layouts_test.sql
\set QUIET on
begin;

create temp table t (k text primary key, v uuid);
grant all on t to authenticated, anon;
insert into t values ('ua', gen_random_uuid()), ('ub', gen_random_uuid());
insert into auth.users (id, email) select v, k || '-' || v || '@layouts.test' from t;

-- Each user creates a company
set local role authenticated;
select null from set_config('request.jwt.claim.sub', (select v::text from t where k = 'ua'), true);
insert into t values ('a', public.create_organization('Layouts A', 'Ann'));
select null from set_config('request.jwt.claim.sub', (select v::text from t where k = 'ub'), true);
insert into t values ('b', public.create_organization('Layouts B', 'Ben'));
reset role;

-- Company A: a sold insurance job with everything the screens read
do $$
declare a uuid := (select v from t where k = 'a'); c uuid; j uuid; e uuid; cl uuid; inv uuid; crew uuid;
begin
  insert into crews (org_id, name) values (a, 'A crew') returning id into crew;
  insert into customers (org_id, name, phone, address, claim_number) values (a, 'Secret Homeowner', '0400 000 001', '1 Hidden St', 'CLAIM-SECRET') returning id into c;
  insert into jobs (org_id, customer_id, title, stage, is_insurance, crew_id, scheduled_start, scheduled_end, site_address)
    values (a, c, 'Secret job', 'sold', true, crew, current_date, current_date, '1 Hidden St') returning id into j;
  insert into estimates (org_id, job_id, status) values (a, j, 'sent') returning id into e;
  insert into estimate_items (org_id, estimate_id, description, quantity, unit_price) values (a, e, 'Re-roof', 1, 9000);
  insert into claims (org_id, job_id, carrier, claim_number, stage) values (a, j, 'Insurer', 'CLAIM-SECRET', 'approved') returning id into cl;
  insert into claim_checks (org_id, claim_id, kind, payer, expected_amount) values (a, cl, 'acv', 'carrier', 5000);
  insert into supplements (org_id, claim_id, status, submitted_on, next_follow_up_on, requested_amount) values (a, cl, 'submitted', current_date - 10, current_date - 1, 1240);
  insert into invoices (org_id, job_id, status, kind) values (a, j, 'sent', 'deposit') returning id into inv;
  insert into invoice_items (org_id, invoice_id, description, quantity, unit_price) values (a, inv, 'Deposit', 1, 2700);
  insert into payments (org_id, invoice_id, amount) values (a, inv, 700);
  insert into material_orders (org_id, job_id, status) values (a, j, 'sent');
  insert into job_events (org_id, job_id, kind) values (a, j, 'on_my_way');
  insert into job_files (org_id, job_id, kind, storage_path) values (a, j, 'photo', a || '/' || j || '/x.jpg');
  insert into job_notes (org_id, job_id, body) values (a, j, 'gate code');
  insert into t values ('job', j);
end $$;

-- Ann (company A) sees her data through the same reads the screens make
set local role authenticated;
select null from set_config('request.jwt.claim.sub', (select v::text from t where k = 'ua'), true);
do $$ begin
  if (select count(*) from estimate_totals) <> 1 or (select total from estimate_totals) <> 9000 then raise exception 'A: estimate total'; end if;
  if (select balance from invoice_totals) <> 2000 then raise exception 'A: invoice balance'; end if;
  if (select count(*) from claim_checks k join claims c on c.id = k.claim_id where k.payer = 'carrier' and c.stage not in ('closed', 'denied')) <> 1 then raise exception 'A: carrier checks'; end if;
  if (select count(*) from supplements where status = 'submitted') <> 1 then raise exception 'A: variation'; end if;
  if (select count(*) from customers where claim_number ilike '%SECRET%' or phone ilike '%0400 000 001%') <> 1 then raise exception 'A: search'; end if;
end $$;

-- Ben (company B) sees none of it: every table/view the Today/Jobs/job page loaders read
select null from set_config('request.jwt.claim.sub', (select v::text from t where k = 'ub'), true);
do $$
declare n int;
begin
  select (select count(*) from jobs) + (select count(*) from customers) + (select count(*) from estimates) + (select count(*) from estimate_items)
       + (select count(*) from estimate_totals) + (select count(*) from claims) + (select count(*) from claim_checks) + (select count(*) from claim_balances)
       + (select count(*) from supplements) + (select count(*) from invoices) + (select count(*) from invoice_totals) + (select count(*) from payments)
       + (select count(*) from material_orders) + (select count(*) from job_events) + (select count(*) from job_files) + (select count(*) from job_notes)
       + (select count(*) from crews)
    into n;
  if n <> 0 then raise exception 'B can see % rows of company A', n; end if;
  if exists (select 1 from customers where name ilike '%Secret%' or claim_number ilike '%SECRET%') then raise exception 'B: search leaks A'; end if;
  if exists (select 1 from claims where claim_number = 'CLAIM-SECRET') then raise exception 'B: claim # search leaks A'; end if;
  if exists (select 1 from jobs where id = (select v from t where k = 'job')) then raise exception 'B: job page leaks A'; end if;
end $$;

-- Writes the screens trigger (Mark contacted, add note) are blocked across companies too
do $$
declare n int;
begin
  update jobs set first_contacted_at = now() where id = (select v from t where k = 'job');
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B could mark A''s lead contacted'; end if;
  begin
    insert into job_notes (org_id, job_id, body) values ((select v from t where k = 'b'), (select v from t where k = 'job'), 'x');
    raise exception 'B could add a note to A''s job';
  exception when others then
    if sqlerrm like 'B could%' then raise; end if;
  end;
end $$;

reset role;
\echo 'layouts_test PASSED'
rollback;
