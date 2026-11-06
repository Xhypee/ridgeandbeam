-- AU estimating (builder E): metric calculator support, GST-inclusive estimates, supplier-priced lines,
-- Australian price-book seed ($0 — each roofer sets their own prices or imports a supplier sheet),
-- public estimate payload with ABN + licence for the job's state.
-- Additive: new columns/functions; views keep their columns; existing orgs' price books are left alone.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
-- true: unit prices on the estimate already include GST (consumer quotes); false: GST is added on top.
-- Defaults to false so rows written by older code keep their meaning; the app sets it from the company setting.
alter table public.estimates add column if not exists gst_inclusive boolean not null default false;

-- Which supplier price-sheet row a line's cost/price came from (contract 1).
alter table public.estimate_items add column if not exists supplier_price_item_id uuid references public.supplier_price_items(id) on delete set null;
drop trigger if exists t_org_spi on public.estimate_items;
create trigger t_org_spi before insert or update on public.estimate_items
  for each row execute function public.check_parent_org('supplier_price_items', 'supplier_price_item_id');

-- Sheet profile / finish / cover width on price-book items (Good = ZINCALUME Custom Orb, Best = COLORBOND Klip-Lok…).
alter table public.catalog_items
  add column if not exists profile text,
  add column if not exists finish text,
  add column if not exists cover_width_mm numeric(8,1);

-- Company-wide calculator assumptions (tiles per m², sarking roll m², cover widths, steep threshold…), see roof.ts.
alter table public.organizations add column if not exists calc_defaults jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Totals: GST-inclusive estimates total the lines (less discount) and report the GST inside them.
-- Same columns as before (estimate_id, org_id, subtotal, taxable, tax, total, option_id, cost).
-- ---------------------------------------------------------------------------
create or replace view public.estimate_totals with (security_invoker = true) as
select e.id as estimate_id, e.org_id,
  coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) as subtotal,
  greatest(coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) - e.discount, 0) as taxable,
  case when e.gst_inclusive
    then round(greatest(coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) - e.discount, 0) * e.tax_rate / (100 + e.tax_rate), 2)
    else round(greatest(coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) - e.discount, 0) * e.tax_rate / 100, 2) end as tax,
  case when e.gst_inclusive
    then round(greatest(coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) - e.discount, 0), 2)
    else round(greatest(coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) - e.discount, 0) * (1 + e.tax_rate / 100), 2) end as total,
  public.estimate_effective_option(e.id) as option_id,
  coalesce(sum(round(i.quantity * i.unit_cost, 2)), 0) as cost
from public.estimates e
left join public.estimate_items i on i.estimate_id = e.id
  and (i.option_id is null or i.option_id = public.estimate_effective_option(e.id))
group by e.id;

create or replace view public.estimate_option_totals with (security_invoker = true) as
select o.id as option_id, o.estimate_id, o.org_id,
  coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) as subtotal,
  case when e.gst_inclusive
    then round(greatest(coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) - e.discount, 0) * e.tax_rate / (100 + e.tax_rate), 2)
    else round(greatest(coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) - e.discount, 0) * e.tax_rate / 100, 2) end as tax,
  case when e.gst_inclusive
    then round(greatest(coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) - e.discount, 0), 2)
    else round(greatest(coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) - e.discount, 0) * (1 + e.tax_rate / 100), 2) end as total,
  coalesce(sum(round(i.quantity * i.unit_cost, 2)), 0) as cost
from public.estimate_options o
join public.estimates e on e.id = o.estimate_id
left join public.estimate_items i on i.estimate_id = o.estimate_id and (i.option_id is null or i.option_id = o.id)
group by o.id, e.id;

-- ---------------------------------------------------------------------------
-- Atomic save: + org_supplier_id ("Price from"), gst_inclusive, and each line's supplier_price_item_id.
-- ---------------------------------------------------------------------------
create or replace function public.save_estimate_content(p_id uuid, p_estimate jsonb, p_options jsonb, p_items jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_est estimates;
  v_map jsonb := '{}'::jsonb;
  v_keep uuid[] := '{}';
  v_oid uuid;
  o jsonb;
  it jsonb;
  n int;
  v_rec_seen boolean := false;
begin
  select * into v_est from estimates where id = p_id for update;
  if v_est.id is null then raise exception 'Estimate not found.'; end if;
  if v_est.status = 'accepted' then
    raise exception 'This estimate was accepted by the customer and is locked. Duplicate it to make changes.';
  end if;
  if jsonb_typeof(coalesce(p_options, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid estimate payload.';
  end if;

  update estimates set
    measurements = coalesce(p_estimate->'measurements', measurements),
    tax_rate = coalesce((p_estimate->>'tax_rate')::numeric, tax_rate),
    discount = coalesce((p_estimate->>'discount')::numeric, discount),
    notes = p_estimate->>'notes',
    terms = p_estimate->>'terms',
    option_label = coalesce(p_estimate->>'option_label', option_label),
    measurement_source = coalesce(p_estimate->>'measurement_source', measurement_source),
    gst_inclusive = coalesce((p_estimate->>'gst_inclusive')::boolean, gst_inclusive),
    org_supplier_id = case when p_estimate ? 'org_supplier_id' then nullif(p_estimate->>'org_supplier_id', '')::uuid else org_supplier_id end
  where id = p_id;

  for o in select * from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
    v_oid := nullif(o->>'id', '')::uuid;
    if v_oid is not null and exists (select 1 from estimate_options where id = v_oid and estimate_id = p_id) then
      v_keep := v_keep || v_oid;
    end if;
  end loop;

  delete from estimate_items where estimate_id = p_id;
  delete from estimate_options where estimate_id = p_id and not (id = any (v_keep));
  update estimate_options set recommended = false where estimate_id = p_id;

  n := 0;
  for o in select * from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
    v_oid := nullif(o->>'id', '')::uuid;
    if v_oid is not null and v_oid = any (v_keep) then
      update estimate_options set
        position = n, name = coalesce(nullif(trim(o->>'name'), ''), 'Option ' || (n + 1)),
        tier = nullif(o->>'tier', ''), description = o->>'description', warranty = o->>'warranty',
        recommended = coalesce((o->>'recommended')::boolean, false) and not v_rec_seen
      where id = v_oid;
    else
      insert into estimate_options (org_id, estimate_id, position, name, tier, description, warranty, recommended)
      values (v_est.org_id, p_id, n, coalesce(nullif(trim(o->>'name'), ''), 'Option ' || (n + 1)),
              nullif(o->>'tier', ''), o->>'description', o->>'warranty',
              coalesce((o->>'recommended')::boolean, false) and not v_rec_seen)
      returning id into v_oid;
    end if;
    v_rec_seen := v_rec_seen or coalesce((o->>'recommended')::boolean, false);
    v_map := v_map || jsonb_build_object(coalesce(o->>'key', v_oid::text), v_oid);
    n := n + 1;
  end loop;

  n := 0;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if nullif(it->>'option_key', '') is not null and v_map->>(it->>'option_key') is null then
      raise exception 'Line "%" points at an option that does not exist.', it->>'description';
    end if;
    insert into estimate_items (org_id, estimate_id, position, description, quantity, unit, unit_price, unit_cost, category, calc_key, option_id, supplier_price_item_id)
    values (v_est.org_id, p_id, n, it->>'description', coalesce((it->>'quantity')::numeric, 0), coalesce(it->>'unit', 'ea'),
            coalesce((it->>'unit_price')::numeric, 0), coalesce((it->>'unit_cost')::numeric, 0),
            coalesce(it->>'category', 'material'), nullif(it->>'calc_key', ''),
            case when nullif(it->>'option_key', '') is null then null else (v_map->>(it->>'option_key'))::uuid end,
            nullif(it->>'supplier_price_item_id', '')::uuid);
    n := n + 1;
  end loop;
  return v_map;
end $$;
revoke all on function public.save_estimate_content(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_estimate_content(uuid, jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Australian price book. Prices start at $0: there are no reliable public trade prices and each roofer's
-- supplier pricing is their own (import a sheet in Settings → Suppliers, or type prices in Settings → Price book).
-- Keys/units match src/lib/calc-keys.ts (+ membrane_roof, requested). Callable by an org admin (create_organization,
-- or "Add Australian items" for an existing company); never overwrites existing rows.
-- ---------------------------------------------------------------------------
create or replace function public.seed_catalog_au(p_org uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_org_admin(p_org) then raise exception 'only owners and admins can add price-book items'; end if;
  insert into catalog_items (org_id, calc_key, tier, name, unit, unit_price, unit_cost, category, profile, finish, cover_width_mm) values
    (p_org, 'metal_sheet',      'good',   'ZINCALUME Custom Orb 0.42 BMT',            'lm',    0, 0, 'material', 'custom_orb', 'ZINCALUME', 762),
    (p_org, 'metal_sheet',      'better', 'COLORBOND Trimdek 0.42 BMT',               'lm',    0, 0, 'material', 'trimdek',    'COLORBOND', 762),
    (p_org, 'metal_sheet',      'best',   'COLORBOND Klip-Lok 700 0.48 BMT',          'lm',    0, 0, 'material', 'klip_lok',   'COLORBOND', 700),
    (p_org, 'ridge_capping',    null,     'Ridge & hip capping',                      'lm',    0, 0, 'material', null, null, null),
    (p_org, 'barge_capping',    null,     'Barge capping',                            'lm',    0, 0, 'material', null, null, null),
    (p_org, 'valley_iron',      null,     'Valley iron',                              'lm',    0, 0, 'material', null, null, null),
    (p_org, 'flashing',         null,     'Apron / wall flashing',                    'lm',    0, 0, 'material', null, null, null),
    (p_org, 'roof_screws',      null,     'Roofing screws (box)',                     'box',   0, 0, 'material', null, null, null),
    (p_org, 'roof_tile',        null,     'Roof tiles',                               'ea',    0, 0, 'material', null, null, null),
    (p_org, 'ridge_tile',       null,     'Ridge / hip tiles',                        'ea',    0, 0, 'material', null, null, null),
    (p_org, 'tile_battens',     null,     'Tile battens',                             'lm',    0, 0, 'material', null, null, null),
    (p_org, 'pointing',         null,     'Flexible pointing',                        'bag',   0, 0, 'material', null, null, null),
    (p_org, 'sarking',          null,     'Sarking (roll)',                           'roll',  0, 0, 'material', null, null, null),
    (p_org, 'safety_mesh',      null,     'Safety mesh (roll)',                       'roll',  0, 0, 'material', null, null, null),
    (p_org, 'membrane_roof',    null,     'Membrane roofing system',                  'm2',    0, 0, 'material', null, null, null),
    (p_org, 'gutter',           null,     'Gutter',                                   'lm',    0, 0, 'material', null, null, null),
    (p_org, 'downpipe',         null,     'Downpipe',                                 'ea',    0, 0, 'material', null, null, null),
    (p_org, 'whirlybird',       null,     'Whirlybird roof vent',                     'ea',    0, 0, 'material', null, null, null),
    (p_org, 'restore_clean',    null,     'High-pressure clean',                      'm2',    0, 0, 'labor',    null, null, null),
    (p_org, 'rebed_repoint',    null,     'Rebed & repoint ridge capping',            'lm',    0, 0, 'labor',    null, null, null),
    (p_org, 'roof_coating',     null,     'Roof coating (membrane paint)',            'm2',    0, 0, 'material', null, null, null),
    (p_org, 'tile_replace',     null,     'Replace broken tiles',                     'ea',    0, 0, 'labor',    null, null, null),
    (p_org, 'labour_strip',     null,     'Strip & dispose of old roof',              'm2',    0, 0, 'labor',    null, null, null),
    (p_org, 'labour_install',   null,     'Installation labour',                      'm2',    0, 0, 'labor',    null, null, null),
    (p_org, 'labour_steep',     null,     'Steep roof allowance',                     'm2',    0, 0, 'labor',    null, null, null),
    (p_org, 'asbestos_removal', null,     'Licensed asbestos removal & disposal',     'm2',    0, 0, 'other',    null, null, null),
    (p_org, 'edge_protection',  null,     'Edge protection / scaffold',               'job',   0, 0, 'other',    null, null, null),
    (p_org, 'skip_bin',         null,     'Skip bin',                                 'ea',    0, 0, 'other',    null, null, null)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.seed_catalog_au(uuid) from public, anon;
grant execute on function public.seed_catalog_au(uuid) to authenticated;

-- The old v2 seeder (US shingles/warranty tiers) now seeds the Australian items instead.
create or replace function public.seed_catalog_v2(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_catalog_au(p_org);
end $$;
revoke all on function public.seed_catalog_v2(uuid) from public, anon;
grant execute on function public.seed_catalog_v2(uuid) to authenticated;

-- New companies: Australian price book only, GST 10%, neutral quote terms (no state-law deposit wording).
create or replace function public.create_organization(p_name text, p_full_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_email text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into organizations (name, email, tax_rate, estimate_terms)
  values (p_name, v_email, 10, 'This quote is valid for 30 days. All prices are in Australian dollars and include GST.')
  returning id into v_org;
  insert into memberships (org_id, user_id, role, full_name, email) values (v_org, auth.uid(), 'owner', p_full_name, v_email);
  perform public.seed_catalog_au(v_org);
  return v_org;
end $$;
revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Public estimate payload (AU): business name, ABN, GST status, the licence for the job's state,
-- GST-inclusive flag, Australian address parts. get_public_document is left as is for older callers.
-- Job state -> customer state -> company state.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_estimate(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  select jsonb_build_object(
    'kind', 'estimate', 'id', e.id, 'number', e.number, 'status', e.status, 'created_at', e.created_at, 'sent_at', e.sent_at,
    'notes', e.notes, 'terms', e.terms, 'tax_rate', e.tax_rate, 'discount', e.discount, 'gst_inclusive', e.gst_inclusive,
    'accepted_at', e.accepted_at, 'accepted_name', e.accepted_name,
    'option_label', e.option_label, 'selected_option_id', e.selected_option_id,
    'signature_data', case when e.status = 'accepted' then e.signature_data end,
    'legal_notices', e.legal_notices,
    'state', s.state,
    'org', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'address', o.address, 'website', o.website,
      'state', o.state, 'postcode', o.zip, 'abn', o.abn, 'gst_registered', o.gst_registered,
      'insurance_certificate_url', o.insurance_certificate_url,
      'licence', case when s.state is not null then o.licences -> s.state end),
    'financing', jsonb_build_object('enabled', coalesce((o.financing->>'enabled')::boolean, false),
      'apr', coalesce((o.financing->>'apr')::numeric, 0), 'term_months', coalesce((o.financing->>'term_months')::int, 0)),
    'customer', jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone,
      'street', c.address, 'suburb', c.city, 'state', c.state, 'postcode', c.zip),
    'job', jsonb_build_object('title', j.title, 'site_address', j.site_address, 'state', j.state, 'is_insurance', j.is_insurance),
    'options', coalesce((select jsonb_agg(jsonb_build_object('id', op.id, 'name', op.name, 'tier', op.tier,
                  'description', op.description, 'warranty', op.warranty, 'recommended', op.recommended, 'position', op.position)
                  order by op.position) from estimate_options op where op.estimate_id = e.id), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('description', i.description, 'quantity', i.quantity, 'unit', i.unit,
                  'unit_price', i.unit_price, 'option_id', i.option_id) order by i.position)
                  from estimate_items i where i.estimate_id = e.id), '[]'::jsonb)
  ) into r
  from estimates e
  join jobs j on j.id = e.job_id
  join customers c on c.id = j.customer_id
  join organizations o on o.id = e.org_id
  cross join lateral (select coalesce(nullif(upper(trim(j.state)), ''), nullif(upper(trim(c.state)), ''), nullif(upper(trim(o.state)), '')) as state) s
  where e.public_token = p_token and e.status <> 'draft';
  return r;
end $$;
revoke all on function public.get_public_estimate(text) from public;
grant execute on function public.get_public_estimate(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Web leads (instant quote / hosted form): Australian state codes are 2–3 letters (NSW, VIC, QLD…).
-- Same function as 20261108000500_growth.sql with left(state, 2) -> left(state, 3).
-- ---------------------------------------------------------------------------
create or replace function public.submit_public_lead(p_key text, p_lead jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org organizations; v_customer uuid; v_job uuid; v_name text; v_assignee uuid; v_role member_role;
begin
  select * into v_org from organizations where intake_key = p_key;
  if v_org.id is null or not public.org_is_live(v_org) then raise exception 'unknown intake key'; end if;
  v_name := nullif(trim(coalesce(p_lead->>'name', '')), '');
  if v_name is null then raise exception 'name is required'; end if;
  if coalesce(nullif(trim(p_lead->>'phone'), ''), nullif(trim(p_lead->>'email'), '')) is null then raise exception 'phone or email is required'; end if;

  insert into customers (org_id, name, email, phone, address, city, state, zip, source, notes)
  values (v_org.id, left(v_name, 200), left(nullif(trim(p_lead->>'email'), ''), 200), left(nullif(trim(p_lead->>'phone'), ''), 50), left(p_lead->>'address', 300),
          left(p_lead->>'city', 100), upper(left(p_lead->>'state', 3)), left(p_lead->>'zip', 20),
          case when p_lead->>'source' in ('referral','website','door_knock','storm','repeat','ads','other') then (p_lead->>'source')::customer_source else 'website' end,
          left(p_lead->>'message', 4000))
  returning id into v_customer;

  v_assignee := public.next_lead_assignee(v_org.id);
  select role into v_role from memberships where org_id = v_org.id and user_id = v_assignee;

  insert into jobs (org_id, customer_id, title, site_address, state, zip, lead_source, notes, is_insurance, lead_received_at, assigned_to, sales_rep_id)
  values (v_org.id, v_customer, coalesce(left(p_lead->>'title', 200), 'New web lead'),
          nullif(concat_ws(', ', nullif(p_lead->>'address', ''), nullif(p_lead->>'city', ''), nullif(p_lead->>'state', ''), nullif(p_lead->>'zip', '')), ''),
          upper(left(p_lead->>'state', 3)), left(p_lead->>'zip', 20), coalesce(left(p_lead->>'source_detail', 100), left(p_lead->>'source', 50), 'website'),
          left(p_lead->>'quote_summary', 4000), coalesce((p_lead->>'insurance')::boolean, false), now(),
          v_assignee, case when v_role = 'sales_rep' then v_assignee end)
  returning id into v_job;

  insert into notifications (org_id, kind, title, body, url)
  values (v_org.id, 'new_lead', 'New lead: ' || v_name, coalesce(p_lead->>'phone', p_lead->>'email'), '/app/jobs/' || v_job);
  if v_assignee is not null then
    insert into notifications (org_id, user_id, kind, title, body, url)
    values (v_org.id, v_assignee, 'lead_assigned', 'Call now: ' || v_name || ' was assigned to you',
            concat_ws(' · ', nullif(p_lead->>'phone', ''), nullif(p_lead->>'email', ''), nullif(p_lead->>'city', '')), '/app/jobs/' || v_job);
  end if;

  return jsonb_build_object('job_id', v_job, 'org_name', v_org.name);
end $$;
revoke all on function public.submit_public_lead(text, jsonb) from public;
grant execute on function public.submit_public_lead(text, jsonb) to anon, authenticated;
