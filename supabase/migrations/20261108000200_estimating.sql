-- Estimating (builder B): good/better/best options, cost vs sell totals, signed acceptance,
-- state notices snapshot, atomic estimate save, public estimate payload.
-- Additive only: new column, functions, triggers, indexes; views are replaced with the same leading columns.

-- ---------------------------------------------------------------------------
-- Estimates: how the choices are labelled ("options" for residential G/B/B, "alternates" for commercial bids)
-- ---------------------------------------------------------------------------
alter table public.estimates
  add column if not exists option_label text not null default 'options' check (option_label in ('options', 'alternates'));

-- At most one recommended option per estimate.
create unique index if not exists estimate_options_one_recommended on public.estimate_options (estimate_id) where recommended;

-- An option-specific line must point at an option of the SAME estimate (t_org2 only checks the org).
create or replace function public.estimate_items_option_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.option_id is not null and not exists (
    select 1 from estimate_options where id = new.option_id and estimate_id = new.estimate_id
  ) then
    raise exception 'line item option belongs to another estimate';
  end if;
  return new;
end $$;
drop trigger if exists estimate_items_option_check on public.estimate_items;
create trigger estimate_items_option_check before insert or update on public.estimate_items
  for each row execute function public.estimate_items_option_check();

create or replace function public.estimates_selected_option_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.selected_option_id is not null and not exists (
    select 1 from estimate_options where id = new.selected_option_id and estimate_id = new.id
  ) then
    raise exception 'selected option belongs to another estimate';
  end if;
  return new;
end $$;
drop trigger if exists estimates_selected_option_check on public.estimates;
create trigger estimates_selected_option_check before insert or update of selected_option_id on public.estimates
  for each row execute function public.estimates_selected_option_check();

-- ---------------------------------------------------------------------------
-- Totals. An estimate with options counts shared lines (option_id null) + the lines of ONE option:
-- the selected option, else the recommended one, else the first. No options -> every line.
-- ---------------------------------------------------------------------------
create or replace function public.estimate_effective_option(p_estimate uuid) returns uuid
language sql stable set search_path = public as $$
  select coalesce(
    (select e.selected_option_id from estimates e where e.id = p_estimate),
    (select o.id from estimate_options o where o.estimate_id = p_estimate order by o.recommended desc, o.position, o.id limit 1)
  );
$$;

-- Written as plain joins (no lateral) so PostgREST can still embed estimate_totals under estimates.
create or replace view public.estimate_totals with (security_invoker = true) as
select e.id as estimate_id, e.org_id,
  coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) as subtotal,
  greatest(coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) - e.discount, 0) as taxable,
  round(greatest(coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) - e.discount, 0) * e.tax_rate / 100, 2) as tax,
  round(greatest(coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) - e.discount, 0) * (1 + e.tax_rate / 100), 2) as total,
  public.estimate_effective_option(e.id) as option_id,
  coalesce(sum(round(i.quantity * i.unit_cost, 2)), 0) as cost
from public.estimates e
left join public.estimate_items i on i.estimate_id = e.id
  and (i.option_id is null or i.option_id = public.estimate_effective_option(e.id))
group by e.id;

-- Per-option totals (shared lines + that option's lines) for the editor, lists and the public page.
create or replace view public.estimate_option_totals with (security_invoker = true) as
select o.id as option_id, o.estimate_id, o.org_id,
  coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) as subtotal,
  round(greatest(coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) - e.discount, 0) * e.tax_rate / 100, 2) as tax,
  round(greatest(coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) - e.discount, 0) * (1 + e.tax_rate / 100), 2) as total,
  coalesce(sum(round(i.quantity * i.unit_cost, 2)), 0) as cost
from public.estimate_options o
join public.estimates e on e.id = o.estimate_id
left join public.estimate_items i on i.estimate_id = o.estimate_id and (i.option_id is null or i.option_id = o.id)
group by o.id, e.id;

grant select on public.estimate_totals, public.estimate_option_totals to authenticated;

-- PostgREST cannot infer a relationship from estimates to a view keyed by its primary key, so expose
-- computed relationships: estimates?select=*,estimate_totals(total) keeps working (to-one, "rows 1").
create or replace function public.estimate_totals(public.estimates) returns setof public.estimate_totals
language sql stable rows 1 set search_path = public as $$
  select * from public.estimate_totals where estimate_id = $1.id;
$$;
create or replace function public.estimate_option_totals(public.estimate_options) returns setof public.estimate_option_totals
language sql stable rows 1 set search_path = public as $$
  select * from public.estimate_option_totals where option_id = $1.id;
$$;

-- ---------------------------------------------------------------------------
-- Atomic save of an estimate's header, options and line items (runs with the caller's RLS).
-- p_options: [{ key, id?, name, tier, description, warranty, recommended }]
-- p_items:   [{ option_key|null, description, quantity, unit, unit_price, unit_cost, category, calc_key }]
-- Returns { <option key>: <option id> }.
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
    measurement_source = coalesce(p_estimate->>'measurement_source', measurement_source)
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
    insert into estimate_items (org_id, estimate_id, position, description, quantity, unit, unit_price, unit_cost, category, calc_key, option_id)
    values (v_est.org_id, p_id, n, it->>'description', coalesce((it->>'quantity')::numeric, 0), coalesce(it->>'unit', 'ea'),
            coalesce((it->>'unit_price')::numeric, 0), coalesce((it->>'unit_cost')::numeric, 0),
            coalesce(it->>'category', 'material'), nullif(it->>'calc_key', ''),
            case when nullif(it->>'option_key', '') is null then null else (v_map->>(it->>'option_key'))::uuid end);
    if nullif(it->>'option_key', '') is not null and v_map->>(it->>'option_key') is null then
      raise exception 'Line "%" points at an option that does not exist.', it->>'description';
    end if;
    n := n + 1;
  end loop;
  return v_map;
end $$;
revoke all on function public.save_estimate_content(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_estimate_content(uuid, jsonb, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Public document payload (estimate branch extended; invoice branch unchanged)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_document(p_kind text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if p_kind = 'estimate' then
    select jsonb_build_object(
      'kind', 'estimate', 'id', e.id, 'number', e.number, 'status', e.status, 'created_at', e.created_at,
      'sent_at', e.sent_at,
      'notes', e.notes, 'terms', e.terms, 'tax_rate', e.tax_rate, 'discount', e.discount,
      'accepted_at', e.accepted_at, 'accepted_name', e.accepted_name,
      'option_label', e.option_label,
      'selected_option_id', e.selected_option_id,
      'signature_data', case when e.status = 'accepted' then e.signature_data end,
      'legal_notices', e.legal_notices,
      'org', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'address', o.address,
        'license_number', o.license_number, 'website', o.website, 'state', o.state,
        'certifications', to_jsonb(o.certifications), 'insurance_certificate_url', o.insurance_certificate_url,
        'payment_schedule', o.payment_schedule),
      'financing', jsonb_build_object('enabled', coalesce((o.financing->>'enabled')::boolean, false),
        'apr', coalesce((o.financing->>'apr')::numeric, 0), 'term_months', coalesce((o.financing->>'term_months')::int, 0)),
      'customer', jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone, 'state', c.state,
        'address', concat_ws(', ', c.address, c.city, c.state, c.zip)),
      'job', jsonb_build_object('title', j.title, 'site_address', j.site_address, 'state', j.state, 'is_insurance', j.is_insurance),
      'options', coalesce((select jsonb_agg(jsonb_build_object('id', op.id, 'name', op.name, 'tier', op.tier,
                    'description', op.description, 'warranty', op.warranty, 'recommended', op.recommended, 'position', op.position)
                    order by op.position) from estimate_options op where op.estimate_id = e.id), '[]'::jsonb),
      'items', coalesce((select jsonb_agg(jsonb_build_object('description', i.description, 'quantity', i.quantity, 'unit', i.unit,
                    'unit_price', i.unit_price, 'option_id', i.option_id) order by i.position)
                         from estimate_items i where i.estimate_id = e.id), '[]'::jsonb)
    ) into r
    from estimates e join jobs j on j.id = e.job_id join customers c on c.id = j.customer_id join organizations o on o.id = e.org_id
    where e.public_token = p_token and e.status <> 'draft';
  elsif p_kind = 'invoice' then
    select jsonb_build_object(
      'kind', 'invoice', 'id', v.id, 'number', v.number, 'status', v.status, 'created_at', v.created_at,
      'issue_date', v.issue_date, 'due_date', v.due_date,
      'notes', v.notes, 'terms', v.terms, 'tax_rate', v.tax_rate, 'discount', v.discount,
      'paid', t.paid,
      'org', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'address', o.address, 'license_number', o.license_number),
      'customer', jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone, 'address', concat_ws(', ', c.address, c.city, c.state, c.zip)),
      'job', jsonb_build_object('title', j.title, 'site_address', j.site_address),
      'items', coalesce((select jsonb_agg(jsonb_build_object('description', i.description, 'quantity', i.quantity, 'unit', i.unit, 'unit_price', i.unit_price) order by i.position)
                         from invoice_items i where i.invoice_id = v.id), '[]'::jsonb)
    ) into r
    from invoices v join invoice_totals t on t.invoice_id = v.id join jobs j on j.id = v.job_id
      join customers c on c.id = j.customer_id join organizations o on o.id = v.org_id
    where v.public_token = p_token and v.status not in ('draft', 'void');
  end if;
  return r;
end $$;
revoke all on function public.get_public_document(text, text) from public;
grant execute on function public.get_public_document(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Signed acceptance: chosen option + drawn signature + typed name + IP/UA + state notices snapshot.
-- ---------------------------------------------------------------------------
create or replace function public.accept_public_estimate(
  p_token text, p_name text, p_option_id uuid, p_signature text, p_ip text, p_user_agent text, p_notices jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_est estimates; v_has_options boolean; v_notices jsonb;
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

  v_notices := case
    when jsonb_typeof(p_notices) = 'array' and jsonb_array_length(p_notices) <= 20 and length(p_notices::text) <= 60000 then p_notices
    else '[]'::jsonb end;

  update estimates set
    status = 'accepted', accepted_at = now(), accepted_name = left(trim(p_name), 200),
    selected_option_id = p_option_id, signature_data = p_signature,
    accepted_ip = left(p_ip, 100), accepted_user_agent = left(p_user_agent, 500),
    legal_notices = v_notices
  where id = v_est.id;
  update jobs set stage = 'sold' where id = v_est.job_id and stage in ('lead', 'inspection', 'estimate_sent');
  insert into notifications (org_id, kind, title, body, url)
  values (v_est.org_id, 'estimate_accepted', 'Estimate #' || v_est.number || ' accepted', 'Signed by ' || left(trim(p_name), 200),
          '/app/estimates/' || v_est.id);
  return true;
end $$;
revoke all on function public.accept_public_estimate(text, text, uuid, text, text, text, jsonb) from public;
grant execute on function public.accept_public_estimate(text, text, uuid, text, text, text, jsonb) to anon, authenticated;

-- Legacy 2-argument acceptance (typed name only). Kept so older callers keep working during the merge;
-- refuses estimates that have options. The coordinator can drop it once every caller uses the signed version.
create or replace function public.accept_public_estimate(p_token text, p_name text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_est estimates;
begin
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'please type your full name to sign'; end if;
  select * into v_est from estimates where public_token = p_token and status = 'sent' for update;
  if v_est.id is null then return false; end if;
  if exists (select 1 from estimate_options where estimate_id = v_est.id) then raise exception 'please choose an option'; end if;
  update estimates set status = 'accepted', accepted_at = now(), accepted_name = trim(p_name) where id = v_est.id;
  update jobs set stage = 'sold' where id = v_est.job_id and stage in ('lead', 'inspection', 'estimate_sent');
  return true;
end $$;
revoke all on function public.accept_public_estimate(text, text) from public;
grant execute on function public.accept_public_estimate(text, text) to anon, authenticated;
