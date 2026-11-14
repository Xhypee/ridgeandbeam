-- Contacts: the Customers list becomes Contacts. A contact is a customer, builder, contractor or other
-- (suppliers stay in org_suppliers and are listed alongside automatically).
alter table public.customers
  add column if not exists kind text not null default 'customer',
  add column if not exists company text,
  add column if not exists trade text,
  add column if not exists abn text,
  add column if not exists licence_no text,
  add column if not exists licence_class text,
  add column if not exists licence_expiry date,
  add column if not exists pl_cover text,
  add column if not exists pl_expiry date,
  add column if not exists workcover_expiry date,
  add column if not exists payment_terms text,
  add column if not exists retention_pct numeric(5,2),
  add column if not exists rate text,
  add column if not exists gst_registered boolean,
  add column if not exists bank_name text,
  add column if not exists bank_bsb text,
  add column if not exists bank_account text;

alter table public.customers drop constraint if exists customers_kind_check;
alter table public.customers add constraint customers_kind_check check (kind in ('customer', 'builder', 'contractor', 'other'));
alter table public.customers drop constraint if exists customers_retention_check;
alter table public.customers add constraint customers_retention_check check (retention_pct is null or (retention_pct >= 0 and retention_pct <= 20));
create index if not exists customers_org_kind_idx on public.customers (org_id, kind);

-- People at a company (a builder's site super, estimator, accounts).
create table if not exists public.contact_people (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.customers(id) on delete cascade,
  name text not null,
  role text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);
create index if not exists contact_people_contact_idx on public.contact_people (contact_id);
alter table public.contact_people enable row level security;
drop policy if exists contact_people_member on public.contact_people;
create policy contact_people_member on public.contact_people for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- Contractors (and others) put on a job. Its own id as the key (not (job_id, contact_id)) so the API doesn't
-- see a second customers<->jobs path and existing jobs->customers embeds stay unambiguous; the app prevents doubles.
create table if not exists public.job_contacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  contact_id uuid not null references public.customers(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  role text,
  created_at timestamptz not null default now()
);
create index if not exists job_contacts_contact_idx on public.job_contacts (contact_id);
create index if not exists job_contacts_job_idx on public.job_contacts (job_id);
alter table public.job_contacts enable row level security;
drop policy if exists job_contacts_member on public.job_contacts;
create policy job_contacts_member on public.job_contacts for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- Supplier rep and notes (shown on the supplier's contact sidebar).
alter table public.org_suppliers
  add column if not exists rep_name text,
  add column if not exists rep_phone text,
  add column if not exists notes text;
