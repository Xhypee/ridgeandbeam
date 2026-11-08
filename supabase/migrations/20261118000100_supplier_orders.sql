-- Sold stage: one material order per supplier for a job, sent as an email with a confirm link.
-- Lines get a cut length and a short spec; orders get a public token (the supplier's confirm page), delivery
-- details, which job files go with the email (plans, roof report, others), and what the supplier said back.

alter table public.material_order_items
  add column if not exists length_m numeric(8,3) check (length_m is null or (length_m > 0 and length_m < 100)),
  add column if not exists spec text,
  add column if not exists group_label text;

alter table public.material_orders
  add column if not exists public_token text not null default encode(gen_random_bytes(18), 'base64'),
  add column if not exists delivery_time text,
  add column if not exists site_contact text,
  add column if not exists attach_plans boolean not null default false,
  add column if not exists attach_report boolean not null default false,
  add column if not exists attach_file_ids uuid[] not null default '{}',
  add column if not exists supplier_ref text,
  add column if not exists supplier_note text,
  add column if not exists supplier_delivery_date date,
  add column if not exists opened_at timestamptz;
update public.material_orders set public_token = translate(public_token, '+/=', '-_') where public_token ~ '[+/=]';
alter table public.material_orders alter column public_token set default translate(encode(gen_random_bytes(18), 'base64'), '+/=', '-_');
create unique index if not exists material_orders_public_token on public.material_orders (public_token);

alter table public.material_orders drop constraint if exists material_orders_delivery_type_check;
alter table public.material_orders add constraint material_orders_delivery_type_check
  check (delivery_type in ('roof_load', 'ground_drop', 'crane', 'pickup'));

-- What the supplier sees from the link in the email: the order without any prices.
create or replace function public.get_supplier_order(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  update material_orders set opened_at = coalesce(opened_at, now()) where public_token = p_token and status in ('sent', 'confirmed');
  select jsonb_build_object(
    'id', o.id, 'status', o.status, 'supplier', o.supplier, 'branch', o.branch, 'po_number', o.po_number,
    'delivery_date', o.delivery_date, 'delivery_time', o.delivery_time, 'delivery_type', o.delivery_type, 'notes', o.notes,
    'site_contact', o.site_contact, 'confirmed_at', o.confirmed_at, 'supplier_ref', o.supplier_ref, 'supplier_note', o.supplier_note,
    'supplier_delivery_date', o.supplier_delivery_date,
    'account_number', s.account_number,
    'org', jsonb_build_object('name', g.name, 'phone', g.phone, 'email', g.email),
    'site_address', j.site_address,
    'items', coalesce((select jsonb_agg(jsonb_build_object('description', i.description, 'spec', i.spec, 'sku', i.sku, 'quantity', i.quantity,
      'unit', i.unit, 'length_m', i.length_m) order by i.position) from material_order_items i where i.order_id = o.id), '[]'::jsonb)
  ) into r
  from material_orders o
  join organizations g on g.id = o.org_id
  join jobs j on j.id = o.job_id
  left join org_suppliers s on s.id = o.org_supplier_id
  where o.public_token = p_token and o.status in ('sent', 'confirmed', 'delivered');
  return r;
end $$;
revoke all on function public.get_supplier_order(text) from public;
grant execute on function public.get_supplier_order(text) to anon, authenticated;

-- The supplier confirms (optionally with their order number, a different delivery date, or a note).
create or replace function public.confirm_supplier_order(p_token text, p_ref text, p_date date, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select id, org_id, job_id, status, supplier into o from material_orders where public_token = p_token for update;
  if o.id is null or o.status not in ('sent', 'confirmed') then return jsonb_build_object('ok', false, 'error', 'This order can''t be confirmed.'); end if;
  if p_date is not null and (p_date < current_date - 1 or p_date > current_date + 365) then return jsonb_build_object('ok', false, 'error', 'Pick a delivery date in the next year.'); end if;
  update material_orders set status = 'confirmed', confirmed_at = now(),
    supplier_ref = nullif(left(trim(coalesce(p_ref, '')), 60), ''), supplier_note = nullif(left(trim(coalesce(p_note, '')), 1000), ''),
    supplier_delivery_date = p_date
  where id = o.id;
  update jobs set materials_status = 'ordered' where id = o.job_id and materials_status = 'not_ordered';
  insert into notifications (org_id, kind, title, body, url)
  values (o.org_id, 'order_confirmed', o.supplier || ' confirmed the order',
    concat_ws(' · ', case when p_date is not null then 'Delivery ' || to_char(p_date, 'Dy DD Mon') end, nullif(trim(coalesce(p_ref, '')), '')),
    '/app/jobs/' || o.job_id || '/materials');
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.confirm_supplier_order(text, text, date, text) from public;
grant execute on function public.confirm_supplier_order(text, text, date, text) to anon, authenticated;
