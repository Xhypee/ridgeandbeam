-- Docket, round 2: the customer's choices and stable quotes.
--   1. The customer can pick the COLORBOND colour (estimates.customer_colour, on by default). The sheet line keeps a
--      price per finish (estimate_items.variants: {"colorbond": {...}, "zincalume": {...}}, written by the roofer's
--      docket from the price book / supplier sheet); acceptance re-prices the line from those, never from the browser.
--   2. Extras the roofer adds are optional unless marked required (estimate_items.required); the customer can remove
--      optional ones (stored as offered + customer_removed, so every total, invoice and order leaves them out).
--   3. A price-book row for every sheet profile × finish (ZINCALUME and COLORBOND Custom Orb, Trimdek, Klip-Lok 700).
--      The unique index now includes profile and finish so the untiered rows can sit next to the Good/Better/Best ones.
--   5. Line ids are kept across saves (save_estimate_content updates lines in place) and estimates.version moves on
--      every change, so the customer page can notice an edit and acceptance can refuse a price the customer didn't see.

alter table public.estimates
  add column if not exists version int not null default 1,
  add column if not exists customer_colour boolean not null default true,
  add column if not exists colour_by_customer boolean not null default false;

alter table public.estimate_items
  add column if not exists required boolean not null default false,
  add column if not exists customer_removed boolean not null default false,
  add column if not exists variants jsonb check (variants is null or jsonb_typeof(variants) = 'object');

-- ---------------------------------------------------------------------------
-- The colours a docket offers (keep in step with COLOURS in src/lib/docket.ts; a unit test checks).
-- ---------------------------------------------------------------------------
create or replace function public.docket_colours() returns text[] language sql immutable as $$
  select array['Monument', 'Surfmist', 'Basalt', 'Woodland Grey', 'Shale Grey', 'Dune', 'Jasper', 'Manor Red', 'Windspray',
               'Paperbark', 'Classic Cream', 'Night Sky', 'ZINCALUME']::text[];
$$;
create or replace function public.colour_finish(p_colour text) returns text language sql immutable as $$
  select case when p_colour ilike '%zincalume%' then 'zincalume' when p_colour is null then null else 'colorbond' end;
$$;

-- ---------------------------------------------------------------------------
-- Version: bumped by save_estimate_content and by any change to what the customer sees on the quote.
-- ---------------------------------------------------------------------------
create or replace function public.estimates_bump_version() returns trigger language plpgsql as $$
begin
  if new.version = old.version and (
       new.measurements is distinct from old.measurements or new.discount is distinct from old.discount
    or new.tax_rate is distinct from old.tax_rate or new.gst_inclusive is distinct from old.gst_inclusive
    or new.notes is distinct from old.notes or new.terms is distinct from old.terms
    or new.roof_profile is distinct from old.roof_profile or new.roof_colour is distinct from old.roof_colour
    or new.customer_colour is distinct from old.customer_colour or new.option_label is distinct from old.option_label) then
    new.version := old.version + 1;
  end if;
  return new;
end $$;
drop trigger if exists t_estimates_version on public.estimates;
create trigger t_estimates_version before update on public.estimates for each row execute function public.estimates_bump_version();

-- ---------------------------------------------------------------------------
-- Price book: one row per sheet profile × finish.
-- ---------------------------------------------------------------------------
drop index if exists public.catalog_items_org_calc_tier;
create unique index catalog_items_org_calc_tier on public.catalog_items (org_id, calc_key, tier, profile, finish) nulls not distinct;

create or replace function public.seed_catalog_au(p_org uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_org_admin(p_org) then raise exception 'only owners and admins can add price-book items'; end if;
  insert into catalog_items (org_id, calc_key, tier, name, unit, unit_price, unit_cost, category, profile, finish, cover_width_mm) values
    (p_org, 'metal_sheet',      'good',   'ZINCALUME Custom Orb 0.42 BMT',            'lm',    0, 0, 'material', 'custom_orb', 'ZINCALUME', 762),
    (p_org, 'metal_sheet',      'better', 'COLORBOND Trimdek 0.42 BMT',               'lm',    0, 0, 'material', 'trimdek',    'COLORBOND', 762),
    (p_org, 'metal_sheet',      'best',   'COLORBOND Klip-Lok 700 0.48 BMT',          'lm',    0, 0, 'material', 'klip_lok',   'COLORBOND', 700),
    (p_org, 'metal_sheet',      null,     'COLORBOND Custom Orb 0.42 BMT',            'lm',    0, 0, 'material', 'custom_orb', 'COLORBOND', 762),
    (p_org, 'metal_sheet',      null,     'ZINCALUME Trimdek 0.42 BMT',               'lm',    0, 0, 'material', 'trimdek',    'ZINCALUME', 762),
    (p_org, 'metal_sheet',      null,     'ZINCALUME Klip-Lok 700 0.48 BMT',          'lm',    0, 0, 'material', 'klip_lok',   'ZINCALUME', 700),
    (p_org, 'ridge_capping',    null,     'Ridge & hip capping',                      'lm',    0, 0, 'material', null, null, null),
    (p_org, 'barge_capping',    null,     'Barge capping',                            'lm',    0, 0, 'material', null, null, null),
    (p_org, 'valley_iron',      null,     'Valley iron',                              'lm',    0, 0, 'material', null, null, null),
    (p_org, 'flashing',         null,     'Apron / wall flashing',                    'lm',    0, 0, 'material', null, null, null),
    (p_org, 'roof_screws',      null,     'Roofing screws (box)',                     'box',   0, 0, 'material', null, null, null),
    (p_org, 'roof_tile',        null,     'Roof tiles',                               'ea',    0, 0, 'material', null, null, null),
    (p_org, 'ridge_tile',       null,     'Ridge / hip tiles',                        'ea',    0, 0, 'material', null, null, null),
    (p_org, 'roof_battens',     null,     'Roof battens (top hat)',                   'lm',    0, 0, 'material', null, null, null),
    (p_org, 'fascia',           null,     'Metal fascia',                             'lm',    0, 0, 'material', null, null, null),
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

-- Existing companies with the Australian sheet rows: add each missing profile × finish at $0.
insert into public.catalog_items (org_id, calc_key, tier, name, unit, unit_price, unit_cost, category, profile, finish, cover_width_mm)
select o.org_id, 'metal_sheet', null, k.name, 'lm', 0, 0, 'material', k.profile, k.finish, k.cover
from (select distinct org_id from public.catalog_items where calc_key = 'metal_sheet') o
cross join (values
  ('ZINCALUME Custom Orb 0.42 BMT', 'custom_orb', 'ZINCALUME', 762), ('COLORBOND Custom Orb 0.42 BMT', 'custom_orb', 'COLORBOND', 762),
  ('ZINCALUME Trimdek 0.42 BMT', 'trimdek', 'ZINCALUME', 762), ('COLORBOND Trimdek 0.42 BMT', 'trimdek', 'COLORBOND', 762),
  ('ZINCALUME Klip-Lok 700 0.48 BMT', 'klip_lok', 'ZINCALUME', 700), ('COLORBOND Klip-Lok 700 0.48 BMT', 'klip_lok', 'COLORBOND', 700)
) as k(name, profile, finish, cover)
where not exists (
  select 1 from public.catalog_items c
  where c.org_id = o.org_id and c.calc_key = 'metal_sheet' and c.profile = k.profile
    and (upper(coalesce(c.finish, '')) = k.finish or upper(c.name) like k.finish || '%'))
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Atomic save, lines kept by id: a line sent with the id of one of this quote's lines is updated in place; a line
-- with a new id (made in the browser) or none is inserted; lines not sent are deleted. Returns the option map plus
-- "__items": the saved line ids in order. Bumps estimates.version.
-- ---------------------------------------------------------------------------
create or replace function public.save_estimate_content(p_id uuid, p_estimate jsonb, p_options jsonb, p_items jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_est estimates;
  v_map jsonb := '{}'::jsonb;
  v_keep uuid[] := '{}';
  v_items uuid[] := '{}';
  v_oid uuid;
  v_iid uuid;
  v_opt uuid;
  o jsonb;
  it jsonb;
  n int;
  v_rec_seen boolean := false;
  v_extra text;
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
    version = version + 1,
    measurements = coalesce(p_estimate->'measurements', measurements),
    tax_rate = coalesce((p_estimate->>'tax_rate')::numeric, tax_rate),
    discount = coalesce((p_estimate->>'discount')::numeric, discount),
    notes = p_estimate->>'notes',
    terms = p_estimate->>'terms',
    option_label = coalesce(p_estimate->>'option_label', option_label),
    measurement_source = coalesce(p_estimate->>'measurement_source', measurement_source),
    gst_inclusive = coalesce((p_estimate->>'gst_inclusive')::boolean, gst_inclusive),
    org_supplier_id = case when p_estimate ? 'org_supplier_id' then nullif(p_estimate->>'org_supplier_id', '')::uuid else org_supplier_id end,
    roof_profile = case when p_estimate ? 'roof_profile' then nullif(p_estimate->>'roof_profile', '') else roof_profile end,
    roof_colour = case when p_estimate ? 'roof_colour' then nullif(left(trim(p_estimate->>'roof_colour'), 40), '') else roof_colour end,
    customer_colour = coalesce((p_estimate->>'customer_colour')::boolean, customer_colour),
    colour_by_customer = case when p_estimate ? 'roof_colour' and nullif(left(trim(p_estimate->>'roof_colour'), 40), '') is distinct from roof_colour then false else colour_by_customer end
  where id = p_id;

  for o in select * from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
    v_oid := nullif(o->>'id', '')::uuid;
    if v_oid is not null and exists (select 1 from estimate_options where id = v_oid and estimate_id = p_id) then
      v_keep := v_keep || v_oid;
    end if;
  end loop;

  -- Lines in the payload that belong to this quote keep their id; the rest of this quote's lines go.
  delete from estimate_items where estimate_id = p_id and not (id = any (
    array(select nullif(x->>'id', '')::uuid from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x where nullif(x->>'id', '') is not null)));
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
    v_extra := case when it->>'extra_status' in ('added', 'offered') then it->>'extra_status' end;
    v_opt := case when nullif(it->>'option_key', '') is null then null else (v_map->>(it->>'option_key'))::uuid end;
    v_iid := nullif(it->>'id', '')::uuid;
    if v_iid is not null and v_iid = any (v_items) then v_iid := null; end if; -- the same id twice: the second is a new line
    if v_iid is not null and exists (select 1 from estimate_items where id = v_iid and estimate_id = p_id) then
      update estimate_items set
        position = n, description = it->>'description', quantity = coalesce((it->>'quantity')::numeric, 0), unit = coalesce(it->>'unit', 'ea'),
        unit_price = coalesce((it->>'unit_price')::numeric, 0), unit_cost = coalesce((it->>'unit_cost')::numeric, 0),
        category = coalesce(it->>'category', 'material'), calc_key = nullif(it->>'calc_key', ''), option_id = v_opt,
        supplier_price_item_id = nullif(it->>'supplier_price_item_id', '')::uuid,
        extra_status = v_extra, blurb = nullif(left(trim(it->>'blurb'), 200), ''),
        customer_added = coalesce((it->>'customer_added')::boolean, false) and v_extra = 'added',
        customer_removed = coalesce((it->>'customer_removed')::boolean, false) and v_extra = 'offered',
        required = coalesce((it->>'required')::boolean, false) and v_extra = 'added',
        variants = case when jsonb_typeof(it->'variants') = 'object' then it->'variants' end
      where id = v_iid;
    else
      begin
        insert into estimate_items (id, org_id, estimate_id, position, description, quantity, unit, unit_price, unit_cost, category, calc_key, option_id,
                                    supplier_price_item_id, extra_status, blurb, customer_added, customer_removed, required, variants)
        values (coalesce(v_iid, gen_random_uuid()), v_est.org_id, p_id, n, it->>'description', coalesce((it->>'quantity')::numeric, 0), coalesce(it->>'unit', 'ea'),
                coalesce((it->>'unit_price')::numeric, 0), coalesce((it->>'unit_cost')::numeric, 0),
                coalesce(it->>'category', 'material'), nullif(it->>'calc_key', ''), v_opt,
                nullif(it->>'supplier_price_item_id', '')::uuid,
                v_extra, nullif(left(trim(it->>'blurb'), 200), ''),
                coalesce((it->>'customer_added')::boolean, false) and v_extra = 'added',
                coalesce((it->>'customer_removed')::boolean, false) and v_extra = 'offered',
                coalesce((it->>'required')::boolean, false) and v_extra = 'added',
                case when jsonb_typeof(it->'variants') = 'object' then it->'variants' end)
        returning id into v_iid;
      exception when unique_violation then
        -- an id taken elsewhere: a fresh one
        insert into estimate_items (org_id, estimate_id, position, description, quantity, unit, unit_price, unit_cost, category, calc_key, option_id,
                                    supplier_price_item_id, extra_status, blurb, customer_added, customer_removed, required, variants)
        values (v_est.org_id, p_id, n, it->>'description', coalesce((it->>'quantity')::numeric, 0), coalesce(it->>'unit', 'ea'),
                coalesce((it->>'unit_price')::numeric, 0), coalesce((it->>'unit_cost')::numeric, 0),
                coalesce(it->>'category', 'material'), nullif(it->>'calc_key', ''), v_opt,
                nullif(it->>'supplier_price_item_id', '')::uuid,
                v_extra, nullif(left(trim(it->>'blurb'), 200), ''),
                coalesce((it->>'customer_added')::boolean, false) and v_extra = 'added',
                coalesce((it->>'customer_removed')::boolean, false) and v_extra = 'offered',
                coalesce((it->>'required')::boolean, false) and v_extra = 'added',
                case when jsonb_typeof(it->'variants') = 'object' then it->'variants' end)
        returning id into v_iid;
      end;
    end if;
    v_items := v_items || v_iid;
    n := n + 1;
  end loop;
  return v_map || jsonb_build_object('__items', to_jsonb(v_items));
end $$;
revoke all on function public.save_estimate_content(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_estimate_content(uuid, jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Public payload: + version, colour choice, required / removed flags, per-finish sheet prices (no costs),
-- the satellite tracing (lat/lng facets) for the roof drawing. Same as 20261112000100_docket.sql otherwise.
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
    'version', e.version,
    'roof_profile', e.roof_profile, 'roof_colour', e.roof_colour,
    'customer_colour', e.customer_colour, 'colour_by_customer', e.colour_by_customer, 'colours', to_jsonb(public.docket_colours()),
    'roof', jsonb_build_object(
      'job_type', e.measurements->'jobType',
      'sections', case when jsonb_typeof(e.measurements->'sections') = 'array' then
        (select coalesce(jsonb_agg(jsonb_build_object('label', x->'label', 'area', x->'area', 'pitch', x->'pitch', 'system', x->'system', 'profile', x->'profile')), '[]'::jsonb)
         from jsonb_array_elements(e.measurements->'sections') x) else '[]'::jsonb end,
      'plan', case when jsonb_typeof(e.measurements->'plans'->'lines') = 'array' then jsonb_build_object(
        'lines', e.measurements->'plans'->'lines', 'scale', e.measurements->'plans'->'scale', 'pitch', e.measurements->'plans'->'pitch') end,
      'satellite', case when jsonb_typeof(e.measurements->'satellite'->'facets') = 'array' then
        (select coalesce(jsonb_agg(jsonb_build_object('label', f->'label', 'points', f->'points')), '[]'::jsonb)
         from jsonb_array_elements(e.measurements->'satellite'->'facets') f) end),
    'org', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'address', o.address, 'website', o.website,
      'state', o.state, 'postcode', o.zip, 'abn', o.abn, 'gst_registered', o.gst_registered,
      'insurance_certificate_url', o.insurance_certificate_url,
      'licence', case when s.state is not null then o.licences -> s.state end),
    'financing', jsonb_build_object('enabled', coalesce((o.financing->>'enabled')::boolean, false),
      'apr', coalesce((o.financing->>'apr')::numeric, 0), 'term_months', coalesce((o.financing->>'term_months')::int, 0)),
    'customer', jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone,
      'street', c.address, 'suburb', c.city, 'state', c.state, 'postcode', c.zip),
    'job', jsonb_build_object('title', j.title, 'site_address', j.site_address, 'state', j.state, 'is_insurance', j.is_insurance,
      'roof_material', j.roof_material, 'job_type', j.job_type, 'lead_source', j.lead_source),
    'compliance', case when p.job_id is not null then jsonb_build_object(
      'roof_system', p.roof_system, 'au_job_type', p.au_job_type, 'owner_occupier', p.owner_occupier, 'existing_house', p.existing_house,
      'building_approval_required', p.building_approval_required, 'built_before_1990', p.built_before_1990, 'door_knock_sale', p.door_knock_sale,
      'urgent_work', p.urgent_work, 'paint_or_coat_only', p.paint_or_coat_only, 'mixed_work', p.mixed_work, 'subcontract', p.subcontract,
      'disaster_emergency_repair', p.disaster_emergency_repair, 'contract_copy_given_on', p.contract_copy_given_on) end,
    'options', coalesce((select jsonb_agg(jsonb_build_object('id', op.id, 'name', op.name, 'tier', op.tier,
                  'description', op.description, 'warranty', op.warranty, 'recommended', op.recommended, 'position', op.position)
                  order by op.position) from estimate_options op where op.estimate_id = e.id), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'description', i.description, 'quantity', i.quantity, 'unit', i.unit,
                  'unit_price', i.unit_price, 'option_id', i.option_id, 'calc_key', i.calc_key, 'extra_status', i.extra_status,
                  'blurb', i.blurb, 'customer_added', i.customer_added, 'customer_removed', i.customer_removed, 'required', i.required,
                  'variants', case when i.variants is not null then
                    (select jsonb_object_agg(k, jsonb_build_object('name', v->'name', 'unit_price', v->'unit_price')) from jsonb_each(i.variants) as vv(k, v)) end)
                  order by i.position)
                  from estimate_items i where i.estimate_id = e.id), '[]'::jsonb)
  ) into r
  from estimates e
  join jobs j on j.id = e.job_id
  join customers c on c.id = j.customer_id
  join organizations o on o.id = e.org_id
  left join job_compliance_profiles p on p.job_id = j.id
  cross join lateral (select coalesce(nullif(upper(trim(j.state)), ''), nullif(upper(trim(c.state)), ''), nullif(upper(trim(o.state)), '')) as state) s
  where e.public_token = p_token and e.status <> 'draft';
  return r;
end $$;
revoke all on function public.get_public_estimate(text) from public;
grant execute on function public.get_public_estimate(text) to anon, authenticated;

-- Cheap check for the customer page: has the quote changed since it was loaded?
create or replace function public.public_estimate_version(p_token text) returns int
language sql stable security definer set search_path = public as $$
  select version from estimates where public_token = p_token and status <> 'draft';
$$;
revoke all on function public.public_estimate_version(text) from public;
grant execute on function public.public_estimate_version(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Signed acceptance with the customer's choices: extras added (offered lines only), optional extras removed
-- (added, not required), the colour (from the list, if the roofer allows it; the sheet line is re-priced from the
-- prices the roofer saved for that finish), and the version the customer saw (a changed quote is refused with
-- QUOTE_CHANGED so the page can refresh).
-- ---------------------------------------------------------------------------
create or replace function public.accept_public_estimate(
  p_token text, p_name text, p_option_id uuid, p_signature text, p_ip text, p_user_agent text, p_notices jsonb,
  p_extras uuid[], p_removed uuid[], p_colour text, p_version int
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_est estimates; v_has_options boolean; v_notices jsonb; v_extras uuid[]; v_removed uuid[]; v_added text; v_gone text;
  v_colour text; v_finish text; it record; v jsonb; v_base text;
begin
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'please type your full name to sign'; end if;
  if p_signature is null or p_signature not like 'data:image/png;base64,%' or length(p_signature) < 100 then
    raise exception 'please draw your signature';
  end if;
  if length(p_signature) > 600000 then raise exception 'signature image is too large'; end if;
  select * into v_est from estimates where public_token = p_token and status = 'sent' for update;
  if v_est.id is null then return false; end if;
  if p_version is not null and p_version <> v_est.version then
    raise exception 'QUOTE_CHANGED: this quote was just updated. Refresh to see the latest version.';
  end if;

  v_has_options := exists (select 1 from estimate_options where estimate_id = v_est.id);
  if v_has_options then
    if p_option_id is null or not exists (select 1 from estimate_options where id = p_option_id and estimate_id = v_est.id) then
      raise exception 'please choose an option';
    end if;
  else
    p_option_id := null;
  end if;

  v_extras := array(select distinct x from unnest(coalesce(p_extras, '{}'::uuid[])) x where x is not null);
  v_removed := array(select distinct x from unnest(coalesce(p_removed, '{}'::uuid[])) x where x is not null);
  if cardinality(v_extras) + cardinality(v_removed) > 60 then raise exception 'too many extras'; end if;
  if exists (
    select 1 from unnest(v_extras) x
    where not exists (select 1 from estimate_items i where i.id = x and i.estimate_id = v_est.id and i.extra_status = 'offered'
                        and (i.option_id is null or i.option_id = p_option_id))
  ) then
    raise exception 'That extra is no longer on offer on this quote. Refresh the page and try again.';
  end if;
  if exists (
    select 1 from unnest(v_removed) x
    where not exists (select 1 from estimate_items i where i.id = x and i.estimate_id = v_est.id and i.extra_status = 'added' and not i.required
                        and (i.option_id is null or i.option_id = p_option_id))
  ) then
    raise exception 'That extra can''t be removed from this quote. Refresh the page and try again.';
  end if;

  -- Colour.
  v_colour := nullif(trim(coalesce(p_colour, '')), '');
  if v_colour is not null and v_colour is distinct from v_est.roof_colour then
    if not v_est.customer_colour then raise exception 'The colour on this quote is set by %.', (select name from organizations where id = v_est.org_id); end if;
    if not (v_colour = any (public.docket_colours())) then raise exception 'Please choose one of the colours shown.'; end if;
    v_finish := public.colour_finish(v_colour);
    for it in select * from estimate_items i where i.estimate_id = v_est.id and i.calc_key = 'metal_sheet' and i.extra_status is null
                and (i.option_id is null or i.option_id = p_option_id) loop
      v := it.variants -> v_finish;
      if v is not null and coalesce((v->>'unit_price')::numeric, 0) > 0 then
        update estimate_items set description = left(case when position(lower(v_colour) in lower(v->>'name')) > 0 then v->>'name' else (v->>'name') || ' · ' || v_colour end, 500), unit_price = (v->>'unit_price')::numeric,
          unit_cost = coalesce((v->>'unit_cost')::numeric, unit_cost), supplier_price_item_id = nullif(v->>'supplier_price_item_id', '')::uuid
        where id = it.id;
      elsif public.colour_finish(v_est.roof_colour) = v_finish or (v_est.roof_colour is null and v_finish = 'colorbond') then
        v_base := it.description;
        if v_est.roof_colour is not null and right(v_base, length(' · ' || v_est.roof_colour)) = ' · ' || v_est.roof_colour then
          v_base := left(v_base, length(v_base) - length(' · ' || v_est.roof_colour));
        end if;
        update estimate_items set description = left(v_base || ' · ' || v_colour, 500) where id = it.id;
      else
        raise exception 'That colour isn''t available on this quote. Please choose another.';
      end if;
    end loop;
    update estimates set roof_colour = v_colour, colour_by_customer = true where id = v_est.id;
  end if;

  v_notices := case
    when jsonb_typeof(p_notices) = 'array' and jsonb_array_length(p_notices) <= 20 and length(p_notices::text) <= 60000 then p_notices
    else '[]'::jsonb end;

  if cardinality(v_extras) > 0 then
    update estimate_items set extra_status = 'added', customer_added = true where estimate_id = v_est.id and id = any (v_extras);
    select string_agg(description, ', ' order by position) into v_added from estimate_items where estimate_id = v_est.id and id = any (v_extras);
  end if;
  if cardinality(v_removed) > 0 then
    update estimate_items set extra_status = 'offered', customer_removed = true, customer_added = false where estimate_id = v_est.id and id = any (v_removed);
    select string_agg(description, ', ' order by position) into v_gone from estimate_items where estimate_id = v_est.id and id = any (v_removed);
  end if;

  update estimates set
    status = 'accepted', accepted_at = now(), accepted_name = left(trim(p_name), 200),
    selected_option_id = p_option_id, signature_data = p_signature,
    accepted_ip = left(p_ip, 100), accepted_user_agent = left(p_user_agent, 500),
    legal_notices = v_notices
  where id = v_est.id;
  update jobs set stage = 'sold' where id = v_est.job_id and stage in ('lead', 'inspection', 'estimate_sent');
  insert into notifications (org_id, kind, title, body, url)
  values (v_est.org_id, 'estimate_accepted', 'Estimate #' || v_est.number || ' accepted',
          left('Signed by ' || left(trim(p_name), 200) || coalesce(' · added ' || v_added, '') || coalesce(' · removed ' || v_gone, '')
               || case when v_colour is not null and v_colour is distinct from v_est.roof_colour then ' · colour ' || v_colour else '' end, 500),
          '/app/estimates/' || v_est.id);
  return true;
end $$;
revoke all on function public.accept_public_estimate(text, text, uuid, text, text, text, jsonb, uuid[], uuid[], text, int) from public;
grant execute on function public.accept_public_estimate(text, text, uuid, text, text, text, jsonb, uuid[], uuid[], text, int) to anon, authenticated;

-- Older signatures go through the same checks (no removals, colour or version).
create or replace function public.accept_public_estimate(
  p_token text, p_name text, p_option_id uuid, p_signature text, p_ip text, p_user_agent text, p_notices jsonb, p_extras uuid[]
) returns boolean language sql security definer set search_path = public as $$
  select public.accept_public_estimate(p_token, p_name, p_option_id, p_signature, p_ip, p_user_agent, p_notices, p_extras, '{}'::uuid[], null, null);
$$;
revoke all on function public.accept_public_estimate(text, text, uuid, text, text, text, jsonb, uuid[]) from public;
grant execute on function public.accept_public_estimate(text, text, uuid, text, text, text, jsonb, uuid[]) to anon, authenticated;
