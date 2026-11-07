-- AU estimating (builder E): Australian price-book seed, GST-inclusive totals, supplier-priced lines,
-- public estimate payload (ABN + licence for the job's state), AU state codes on web leads, tenant isolation.
--   psql -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/au_estimating_test.sql
-- Every check raises on failure; a clean run ends with AU ESTIMATING TESTS PASSED.
\set QUIET on
begin;

select gen_random_uuid() as ua, gen_random_uuid() as ub \gset
insert into auth.users (id, email) values (:'ua', 'au-est-a-' || :'ua' || '@test.dev'), (:'ub', 'au-est-b-' || :'ub' || '@test.dev');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ub', true);
insert into ids values ('b_org', public.create_organization('Bondi Roofing', 'B'));
select null from set_config('request.jwt.claim.sub', :'ua', true);
insert into ids values ('a_org', public.create_organization('Alice Springs Roofing', 'A'));

-- 1. New companies get the Australian price book at $0, no US items; GST 10%; neutral terms.
do $$
declare a uuid := (select v from ids where k = 'a_org');
begin
  if (select count(*) from catalog_items where org_id = a) <> 30 then raise exception 'expected 30 AU items, got %', (select count(*) from catalog_items where org_id = a); end if;
  if exists (select 1 from catalog_items where org_id = a and calc_key in ('shingles', 'tearoff', 'underlayment', 'ice_water', 'warranty', 'dumpster', 'permit', 'drip_edge')) then
    raise exception 'US items seeded for a new company';
  end if;
  if exists (select 1 from catalog_items where org_id = a and (unit_price <> 0 or unit_cost <> 0)) then raise exception 'seeded prices must be $0'; end if;
  if (select string_agg(tier || ':' || profile || ':' || cover_width_mm::int, ',' order by tier) from catalog_items where org_id = a and calc_key = 'metal_sheet')
     <> 'best:klip_lok:700,better:trimdek:762,good:custom_orb:762' then raise exception 'metal sheet tiers wrong'; end if;
  if (select unit from catalog_items where org_id = a and calc_key = 'sarking') <> 'roll' then raise exception 'sarking unit wrong'; end if;
  if (select category from catalog_items where org_id = a and calc_key = 'labour_install') <> 'labor' then raise exception 'labour category wrong'; end if;
  if (select tax_rate from organizations where id = a) <> 10 then raise exception 'GST rate not 10'; end if;
  if (select estimate_terms from organizations where id = a) ilike '%deposit%' then raise exception 'terms mention a deposit (state law)'; end if;
  -- idempotent: seeding again adds nothing; the v2 seeder now seeds AU items too
  if public.seed_catalog_au(a) <> 0 then raise exception 'reseed added rows'; end if;
  perform public.seed_catalog_v2(a);
  if (select count(*) from catalog_items where org_id = a) <> 30 then raise exception 'v2 reseed changed the catalog'; end if;
end $$;

-- An existing company with only legacy items can add the AU items; nothing is overwritten.
do $$
declare a uuid := (select v from ids where k = 'a_org');
begin
  delete from catalog_items where org_id = a and calc_key = 'gutter';
  update catalog_items set unit_price = 99 where org_id = a and calc_key = 'downpipe';
  insert into catalog_items (org_id, calc_key, name, unit, unit_price) values (a, 'shingles', 'Legacy shingles', 'bundle', 42);
  if public.seed_catalog_au(a) <> 1 then raise exception 'expected 1 item re-added'; end if;
  if (select unit_price from catalog_items where org_id = a and calc_key = 'downpipe') <> 99 then raise exception 'seed overwrote a price'; end if;
  if not exists (select 1 from catalog_items where org_id = a and calc_key = 'shingles') then raise exception 'seed removed legacy items'; end if;
end $$;

-- B cannot seed into A's price book (either seeder).
select null from set_config('request.jwt.claim.sub', :'ub', true);
do $$ begin
  begin
    perform public.seed_catalog_au((select v from ids where k = 'a_org'));
    raise exception 'B seeded A catalog';
  exception when raise_exception then
    if sqlerrm not like 'only owners and admins%' then raise; end if;
  end;
  begin
    perform public.seed_catalog_v2((select v from ids where k = 'a_org'));
    raise exception 'B seeded A catalog via v2';
  exception when raise_exception then
    if sqlerrm not like 'only owners and admins%' then raise; end if;
  end;
  if (select count(*) from catalog_items) <> 30 then raise exception 'B should see only its own 30 items'; end if;
end $$;
-- B's own supplier + price row (used below to prove A can't reference it).
insert into org_suppliers (org_id, custom_name) select v, 'B Metals' from ids where k = 'b_org' returning id \gset bsup_
insert into supplier_price_lists (org_id, org_supplier_id, name) select v, :'bsup_id', 'B sheet' from ids where k = 'b_org' returning id \gset bpl_
insert into supplier_price_items (org_id, price_list_id, description, unit, cost_ex_gst, calc_key)
  select v, :'bpl_id', 'Trimdek', 'lm', 20, 'metal_sheet' from ids where k = 'b_org' returning id \gset bspi_

-- 2. A: customer, NSW job, GST-inclusive estimate priced from a supplier sheet.
select null from set_config('request.jwt.claim.sub', :'ua', true);
update organizations set abn = '51824753556', gst_registered = true, state = 'NT',
  licences = '{"NSW": {"number": "123456C", "classes": ["Roof plumbing"]}, "QLD": {"number": "QBCC 15012345", "classes": "Roofing"}}'::jsonb
  where id = (select v from ids where k = 'a_org');
insert into customers (org_id, name, address, city, state, zip) select v, 'Nora Homeowner', '12 Ocean St', 'Bondi', 'NSW', '2026' from ids where k = 'a_org' returning id \gset cust_
insert into jobs (org_id, customer_id, title, state) select (select v from ids where k = 'a_org'), :'cust_id', 'Tile to Colorbond', 'NSW' returning id \gset job_
insert into org_suppliers (org_id, custom_name) select v, 'A Metals' from ids where k = 'a_org' returning id \gset asup_
insert into supplier_price_lists (org_id, org_supplier_id, name) select v, :'asup_id', 'A sheet' from ids where k = 'a_org' returning id \gset apl_
insert into supplier_price_items (org_id, price_list_id, product_code, description, profile, unit, cost_ex_gst, calc_key)
  select v, :'apl_id', 'TD42', 'COLORBOND Trimdek 0.42', 'Trimdek', 'lm', 20, 'metal_sheet' from ids where k = 'a_org' returning id \gset aspi_
insert into estimates (org_id, job_id, tax_rate, gst_inclusive) select (select v from ids where k = 'a_org'), :'job_id', 10, true returning id, public_token \gset est_
insert into ids values ('est', :'est_id'), ('aspi', :'aspi_id'), ('asup', :'asup_id'), ('bspi', :'bspi_id'), ('bsup', :'bsup_id');

-- Shared install 10 m² × $110 = $1,100; Good sheet 100 lm × $22 = $2,200; Better (supplier) 100 lm × $29.70 = $2,970.
select null from public.save_estimate_content(:'est_id',
  jsonb_build_object('tax_rate', 10, 'discount', 110, 'gst_inclusive', true, 'org_supplier_id', :'asup_id',
    'measurements', '{"units":"metric","sections":[{"label":"Main","area":100,"pitch":22.5}]}'::jsonb),
  '[{"key":"g","name":"Good","tier":"good","recommended":false},{"key":"b","name":"Better","tier":"better","recommended":true}]'::jsonb,
  jsonb_build_array(
    jsonb_build_object('option_key', null, 'description', 'Installation labour', 'quantity', 10, 'unit', 'm2', 'unit_price', 110, 'unit_cost', 60, 'category', 'labor', 'calc_key', 'labour_install'),
    jsonb_build_object('option_key', 'g', 'description', 'ZINCALUME Custom Orb', 'quantity', 100, 'unit', 'lm', 'unit_price', 22, 'unit_cost', 14, 'calc_key', 'metal_sheet'),
    jsonb_build_object('option_key', 'b', 'description', 'COLORBOND Trimdek 0.42', 'quantity', 100, 'unit', 'lm', 'unit_price', 29.7, 'unit_cost', 20, 'calc_key', 'metal_sheet', 'supplier_price_item_id', :'aspi_id')));

do $$
declare e uuid := (select v from ids where k = 'est'); r record;
begin
  if (select org_supplier_id from estimates where id = e) <> (select v from ids where k = 'asup') then raise exception 'org_supplier_id not saved'; end if;
  if (select supplier_price_item_id from estimate_items where estimate_id = e and description like 'COLORBOND%') <> (select v from ids where k = 'aspi') then
    raise exception 'supplier_price_item_id not saved';
  end if;
  if (select count(*) from estimate_items where estimate_id = e and supplier_price_item_id is null) <> 2 then raise exception 'other lines should have no supplier item'; end if;
  -- Recommended (Better): 1100 + 2970 - 110 = 3960 incl. GST; GST = 3960 / 11 = 360
  select * into r from estimate_totals where estimate_id = e;
  if r.total <> 3960.00 or r.tax <> 360.00 or r.subtotal <> 4070.00 then raise exception 'inclusive totals wrong: % % %', r.subtotal, r.tax, r.total; end if;
  -- Good: 1100 + 2200 - 110 = 3190, GST 290
  select t.* into r from estimate_option_totals t join estimate_options o on o.id = t.option_id where o.estimate_id = e and o.name = 'Good';
  if r.total <> 3190.00 or r.tax <> 290.00 then raise exception 'Good option totals wrong: % %', r.total, r.tax; end if;
  -- Saving without org_supplier_id keeps it; saving an empty one clears it
  perform public.save_estimate_content(e, '{"tax_rate":10}'::jsonb, '[]'::jsonb, '[]'::jsonb);
  if (select org_supplier_id from estimates where id = e) is null then raise exception 'org_supplier_id cleared by an unrelated save'; end if;
  perform public.save_estimate_content(e, '{"org_supplier_id":""}'::jsonb, '[]'::jsonb, '[]'::jsonb);
  if (select org_supplier_id from estimates where id = e) is not null then raise exception 'org_supplier_id not cleared'; end if;
end $$;

-- Ex-GST estimates still add GST on top (default for rows written by older code).
insert into estimates (org_id, job_id, tax_rate) select (select v from ids where k = 'a_org'), :'job_id', 10 returning id \gset ex_
insert into estimate_items (org_id, estimate_id, description, quantity, unit_price) select v, :'ex_id', 'Install', 10, 100 from ids where k = 'a_org';
do $$ begin
  if (select total from estimate_totals where estimate_id = (select id from estimates where gst_inclusive = false and org_id = (select v from ids where k = 'a_org') limit 1)) <> 1100.00 then
    raise exception 'ex-GST total wrong';
  end if;
end $$;

-- A cannot point a line or the estimate at B's supplier data.
do $$
declare e uuid := (select v from ids where k = 'est');
begin
  begin
    perform public.save_estimate_content(e, '{}'::jsonb, '[]'::jsonb,
      jsonb_build_array(jsonb_build_object('description', 'Stolen price', 'quantity', 1, 'unit_price', 1, 'supplier_price_item_id', (select v from ids where k = 'bspi'))));
    raise exception 'A used B supplier item';
  exception when raise_exception then
    if sqlerrm not like '%another organization%' then raise; end if;
  end;
  begin
    perform public.save_estimate_content(e, jsonb_build_object('org_supplier_id', (select v from ids where k = 'bsup')), '[]'::jsonb, '[]'::jsonb);
    raise exception 'A priced from B supplier';
  exception when raise_exception then
    if sqlerrm not like '%another organization%' then raise; end if;
  end;
end $$;

-- Restore the priced content, then send.
select null from public.save_estimate_content(:'est_id',
  jsonb_build_object('tax_rate', 10, 'discount', 0, 'gst_inclusive', true),
  '[]'::jsonb,
  jsonb_build_array(jsonb_build_object('description', 'COLORBOND Trimdek 0.42', 'quantity', 100, 'unit', 'lm', 'unit_price', 29.7, 'unit_cost', 20, 'calc_key', 'metal_sheet', 'supplier_price_item_id', :'aspi_id')));

-- 3. Public payload: draft hidden; sent shows ABN, GST status, NSW licence (job state), AU address parts.
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
select public.get_public_estimate(:'est_public_token') is null as hidden \gset
\if :hidden \else \echo 'FAIL draft estimate is public' \quit \endif
set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ua', true);
update estimates set status = 'sent', sent_at = now() where id = :'est_id';
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
select public.get_public_estimate(:'est_public_token') as doc \gset
select ((:'doc'::jsonb)->'org'->>'abn') = '51824753556'
   and ((:'doc'::jsonb)->'org'->>'gst_registered')::boolean
   and ((:'doc'::jsonb)->'org'->'licence'->>'number') = '123456C'
   and ((:'doc'::jsonb)->>'state') = 'NSW'
   and ((:'doc'::jsonb)->>'gst_inclusive')::boolean
   and ((:'doc'::jsonb)->'customer'->>'suburb') = 'Bondi'
   and ((:'doc'::jsonb)->'customer'->>'postcode') = '2026'
   and jsonb_array_length((:'doc'::jsonb)->'items') = 1
   and ((:'doc'::jsonb)->'items'->0) ? 'unit_cost' = false
   and ((:'doc'::jsonb)->'items'->0) ? 'supplier_price_item_id' = false as payload_ok \gset
\if :payload_ok \else \echo 'FAIL public payload' :'doc' \quit \endif

-- Job without a state falls back to the customer's (QLD) licence, then the company's state.
set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ua', true);
update customers set state = 'QLD' where id = :'cust_id';
update jobs set state = null where id = :'job_id';
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
select (public.get_public_estimate(:'est_public_token')->'org'->'licence'->>'number') = 'QBCC 15012345' as qld_ok \gset
\if :qld_ok \else \echo 'FAIL licence fallback to customer state' \quit \endif
set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ua', true);
update customers set state = null where id = :'cust_id';
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
select (public.get_public_estimate(:'est_public_token')->>'state') = 'NT'
   and (public.get_public_estimate(:'est_public_token')->'org'->'licence') = 'null'::jsonb as nt_ok \gset
\if :nt_ok \else \echo 'FAIL company state fallback (no NT licence on file)' \quit \endif
select public.get_public_estimate('not-a-token') is null as bad_token \gset
\if :bad_token \else \echo 'FAIL unknown token returned data' \quit \endif

-- 4. Isolation: B sees none of A's estimates, lines or totals.
set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ub', true);
do $$ begin
  if (select count(*) from estimates) <> 0 then raise exception 'B sees A estimates'; end if;
  if (select count(*) from estimate_items) <> 0 then raise exception 'B sees A lines'; end if;
  if (select count(*) from estimate_totals) <> 0 then raise exception 'B sees A totals'; end if;
  begin
    perform public.save_estimate_content((select v from ids where k = 'est'), '{}'::jsonb, '[]'::jsonb, '[]'::jsonb);
    raise exception 'B saved into A estimate';
  exception when raise_exception then
    if sqlerrm not like 'Estimate not found%' then raise; end if;
  end;
end $$;

-- 5. Web leads keep 3-letter state codes.
set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ua', true);
select intake_key from organizations where id = (select v from ids where k = 'a_org') \gset
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
select (public.submit_public_lead(:'intake_key', '{"name":"Wes Webb","phone":"0412 345 678","address":"3 Gum Rd","city":"Paddington","state":"nsw","zip":"2021"}'::jsonb)->>'job_id') as lead_job \gset
set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ua', true);
select (select state from jobs where id = :'lead_job') = 'NSW' and (select c.state from customers c join jobs j on j.customer_id = c.id where j.id = :'lead_job') = 'NSW' as lead_ok \gset
\if :lead_ok \else \echo 'FAIL lead state truncated' \quit \endif

\echo 'AU ESTIMATING TESTS PASSED'
rollback;
