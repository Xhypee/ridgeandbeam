-- Run against a DB with auth_stub.sql + migrations applied:
--   psql -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/rls_test.sql
-- Every check raises on failure, so a clean run means all assertions passed.
\set QUIET on
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@acme-roof.test'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@bobs-roofing.test'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@acme-roof.test');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

-- Alice creates Acme; Bob creates Bob's Roofing
set local role authenticated;
select null from set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into ids values ('acme', public.create_organization('Acme Roofing', 'Alice'));
select null from set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
insert into ids values ('bobs', public.create_organization('Bob''s Roofing', 'Bob'));

-- Alice adds data
select null from set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into customers (org_id, name) select v, 'Jane Homeowner' from ids where k = 'acme' returning id \gset acme_cust_
insert into ids values ('acme_cust', :'acme_cust_id');
insert into jobs (org_id, customer_id, title) select (select v from ids where k='acme'), :'acme_cust_id', 'Full replacement' returning id \gset acme_job_
insert into estimates (org_id, job_id, tax_rate) select (select v from ids where k='acme'), :'acme_job_id', 10 returning id, number, public_token \gset est_
insert into estimate_items (org_id, estimate_id, description, quantity, unit_price)
  select (select v from ids where k='acme'), :'est_id', 'Shingles', 30, 40;   -- 1200
insert into estimate_items (org_id, estimate_id, description, quantity, unit_price)
  select (select v from ids where k='acme'), :'est_id', 'Labor', 10, 80;      -- 800
insert into estimates (org_id, job_id) select (select v from ids where k='acme'), :'acme_job_id' returning number \gset est2_

do $$ begin
  if (select count(*) from catalog_items) = 0 then raise exception 'starter catalog was not seeded'; end if;
  if exists (select 1 from catalog_items where org_id <> (select v from ids where k='acme')) then raise exception 'alice sees another org catalog'; end if;
end $$;

select :est_number = 1001 as ok1, :est2_number = 1002 as ok2 \gset
\if :ok1 \else \echo 'FAIL estimate numbering' \quit \endif
\if :ok2 \else \echo 'FAIL estimate numbering 2' \quit \endif

do $$ declare t numeric; begin
  select total into t from estimate_totals order by total desc limit 1;
  if t <> 2200.00 then raise exception 'estimate total wrong: %', t; end if;
end $$;

-- Bob cannot see or touch Acme data
select null from set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  if (select count(*) from customers) <> 0 then raise exception 'bob sees acme customers'; end if;
  if (select count(*) from estimates) <> 0 then raise exception 'bob sees acme estimates'; end if;
  if (select count(*) from organizations) <> 1 then raise exception 'bob sees other orgs'; end if;
  if (select count(*) from catalog_items) = 0 or exists (select 1 from catalog_items where org_id <> (select v from ids where k='bobs')) then raise exception 'bob catalog isolation wrong'; end if;
end $$;
update customers set name = 'hacked';  -- silently affects 0 rows under RLS
do $$ begin
  begin
    insert into customers (org_id, name) select v, 'x' from ids where k = 'acme';
    raise exception 'bob inserted into acme';
  exception when insufficient_privilege then null; end;
  -- Bob tries to attach a job in his own org to Acme's customer
  begin
    insert into jobs (org_id, customer_id, title)
      select (select v from ids where k='bobs'), (select v from ids where k='acme_cust'), 'steal';
    raise exception 'cross-org job reference allowed';
  exception when raise_exception then
    if sqlerrm not like '%another organization%' then raise; end if;
  end;
end $$;

-- Back to Alice: verify Bob's update did nothing
select null from set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ begin
  if exists (select 1 from customers where name = 'hacked') then raise exception 'cross-tenant update succeeded'; end if;
end $$;

-- Draft estimates are not public
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
do $$ begin
  if (select count(*) from customers) <> 0 then raise exception 'anon sees customers'; end if;
end $$;
select public.get_public_document('estimate', :'est_public_token') is null as hidden \gset
\if :hidden \else \echo 'FAIL draft estimate is public' \quit \endif

-- Alice sends it; customer accepts via public link; job moves to sold
set local role authenticated;
select null from set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
update estimates set status = 'sent', sent_at = now() where id = :'est_id';
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
select (public.get_public_document('estimate', :'est_public_token')->>'number')::int = 1001 as visible \gset
\if :visible \else \echo 'FAIL sent estimate not public' \quit \endif
select public.accept_public_estimate(:'est_public_token', 'Jane Homeowner', null, 'data:image/png;base64,' || repeat('A', 200), '1.2.3.4', 'rls-test', '[]'::jsonb) as accepted \gset
\if :accepted \else \echo 'FAIL accept' \quit \endif
select public.accept_public_estimate(:'est_public_token', 'Jane Homeowner', null, 'data:image/png;base64,' || repeat('A', 200), '1.2.3.4', 'rls-test', '[]'::jsonb) as accepted_again \gset
-- The old name-only accept (no signature) must be gone.
select count(*) = 0 as legacy_gone from pg_proc where proname = 'accept_public_estimate' and pronargs = 2 \gset
\if :legacy_gone \else \echo 'FAIL legacy accept_public_estimate(text, text) still exists' \quit \endif
\if :accepted_again \echo 'FAIL double accept' \quit \endif
do $$ begin
  begin perform public.create_organization('anon org'); raise exception 'anon created org';
  exception when insufficient_privilege then null; end;
end $$;

set local role authenticated;
select null from set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ begin
  if (select stage from jobs limit 1) <> 'sold' then raise exception 'job not moved to sold'; end if;
end $$;

-- Invoice + payments drive status
insert into invoices (org_id, job_id, status, tax_rate) select (select v from ids where k='acme'), :'acme_job_id', 'sent', 0 returning id, number \gset inv_
insert into invoice_items (org_id, invoice_id, description, quantity, unit_price)
  select (select v from ids where k='acme'), :'inv_id', 'Roof', 1, 1000;
insert into payments (org_id, invoice_id, amount) select (select v from ids where k='acme'), :'inv_id', 400;
do $$ begin
  if (select status from invoices limit 1) <> 'partial' then raise exception 'expected partial, got %', (select status from invoices limit 1); end if;
end $$;
insert into payments (org_id, invoice_id, amount) select (select v from ids where k='acme'), :'inv_id', 600;
do $$ begin
  if (select status from invoices limit 1) <> 'paid' then raise exception 'expected paid'; end if;
  if (select balance from invoice_totals limit 1) <> 0 then raise exception 'expected zero balance'; end if;
end $$;
delete from payments where amount = 600;
do $$ begin
  if (select status from invoices limit 1) <> 'partial' then raise exception 'expected partial after delete'; end if;
end $$;

-- Invites: Carol joins Acme as member; members cannot invite or edit org
insert into invites (org_id, email, role) select v, 'carol@acme-roof.test', 'member' from ids where k = 'acme' returning token \gset inv_
select null from set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  begin perform public.accept_invite((select token from invites limit 1)); raise exception 'bob accepted carol invite';
  exception when raise_exception then if sqlerrm like 'bob accepted%' then raise; end if; end;
end $$;
select null from set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
select public.accept_invite(:'inv_token', 'Carol') = (select v from ids where k='acme') as joined \gset
\if :joined \else \echo 'FAIL invite' \quit \endif
do $$ begin
  if (select count(*) from customers) <> 1 then raise exception 'carol cannot see acme customers'; end if;
  if (select count(*) from invites) <> 0 then raise exception 'member can read invites'; end if;
end $$;
update organizations set name = 'Carol Co';
update memberships set role = 'owner' where user_id = auth.uid();
do $$ begin
  if exists (select 1 from organizations where name = 'Carol Co') then raise exception 'member edited org'; end if;
  if (select role from memberships where user_id = auth.uid()) <> 'member' then raise exception 'member escalated role'; end if;
end $$;


-- ---------------------------------------------------------------------------
-- v2 platform tables
-- ---------------------------------------------------------------------------
select null from set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
insert into claims (org_id, job_id, carrier, rcv_amount, depreciation_amount, deductible)
  select (select v from ids where k='acme'), :'acme_job_id', 'State Farm', 20000, 5000, 1000 returning id \gset claim_
do $$ begin
  if (select count(*) from claim_documents) = 0 then raise exception 'claim paperwork checklist not seeded'; end if;
end $$;
insert into commission_plans (org_id, name, kind, rate) select v, '10% GP', 'pct_gross_profit', 10 from ids where k='acme' returning id \gset plan_
insert into commission_payouts (org_id, user_id, job_id, kind, amount)
  select (select v from ids where k='acme'), '00000000-0000-0000-0000-00000000000a', :'acme_job_id', 'advance', 250;

-- Bob: cannot see Acme claims or attach his own claim rows to Acme's job
select null from set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$ begin
  if (select count(*) from claims) <> 0 then raise exception 'bob sees acme claims'; end if;
  if (select count(*) from commission_payouts) <> 0 then raise exception 'bob sees acme payouts'; end if;
  begin
    insert into claims (org_id, job_id) select (select v from ids where k='bobs'), (select id from jobs limit 1);
  exception when others then null; end;
end $$;

-- Carol (member of Acme): sees claims, cannot see Alice's payouts, cannot write commission plans, cannot read tokens
select null from set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
do $$ begin
  if (select count(*) from claims) <> 1 then raise exception 'member cannot see org claims'; end if;
  if (select count(*) from commission_payouts) <> 0 then raise exception 'member sees other rep payouts'; end if;
  begin
    insert into commission_plans (org_id, name, kind) select v, 'x', 'pct_contract' from ids where k='acme';
    raise exception 'member wrote commission plan';
  exception when insufficient_privilege then null; end;
  if (select count(*) from integration_secrets) <> 0 then raise exception 'tokens readable'; end if;
end $$;

-- Anonymous web lead intake creates customer + job + notification in the right org
select null from set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select intake_key from organizations where id = (select v from ids where k='acme') \gset
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
select (public.submit_public_lead(:'intake_key',
  '{"name":"Web Lead","phone":"555-0199","zip":"80202","state":"co"}'::jsonb)->>'job_id') is not null as lead_ok \gset
\if :lead_ok \else \echo 'FAIL public lead intake' \quit \endif
do $$ begin
  begin perform public.submit_public_lead('nope', '{"name":"x","phone":"1"}'::jsonb); raise exception 'bad key accepted';
  exception when raise_exception then if sqlerrm = 'bad key accepted' then raise; end if; end;
end $$;
set local role authenticated;
select null from set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$ begin
  if not exists (select 1 from customers where name = 'Web Lead' and state = 'CO') then raise exception 'lead customer missing'; end if;
  if not exists (select 1 from notifications where kind = 'new_lead') then raise exception 'lead notification missing'; end if;
end $$;

\echo 'ALL RLS TESTS PASSED'
rollback;
