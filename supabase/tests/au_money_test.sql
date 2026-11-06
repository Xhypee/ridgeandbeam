-- AU money & insurance tests (builder M). Run against the migrated DB:
--   psql "<db>" -v ON_ERROR_STOP=1 -f supabase/tests/au_money_test.sql
-- Every check raises on failure; everything is rolled back.
\set QUIET on
begin;

select gen_random_uuid() as ua, gen_random_uuid() as ub \gset
insert into auth.users (id, email) values (:'ua', 'amy-' || :'ua' || '@aumoney.test'), (:'ub', 'bob-' || :'ub' || '@aumoney.test');

create temp table ids (k text primary key, v text);
grant all on ids to authenticated, anon;
create function pg_temp.id(p text) returns uuid language sql as $$ select v::uuid from ids where k = p $$;

set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ub', true);
insert into ids values ('org_b', public.create_organization('Bob Roofing Pty Ltd', 'Bob'));

select null from set_config('request.jwt.claim.sub', :'ua', true);
insert into ids values ('org_a', public.create_organization('Amy Roofing Pty Ltd', 'Amy'));
update organizations set abn = '51824753556', gst_registered = true, bank_account_name = 'Amy Roofing Pty Ltd', bank_bsb = '062000', bank_account_number = '12345678',
  payid = 'pay@amy.test', payid_type = 'email' where id = pg_temp.id('org_a');
insert into customers (org_id, name, address, city, state, zip) values (pg_temp.id('org_a'), 'Jane Citizen', '1 Hail St', 'Newtown', 'NSW', '2042') returning id \gset cust_
insert into jobs (org_id, customer_id, title, is_insurance, state) values (pg_temp.id('org_a'), :'cust_id', 'Hail re-roof', true, 'NSW') returning id \gset job_
insert into ids values ('job', :'job_id');

-- ---------------------------------------------------------------------------
-- Claims: AU defaults, paperwork, settlement path, constraints
-- ---------------------------------------------------------------------------
insert into claims (org_id, job_id, carrier, claim_number, policy_type, event_type, catastrophe, excess, approved_amount, settlement_path)
  values (pg_temp.id('org_a'), :'job_id', 'NRMA', 'HAIL-26-1', 'replacement', 'hail', 'declared', 750, 18000, 'own_builder')
  returning id \gset claim_
insert into ids values ('claim', :'claim_id');
do $$ declare c claims; begin
  select * into c from claims where id = pg_temp.id('claim');
  if c.stage <> 'lodged' then raise exception 'default stage should be lodged, got %', c.stage; end if;
  if c.lodged_on is distinct from current_date then raise exception 'lodged_on should default to today'; end if;
  if (select count(*) from claim_documents where claim_id = c.id and doc_type in ('insurer_scope', 'make_safe_report', 'tax_invoice', 'hwi_certificate')) <> 4 then
    raise exception 'AU paperwork checklist not seeded';
  end if;
  if exists (select 1 from claim_documents where claim_id = c.id and doc_type in ('w9', 'lien_waiver', 'endorsed_check')) then raise exception 'US paperwork seeded'; end if;
  begin
    update claims set settlement_path = 'mortgagee_cheque' where id = c.id;
    raise exception 'bad settlement path allowed';
  exception when check_violation then null; end;
  begin
    update claims set event_type = 'tornado' where id = c.id;
    raise exception 'bad event type allowed';
  exception when check_violation then null; end;
  begin
    update claims set excess = -1 where id = c.id;
    raise exception 'negative excess allowed';
  exception when check_violation then null; end;
  begin
    update claims set make_safe_payer = 'mortgagee' where id = c.id;
    raise exception 'bad make-safe payer allowed';
  exception when check_violation then null; end;
end $$;
update claims set stage = 'cash_settlement_offered' where id = :'claim_id';
update claims set stage = 'work_authorised' where id = :'claim_id';

-- Ledger: AU payers/kinds allowed, US-only payer rejected
insert into claim_checks (org_id, claim_id, kind, payer, expected_amount, received_amount)
  values (pg_temp.id('org_a'), :'claim_id', 'scope', 'carrier', 17250, 17250),
         (pg_temp.id('org_a'), :'claim_id', 'excess', 'homeowner', 750, 0),
         (pg_temp.id('org_a'), :'claim_id', 'scope', 'panel_builder', 1000, 0);
do $$ declare b record; begin
  select * into b from claim_balances where claim_id = pg_temp.id('claim');
  if b.expected <> 19000 or b.received <> 17250 or b.outstanding <> 1750 then raise exception 'claim_balances wrong: % % %', b.expected, b.received, b.outstanding; end if;
  begin
    insert into claim_checks (org_id, claim_id, kind, payer, expected_amount) values (pg_temp.id('org_a'), pg_temp.id('claim'), 'excess', 'lender', 1);
    raise exception 'bad payer allowed';
  exception when check_violation then null; end;
end $$;

-- Variation requests: approval adds one expected payment from the right payer for the settlement path
insert into supplements (org_id, claim_id) values (pg_temp.id('org_a'), :'claim_id') returning id \gset v1_
insert into ids values ('v1', :'v1_id');
insert into supplement_items (org_id, supplement_id, description, quantity, unit, unit_price) values (pg_temp.id('org_a'), :'v1_id', 'Sarking', 180, 'M2', 9.50);
update supplements set status = 'approved', approved_amount = 1710 where id = :'v1_id';
do $$ declare c claim_checks; begin
  select * into c from claim_checks where supplement_id = pg_temp.id('v1');
  if c.id is null or c.kind <> 'variation' or c.payer <> 'carrier' or c.expected_amount <> 1710 or c.endorsement <> 'not_required' or c.label <> 'Variation request 1' then
    raise exception 'own-builder variation payment wrong: %', row_to_json(c);
  end if;
end $$;
update claims set settlement_path = 'insurer_managed', panel_builder_name = 'Acme Builders' where id = :'claim_id';
insert into supplements (org_id, claim_id) values (pg_temp.id('org_a'), :'claim_id') returning id \gset v2_
update supplements set status = 'partial', approved_amount = 300 where id = :'v2_id';
do $$ begin
  if (select payer from claim_checks where supplement_id = (select id from supplements where claim_id = pg_temp.id('claim') and round = 2)) <> 'panel_builder' then
    raise exception 'panel-builder variation should be paid by the panel builder';
  end if;
end $$;
update claims set settlement_path = 'cash_settlement' where id = :'claim_id';
insert into supplements (org_id, claim_id) values (pg_temp.id('org_a'), :'claim_id') returning id \gset v3_
update supplements set status = 'approved', approved_amount = 120 where id = :'v3_id';
do $$ begin
  if (select payer from claim_checks where supplement_id = (select id from supplements where claim_id = pg_temp.id('claim') and round = 3)) <> 'homeowner' then
    raise exception 'cash-settlement variation should be paid by the homeowner';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Invoices: GST-inclusive totals, legacy exclusive totals, buyer ABN format
-- ---------------------------------------------------------------------------
insert into invoices (org_id, job_id, tax_rate, status, buyer_abn) values (pg_temp.id('org_a'), :'job_id', 10, 'sent', null) returning id, public_token \gset inv_
insert into ids values ('inv', :'inv_id'), ('inv_token', :'inv_public_token');
insert into invoice_items (org_id, invoice_id, description, quantity, unit, unit_price) values (pg_temp.id('org_a'), :'inv_id', 'Colorbond re-roof', 1, 'ea', 21072.35);
insert into invoices (org_id, job_id, tax_rate, amounts_include_gst) values (pg_temp.id('org_a'), :'job_id', 10, false) returning id \gset legacy_
insert into invoice_items (org_id, invoice_id, description, quantity, unit, unit_price) values (pg_temp.id('org_a'), :'legacy_id', 'Repair', 1, 'ea', 1000);
insert into ids values ('legacy', :'legacy_id');
do $$ declare t record; begin
  if not (select amounts_include_gst from invoices where id = pg_temp.id('inv')) then raise exception 'new invoices should be GST-inclusive'; end if;
  select * into t from invoice_totals where invoice_id = pg_temp.id('inv');
  if t.total <> 21072.35 or t.tax <> 1915.67 or t.balance <> 21072.35 then raise exception 'inclusive totals wrong: % % %', t.total, t.tax, t.balance; end if;
  select * into t from invoice_totals where invoice_id = pg_temp.id('legacy');
  if t.total <> 1100 or t.tax <> 100 then raise exception 'exclusive totals wrong: % %', t.total, t.tax; end if;
  begin
    update invoices set buyer_abn = '123' where id = pg_temp.id('inv');
    raise exception 'bad buyer ABN allowed';
  exception when check_violation then null; end;
  begin
    update invoices set bill_to = 'lender' where id = pg_temp.id('inv');
    raise exception 'bad bill_to allowed';
  exception when check_violation then null; end;
end $$;
update invoices set bill_to = 'panel_builder' where id = :'inv_id';
insert into payments (org_id, invoice_id, amount, method) values (pg_temp.id('org_a'), :'inv_id', 2107.24, 'bank_transfer');
do $$ begin
  if (select status from invoices where id = pg_temp.id('inv')) <> 'partial' then raise exception 'payment did not update status'; end if;
end $$;

-- Organisation bank details and crew ABN formats
do $$ begin
  begin
    update organizations set bank_bsb = '06200' where id = pg_temp.id('org_a');
    raise exception 'bad BSB allowed';
  exception when check_violation then null; end;
  begin
    update organizations set payid_type = 'twitter' where id = pg_temp.id('org_a');
    raise exception 'bad PayID type allowed';
  exception when check_violation then null; end;
end $$;
insert into crews (org_id, name, abn) values (pg_temp.id('org_a'), 'Smith Roofing', '51824753556') returning id \gset crew_
insert into ids values ('crew', :'crew_id');
do $$ begin
  if not (select gst_registered from crews where id = pg_temp.id('crew')) then raise exception 'crews should default to GST registered'; end if;
  begin
    update crews set abn = 'ABC' where id = pg_temp.id('crew');
    raise exception 'bad crew ABN allowed';
  exception when check_violation then null; end;
end $$;

-- Xero integration rows (admin only)
insert into integrations (org_id, provider, status, settings) values (pg_temp.id('org_a'), 'xero', 'disconnected', '{"sales":"200"}');
do $$ begin
  begin
    insert into integrations (org_id, provider) values (pg_temp.id('org_a'), 'myob-bogus');
    raise exception 'bad provider allowed';
  exception when check_violation then null; end;
end $$;

-- ---------------------------------------------------------------------------
-- Tenant isolation
-- ---------------------------------------------------------------------------
select null from set_config('request.jwt.claim.sub', :'ub', true);
do $$ begin
  if (select count(*) from claims) <> 0 then raise exception 'bob sees amy claims'; end if;
  if (select count(*) from claim_checks) <> 0 then raise exception 'bob sees amy ledger'; end if;
  if (select count(*) from crews where abn is not null) <> 0 then raise exception 'bob sees amy crews'; end if;
  if (select count(*) from integrations where provider = 'xero') <> 0 then raise exception 'bob sees amy integrations'; end if;
  if (select count(*) from invoice_totals) <> 0 then raise exception 'bob sees amy invoice totals'; end if;
  if exists (select 1 from organizations where bank_account_number = '12345678') then raise exception 'bob sees amy bank details'; end if;
  begin
    insert into claim_checks (org_id, claim_id, kind, payer, expected_amount) values (pg_temp.id('org_b'), pg_temp.id('claim'), 'excess', 'homeowner', 1);
    raise exception 'cross-org ledger insert allowed';
  exception when raise_exception then
    if sqlerrm not like '%another organization%' then raise; end if;
  end;
end $$;
update claims set excess = 0, settlement_path = 'undecided';
update crews set abn = null;
select null from set_config('request.jwt.claim.sub', :'ua', true);
do $$ begin
  if (select excess from claims where id = pg_temp.id('claim')) <> 750 then raise exception 'cross-tenant claim update'; end if;
  if (select abn from crews where id = pg_temp.id('crew')) is null then raise exception 'cross-tenant crew update'; end if;
end $$;

-- Draft invoices are not public
insert into invoices (org_id, job_id, tax_rate) values (pg_temp.id('org_a'), :'job_id', 10) returning public_token \gset draft_
insert into ids values ('draft_token', :'draft_public_token');

-- ---------------------------------------------------------------------------
-- Public tax invoice (anonymous, by token)
-- ---------------------------------------------------------------------------
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
do $$ declare r jsonb; begin
  r := public.get_public_tax_invoice((select v from ids where k = 'inv_token'));
  if r is null then raise exception 'public tax invoice missing'; end if;
  if r->'seller'->>'abn' <> '51824753556' or (r->'seller'->>'gst_registered')::boolean is not true then raise exception 'seller ABN/GST missing: %', r->'seller'; end if;
  if (r->'totals'->>'gst')::numeric <> 1915.67 or (r->'totals'->>'balance')::numeric <> 18965.11 then raise exception 'public totals wrong: %', r->'totals'; end if;
  if r->'buyer'->>'name' <> 'Jane Citizen' or r->'buyer'->>'address' not like '1 Hail St, Newtown, NSW 2042' then raise exception 'buyer fallback wrong: %', r->'buyer'; end if;
  if r->'pay'->>'bank_bsb' <> '062000' or r->'pay'->>'payid' <> 'pay@amy.test' then raise exception 'pay details missing: %', r->'pay'; end if;
  if r->'claim'->>'excess' is null then raise exception 'claim explainer data missing'; end if;
  if r::text like '%stripe_account_id%' or r::text like '%refresh_token%' then raise exception 'public invoice leaks secrets'; end if;
  if public.get_public_tax_invoice((select v from ids where k = 'draft_token')) is not null then raise exception 'draft invoice is public'; end if;
  if public.get_public_tax_invoice('nope') is not null then raise exception 'unknown token returned data'; end if;
  if (select count(*) from claims) <> 0 or (select count(*) from crews) <> 0 then raise exception 'anon can read tables'; end if;
end $$;

\echo 'PASSED au_money_test'
rollback;
