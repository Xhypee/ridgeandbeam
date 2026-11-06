-- Production & operations (builder D): crew work-order portal, crew problem reports,
-- member production settings, and small additive columns for material orders.
-- Additive only: no shared columns are dropped or renamed.

-- ---------------------------------------------------------------------------
-- Material orders: where "Send to branch" emails go
-- ---------------------------------------------------------------------------
alter table public.material_orders
  add column if not exists branch_email text,
  add column if not exists branch_phone text,
  add column if not exists confirmed_at timestamptz;

create index if not exists job_costs_source_idx on public.job_costs (job_id, source, source_id);
create index if not exists jobs_crew_schedule_idx on public.jobs (org_id, crew_id, scheduled_start);

-- ---------------------------------------------------------------------------
-- Admin edits a member's production settings (crew for crew leads, commission plan, phone).
-- The memberships update policy excludes the owner's row, but owners are often the
-- salesperson too, so this goes through a checked security-definer function.
-- ---------------------------------------------------------------------------
create or replace function public.set_member_settings(p_org uuid, p_user uuid, p_crew uuid, p_plan uuid, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_org_admin(p_org) then raise exception 'only owners and admins can change team settings'; end if;
  if p_crew is not null and not exists (select 1 from crews where id = p_crew and org_id = p_org) then
    raise exception 'crew belongs to another organization';
  end if;
  if p_plan is not null and not exists (select 1 from commission_plans where id = p_plan and org_id = p_org) then
    raise exception 'commission plan belongs to another organization';
  end if;
  update memberships
     set crew_id = p_crew, commission_plan_id = p_plan, phone = nullif(trim(coalesce(p_phone, '')), '')
   where org_id = p_org and user_id = p_user;
  if not found then raise exception 'member not found'; end if;
end $$;
revoke all on function public.set_member_settings(uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.set_member_settings(uuid, uuid, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Crew work-order portal (/w/<crews.public_token>): anonymous, token-keyed.
-- Never returns prices or costs.
-- ---------------------------------------------------------------------------
create or replace function public.get_crew_portal(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'crew', jsonb_build_object('id', c.id, 'name', c.name, 'color', c.color, 'language', c.language),
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
    'crew', jsonb_build_object('id', v_crew.id, 'name', v_crew.name, 'language', v_crew.language),
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
      select jsonb_agg(jsonb_build_object('id', f.id, 'storage_path', f.storage_path, 'caption', f.caption, 'category', f.category) order by f.created_at desc)
      from job_files f
      where f.job_id = v_job.id and f.org_id = v_job.org_id and f.kind = 'photo'
        and (f.shared_with_homeowner or f.category in ('delivery', 'overview', 'damage', 'decking'))
    ), '[]'::jsonb)
  ) into r
  from organizations o join customers cu on cu.id = v_job.customer_id
  where o.id = v_job.org_id;
  return r;
end $$;
revoke all on function public.get_crew_job(text, uuid) from public;
grant execute on function public.get_crew_job(text, uuid) to anon, authenticated;

-- "Problem / missing material" from the crew portal -> job note + in-app notification.
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
    when 'wrong_material' then 'Wrong material / color'
    when 'damage_found' then 'Damage found (decking, etc.)'
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
