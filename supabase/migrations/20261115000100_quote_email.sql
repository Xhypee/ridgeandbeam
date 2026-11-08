-- Quote emails: the office previews the quote email (drafts too) before sending it.
-- estimate_doc(id) builds the same JSON the customer's quote page uses; get_public_estimate(token) now wraps it
-- (unchanged output, still hides drafts), and get_estimate_doc(id) is the staff-only preview (org members who can see money).

create or replace function public.estimate_doc(p_id uuid)
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
  where e.id = p_id;
  return r;
end $$;
revoke all on function public.estimate_doc(uuid) from public, anon, authenticated;

create or replace function public.get_public_estimate(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.estimate_doc(e.id) from estimates e where e.public_token = p_token and e.status <> 'draft';
$$;
revoke all on function public.get_public_estimate(text) from public;
grant execute on function public.get_public_estimate(text) to anon, authenticated;

create or replace function public.get_estimate_doc(p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select public.estimate_doc(e.id) from estimates e
  where e.id = p_id and public.is_org_member(e.org_id) and public.org_role(e.org_id) <> 'crew_lead';
$$;
revoke all on function public.get_estimate_doc(uuid) from public, anon;
grant execute on function public.get_estimate_doc(uuid) to authenticated;
