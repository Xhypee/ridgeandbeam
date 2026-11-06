-- Growth & integrations: lead intake isolation, round-robin routing, cancellation grace period,
-- financing dealer fees, canvassing same-org checks, admin-only spend, service-role-only secrets,
-- public invoice pay info.
--   psql -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/growth_test.sql
\set QUIET on
\pset tuples_only on
\pset format unaligned
begin;

create temp table t (k text primary key, v text);
grant all on t to authenticated, anon;
insert into t values
  ('owner_a', gen_random_uuid()::text), ('rep1', gen_random_uuid()::text), ('rep2', gen_random_uuid()::text),
  ('owner_b', gen_random_uuid()::text), ('office_a', gen_random_uuid()::text);
insert into auth.users (id, email) select v::uuid, k || '-' || left(v, 8) || '@growth.test' from t;
create or replace function pg_temp.id(p text) returns uuid language sql as $$ select v::uuid from t where k = p $$;
create or replace function pg_temp.as_user(p text) returns void language sql as $$ select set_config('request.jwt.claim.sub', (select v from t where k = p), true) $$;

-- Two companies
set local role authenticated;
select pg_temp.as_user('owner_a');
insert into t values ('org_a', public.create_organization('Growth A Roofing', 'Olive Owner')::text);
select pg_temp.as_user('owner_b');
insert into t values ('org_b', public.create_organization('Growth B Roofing', 'Bea Owner')::text);
reset role;

-- Org A: two sales reps (rep1 joined first) and an office member
insert into memberships (org_id, user_id, role, full_name, created_at) values
  (pg_temp.id('org_a'), pg_temp.id('rep1'), 'sales_rep', 'Rita Rep', now() - interval '2 days'),
  (pg_temp.id('org_a'), pg_temp.id('rep2'), 'sales_rep', 'Sam Rep', now() - interval '1 day'),
  (pg_temp.id('org_a'), pg_temp.id('office_a'), 'member', 'Otto Office', now());
insert into t select 'key_a', intake_key from organizations where id = pg_temp.id('org_a');
insert into t select 'key_b', intake_key from organizations where id = pg_temp.id('org_b');

-- ---------------------------------------------------------------------------
-- Anonymous website submits three leads to A, one to B
-- ---------------------------------------------------------------------------
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
insert into t select 'lead1', (public.submit_public_lead((select v from t where k = 'key_a'), '{"name":"Lead One","phone":"555-0101","source":"angi","source_detail":"angi","city":"Denver"}'::jsonb))->>'job_id';
insert into t select 'lead2', (public.submit_public_lead((select v from t where k = 'key_a'), '{"name":"Lead Two","email":"two@example.com"}'::jsonb))->>'job_id';
insert into t select 'lead3', (public.submit_public_lead((select v from t where k = 'key_a'), '{"name":"Lead Three","phone":"555-0103"}'::jsonb))->>'job_id';
insert into t select 'lead_b', (public.submit_public_lead((select v from t where k = 'key_b'), '{"name":"B Lead","phone":"555-0201"}'::jsonb))->>'job_id';

do $$ begin
  if (select count(*) from jobs) <> 0 then raise exception 'anon can read jobs'; end if;
  if (select count(*) from customers) <> 0 then raise exception 'anon can read customers'; end if;
  begin
    perform public.submit_public_lead('not-a-real-key', '{"name":"X","phone":"1"}'::jsonb);
    raise exception 'unknown key accepted';
  exception when raise_exception then
    if sqlerrm <> 'unknown intake key' then raise; end if;
  end;
  begin
    perform public.submit_public_lead((select v from t where k = 'key_a'), '{"name":"No contact"}'::jsonb);
    raise exception 'lead without phone/email accepted';
  exception when raise_exception then
    if sqlerrm not like 'phone or email%' then raise; end if;
  end;
  begin
    perform public.next_lead_assignee((select v::uuid from t where k = 'org_a'));
    raise exception 'anon can call next_lead_assignee';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Round robin: rep1, rep2, rep1 (least recently assigned first); B has no reps -> owner
do $$
declare a1 uuid; a2 uuid; a3 uuid; ab uuid; s1 uuid;
begin
  select assigned_to, sales_rep_id into a1, s1 from jobs where id = (select v::uuid from t where k = 'lead1');
  select assigned_to into a2 from jobs where id = (select v::uuid from t where k = 'lead2');
  select assigned_to into a3 from jobs where id = (select v::uuid from t where k = 'lead3');
  select assigned_to into ab from jobs where id = (select v::uuid from t where k = 'lead_b');
  if a1 is distinct from pg_temp.id('rep1') then raise exception 'lead1 should go to rep1, got %', a1; end if;
  if s1 is distinct from pg_temp.id('rep1') then raise exception 'lead1 sales_rep_id should be rep1'; end if;
  if a2 is distinct from pg_temp.id('rep2') then raise exception 'lead2 should go to rep2, got %', a2; end if;
  if a3 is distinct from pg_temp.id('rep1') then raise exception 'lead3 should go back to rep1, got %', a3; end if;
  if ab is distinct from pg_temp.id('owner_b') then raise exception 'org B lead should go to its owner, got %', ab; end if;
  if (select sales_rep_id from jobs where id = (select v::uuid from t where k = 'lead_b')) is not null then raise exception 'owner should not be set as sales rep'; end if;
  if (select org_id from jobs where id = (select v::uuid from t where k = 'lead_b')) <> pg_temp.id('org_b') then raise exception 'B lead landed in wrong org'; end if;
  if (select count(*) from jobs where org_id = pg_temp.id('org_a')) <> 3 then raise exception 'org A should have 3 jobs'; end if;
  if (select lead_source from jobs where id = (select v::uuid from t where k = 'lead1')) <> 'angi' then raise exception 'lead source not kept'; end if;
  if (select count(*) from notifications where user_id = pg_temp.id('rep1') and kind = 'lead_assigned') <> 2 then raise exception 'rep1 should have 2 assignment notifications'; end if;
  if (select count(*) from notifications where user_id = pg_temp.id('rep2') and kind = 'lead_assigned') <> 1 then raise exception 'rep2 should have 1 assignment notification'; end if;
  if (select count(*) from notifications where org_id = pg_temp.id('org_a') and user_id is null and kind = 'new_lead') <> 3 then raise exception 'org-wide new_lead notifications missing'; end if;
end $$;

-- Notification visibility: rep1 sees their own + org-wide, never rep2's; org B sees nothing of A
set local role authenticated;
select pg_temp.as_user('rep1');
do $$ begin
  if exists (select 1 from notifications where user_id = pg_temp.id('rep2')) then raise exception 'rep1 sees rep2 notifications'; end if;
  if (select count(*) from notifications where kind = 'lead_assigned') <> 2 then raise exception 'rep1 should see own assignment notifications'; end if;
  if (select count(*) from jobs) <> 3 then raise exception 'rep1 should see all org A jobs'; end if;
  -- reps can't enter marketing spend
  begin
    insert into lead_spend (org_id, source, month, amount) values (pg_temp.id('org_a'), 'angi', '2026-11-01', 500);
    raise exception 'sales rep wrote lead_spend';
  exception when insufficient_privilege then null; end;
end $$;
select pg_temp.as_user('owner_b');
do $$ begin
  if (select count(*) from jobs) <> 1 then raise exception 'owner B sees other org jobs'; end if;
  if exists (select 1 from notifications where org_id = pg_temp.id('org_a')) then raise exception 'owner B sees org A notifications'; end if;
  if exists (select 1 from customers where name like 'Lead %') then raise exception 'owner B sees org A customers'; end if;
end $$;

-- Owner A enters spend; can read it back
select pg_temp.as_user('owner_a');
insert into lead_spend (org_id, source, month, amount) values (pg_temp.id('org_a'), 'angi', '2026-11-01', 600);
do $$ begin
  if (select sum(amount) from lead_spend) <> 600 then raise exception 'owner spend not saved'; end if;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Cancellation grace period: intake keeps working until cancel_at
-- ---------------------------------------------------------------------------
update organizations set subscription_status = 'cancelled', cancel_at = now() + interval '30 days' where id = pg_temp.id('org_b');
set local role anon;
do $$ begin
  if public.get_intake_org((select v from t where k = 'key_b')) is null then raise exception 'cancelled org within period should still show intake'; end if;
  perform public.submit_public_lead((select v from t where k = 'key_b'), '{"name":"Grace Lead","phone":"555-0300"}'::jsonb);
end $$;
reset role;
update organizations set cancel_at = now() - interval '1 minute' where id = pg_temp.id('org_b');
set local role anon;
do $$ begin
  if public.get_intake_org((select v from t where k = 'key_b')) is not null then raise exception 'expired org still shows intake'; end if;
  begin
    perform public.submit_public_lead((select v from t where k = 'key_b'), '{"name":"Late Lead","phone":"555-0301"}'::jsonb);
    raise exception 'expired org accepted a lead';
  exception when raise_exception then
    if sqlerrm <> 'unknown intake key' then raise; end if;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Financing: funded -> one dealer_fee job cost (source financing)
-- ---------------------------------------------------------------------------
set local role authenticated;
select pg_temp.as_user('owner_a');
insert into financing_applications (org_id, job_id, lender, amount, dealer_fee_pct, status)
  values (pg_temp.id('org_a'), (select v::uuid from t where k = 'lead1'), 'GreenSky', 20000, 7.5, 'approved') returning id \gset fin_
update financing_applications set status = 'funded' where id = :'fin_id';
update financing_applications set notes = 'touch' where id = :'fin_id';
update financing_applications set status = 'approved' where id = :'fin_id';
update financing_applications set status = 'funded' where id = :'fin_id';
do $$ begin
  if (select count(*) from job_costs where source = 'financing') <> 1 then raise exception 'expected exactly one dealer fee cost, got %', (select count(*) from job_costs where source = 'financing'); end if;
  if (select amount from job_costs where source = 'financing') <> 1500.00 then raise exception 'dealer fee should be 1500, got %', (select amount from job_costs where source = 'financing'); end if;
  if (select category from job_costs where source = 'financing') <> 'dealer_fee' then raise exception 'dealer fee category wrong'; end if;
  if (select funded_on from financing_applications limit 1) is null then raise exception 'funded_on not set'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Canvassing: knocks are org-scoped; a converted knock can't point at another org's customer
-- ---------------------------------------------------------------------------
insert into door_knocks (org_id, lat, lng, status, setter_id) values (pg_temp.id('org_a'), 39.74, -104.99, 'interested', pg_temp.id('owner_a')) returning id \gset knock_
reset role;
insert into t select 'cust_b', id::text from customers where org_id = pg_temp.id('org_b') limit 1;
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ begin
  begin
    update door_knocks set customer_id = (select v::uuid from t where k = 'cust_b');
    raise exception 'knock linked to another org customer';
  exception when raise_exception then
    if sqlerrm <> 'parent record belongs to another organization' then raise; end if;
  end;
end $$;
select pg_temp.as_user('owner_b');
do $$ begin
  if (select count(*) from door_knocks) <> 0 then raise exception 'owner B sees org A knocks'; end if;
  if (select count(*) from lead_spend) <> 0 then raise exception 'owner B sees org A spend'; end if;
  if (select count(*) from financing_applications) <> 0 then raise exception 'owner B sees org A financing'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Integration secrets are service-role only
-- ---------------------------------------------------------------------------
select pg_temp.as_user('owner_a');
insert into integrations (org_id, provider, status, external_id) values (pg_temp.id('org_a'), 'quickbooks', 'connected', 'realm-1') returning id \gset integ_
reset role;
insert into integration_secrets (integration_id, access_token, refresh_token) values (:'integ_id', 'at', 'rt');
set local role authenticated;
select pg_temp.as_user('owner_a');
do $$ begin
  if (select count(*) from integration_secrets) <> 0 then raise exception 'owner can read integration secrets'; end if;
end $$;
select pg_temp.as_user('rep1');
do $$ begin
  begin
    update integrations set status = 'disconnected';
    if (select status from integrations limit 1) <> 'connected' then raise exception 'rep changed integration'; end if;
  exception when insufficient_privilege then null; end;
end $$;

-- ---------------------------------------------------------------------------
-- Public invoice pay info: hidden for drafts, no secrets, correct balance
-- ---------------------------------------------------------------------------
select pg_temp.as_user('owner_a');
insert into invoices (org_id, job_id, tax_rate) values (pg_temp.id('org_a'), (select v::uuid from t where k = 'lead1'), 0) returning id, public_token \gset inv_
insert into invoice_items (org_id, invoice_id, description, quantity, unit_price) values (pg_temp.id('org_a'), :'inv_id', 'Roof', 1, 1000);
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
select public.get_public_invoice_pay(:'inv_public_token') is null as draft_hidden \gset
\if :draft_hidden \else \echo 'FAIL draft invoice pay info visible' \quit \endif
reset role;
update invoices set status = 'sent' where id = :'inv_id';
update organizations set stripe_account_id = 'acct_test', stripe_charges_enabled = true where id = pg_temp.id('org_a');
set local role anon;
insert into t values ('pay', public.get_public_invoice_pay(:'inv_public_token')::text);
reset role;
do $$ declare r jsonb := (select v::jsonb from t where k = 'pay'); begin
  if (r->>'balance')::numeric <> 1000 then raise exception 'pay balance wrong: %', r->>'balance'; end if;
  if not (r->>'online_ready')::boolean then raise exception 'online_ready should be true'; end if;
  if r ? 'stripe_account_id' or r::text like '%acct_test%' then raise exception 'pay info leaks the Stripe account id'; end if;
end $$;

\echo 'GROWTH TESTS PASSED'
rollback;
