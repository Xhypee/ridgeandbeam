-- The receipt docket quote: the roof is the main item and extras are tapped on or off.
--   estimate_items.extra_status: null = main line (always in the total), 'added' = an extra that is in the total,
--     'offered' = shown under "Often added" and NOT in the total until the roofer or the customer adds it.
--   estimate_items.blurb: the short "why" shown next to an extra; customer_added: the customer added it when signing.
--   estimates.roof_profile / roof_colour: the sheet profile and COLORBOND colour on the docket (what the customer sees).
--   catalog_items.is_extra: null = the default for its calculator key (sarking, gutters, fascia, mesh, edge protection,
--     whirlybirds, skip bins…), true/false = the roofer's choice in Settings → Price book; blurb = the "why" line.
-- Totals (views + the TS mirror in src/lib/estimate-totals.ts), the work order and acceptance skip offered lines.
-- Additive: existing quotes have no extras (null = main) and keep their totals.

alter table public.estimate_items
  add column if not exists extra_status text check (extra_status in ('added', 'offered')),
  add column if not exists blurb text check (length(blurb) <= 200),
  add column if not exists customer_added boolean not null default false;

alter table public.estimates
  add column if not exists roof_profile text check (roof_profile in ('custom_orb', 'trimdek', 'klip_lok', 'spandek')),
  add column if not exists roof_colour text check (length(roof_colour) <= 40);

alter table public.catalog_items
  add column if not exists is_extra boolean,
  add column if not exists blurb text check (length(blurb) <= 200);

-- ---------------------------------------------------------------------------
-- Totals: same columns as 20261110000200_au_estimating.sql, offered extras left out.
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
  and i.extra_status is distinct from 'offered'
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
  and i.extra_status is distinct from 'offered'
group by o.id, e.id;

-- ---------------------------------------------------------------------------
-- Atomic save: + roof_profile / roof_colour, and each line's extra_status, blurb and customer_added.
-- Same function as 20261110000200_au_estimating.sql otherwise.
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
    roof_colour = case when p_estimate ? 'roof_colour' then nullif(left(trim(p_estimate->>'roof_colour'), 40), '') else roof_colour end
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
    v_extra := case when it->>'extra_status' in ('added', 'offered') then it->>'extra_status' end;
    insert into estimate_items (org_id, estimate_id, position, description, quantity, unit, unit_price, unit_cost, category, calc_key, option_id,
                                supplier_price_item_id, extra_status, blurb, customer_added)
    values (v_est.org_id, p_id, n, it->>'description', coalesce((it->>'quantity')::numeric, 0), coalesce(it->>'unit', 'ea'),
            coalesce((it->>'unit_price')::numeric, 0), coalesce((it->>'unit_cost')::numeric, 0),
            coalesce(it->>'category', 'material'), nullif(it->>'calc_key', ''),
            case when nullif(it->>'option_key', '') is null then null else (v_map->>(it->>'option_key'))::uuid end,
            nullif(it->>'supplier_price_item_id', '')::uuid,
            v_extra, nullif(left(trim(it->>'blurb'), 200), ''),
            coalesce((it->>'customer_added')::boolean, false) and v_extra = 'added');
    n := n + 1;
  end loop;
  return v_map;
end $$;
revoke all on function public.save_estimate_content(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_estimate_content(uuid, jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Public quote payload: + each line's id, calc key (icon), extra status and blurb; the docket's profile and colour;
-- the roof shape for the drawing (the plan lines from "Measure from plans", or the sections). Same function as
-- 20261110000700_public_estimate_rules.sql otherwise. The plans' file, title-block details and client are NOT exposed.
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
    'roof_profile', e.roof_profile, 'roof_colour', e.roof_colour,
    'roof', jsonb_build_object(
      'job_type', e.measurements->'jobType',
      'sections', case when jsonb_typeof(e.measurements->'sections') = 'array' then
        (select coalesce(jsonb_agg(jsonb_build_object('area', x->'area', 'pitch', x->'pitch', 'system', x->'system', 'profile', x->'profile')), '[]'::jsonb)
         from jsonb_array_elements(e.measurements->'sections') x) else '[]'::jsonb end,
      'plan', case when jsonb_typeof(e.measurements->'plans'->'lines') = 'array' then jsonb_build_object(
        'lines', e.measurements->'plans'->'lines', 'scale', e.measurements->'plans'->'scale', 'pitch', e.measurements->'plans'->'pitch') end),
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
                  'blurb', i.blurb, 'customer_added', i.customer_added) order by i.position)
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

-- ---------------------------------------------------------------------------
-- Signed acceptance + the extras the customer added. Only lines the roofer offered on THIS quote (for the chosen
-- option, or shared) can be added; they move to 'added' (customer_added) so every total, invoice and order counts them.
-- ---------------------------------------------------------------------------
create or replace function public.accept_public_estimate(
  p_token text, p_name text, p_option_id uuid, p_signature text, p_ip text, p_user_agent text, p_notices jsonb, p_extras uuid[]
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_est estimates; v_has_options boolean; v_notices jsonb; v_extras uuid[]; v_added text;
begin
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'please type your full name to sign'; end if;
  if p_signature is null or p_signature not like 'data:image/png;base64,%' or length(p_signature) < 100 then
    raise exception 'please draw your signature';
  end if;
  if length(p_signature) > 600000 then raise exception 'signature image is too large'; end if;
  select * into v_est from estimates where public_token = p_token and status = 'sent' for update;
  if v_est.id is null then return false; end if;

  v_has_options := exists (select 1 from estimate_options where estimate_id = v_est.id);
  if v_has_options then
    if p_option_id is null or not exists (select 1 from estimate_options where id = p_option_id and estimate_id = v_est.id) then
      raise exception 'please choose an option';
    end if;
  else
    p_option_id := null;
  end if;

  v_extras := array(select distinct x from unnest(coalesce(p_extras, '{}'::uuid[])) x where x is not null);
  if cardinality(v_extras) > 50 then raise exception 'too many extras'; end if;
  if exists (
    select 1 from unnest(v_extras) x
    where not exists (select 1 from estimate_items i where i.id = x and i.estimate_id = v_est.id and i.extra_status = 'offered'
                        and (i.option_id is null or i.option_id = p_option_id))
  ) then
    raise exception 'That extra is no longer on offer on this quote. Refresh the page and try again.';
  end if;

  v_notices := case
    when jsonb_typeof(p_notices) = 'array' and jsonb_array_length(p_notices) <= 20 and length(p_notices::text) <= 60000 then p_notices
    else '[]'::jsonb end;

  if cardinality(v_extras) > 0 then
    update estimate_items set extra_status = 'added', customer_added = true where estimate_id = v_est.id and id = any (v_extras);
    select string_agg(description, ', ' order by position) into v_added from estimate_items where estimate_id = v_est.id and id = any (v_extras);
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
          left('Signed by ' || left(trim(p_name), 200) || coalesce(' · added ' || v_added, ''), 500),
          '/app/estimates/' || v_est.id);
  return true;
end $$;
revoke all on function public.accept_public_estimate(text, text, uuid, text, text, text, jsonb, uuid[]) from public;
grant execute on function public.accept_public_estimate(text, text, uuid, text, text, text, jsonb, uuid[]) to anon, authenticated;

-- The 7-argument version (no extras) now goes through the same checks.
create or replace function public.accept_public_estimate(
  p_token text, p_name text, p_option_id uuid, p_signature text, p_ip text, p_user_agent text, p_notices jsonb
) returns boolean language sql security definer set search_path = public as $$
  select public.accept_public_estimate(p_token, p_name, p_option_id, p_signature, p_ip, p_user_agent, p_notices, '{}'::uuid[]);
$$;
revoke all on function public.accept_public_estimate(text, text, uuid, text, text, text, jsonb) from public;
grant execute on function public.accept_public_estimate(text, text, uuid, text, text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Crew job sheet: materials from the accepted quote without the extras the customer didn't take.
-- Same function as 20261110000600_au_production.sql plus the extra_status filter.
-- ---------------------------------------------------------------------------
create or replace function public.get_crew_job(p_token text, p_job uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_crew crews; v_job jobs; v_est estimates; r jsonb;
begin
  select * into v_crew from crews where public_token = p_token and length(p_token) >= 20;
  if v_crew.id is null then return null; end if;
  select * into v_job from jobs where id = p_job and crew_id = v_crew.id and org_id = v_crew.org_id;
  if v_job.id is null then return null; end if;
  select * into v_est from estimates where job_id = v_job.id and status = 'accepted'
    order by accepted_at desc nulls last, created_at desc limit 1;

  select jsonb_build_object(
    'crew', jsonb_build_object('id', v_crew.id, 'name', v_crew.name),
    'org', jsonb_build_object('id', o.id, 'name', o.name, 'phone', o.phone),
    'job', jsonb_build_object(
      'id', v_job.id, 'org_id', v_job.org_id, 'title', v_job.title, 'job_type', v_job.job_type,
      'site_address', v_job.site_address, 'roof_material', v_job.roof_material,
      'scheduled_start', v_job.scheduled_start, 'scheduled_end', v_job.scheduled_end,
      'schedule_locked', v_job.schedule_locked, 'shingle_color', v_job.shingle_color,
      'delivery_type', v_job.delivery_type, 'delivery_notes', v_job.delivery_notes,
      'gate_code', v_job.gate_code, 'site_hazards', v_job.site_hazards,
      'permit_number', v_job.permit_number, 'materials_status', v_job.materials_status,
      'dumpster_status', v_job.dumpster_status,
      'customer_name', cu.name, 'customer_phone', cu.phone
    ),
    'measurements', coalesce(v_est.measurements, '{}'::jsonb),
    'estimate_items', coalesce((
      select jsonb_agg(jsonb_build_object('description', i.description, 'quantity', i.quantity, 'unit', i.unit, 'category', i.category) order by i.position)
      from estimate_items i
      where v_est.id is not null and i.estimate_id = v_est.id
        and (i.option_id is null or i.option_id = v_est.selected_option_id)
        and i.extra_status is distinct from 'offered'
    ), '[]'::jsonb),
    'orders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'supplier', mo.supplier, 'status', mo.status, 'delivery_date', mo.delivery_date,
        'delivery_type', mo.delivery_type, 'color', mo.color,
        'items', coalesce((select jsonb_agg(jsonb_build_object('description', it.description, 'quantity', it.quantity, 'unit', it.unit) order by it.position)
                           from material_order_items it where it.order_id = mo.id), '[]'::jsonb)
      ) order by mo.created_at)
      from material_orders mo where mo.job_id = v_job.id and mo.status <> 'cancelled'
    ), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'storage_path', f.storage_path, 'caption', f.caption, 'category', f.category,
                                          'slope', f.slope, 'count', case when f.category = 'broken_tiles' then f.test_square_hits end)
                       order by f.created_at desc)
      from job_files f
      where f.job_id = v_job.id and f.org_id = v_job.org_id and f.kind = 'photo'
        and (f.shared_with_homeowner or f.category in ('delivery', 'overview', 'damage', 'decking', 'broken_tiles', 'ridge_capping',
                                                       'sheet_damage', 'hail_dents', 'gutter_damage', 'internal_water'))
    ), '[]'::jsonb)
  ) into r
  from organizations o join customers cu on cu.id = v_job.customer_id
  where o.id = v_job.org_id;
  return r;
end $$;
revoke all on function public.get_crew_job(text, uuid) from public;
grant execute on function public.get_crew_job(text, uuid) to anon, authenticated;
