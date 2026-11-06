-- RoofDesk: multi-tenant roofing CRM / estimating / jobs / invoicing
-- Every business table carries org_id and is protected by RLS via is_org_member().

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  phone text,
  email text,
  address text,
  license_number text,
  tax_rate numeric(6,3) not null default 0,         -- percent, e.g. 8.25
  default_waste_pct numeric(5,2) not null default 10,
  estimate_terms text not null default 'Estimate valid for 30 days. 50% deposit due at signing, balance due on completion.',
  invoice_terms text not null default 'Payment due within 15 days.',
  next_estimate_number int not null default 1001,
  next_invoice_number int not null default 1001,
  created_at timestamptz not null default now()
);

create type public.member_role as enum ('owner', 'admin', 'member');

create table public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'member',
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index on public.memberships (user_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.member_role not null default 'member' check (role <> 'owner'),
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.invites (org_id);

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where org_id = p_org and user_id = auth.uid());
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships
    where org_id = p_org and user_id = auth.uid() and role in ('owner', 'admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- CRM
-- ---------------------------------------------------------------------------
create type public.customer_source as enum ('referral', 'website', 'door_knock', 'storm', 'repeat', 'ads', 'other');

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  source public.customer_source not null default 'other',
  -- insurance claim details (storm / hail work)
  insurance_company text,
  claim_number text,
  adjuster_name text,
  adjuster_phone text,
  notes text,
  follow_up_on date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.customers (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Jobs & scheduling
-- ---------------------------------------------------------------------------
create type public.job_stage as enum ('lead', 'inspection', 'estimate_sent', 'sold', 'scheduled', 'in_progress', 'completed', 'paid', 'lost');
create type public.job_type as enum ('replacement', 'repair', 'inspection', 'new_construction', 'gutters', 'other');

create table public.crews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  color text not null default '#2563eb',
  created_at timestamptz not null default now()
);
create index on public.crews (org_id);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  job_type public.job_type not null default 'replacement',
  stage public.job_stage not null default 'lead',
  site_address text,
  roof_material text,
  is_insurance boolean not null default false,
  scheduled_start date,
  scheduled_end date,
  crew_id uuid references public.crews(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end is null or scheduled_start is null or scheduled_end >= scheduled_start)
);
create index on public.jobs (org_id, stage);
create index on public.jobs (org_id, scheduled_start);
create index on public.jobs (customer_id);

create table public.job_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  body text not null check (length(trim(body)) > 0),
  author_id uuid references auth.users(id) on delete set null,
  author_name text,
  created_at timestamptz not null default now()
);
create index on public.job_notes (job_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Price book
-- ---------------------------------------------------------------------------
create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  calc_key text,                       -- links the item to the roof calculator (see src/lib/roof.ts)
  name text not null,
  unit text not null default 'ea',
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  category text not null default 'material' check (category in ('material', 'labor', 'other')),
  created_at timestamptz not null default now(),
  unique (org_id, calc_key)
);
create index on public.catalog_items (org_id);

-- ---------------------------------------------------------------------------
-- Estimates
-- ---------------------------------------------------------------------------
create type public.estimate_status as enum ('draft', 'sent', 'accepted', 'declined');

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  number int not null,
  status public.estimate_status not null default 'draft',
  -- roof measurements used by the calculator
  measurements jsonb not null default '{}'::jsonb,
  tax_rate numeric(6,3) not null default 0,
  discount numeric(12,2) not null default 0 check (discount >= 0),
  notes text,
  terms text,
  public_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  sent_at timestamptz,
  accepted_at timestamptz,
  accepted_name text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, number)
);
create index on public.estimates (org_id, created_at desc);
create index on public.estimates (job_id);

create table public.estimate_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  position int not null default 0,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit text not null default 'ea',
  unit_price numeric(12,2) not null default 0,
  category text not null default 'material'
);
create index on public.estimate_items (estimate_id, position);

-- ---------------------------------------------------------------------------
-- Invoices & payments
-- ---------------------------------------------------------------------------
create type public.invoice_status as enum ('draft', 'sent', 'partial', 'paid', 'void');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  estimate_id uuid references public.estimates(id) on delete set null,
  number int not null,
  status public.invoice_status not null default 'draft',
  issue_date date not null default current_date,
  due_date date,
  tax_rate numeric(6,3) not null default 0,
  discount numeric(12,2) not null default 0 check (discount >= 0),
  notes text,
  terms text,
  public_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, number)
);
create index on public.invoices (org_id, created_at desc);
create index on public.invoices (job_id);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  position int not null default 0,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit text not null default 'ea',
  unit_price numeric(12,2) not null default 0,
  category text not null default 'material'
);
create index on public.invoice_items (invoice_id, position);

create type public.payment_method as enum ('check', 'cash', 'card', 'ach', 'insurance', 'financing', 'other');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method public.payment_method not null default 'check',
  paid_on date not null default current_date,
  reference text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.payments (invoice_id);

-- ---------------------------------------------------------------------------
-- Totals view (computed in SQL so lists and dashboards agree)
-- ---------------------------------------------------------------------------
create or replace view public.estimate_totals with (security_invoker = true) as
select e.id as estimate_id, e.org_id,
  coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) as subtotal,
  greatest(coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) - e.discount, 0) as taxable,
  round(greatest(coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) - e.discount, 0) * e.tax_rate / 100, 2) as tax,
  round(greatest(coalesce(sum(round(i.quantity * i.unit_price, 2)), 0) - e.discount, 0) * (1 + e.tax_rate / 100), 2) as total
from public.estimates e
left join public.estimate_items i on i.estimate_id = e.id
group by e.id;

create or replace view public.invoice_totals with (security_invoker = true) as
with sums as (
  select v.id, v.org_id, v.discount, v.tax_rate,
    coalesce((select sum(round(i.quantity * i.unit_price, 2)) from public.invoice_items i where i.invoice_id = v.id), 0) as subtotal,
    coalesce((select sum(p.amount) from public.payments p where p.invoice_id = v.id), 0) as paid
  from public.invoices v
)
select id as invoice_id, org_id, subtotal,
  round(greatest(subtotal - discount, 0) * tax_rate / 100, 2) as tax,
  round(greatest(subtotal - discount, 0) * (1 + tax_rate / 100), 2) as total,
  paid,
  round(greatest(subtotal - discount, 0) * (1 + tax_rate / 100), 2) - paid as balance
from sums;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger jobs_touch before update on public.jobs for each row execute function public.touch_updated_at();

-- Per-org sequential document numbers. Row-locks the org to avoid duplicates.
create or replace function public.assign_estimate_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update organizations set next_estimate_number = next_estimate_number + 1
   where id = new.org_id returning next_estimate_number - 1 into new.number;
  return new;
end $$;
create trigger estimates_number before insert on public.estimates
  for each row execute function public.assign_estimate_number();

create or replace function public.assign_invoice_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update organizations set next_invoice_number = next_invoice_number + 1
   where id = new.org_id returning next_invoice_number - 1 into new.number;
  return new;
end $$;
create trigger invoices_number before insert on public.invoices
  for each row execute function public.assign_invoice_number();

-- Children must belong to the same org as their parent (blocks cross-tenant references).
create or replace function public.check_same_org() returns trigger
language plpgsql security definer set search_path = public as $$
declare parent_org uuid;
begin
  if tg_table_name = 'jobs' then
    select org_id into parent_org from customers where id = new.customer_id;
    if new.crew_id is not null and not exists (select 1 from crews where id = new.crew_id and org_id = new.org_id) then
      raise exception 'crew belongs to another organization';
    end if;
  elsif tg_table_name in ('estimates', 'job_notes') then
    select org_id into parent_org from jobs where id = new.job_id;
  elsif tg_table_name = 'invoices' then
    select org_id into parent_org from jobs where id = new.job_id;
    if new.estimate_id is not null and not exists (select 1 from estimates where id = new.estimate_id and org_id = new.org_id) then
      raise exception 'estimate belongs to another organization';
    end if;
  elsif tg_table_name = 'estimate_items' then
    select org_id into parent_org from estimates where id = new.estimate_id;
  elsif tg_table_name in ('invoice_items', 'payments') then
    select org_id into parent_org from invoices where id = new.invoice_id;
  end if;
  if parent_org is null or parent_org <> new.org_id then
    raise exception 'parent record belongs to another organization';
  end if;
  return new;
end $$;

create trigger jobs_same_org before insert or update on public.jobs for each row execute function public.check_same_org();
create trigger estimates_same_org before insert or update on public.estimates for each row execute function public.check_same_org();
create trigger job_notes_same_org before insert or update on public.job_notes for each row execute function public.check_same_org();
create trigger invoices_same_org before insert or update on public.invoices for each row execute function public.check_same_org();
create trigger estimate_items_same_org before insert or update on public.estimate_items for each row execute function public.check_same_org();
create trigger invoice_items_same_org before insert or update on public.invoice_items for each row execute function public.check_same_org();
create trigger payments_same_org before insert or update on public.payments for each row execute function public.check_same_org();

-- Keep invoice status in sync with payments.
create or replace function public.sync_invoice_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_total numeric; v_paid numeric; v_status invoice_status;
begin
  v_id := coalesce(new.invoice_id, old.invoice_id);
  select status into v_status from invoices where id = v_id;
  if v_status is null or v_status = 'void' then return null; end if;
  select total, paid into v_total, v_paid from invoice_totals where invoice_id = v_id;
  update invoices set status = case
      when v_paid >= v_total and v_total > 0 then 'paid'::invoice_status
      when v_paid > 0 then 'partial'::invoice_status
      when v_status in ('paid', 'partial') then 'sent'::invoice_status
      else v_status end
   where id = v_id;
  return null;
end $$;
create trigger payments_sync after insert or update or delete on public.payments
  for each row execute function public.sync_invoice_status();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.customers enable row level security;
alter table public.crews enable row level security;
alter table public.jobs enable row level security;
alter table public.job_notes enable row level security;
alter table public.catalog_items enable row level security;
alter table public.estimates enable row level security;
alter table public.estimate_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;

create policy org_select on public.organizations for select using (public.is_org_member(id));
create policy org_update on public.organizations for update using (public.is_org_admin(id)) with check (public.is_org_admin(id));
-- inserts go through create_organization(); deletes are not exposed.

create policy members_select on public.memberships for select using (public.is_org_member(org_id));
create policy members_update on public.memberships for update
  using (public.is_org_admin(org_id) and role <> 'owner') with check (public.is_org_admin(org_id) and role <> 'owner');
create policy members_delete on public.memberships for delete
  using ((public.is_org_admin(org_id) and role <> 'owner') or (user_id = auth.uid() and role <> 'owner'));

create policy invites_all on public.invites for all
  using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

-- Generic member policies for business tables.
do $$
declare t text;
begin
  foreach t in array array['customers', 'crews', 'jobs', 'job_notes', 'catalog_items', 'estimates', 'estimate_items', 'invoices', 'invoice_items', 'payments']
  loop
    execute format('create policy %I on public.%I for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id))', t || '_member', t);
  end loop;
end $$;

-- Organization-level counters must not be editable directly by members via org_update;
-- only admins can update the org row at all, and number counters are bumped by triggers.

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(p_name text, p_full_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_email text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into organizations (name, email) values (p_name, v_email) returning id into v_org;
  insert into memberships (org_id, user_id, role, full_name, email) values (v_org, auth.uid(), 'owner', p_full_name, v_email);

  -- Starter price book. Prices are placeholders the roofer edits in Settings.
  insert into catalog_items (org_id, calc_key, name, unit, unit_price, category) values
    (v_org, 'tearoff',      'Tear-off & disposal (per layer)',        'sq',     65.00,  'labor'),
    (v_org, 'labor',        'Installation labor',                     'sq',     95.00,  'labor'),
    (v_org, 'steep',        'Steep-pitch charge (8/12 and up)',       'sq',     25.00,  'labor'),
    (v_org, 'shingles',     'Architectural shingles',                 'bundle', 42.00,  'material'),
    (v_org, 'underlayment', 'Synthetic underlayment (10 sq roll)',    'roll',   115.00, 'material'),
    (v_org, 'ice_water',    'Ice & water shield (2 sq roll)',         'roll',   95.00,  'material'),
    (v_org, 'starter',      'Starter strip (~100 LF bundle)',         'bundle', 55.00,  'material'),
    (v_org, 'ridge_cap',    'Hip & ridge cap (~30 LF bundle)',        'bundle', 72.00,  'material'),
    (v_org, 'drip_edge',    'Drip edge (10 ft)',                      'piece',  11.00,  'material'),
    (v_org, 'ridge_vent',   'Ridge vent (4 ft)',                      'piece',  22.00,  'material'),
    (v_org, 'nails',        'Coil roofing nails (box, ~15 sq)',       'box',    58.00,  'material'),
    (v_org, 'pipe_boot',    'Pipe boot flashing',                     'ea',     18.00,  'material'),
    (v_org, 'dumpster',     'Dumpster / haul-off',                    'ea',     475.00, 'other'),
    (v_org, 'permit',       'Permit',                                 'ea',     250.00, 'other');
  return v_org;
end $$;

create or replace function public.accept_invite(p_token text, p_full_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_inv invites; v_email text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select email into v_email from auth.users where id = auth.uid();
  select * into v_inv from invites where token = p_token and accepted_at is null;
  if v_inv.id is null then raise exception 'invite not found or already used'; end if;
  if lower(v_inv.email) <> lower(v_email) then raise exception 'this invite was sent to a different email address'; end if;
  insert into memberships (org_id, user_id, role, full_name, email)
    values (v_inv.org_id, auth.uid(), v_inv.role, p_full_name, v_email)
    on conflict (org_id, user_id) do nothing;
  update invites set accepted_at = now() where id = v_inv.id;
  return v_inv.org_id;
end $$;

-- Public (anonymous) customer-facing views of an estimate / invoice by unguessable token.
create or replace function public.get_public_document(p_kind text, p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if p_kind = 'estimate' then
    select jsonb_build_object(
      'kind', 'estimate', 'id', e.id, 'number', e.number, 'status', e.status, 'created_at', e.created_at,
      'notes', e.notes, 'terms', e.terms, 'tax_rate', e.tax_rate, 'discount', e.discount,
      'accepted_at', e.accepted_at, 'accepted_name', e.accepted_name,
      'org', jsonb_build_object('name', o.name, 'phone', o.phone, 'email', o.email, 'address', o.address, 'license_number', o.license_number),
      'customer', jsonb_build_object('name', c.name, 'email', c.email, 'phone', c.phone, 'address', concat_ws(', ', c.address, c.city, c.state, c.zip)),
      'job', jsonb_build_object('title', j.title, 'site_address', j.site_address),
      'items', coalesce((select jsonb_agg(jsonb_build_object('description', i.description, 'quantity', i.quantity, 'unit', i.unit, 'unit_price', i.unit_price) order by i.position)
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

create or replace function public.accept_public_estimate(p_token text, p_name text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_est estimates;
begin
  if p_name is null or length(trim(p_name)) < 2 then raise exception 'please type your full name to sign'; end if;
  select * into v_est from estimates where public_token = p_token and status = 'sent' for update;
  if v_est.id is null then return false; end if;
  update estimates set status = 'accepted', accepted_at = now(), accepted_name = trim(p_name) where id = v_est.id;
  update jobs set stage = 'sold' where id = v_est.job_id and stage in ('lead', 'inspection', 'estimate_sent');
  return true;
end $$;

revoke all on function public.get_public_document(text, text) from public;
revoke all on function public.accept_public_estimate(text, text) from public;
grant execute on function public.get_public_document(text, text) to anon, authenticated;
grant execute on function public.accept_public_estimate(text, text) to anon, authenticated;
revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;
revoke all on function public.accept_invite(text, text) from public, anon;
grant execute on function public.accept_invite(text, text) to authenticated;
