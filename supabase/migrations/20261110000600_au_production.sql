-- AU production, field & homeowner portal (builder P).
-- Additive: metric crew pay columns (the US per-square columns stay, deprecated), Australian job types,
-- storm-damage photo categories, and the crew / homeowner RPCs updated for Australian terms.

-- ---------------------------------------------------------------------------
-- Crew pay sheet in $/m² of true (sloped) roof area, plus a $/lm gutter rate.
-- Existing per-square rates are converted once (1 square = 100 sq ft = 9.290304 m²).
-- ---------------------------------------------------------------------------
alter table public.crews
  add column if not exists pay_rate_m2 numeric(10,2) not null default 0,        -- base install, per m² true area
  add column if not exists pay_low_slope_m2 numeric(10,2) not null default 0,   -- replaces base under the low-slope pitch (10°)
  add column if not exists pay_steep_m2 numeric(10,2) not null default 0,       -- adder above the steep pitch (estimate's steep setting, 25°)
  add column if not exists pay_high_steep_m2 numeric(10,2) not null default 0,  -- adder from 35° (replaces the steep adder)
  add column if not exists pay_strip_m2 numeric(10,2) not null default 0,       -- strip / remove the old roof, per m²
  add column if not exists pay_gutter_lm numeric(10,2) not null default 0;      -- new gutter, per lineal metre

do $$ begin
  alter table public.crews add constraint crews_pay_m2_nonneg check (
    pay_rate_m2 >= 0 and pay_low_slope_m2 >= 0 and pay_steep_m2 >= 0 and pay_high_steep_m2 >= 0 and pay_strip_m2 >= 0 and pay_gutter_lm >= 0);
exception when duplicate_object then null; end $$;

update public.crews set
  pay_rate_m2 = round(rate_per_square / 9.290304, 2),
  pay_low_slope_m2 = round(low_slope_rate / 9.290304, 2),
  pay_steep_m2 = round(steep_adder / 9.290304, 2),
  pay_high_steep_m2 = round(high_steep_adder / 9.290304, 2),
  pay_strip_m2 = round(layer_adder / 9.290304, 2)
where pay_rate_m2 = 0 and pay_low_slope_m2 = 0 and pay_steep_m2 = 0 and pay_high_steep_m2 = 0 and pay_strip_m2 = 0
  and (rate_per_square > 0 or low_slope_rate > 0 or steep_adder > 0 or high_steep_adder > 0 or layer_adder > 0);

comment on column public.crews.rate_per_square is 'Deprecated (US per-square pay). Use pay_rate_m2.';
comment on column public.crews.steep_adder is 'Deprecated (US). Use pay_steep_m2.';
comment on column public.crews.high_steep_adder is 'Deprecated (US). Use pay_high_steep_m2.';
comment on column public.crews.layer_adder is 'Deprecated (US). Use pay_strip_m2.';
comment on column public.crews.low_slope_rate is 'Deprecated (US). Use pay_low_slope_m2.';
comment on column public.crews.language is 'Deprecated: the crew portal is plain English only.';
update public.crews set language = 'en' where language <> 'en';

-- ---------------------------------------------------------------------------
-- Australian job types (enum values are additive).
-- ---------------------------------------------------------------------------
alter type public.job_type add value if not exists 'tile_to_metal';
alter type public.job_type add value if not exists 'restoration';
alter type public.job_type add value if not exists 'asbestos';

-- ---------------------------------------------------------------------------
-- Storm-damage photo categories. job_files.test_square_hits holds the broken-tile count for
-- 'broken_tiles' photos (legacy 'test_square' rows keep their old meaning).
-- ---------------------------------------------------------------------------
alter table public.job_files drop constraint if exists job_files_category_check;
alter table public.job_files add constraint job_files_category_check check (category in (
  'overview', 'broken_tiles', 'ridge_capping', 'sheet_damage', 'hail_dents', 'gutter_damage', 'internal_water',
  'damage', 'decking', 'progress', 'completion', 'delivery', 'document', 'other', 'test_square'));
comment on column public.job_files.test_square_hits is 'Broken / cracked tile count on this slope (category broken_tiles). Legacy: US test-square hits.';

-- ---------------------------------------------------------------------------
-- Crew job: show storm-damage photos too; no language.
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

create or replace function public.get_crew_portal(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'crew', jsonb_build_object('id', c.id, 'name', c.name, 'color', c.color),
    'org', jsonb_build_object('name', o.name, 'phone', o.phone),
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', j.id, 'title', j.title, 'site_address', j.site_address,
        'scheduled_start', j.scheduled_start, 'scheduled_end', j.scheduled_end,
        'schedule_locked', j.schedule_locked, 'stage', j.stage,
        'customer_name', cu.name
      ) order by j.scheduled_start, j.title)
      from jobs j join customers cu on cu.id = j.customer_id
      where j.crew_id = c.id and j.org_id = c.org_id
        and j.scheduled_start is not null
        and coalesce(j.scheduled_end, j.scheduled_start) >= current_date - 3
        and j.stage not in ('lost', 'paid')
    ), '[]'::jsonb)
  )
  from crews c join organizations o on o.id = c.org_id
  where c.public_token = p_token and length(p_token) >= 20;
$$;
revoke all on function public.get_crew_portal(text) from public;
grant execute on function public.get_crew_portal(text) to anon, authenticated;

-- Crew problem report: Australian wording (battens / sarking, colour).
create or replace function public.report_crew_problem(p_token text, p_job uuid, p_kind text, p_message text, p_name text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_crew crews; v_job jobs; v_note uuid; v_kind text; v_label text; v_body text; v_who text;
begin
  select * into v_crew from crews where public_token = p_token and length(p_token) >= 20;
  if v_crew.id is null then raise exception 'unknown crew link'; end if;
  select * into v_job from jobs where id = p_job and crew_id = v_crew.id and org_id = v_crew.org_id;
  if v_job.id is null then raise exception 'job is not assigned to this crew'; end if;
  v_kind := case when p_kind in ('missing_material', 'wrong_material', 'damage_found', 'safety', 'homeowner', 'other') then p_kind else 'other' end;
  v_label := case v_kind
    when 'missing_material' then 'Missing material'
    when 'wrong_material' then 'Wrong material / colour'
    when 'damage_found' then 'Damage found (battens, sarking, etc.)'
    when 'safety' then 'Safety issue'
    when 'homeowner' then 'Homeowner issue'
    else 'Problem' end;
  v_body := left(nullif(trim(coalesce(p_message, '')), ''), 2000);
  v_who := coalesce(nullif(left(trim(coalesce(p_name, '')), 80), ''), v_crew.name);

  insert into job_notes (org_id, job_id, body, author_name)
  values (v_job.org_id, v_job.id, '[Crew report] ' || v_label || coalesce(': ' || v_body, ''), v_who || ' (' || v_crew.name || ')')
  returning id into v_note;

  insert into notifications (org_id, user_id, kind, title, body, url)
  values (v_job.org_id, null, 'crew_problem', v_label || ' — ' || v_job.title, coalesce(v_body, 'Reported by ' || v_who), '/app/jobs/' || v_job.id || '/production');
  if v_job.assigned_to is not null then
    insert into notifications (org_id, user_id, kind, title, body, url)
    values (v_job.org_id, v_job.assigned_to, 'crew_problem', v_label || ' — ' || v_job.title, coalesce(v_body, 'Reported by ' || v_who), '/app/jobs/' || v_job.id || '/production');
  end if;

  return jsonb_build_object('note_id', v_note, 'org_id', v_job.org_id, 'job_id', v_job.id, 'label', v_label);
end $$;
revoke all on function public.report_crew_problem(text, uuid, text, text, text) from public;
grant execute on function public.report_crew_problem(text, uuid, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Homeowner portal: Australian claim fields (insurer, excess, settlement path, approved amount),
-- the business ABN + state licences, and the job's state. No US deductible / depreciation / mortgagee.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_job(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', j.id, 'org_id', j.org_id, 'title', j.title, 'site_address', j.site_address, 'stage', j.stage, 'job_type', j.job_type,
    'state', coalesce(j.state, c.state),
    'is_insurance', j.is_insurance, 'scheduled_start', j.scheduled_start, 'scheduled_end', j.scheduled_end,
    'permit_status', j.permit_status, 'materials_status', j.materials_status, 'colors_confirmed', j.colors_confirmed,
    'shingle_color', j.shingle_color, 'completed_at', j.completed_at, 'walkthrough_signed_at', j.walkthrough_signed_at,
    'warranty_product', j.warranty_product, 'warranty_registered_at', j.warranty_registered_at, 'created_at', j.created_at,
    'org', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'address', o.address,
                              'license_number', o.license_number, 'abn', o.abn, 'licences', o.licences,
                              'insurance_certificate_url', o.insurance_certificate_url,
                              'certifications', o.certifications, 'google_review_url', o.google_review_url),
    'customer', jsonb_build_object('first_name', split_part(trim(c.name), ' ', 1)),
    'crew', (select jsonb_build_object('name', cr.name) from crews cr where cr.id = j.crew_id),
    'rep', (select jsonb_build_object('name', m.full_name, 'phone', m.phone) from memberships m
             where m.org_id = j.org_id and m.user_id = coalesce(j.sales_rep_id, j.assigned_to)),
    'file_count', (select count(*) from job_files f where f.job_id = j.id and f.kind = 'photo'),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'note', e.note, 'created_at', e.created_at,
                                                            'photo', (select f.storage_path from job_files f where f.id = e.file_id and f.job_id = j.id and f.kind = 'photo'))
                                         order by e.created_at desc)
                        from job_events e where e.job_id = j.id and e.visible_to_homeowner), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('storage_path', f.storage_path, 'caption', f.caption, 'category', f.category,
                                                            'slope', f.slope, 'taken_at', coalesce(f.taken_at, f.created_at))
                                         order by coalesce(f.taken_at, f.created_at))
                        from job_files f where f.job_id = j.id and f.kind = 'photo' and f.shared_with_homeowner), '[]'::jsonb),
    'estimates', coalesce((select jsonb_agg(jsonb_build_object('number', e.number, 'status', e.status, 'public_token', e.public_token,
                                                               'accepted_at', e.accepted_at, 'total', t.total) order by e.created_at)
                           from estimates e join estimate_totals t on t.estimate_id = e.id
                           where e.job_id = j.id and e.status <> 'draft'), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('number', v.number, 'status', v.status, 'kind', v.kind, 'public_token', v.public_token,
                                                              'milestone_label', v.milestone_label, 'due_date', v.due_date,
                                                              'total', t.total, 'paid', t.paid, 'balance', t.balance) order by v.created_at)
                          from invoices v join invoice_totals t on t.invoice_id = v.id
                          where v.job_id = j.id and v.status not in ('draft', 'void')), '[]'::jsonb),
    'change_orders', coalesce((select jsonb_agg(jsonb_build_object('title', co.title, 'status', co.status, 'public_token', co.public_token,
                                                                   'total', (select coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) from change_order_items i where i.change_order_id = co.id))
                                              order by co.created_at)
                               from change_orders co where co.job_id = j.id and co.status <> 'draft'), '[]'::jsonb),
    'claim', (select jsonb_build_object('insurer', cl.carrier, 'claim_number', cl.claim_number, 'stage', cl.stage,
                                        'lodged_on', cl.lodged_on, 'event_type', cl.event_type,
                                        'excess', cl.excess, 'settlement_path', cl.settlement_path,
                                        'approved_amount', cl.approved_amount, 'cash_settlement_amount', cl.cash_settlement_amount,
                                        'payments', coalesce((select jsonb_agg(jsonb_build_object('kind', k.kind, 'payer', k.payer, 'label', k.label,
                                                                                                 'expected_amount', k.expected_amount, 'received_amount', k.received_amount,
                                                                                                 'received_on', k.received_on) order by k.created_at)
                                                              from claim_checks k where k.claim_id = cl.id), '[]'::jsonb))
              from claims cl where cl.job_id = j.id),
    'accepted_estimate', exists (select 1 from estimates e where e.job_id = j.id and e.status = 'accepted')
  )
  from jobs j join organizations o on o.id = j.org_id join customers c on c.id = j.customer_id
  where j.public_token = p_token and o.subscription_status <> 'cancelled';
$$;
revoke all on function public.get_public_job(text) from public;
grant execute on function public.get_public_job(text) to anon, authenticated;
