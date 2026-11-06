-- Field & homeowner (builder C) DB tests: tenant isolation, offline idempotency, portal RPC,
-- change-order approval -> invoice + job cost (contract 3), inbound SMS matching.
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/field_test.sql
\set QUIET on
begin;

select gen_random_uuid() as u1, gen_random_uuid() as u2, gen_random_uuid() as u3 \gset
insert into auth.users (id, email) values
  (:'u1', 'field-owner-' || :'u1' || '@test.local'),
  (:'u2', 'field-other-' || :'u2' || '@test.local'),
  (:'u3', 'field-crew-' || :'u3' || '@test.local');
-- unique 10-digit phone for this run
select '7' || lpad((floor(random() * 1e9))::bigint::text, 9, '0') as phone10 \gset

create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to authenticated, anon, service_role;

set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'u1', true);
select public.create_organization('Field Test Roofing', 'Fran') as org1 \gset
select null from set_config('request.jwt.claim.sub', :'u2', true);
select public.create_organization('Other Roofing', 'Otto') as org2 \gset

reset role;
insert into memberships (org_id, user_id, role, full_name) values (:'org1', :'u3', 'crew_lead', 'Carl Crew');
set local role authenticated;

-- Fran's job, customer phone formatted with punctuation
select null from set_config('request.jwt.claim.sub', :'u1', true);
insert into customers (org_id, name, phone)
  values (:'org1', 'Hank Homeowner', '(' || substr(:'phone10', 1, 3) || ') ' || substr(:'phone10', 4, 3) || '-' || substr(:'phone10', 7, 4))
  returning id as cust1 \gset
insert into jobs (org_id, customer_id, title, stage, assigned_to) values (:'org1', :'cust1', 'Hail replacement', 'sold', :'u1')
  returning id as job1, public_token as job_token \gset
insert into claims (org_id, job_id, carrier, claim_number, rcv_amount, depreciation_amount, deductible, stage)
  values (:'org1', :'job1', 'Acme Mutual', 'C-1', 20000, 5000, 1000, 'approved') returning id as claim1 \gset
insert into claim_checks (org_id, claim_id, kind, expected_amount, received_amount) values
  (:'org1', :'claim1', 'acv', 14000, 14000), (:'org1', :'claim1', 'depreciation', 5000, 0);

-- Offline queue idempotency (files by (org_id, client_id) upsert target; events unique client_id)
insert into job_files (org_id, job_id, client_id, storage_path, category, slope, test_square_hits, shared_with_homeowner)
  values (:'org1', :'job1', 'cid-photo-1', :'org1' || '/' || :'job1' || '/cid-photo-1.jpg', 'test_square', 'front', 9, true) returning id as file1 \gset
insert into job_files (org_id, job_id, client_id, storage_path) values (:'org1', :'job1', 'cid-photo-2', :'org1' || '/' || :'job1' || '/cid-photo-2.jpg');
insert into job_files (org_id, job_id, client_id, storage_path) values (:'org1', :'job1', 'cid-photo-1', 'dup')
  on conflict (org_id, client_id) do nothing;
do $$ begin
  if (select count(*) from job_files) <> 2 then raise exception 'duplicate client_id created a second file'; end if;
end $$;
insert into job_events (org_id, job_id, client_id, kind, note, file_id) values (:'org1', :'job1', 'cid-ev-1', 'tear_off_started', 'Crew on site', :'file1');
do $$ begin
  begin
    insert into job_events (org_id, job_id, client_id, kind) select org_id, job_id, 'cid-ev-1', 'tear_off_started' from job_events limit 1;
    raise exception 'duplicate event client_id allowed';
  exception when unique_violation then null; end;
end $$;
insert into job_events (org_id, job_id, kind, note, visible_to_homeowner) values (:'org1', :'job1', 'note', 'internal only', false);
insert into job_checklist_items (org_id, job_id, kind, label) values (:'org1', :'job1', 'punch', 'Reseal pipe boot');

-- Change orders: one sent (decking material + labor), one draft, one for on-site approval
insert into change_orders (org_id, job_id, title, status, file_ids, created_by) values (:'org1', :'job1', 'Rotten decking', 'sent', array[:'file1']::uuid[], :'u1')
  returning id as co1, public_token as co_token \gset
insert into change_order_items (org_id, change_order_id, position, description, quantity, unit, unit_price, unit_cost, category) values
  (:'org1', :'co1', 0, 'Decking (4x8 sheet)', 5, 'sheet', 72, 38, 'material'),
  (:'org1', :'co1', 1, 'Extra labor', 2, 'hr', 60, 30, 'labor');
insert into change_orders (org_id, job_id, title, status) values (:'org1', :'job1', 'Draft CO', 'draft') returning id as co_draft, public_token as co_draft_token \gset
insert into change_order_items (org_id, change_order_id, description, quantity, unit_price, unit_cost) values (:'org1', :'co_draft', 'Skylight', 1, 400, 0);
insert into t_ids values ('org1', :'org1'), ('org2', :'org2'), ('job1', :'job1'), ('co1', :'co1'), ('co_draft', :'co_draft');

-- Tenant isolation: Otto sees nothing and cannot attach rows to Fran's job
select null from set_config('request.jwt.claim.sub', :'u2', true);
do $$ begin
  if (select count(*) from job_files) <> 0 then raise exception 'other org sees job_files'; end if;
  if (select count(*) from job_events) <> 0 then raise exception 'other org sees job_events'; end if;
  if (select count(*) from change_orders) <> 0 then raise exception 'other org sees change_orders'; end if;
  if (select count(*) from change_order_items) <> 0 then raise exception 'other org sees change_order_items'; end if;
  if (select count(*) from job_checklist_items) <> 0 then raise exception 'other org sees checklist'; end if;
  begin
    insert into job_events (org_id, job_id, kind) select (select v from t_ids where k='org2'), (select v from t_ids where k='job1'), 'on_my_way';
    raise exception 'cross-org event insert allowed';
  exception when raise_exception then if sqlerrm not like '%another organization%' then raise; end if; end;
  begin
    insert into job_files (org_id, job_id, storage_path) select (select v from t_ids where k='org2'), (select v from t_ids where k='job1'), 'x';
    raise exception 'cross-org file insert allowed';
  exception when raise_exception then if sqlerrm not like '%another organization%' then raise; end if; end;
  begin
    perform public.approve_change_order_on_site((select v from t_ids where k='co_draft'), 'Otto Other', null, 'verbal');
    raise exception 'other org approved change order';
  exception when raise_exception then if sqlerrm not like '%not found%' then raise; end if; end;
  begin perform public.apply_change_order((select v from t_ids where k='co1')); raise exception 'apply_change_order callable';
  exception when insufficient_privilege then null; end;
  begin perform public.match_customer_phone('3035550100'); raise exception 'match_customer_phone callable';
  exception when insufficient_privilege then null; end;
end $$;

-- Crew lead (member of Fran's org) cannot approve change orders
select null from set_config('request.jwt.claim.sub', :'u3', true);
do $$ begin
  if (select count(*) from change_orders) <> 2 then raise exception 'crew lead cannot see own org change orders'; end if;
  begin
    perform public.approve_change_order_on_site((select v from t_ids where k='co_draft'), 'Hank Homeowner', null, 'verbal');
    raise exception 'crew lead approved';
  exception when raise_exception then if sqlerrm not like '%only office or sales%' then raise; end if; end;
end $$;

-- Anonymous homeowner: portal + change order by token
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
do $$ begin
  if (select count(*) from change_orders) <> 0 then raise exception 'anon reads change_orders'; end if;
  if (select count(*) from job_files) <> 0 then raise exception 'anon reads job_files'; end if;
  begin perform public.approve_change_order_on_site((select v from t_ids where k='co_draft'), 'Anon', null, 'verbal'); raise exception 'anon on-site approval';
  exception when insufficient_privilege then null; end;
end $$;
select public.get_public_job('nope') is null as bad_token_null \gset
\if :bad_token_null \else \echo 'FAIL bad portal token returned data' \quit \endif
select public.get_public_job(:'job_token') as portal \gset
select (:'portal'::jsonb->>'title') = 'Hail replacement'
   and jsonb_array_length(:'portal'::jsonb->'photos') = 1
   and jsonb_array_length(:'portal'::jsonb->'events') = 1
   and (:'portal'::jsonb->'claim'->>'deductible')::numeric = 1000
   and jsonb_array_length(:'portal'::jsonb->'claim'->'checks') = 2
   and jsonb_array_length(:'portal'::jsonb->'change_orders') = 1
   and (:'portal'::jsonb->'change_orders'->0->>'total')::numeric = 480
   and (:'portal'::jsonb->'events'->0->>'photo') is not null
   and (:'portal'::jsonb->'customer'->>'first_name') = 'Hank'
   and (:'portal'::jsonb->'customer') ? 'phone' = false as portal_ok \gset
\if :portal_ok \else \echo 'FAIL portal payload' \quit \endif

select public.get_public_change_order(:'co_draft_token') is null as draft_hidden \gset
\if :draft_hidden \else \echo 'FAIL draft change order is public' \quit \endif
select jsonb_array_length(public.get_public_change_order(:'co_token')->'items') = 2
   and jsonb_array_length(public.get_public_change_order(:'co_token')->'photos') = 1 as co_visible \gset
\if :co_visible \else \echo 'FAIL sent change order not public' \quit \endif

-- name and signature required
do $$ begin
  begin perform public.approve_public_change_order('whatever', 'H', 'data:image/png;base64,AAAA'); raise exception 'short name accepted';
  exception when raise_exception then if sqlerrm not like '%full name%' then raise; end if; end;
end $$;
do $$ begin
  begin perform public.approve_public_change_order('whatever', 'Hank Homeowner', 'not-a-signature'); raise exception 'missing signature accepted';
  exception when raise_exception then if sqlerrm not like '%sign in the box%' then raise; end if; end;
end $$;
select public.approve_public_change_order(:'co_token', 'Hank Homeowner', 'data:image/png;base64,iVBORw0KGgo=', '1.2.3.4', 'test-agent') as approved \gset
\if :approved \else \echo 'FAIL public approval' \quit \endif
select public.approve_public_change_order(:'co_token', 'Hank Homeowner', 'data:image/png;base64,iVBORw0KGgo=') as approved_again \gset
\if :approved_again \echo 'FAIL double approval' \quit \endif
select (public.get_public_change_order(:'co_token')->>'status') = 'approved' as shows_approved \gset
\if :shows_approved \else \echo 'FAIL approved status not public' \quit \endif

-- Back to Fran: contract 3 effects (no final invoice yet -> new change_order invoice; costs by category)
set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'u1', true);
do $$
declare v_inv uuid; v_kind text;
begin
  select invoice_id into v_inv from change_orders where title = 'Rotten decking';
  select kind into v_kind from invoices where id = v_inv;
  if v_kind is distinct from 'change_order' then raise exception 'expected change_order invoice, got %', v_kind; end if;
  if (select count(*) from invoice_items where invoice_id = v_inv) <> 2 then raise exception 'invoice items not added'; end if;
  if (select subtotal from invoice_totals where invoice_id = v_inv) <> 480 then raise exception 'invoice subtotal wrong'; end if;
  if (select amount from job_costs where description = 'Change order: Rotten decking' and category = 'materials') <> 190 then raise exception 'materials cost wrong'; end if;
  if (select amount from job_costs where description = 'Change order: Rotten decking' and category = 'labor') <> 60 then raise exception 'labor cost wrong'; end if;
  if (select approved_ip from change_orders where title = 'Rotten decking') <> '1.2.3.4' then raise exception 'audit ip missing'; end if;
  if not exists (select 1 from notifications where kind = 'change_order_approved') then raise exception 'no approval notification'; end if;
  if not exists (select 1 from job_events where kind = 'change_order_approved') then raise exception 'no approval event'; end if;
end $$;

-- An open final invoice exists -> the next approval appends to it (verbal, on site, by an office user)
insert into invoices (org_id, job_id, kind, status) values (:'org1', :'job1', 'final', 'sent') returning id as final_inv \gset
insert into invoice_items (org_id, invoice_id, position, description, quantity, unit_price) values (:'org1', :'final_inv', 0, 'Roof', 1, 10000);
do $$ begin
  begin perform public.approve_change_order_on_site((select v from t_ids where k='co_draft'), 'Hank Homeowner', null, 'in_person_signature'); raise exception 'unsigned in-person accepted';
  exception when raise_exception then if sqlerrm not like '%sign in the box%' then raise; end if; end;
end $$;
select public.approve_change_order_on_site(:'co_draft', 'Hank Homeowner', null, 'verbal') as verbal_ok \gset
\if :verbal_ok \else \echo 'FAIL verbal approval' \quit \endif
do $$ begin
  if (select invoice_id from change_orders where title = 'Draft CO') <> (select id from invoices where kind = 'final') then raise exception 'not appended to final invoice'; end if;
  if (select count(*) from invoice_items i join invoices v on v.id = i.invoice_id where v.kind = 'final') <> 2 then raise exception 'final invoice line count wrong'; end if;
  if (select max(position) from invoice_items i join invoices v on v.id = i.invoice_id where v.kind = 'final') <> 1 then raise exception 'appended line position wrong'; end if;
  if exists (select 1 from job_costs where description = 'Change order: Draft CO') then raise exception 'zero-cost CO created a job cost'; end if;
  if (select approval_method from change_orders where title = 'Draft CO') <> 'verbal' then raise exception 'approval method not recorded'; end if;
end $$;

-- Inbound SMS matching (service role only): punctuation-insensitive, +1 prefix ok, unknown -> no row
set local role service_role;
select (select customer_id from public.match_customer_phone('+1' || :'phone10')) = :'cust1'::uuid
   and (select job_id from public.match_customer_phone('+1' || :'phone10')) = :'job1'::uuid
   and (select assigned_to from public.match_customer_phone(:'phone10')) = :'u1'::uuid
   and not exists (select 1 from public.match_customer_phone('+1 000 000 0000')) as sms_match_ok \gset
\if :sms_match_ok \else \echo 'FAIL inbound phone match' \quit \endif

\echo 'PASSED field_test'
rollback;
