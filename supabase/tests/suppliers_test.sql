-- Suppliers & price sheets (builder S) DB tests.
--   psql -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/suppliers_test.sql
-- Every check raises on failure; a clean run prints PASSED. Everything is rolled back.
\set QUIET on
\set ON_ERROR_STOP on
\o /dev/null
begin;

select gen_random_uuid() as alice, gen_random_uuid() as olly, gen_random_uuid() as cal, gen_random_uuid() as ray, gen_random_uuid() as bob \gset
insert into auth.users (id, email) values
  (:'alice', 'alice-' || :'alice' || '@sup-test.local'),
  (:'olly', 'olly-' || :'olly' || '@sup-test.local'),
  (:'cal', 'cal-' || :'cal' || '@sup-test.local'),
  (:'ray', 'ray-' || :'ray' || '@sup-test.local'),
  (:'bob', 'bob-' || :'bob' || '@sup-test.local');

set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'alice', true);
select public.create_organization('Sup Test Roofing', 'Alice') as org_a \gset
select null from set_config('request.jwt.claim.sub', :'bob', true);
select public.create_organization('Other Roofing', 'Bob') as org_b \gset
reset role;
insert into memberships (org_id, user_id, role, full_name, email) values
  (:'org_a', :'olly', 'member', 'Olly Office', 'olly@sup-test.local'),
  (:'org_a', :'cal', 'crew_lead', 'Cal Crew', 'cal@sup-test.local'),
  (:'org_a', :'ray', 'sales_rep', 'Ray Rep', 'ray@sup-test.local');
select null from set_config('t.org_a', :'org_a', true);
select null from set_config('t.org_b', :'org_b', true);

-- ---------------------------------------------------------------------------
-- Directory: seeded, readable by any signed-in user, not by anon, no prices
-- ---------------------------------------------------------------------------
set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'cal', true);
do $$ begin
  if (select count(*) from suppliers where slug in ('lysaght','stramit','metroll','fielders','steeline','roofing-centre-tas','bunnings-trade',
      'mitre10-trade','reece','tradelink','monier','bristile','boral-lutum','bradford')) <> 14 then raise exception 'directory seed incomplete'; end if;
  if exists (select 1 from suppliers where verified) then raise exception 'unverified coverage marked verified'; end if;
  if (select states from suppliers where slug = 'roofing-centre-tas') <> '{TAS}' then raise exception 'TAS coverage wrong'; end if;
  if (select cardinality(states) from suppliers where slug = 'reece') <> 0 then raise exception 'coverage invented for Reece'; end if;
end $$;
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
do $$ begin
  if (select count(*) from suppliers) <> 0 then raise exception 'anon reads the supplier directory'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Org A adds suppliers; one row per directory supplier; default stays in step
-- ---------------------------------------------------------------------------
set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'alice', true);
insert into org_suppliers (org_id, supplier_id, account_number, branch_email)
  values (:'org_a', (select id from suppliers where slug = 'lysaght'), 'ACC-123', 'smithfield@example.com') returning id as lys \gset
insert into org_suppliers (org_id, custom_name) values (:'org_a', 'No.1 Roofing Parramatta') returning id as custom \gset
do $$ begin
  begin
    insert into org_suppliers (org_id, supplier_id) values (current_setting('t.org_a')::uuid, (select id from suppliers where slug = 'lysaght'));
    raise exception 'duplicate directory supplier accepted';
  exception when unique_violation then null; end;
  begin
    insert into org_suppliers (org_id) values (current_setting('t.org_a')::uuid);
    raise exception 'supplier with no name accepted';
  exception when check_violation then null; end;
end $$;
select null as ok from public.set_default_supplier(:'org_a', :'lys') \gset
select null as ok from public.set_default_supplier(:'org_a', :'custom') \gset
do $$ begin
  if (select default_supplier_id from organizations where id = current_setting('t.org_a')::uuid) <> (select id from org_suppliers where custom_name like 'No.1%') then
    raise exception 'default supplier not set';
  end if;
  if (select count(*) from org_suppliers where is_default) <> 1 or not (select is_default from org_suppliers where custom_name like 'No.1%') then
    raise exception 'is_default out of step';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Price lists: import inactive, activate → exactly one active, old version kept
-- ---------------------------------------------------------------------------
insert into supplier_price_lists (org_id, org_supplier_id, name, effective_date, is_active, status)
  values (:'org_a', :'lys', 'Lysaght Oct', '2026-10-01', false, 'importing') returning id as list1 \gset
insert into supplier_price_items (org_id, price_list_id, product_code, description, unit, cost_ex_gst, calc_key)
  values (:'org_a', :'list1', 'CO42', 'Custom Orb 0.42 Monument', 'lm', 12.10, 'metal_sheet') returning id as item1 \gset
select null as ok from public.activate_supplier_price_list(:'list1') \gset
insert into supplier_price_lists (org_id, org_supplier_id, name, effective_date, is_active, status)
  values (:'org_a', :'lys', 'Lysaght Nov', '2026-11-01', false, 'importing') returning id as list2 \gset
insert into supplier_price_items (org_id, price_list_id, product_code, description, unit, cost_ex_gst, calc_key)
  values (:'org_a', :'list2', 'CO42', 'Custom Orb 0.42 Monument', 'lm', 12.60, 'metal_sheet');
select null as ok from public.activate_supplier_price_list(:'list2') \gset
do $$ begin
  if (select count(*) from supplier_price_lists where is_active) <> 1 then raise exception 'more than one active list'; end if;
  if not (select is_active and status = 'ready' from supplier_price_lists where name = 'Lysaght Nov') then raise exception 'new list not active'; end if;
  if (select is_active from supplier_price_lists where name = 'Lysaght Oct') then raise exception 'old list still active'; end if;
  if (select count(*) from supplier_price_items) <> 2 then raise exception 'old version items lost'; end if;
  begin
    update supplier_price_lists set is_active = true where name = 'Lysaght Oct';
    raise exception 'two active lists allowed';
  exception when unique_violation then null; end;
end $$;

-- Office member can import; sales rep reads prices but can't write.
select null from set_config('request.jwt.claim.sub', :'olly', true);
insert into supplier_price_items (org_id, price_list_id, description, unit, cost_ex_gst, calc_key)
  values (:'org_a', :'list2', 'Quad gutter 115 6.5m', 'length', 58.50, 'gutter');
select null from set_config('request.jwt.claim.sub', :'ray', true);
do $$ begin
  if (select count(*) from supplier_price_items) <> 3 then raise exception 'sales rep cannot read prices'; end if;
  insert into supplier_price_items (org_id, price_list_id, description, cost_ex_gst)
    values (current_setting('t.org_a')::uuid, (select id from supplier_price_lists where is_active), 'Rep row', 1);
  raise exception 'sales rep wrote a price';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  update supplier_price_items set cost_ex_gst = 0;
  if exists (select 1 from supplier_price_items where cost_ex_gst = 0) then raise exception 'sales rep changed prices'; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Crew leads are members but never see trade prices or price lists
-- ---------------------------------------------------------------------------
select null from set_config('request.jwt.claim.sub', :'cal', true);
do $$ begin
  if (select count(*) from supplier_price_items) <> 0 then raise exception 'crew lead reads supplier prices'; end if;
  if (select count(*) from supplier_price_lists) <> 0 then raise exception 'crew lead reads price lists'; end if;
  if (select count(*) from org_suppliers) <> 2 then raise exception 'crew lead cannot see supplier names'; end if;
  begin
    insert into supplier_price_items (org_id, price_list_id, description, cost_ex_gst)
      values (current_setting('t.org_a')::uuid, (select id from supplier_price_lists limit 1), 'x', 1);
    raise exception 'crew lead wrote a price';
  exception when insufficient_privilege or not_null_violation then null; end;
end $$;

-- ---------------------------------------------------------------------------
-- Tenant isolation
-- ---------------------------------------------------------------------------
select null from set_config('request.jwt.claim.sub', :'bob', true);
insert into org_suppliers (org_id, supplier_id) values (:'org_b', (select id from suppliers where slug = 'stramit')) returning id as bob_os \gset
insert into supplier_price_lists (org_id, org_supplier_id, name) values (:'org_b', :'bob_os', 'Stramit') returning id as bob_list \gset
insert into supplier_price_items (org_id, price_list_id, description, unit, cost_ex_gst, calc_key)
  values (:'org_b', :'bob_list', 'Stramit Corrugated', 'lm', 9.99, 'metal_sheet') returning id as bob_item \gset
select null from set_config('t.lys', :'lys', true);
select null from set_config('t.list2', :'list2', true);
select null from set_config('t.item1', :'item1', true);
select null from set_config('t.bob_os', :'bob_os', true);
select null from set_config('t.bob_list', :'bob_list', true);
select null from set_config('t.bob_item', :'bob_item', true);
do $$ begin
  if (select count(*) from org_suppliers) <> 1 then raise exception 'org B sees org A suppliers'; end if;
  if (select count(*) from supplier_price_lists) <> 1 then raise exception 'org B sees org A price lists'; end if;
  if (select count(*) from supplier_price_items) <> 1 then raise exception 'org B sees org A prices'; end if;
  begin
    insert into supplier_price_items (org_id, price_list_id, description, cost_ex_gst) values (current_setting('t.org_a')::uuid, current_setting('t.list2')::uuid, 'evil', 0);
    raise exception 'org B wrote into org A price list';
  exception when insufficient_privilege then null; end;
  begin
    insert into supplier_price_items (org_id, price_list_id, description, cost_ex_gst) values (current_setting('t.org_b')::uuid, current_setting('t.list2')::uuid, 'evil', 0);
    raise exception 'org B attached a row to org A list';
  exception when raise_exception then if sqlerrm not like 'parent record belongs%' then raise; end if; end;
  begin
    insert into supplier_price_lists (org_id, org_supplier_id, name) values (current_setting('t.org_b')::uuid, current_setting('t.lys')::uuid, 'evil');
    raise exception 'org B attached a list to org A supplier';
  exception when raise_exception then if sqlerrm not like 'parent record belongs%' then raise; end if; end;
  begin
    perform public.set_default_supplier(current_setting('t.org_a')::uuid, current_setting('t.bob_os')::uuid);
    raise exception 'org B changed org A default';
  exception when raise_exception then if sqlerrm not like 'only owners%' then raise; end if; end;
  begin
    perform public.activate_supplier_price_list(current_setting('t.list2')::uuid);
    raise exception 'org B activated org A list';
  exception when raise_exception then if sqlerrm <> 'price list not found' then raise; end if; end;
end $$;

-- Cross-org links are rejected even for the org's own admin.
select null from set_config('request.jwt.claim.sub', :'alice', true);
do $$ begin
  begin
    perform public.set_default_supplier(current_setting('t.org_a')::uuid, current_setting('t.bob_os')::uuid);
    raise exception 'default set to another org supplier';
  exception when raise_exception then if sqlerrm not like 'supplier belongs%' then raise; end if; end;
  begin
    update organizations set default_supplier_id = current_setting('t.bob_os')::uuid where id = current_setting('t.org_a')::uuid;
    raise exception 'org default points at another org';
  exception when raise_exception then if sqlerrm not like 'default supplier belongs%' then raise; end if; end;
  begin
    insert into catalog_items (org_id, calc_key, name, supplier_price_item_id) values (current_setting('t.org_a')::uuid, 'sup_test_key', 'x', current_setting('t.bob_item')::uuid);
    raise exception 'catalog item linked to another org price';
  exception when raise_exception then if sqlerrm not like 'parent record belongs%' then raise; end if; end;
  insert into catalog_items (org_id, calc_key, name, supplier_price_item_id) values (current_setting('t.org_a')::uuid, 'sup_test_key', 'ok', current_setting('t.item1')::uuid);
end $$;

-- ---------------------------------------------------------------------------
-- Material orders carry the org supplier and supplier rows (same org only)
-- ---------------------------------------------------------------------------
insert into customers (org_id, name) values (:'org_a', 'Pat Homeowner') returning id as cust \gset
insert into jobs (org_id, customer_id, title) values (:'org_a', :'cust', 'Re-roof') returning id as job \gset
insert into material_orders (org_id, job_id, org_supplier_id, supplier) values (:'org_a', :'job', :'lys', 'Lysaght (BlueScope)') returning id as ord, supplier as sup_default \gset
insert into material_order_items (org_id, order_id, description, sku, quantity, unit, unit_cost, calc_key, supplier_price_item_id)
  values (:'org_a', :'ord', 'Custom Orb 0.42 Monument', 'CO42', 180, 'lm', 12.10, 'metal_sheet', :'item1');
select null from set_config('t.ord', :'ord', true);
do $$ begin
  begin
    insert into material_order_items (org_id, order_id, description, supplier_price_item_id)
      values (current_setting('t.org_a')::uuid, current_setting('t.ord')::uuid, 'x', current_setting('t.bob_item')::uuid);
    raise exception 'order line linked to another org price';
  exception when raise_exception then if sqlerrm not like 'parent record belongs%' then raise; end if; end;
  begin
    insert into material_orders (org_id, job_id, org_supplier_id) values (current_setting('t.org_a')::uuid, (select id from jobs limit 1), current_setting('t.bob_os')::uuid);
    raise exception 'order linked to another org supplier';
  exception when raise_exception then if sqlerrm not like 'parent record belongs%' then raise; end if; end;
end $$;
reset role;
do $$ begin
  if (select column_default from information_schema.columns where table_name = 'material_orders' and column_name = 'supplier') not like '%Supplier%' then
    raise exception 'US default supplier still set';
  end if;
end $$;

-- Removing a supplier clears the default and keeps the order (supplier name stays on it).
set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'alice', true);
select null as ok from public.set_default_supplier(:'org_a', :'lys') \gset
delete from org_suppliers where id = :'lys';
do $$ begin
  if (select default_supplier_id from organizations where id = current_setting('t.org_a')::uuid) is not null then raise exception 'default not cleared'; end if;
  if (select org_supplier_id from material_orders where id = current_setting('t.ord')::uuid) is not null then raise exception 'order supplier link not cleared'; end if;
  if (select supplier from material_orders where id = current_setting('t.ord')::uuid) <> 'Lysaght (BlueScope)' then raise exception 'order lost its supplier name'; end if;
  if (select count(*) from supplier_price_lists) <> 0 then raise exception 'price lists not removed with supplier'; end if;
end $$;

\echo 'PASSED'
rollback;
