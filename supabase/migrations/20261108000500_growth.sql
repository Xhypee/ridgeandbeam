-- Growth & integrations: speed-to-lead routing, online payments, financing, SaaS billing, canvassing.
-- Additive only.

-- ---------------------------------------------------------------------------
-- Organization settings owned by payments / billing
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists ach_enabled boolean not null default true,
  add column if not exists stripe_charges_enabled boolean not null default false,
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists ai_responder_enabled boolean not null default true;

-- Payments: which checkout session produced the row (debugging / support)
alter table public.payments add column if not exists provider_session text;

-- Financing: when the loan funded and the dealer-fee cost it produced
alter table public.financing_applications
  add column if not exists funded_on date,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists jobs_org_lead_idx on public.jobs (org_id, lead_received_at desc);
create index if not exists door_knocks_setter_idx on public.door_knocks (org_id, setter_id, created_at desc);

-- A converted door knock must point at a customer of the same company.
drop trigger if exists t_org2 on public.door_knocks;
create trigger t_org2 before insert or update on public.door_knocks for each row execute function public.check_parent_org('customers', 'customer_id');

-- ---------------------------------------------------------------------------
-- Financing: when an application is funded, post the dealer fee as a job cost (once).
-- ---------------------------------------------------------------------------
create or replace function public.financing_funded_cost() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_fee numeric;
begin
  if new.status = 'funded' and (tg_op = 'INSERT' or old.status is distinct from 'funded') then
    if new.funded_on is null then new.funded_on := current_date; end if;
    v_fee := round(new.amount * new.dealer_fee_pct / 100, 2);
    if v_fee > 0 and not exists (select 1 from job_costs where source = 'financing' and source_id = new.id) then
      insert into job_costs (org_id, job_id, category, vendor, description, amount, incurred_on, source, source_id, created_by)
      values (new.org_id, new.job_id, 'dealer_fee', new.lender,
              'Financing dealer fee (' || new.dealer_fee_pct || '% of ' || new.amount || ')', v_fee, new.funded_on, 'financing', new.id, new.created_by);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists financing_funded_cost on public.financing_applications;
create trigger financing_funded_cost before insert or update on public.financing_applications
  for each row execute function public.financing_funded_cost();

-- ---------------------------------------------------------------------------
-- Lead routing: round-robin across sales reps (owner when there are none).
-- Picks the rep who was least recently handed a lead; locks the org row so two
-- simultaneous leads don't land on the same person.
-- ---------------------------------------------------------------------------
create or replace function public.next_lead_assignee(p_org uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  perform 1 from organizations where id = p_org for update;
  select m.user_id into v_user
  from memberships m
  left join lateral (
    select max(j.lead_received_at) as last_at from jobs j where j.org_id = p_org and j.assigned_to = m.user_id
  ) l on true
  where m.org_id = p_org and m.role = 'sales_rep'
  order by l.last_at asc nulls first, m.created_at asc, m.user_id
  limit 1;
  if v_user is null then
    select user_id into v_user from memberships where org_id = p_org and role = 'owner' order by created_at limit 1;
  end if;
  return v_user;
end $$;
revoke all on function public.next_lead_assignee(uuid) from public, anon, authenticated;

-- An org that cancelled keeps working (and keeps receiving leads) until cancel_at.
create or replace function public.org_is_live(o public.organizations) returns boolean
language sql stable as $$
  select o.subscription_status <> 'cancelled' or (o.cancel_at is not null and o.cancel_at > now());
$$;

-- Same signature and behavior as the platform version, plus assignment + a notification for the assignee.
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
          left(p_lead->>'city', 100), upper(left(p_lead->>'state', 2)), left(p_lead->>'zip', 20),
          case when p_lead->>'source' in ('referral','website','door_knock','storm','repeat','ads','other') then (p_lead->>'source')::customer_source else 'website' end,
          left(p_lead->>'message', 4000))
  returning id into v_customer;

  v_assignee := public.next_lead_assignee(v_org.id);
  select role into v_role from memberships where org_id = v_org.id and user_id = v_assignee;

  insert into jobs (org_id, customer_id, title, site_address, state, zip, lead_source, notes, is_insurance, lead_received_at, assigned_to, sales_rep_id)
  values (v_org.id, v_customer, coalesce(left(p_lead->>'title', 200), 'New web lead'),
          nullif(concat_ws(', ', nullif(p_lead->>'address', ''), nullif(p_lead->>'city', ''), nullif(p_lead->>'state', ''), nullif(p_lead->>'zip', '')), ''),
          upper(left(p_lead->>'state', 2)), left(p_lead->>'zip', 20), coalesce(left(p_lead->>'source_detail', 100), left(p_lead->>'source', 50), 'website'),
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

create or replace function public.get_intake_org(p_key text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', name, 'phone', phone, 'website', website, 'instant_quote', instant_quote, 'state', state)
  from organizations o where intake_key = p_key and public.org_is_live(o);
$$;
revoke all on function public.get_intake_org(text) from public;
grant execute on function public.get_intake_org(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public invoice: what the homeowner needs to pay online (no secrets).
-- ---------------------------------------------------------------------------
create or replace function public.get_public_invoice_pay(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'invoice_id', v.id, 'number', v.number, 'status', v.status, 'balance', t.balance, 'total', t.total,
    'card_fee_pct', o.card_fee_pct, 'pass_card_fee', o.pass_card_fee, 'ach_enabled', o.ach_enabled,
    'online_ready', (o.stripe_account_id is not null and o.stripe_charges_enabled),
    'financing', o.financing,
    'org', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'address', o.address)
  )
  from invoices v join invoice_totals t on t.invoice_id = v.id join organizations o on o.id = v.org_id
  where v.public_token = p_token and v.status not in ('draft', 'void');
$$;
revoke all on function public.get_public_invoice_pay(text) from public;
grant execute on function public.get_public_invoice_pay(text) to anon, authenticated;
