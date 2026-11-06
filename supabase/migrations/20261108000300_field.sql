-- Field & homeowner (builder C): offline capture idempotency, status events, change-order approvals,
-- homeowner portal RPC, inbound SMS matching. Additive only.

-- ---------------------------------------------------------------------------
-- Offline queue idempotency for status events
-- ---------------------------------------------------------------------------
alter table public.job_events add column if not exists client_id text;
create unique index if not exists job_events_org_client on public.job_events (org_id, client_id);

-- ---------------------------------------------------------------------------
-- Change orders: approval audit trail + line categories (drives job cost category)
-- ---------------------------------------------------------------------------
alter table public.change_orders
  add column if not exists sent_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists approval_method text check (approval_method in ('remote_signature', 'in_person_signature', 'verbal')),
  add column if not exists approved_ip text,
  add column if not exists approved_user_agent text,
  add column if not exists approved_by uuid references auth.users(id) on delete set null;

alter table public.change_order_items
  add column if not exists category text not null default 'material' check (category in ('material', 'labor', 'other'));

create index if not exists change_order_items_co on public.change_order_items (change_order_id, position);
create index if not exists job_checklist_items_kind on public.job_checklist_items (job_id, kind);

-- ---------------------------------------------------------------------------
-- Contract 3: apply an approved change order to billing + job cost.
-- Internal (not callable by clients); used by the two approval RPCs below.
-- ---------------------------------------------------------------------------
create or replace function public.apply_change_order(p_co uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_co change_orders; v_inv uuid; v_org organizations; v_pos int; r record;
begin
  select * into v_co from change_orders where id = p_co;
  if v_co.id is null then raise exception 'change order not found'; end if;
  select * into v_org from organizations where id = v_co.org_id;

  select id into v_inv from invoices
   where job_id = v_co.job_id and org_id = v_co.org_id and kind = 'final' and status in ('draft', 'sent', 'partial')
   order by created_at desc limit 1;
  if v_inv is null then
    insert into invoices (org_id, job_id, kind, tax_rate, terms, due_date, notes, created_by)
    values (v_co.org_id, v_co.job_id, 'change_order', v_org.tax_rate, v_org.invoice_terms, current_date + 15,
            'Change order: ' || v_co.title, v_co.created_by)
    returning id into v_inv;
  end if;

  select coalesce(max(position), -1) + 1 into v_pos from invoice_items where invoice_id = v_inv;
  insert into invoice_items (org_id, invoice_id, position, description, quantity, unit, unit_price, unit_cost, category)
  select v_co.org_id, v_inv, v_pos + i.position, 'Change order: ' || i.description, i.quantity, i.unit, i.unit_price, i.unit_cost, i.category
    from change_order_items i where i.change_order_id = v_co.id order by i.position;

  for r in
    select case i.category when 'labor' then 'labor' when 'material' then 'materials' else 'other' end as cat,
           round(sum(i.quantity * i.unit_cost), 2) as amt
      from change_order_items i where i.change_order_id = v_co.id group by 1
  loop
    if r.amt > 0 then
      insert into job_costs (org_id, job_id, category, description, amount, source, source_id, created_by)
      values (v_co.org_id, v_co.job_id, r.cat, 'Change order: ' || v_co.title, r.amt, 'manual', v_co.id, v_co.created_by);
    end if;
  end loop;

  update change_orders set invoice_id = v_inv where id = v_co.id;
  insert into job_events (org_id, job_id, kind, note, visible_to_homeowner, created_by_name)
  values (v_co.org_id, v_co.job_id, 'change_order_approved', v_co.title, true, coalesce(v_co.approved_name, 'Homeowner'));
  return v_inv;
end $$;
revoke all on function public.apply_change_order(uuid) from public, anon, authenticated;

-- Homeowner approves remotely from /c/[token] with a drawn signature.
create or replace function public.approve_public_change_order(p_token text, p_name text, p_signature text, p_ip text default null, p_user_agent text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_co change_orders;
begin
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'please type your full name to sign'; end if;
  if p_signature is null or p_signature not like 'data:image/png;base64,%' or length(p_signature) > 400000 then
    raise exception 'please sign in the box';
  end if;
  select * into v_co from change_orders where public_token = p_token and status = 'sent' for update;
  if v_co.id is null then return false; end if;
  update change_orders set status = 'approved', approved_at = now(), approved_name = left(trim(p_name), 200), signature_data = p_signature,
         approval_method = 'remote_signature', approved_ip = left(p_ip, 100), approved_user_agent = left(p_user_agent, 500)
   where id = v_co.id;
  perform public.apply_change_order(v_co.id);
  insert into notifications (org_id, user_id, kind, title, body, url)
  select v_co.org_id, j.assigned_to, 'change_order_approved', 'Change order approved: ' || v_co.title, trim(p_name), '/app/jobs/' || v_co.job_id || '/change-orders/' || v_co.id
    from jobs j where j.id = v_co.job_id;
  return true;
end $$;

create or replace function public.decline_public_change_order(p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_co change_orders;
begin
  select * into v_co from change_orders where public_token = p_token and status = 'sent' for update;
  if v_co.id is null then return false; end if;
  update change_orders set status = 'declined', declined_at = now() where id = v_co.id;
  insert into notifications (org_id, user_id, kind, title, url)
  select v_co.org_id, j.assigned_to, 'change_order_declined', 'Change order declined: ' || v_co.title, '/app/jobs/' || v_co.job_id || '/change-orders/' || v_co.id
    from jobs j where j.id = v_co.job_id;
  return true;
end $$;

-- Rep records approval on site (homeowner signs on the rep's phone) or verbally.
create or replace function public.approve_change_order_on_site(p_co uuid, p_name text, p_signature text, p_method text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_co change_orders;
begin
  select * into v_co from change_orders where id = p_co for update;
  if v_co.id is null or not public.is_org_member(v_co.org_id) then raise exception 'change order not found'; end if;
  if public.org_role(v_co.org_id) = 'crew_lead' then raise exception 'only office or sales can approve change orders'; end if;
  if v_co.status not in ('draft', 'sent') then return false; end if;
  if p_method not in ('in_person_signature', 'verbal') then raise exception 'unknown approval method'; end if;
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'enter the homeowner''s full name'; end if;
  if p_method = 'in_person_signature' and (p_signature is null or p_signature not like 'data:image/png;base64,%') then
    raise exception 'have the homeowner sign in the box';
  end if;
  update change_orders set status = 'approved', approved_at = now(), approved_name = left(trim(p_name), 200),
         signature_data = case when p_method = 'in_person_signature' then p_signature end,
         approval_method = p_method, approved_by = auth.uid()
   where id = v_co.id;
  perform public.apply_change_order(v_co.id);
  return true;
end $$;

-- Public view of a change order by token (for /c/[token]).
create or replace function public.get_public_change_order(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', co.id, 'org_id', co.org_id, 'job_id', co.job_id, 'title', co.title, 'description', co.description, 'status', co.status,
    'created_at', co.created_at, 'approved_at', co.approved_at, 'approved_name', co.approved_name, 'approval_method', co.approval_method,
    'org', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'license_number', o.license_number),
    'customer', jsonb_build_object('name', c.name),
    'job', jsonb_build_object('title', j.title, 'site_address', j.site_address, 'public_token', j.public_token),
    'tax_rate', o.tax_rate,
    'items', coalesce((select jsonb_agg(jsonb_build_object('description', i.description, 'quantity', i.quantity, 'unit', i.unit, 'unit_price', i.unit_price) order by i.position)
                       from change_order_items i where i.change_order_id = co.id), '[]'::jsonb),
    'photos', coalesce((select jsonb_agg(jsonb_build_object('storage_path', f.storage_path, 'caption', f.caption))
                        from job_files f where f.id = any(co.file_ids) and f.job_id = co.job_id and f.kind = 'photo'), '[]'::jsonb)
  )
  from change_orders co join jobs j on j.id = co.job_id join customers c on c.id = j.customer_id join organizations o on o.id = co.org_id
  where co.public_token = p_token and co.status <> 'draft';
$$;

-- ---------------------------------------------------------------------------
-- Contract 6: homeowner portal by jobs.public_token
-- ---------------------------------------------------------------------------
create or replace function public.get_public_job(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', j.id, 'org_id', j.org_id, 'title', j.title, 'site_address', j.site_address, 'stage', j.stage, 'job_type', j.job_type,
    'is_insurance', j.is_insurance, 'scheduled_start', j.scheduled_start, 'scheduled_end', j.scheduled_end,
    'permit_status', j.permit_status, 'materials_status', j.materials_status, 'colors_confirmed', j.colors_confirmed,
    'shingle_color', j.shingle_color, 'completed_at', j.completed_at, 'walkthrough_signed_at', j.walkthrough_signed_at,
    'warranty_product', j.warranty_product, 'warranty_registered_at', j.warranty_registered_at, 'created_at', j.created_at,
    'org', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'website', o.website, 'address', o.address,
                              'license_number', o.license_number, 'insurance_certificate_url', o.insurance_certificate_url,
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
    'claim', (select jsonb_build_object('carrier', cl.carrier, 'claim_number', cl.claim_number, 'stage', cl.stage, 'policy_type', cl.policy_type,
                                        'rcv_amount', cl.rcv_amount, 'depreciation_amount', cl.depreciation_amount, 'deductible', cl.deductible,
                                        'mortgagee_name', cl.mortgagee_name,
                                        'checks', coalesce((select jsonb_agg(jsonb_build_object('kind', k.kind, 'payer', k.payer, 'label', k.label,
                                                                                               'expected_amount', k.expected_amount, 'received_amount', k.received_amount,
                                                                                               'received_on', k.received_on, 'endorsement', k.endorsement) order by k.created_at)
                                                            from claim_checks k where k.claim_id = cl.id), '[]'::jsonb))
              from claims cl where cl.job_id = j.id),
    'accepted_estimate', exists (select 1 from estimates e where e.job_id = j.id and e.status = 'accepted')
  )
  from jobs j join organizations o on o.id = j.org_id join customers c on c.id = j.customer_id
  where j.public_token = p_token and o.subscription_status <> 'cancelled';
$$;

-- ---------------------------------------------------------------------------
-- Inbound SMS: match a phone number to the most relevant customer + job across orgs.
-- Service role only (called from the inbound webhook via recordInboundMessage).
-- ---------------------------------------------------------------------------
create or replace function public.match_customer_phone(p_phone text)
returns table (org_id uuid, customer_id uuid, job_id uuid, assigned_to uuid, customer_name text, job_title text)
language sql stable security definer set search_path = public as $$
  with d as (select right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10) as digits),
  c as (
    select cu.* from customers cu, d
     where length(d.digits) = 10 and right(regexp_replace(coalesce(cu.phone, ''), '\D', '', 'g'), 10) = d.digits
  )
  select c.org_id, c.id, jb.id, coalesce(jb.assigned_to, jb.sales_rep_id), c.name, jb.title
    from c
    left join lateral (
      select j.* from jobs j where j.customer_id = c.id
       order by (j.stage in ('lost', 'paid')), j.updated_at desc limit 1
    ) jb on true
    left join lateral (
      select max(m.created_at) as last_out from messages m
       where m.customer_id = c.id and m.direction = 'outbound'
    ) lm on true
   order by lm.last_out desc nulls last, c.created_at desc
   limit 1;
$$;

revoke all on function public.approve_public_change_order(text, text, text, text, text) from public;
revoke all on function public.decline_public_change_order(text) from public;
revoke all on function public.get_public_change_order(text) from public;
revoke all on function public.get_public_job(text) from public;
revoke all on function public.approve_change_order_on_site(uuid, text, text, text) from public, anon;
revoke all on function public.match_customer_phone(text) from public, anon, authenticated;
grant execute on function public.approve_public_change_order(text, text, text, text, text) to anon, authenticated;
grant execute on function public.decline_public_change_order(text) to anon, authenticated;
grant execute on function public.get_public_change_order(text) to anon, authenticated;
grant execute on function public.get_public_job(text) to anon, authenticated;
grant execute on function public.approve_change_order_on_site(uuid, text, text, text) to authenticated;
grant execute on function public.match_customer_phone(text) to service_role;
