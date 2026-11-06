-- Ridge & Beam platform expansion: claims & insurance money, tiers, field capture, homeowner portal,
-- production readiness, crews & work orders, costing & commissions, orders, leads, canvassing, integrations.

-- ---------------------------------------------------------------------------
-- Generic helper: child rows must belong to the same org as their parent.
-- Usage: trigger ... execute function check_parent_org('<parent table>', '<fk column>')
-- ---------------------------------------------------------------------------
create or replace function public.check_parent_org() returns trigger
language plpgsql security definer set search_path = public as $$
declare parent_org uuid; fk uuid;
begin
  fk := (to_jsonb(new) ->> tg_argv[1])::uuid;
  if fk is null then return new; end if;
  execute format('select org_id from public.%I where id = $1', tg_argv[0]) into parent_org using fk;
  if parent_org is null or parent_org <> new.org_id then
    raise exception 'parent record belongs to another organization';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Organizations: settings used across modules
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column state text,
  add column zip text,
  add column lat double precision,
  add column lng double precision,
  add column website text,
  add column google_review_url text,
  add column insurance_certificate_url text,
  add column certifications text[] not null default '{}',
  add column intake_key text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  add column payment_schedule jsonb not null default '[{"label":"Deposit","pct":30,"trigger":"signed"},{"label":"Materials delivered","pct":40,"trigger":"delivered"},{"label":"Completion","pct":30,"trigger":"completed"}]'::jsonb,
  add column financing jsonb not null default '{"enabled":false,"apr":9.99,"term_months":120,"lenders":[]}'::jsonb,
  add column min_margin_pct numeric(5,2) not null default 25,
  add column bundles_per_square numeric(4,2) not null default 3,
  add column card_fee_pct numeric(5,2) not null default 2.9,
  add column pass_card_fee boolean not null default false,
  add column stripe_account_id text,
  add column plan text not null default 'pro',
  add column subscription_status text not null default 'active' check (subscription_status in ('trialing', 'active', 'cancelled')),
  add column cancel_at timestamptz,
  add column instant_quote jsonb not null default '{"enabled":true,"price_per_square_low":450,"price_per_square_high":650}'::jsonb;

-- ---------------------------------------------------------------------------
-- Memberships: commission plan + phone for notifications
-- ---------------------------------------------------------------------------
create table public.commission_plans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('pct_contract', 'pct_gross_profit', 'split_10_50_50')),
  rate numeric(6,3) not null default 10,          -- percent
  draw_amount numeric(12,2) not null default 0,   -- recurring draw against commission
  created_at timestamptz not null default now()
);
create index on public.commission_plans (org_id);

alter table public.memberships
  add column phone text,
  add column commission_plan_id uuid references public.commission_plans(id) on delete set null,
  add column crew_id uuid; -- crew leads: the crew they run (FK added after crews alter)

-- ---------------------------------------------------------------------------
-- Crews: pay sheet + language + portal token
-- ---------------------------------------------------------------------------
alter table public.crews
  add column phone text,
  add column language text not null default 'en' check (language in ('en', 'es')),
  add column public_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  add column rate_per_square numeric(10,2) not null default 0,
  add column steep_adder numeric(10,2) not null default 0,        -- per square, 8/12 to 9/12
  add column high_steep_adder numeric(10,2) not null default 0,   -- per square, 10/12 and up
  add column layer_adder numeric(10,2) not null default 0,        -- per square per extra layer
  add column low_slope_rate numeric(10,2) not null default 0,     -- per square
  add column is_subcontractor boolean not null default true;

alter table public.memberships
  add constraint memberships_crew_fk foreign key (crew_id) references public.crews(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Jobs: ownership, speed-to-lead, readiness, delivery, portal, close-out, liens
-- ---------------------------------------------------------------------------
alter table public.jobs
  add column state text,
  add column zip text,
  add column lat double precision,
  add column lng double precision,
  add column assigned_to uuid references auth.users(id) on delete set null,
  add column sales_rep_id uuid references auth.users(id) on delete set null,
  add column setter_id uuid references auth.users(id) on delete set null,
  add column lead_source text,
  add column lead_received_at timestamptz not null default now(),
  add column first_contacted_at timestamptz,
  add column stage_changed_at timestamptz not null default now(),
  add column public_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  add column notify_homeowner boolean not null default true,
  -- readiness
  add column permit_status text not null default 'needed' check (permit_status in ('not_needed', 'needed', 'applied', 'approved')),
  add column permit_number text,
  add column hoa_status text not null default 'not_needed' check (hoa_status in ('not_needed', 'needed', 'submitted', 'approved')),
  add column colors_confirmed boolean not null default false,
  add column shingle_color text,
  add column materials_status text not null default 'not_ordered' check (materials_status in ('not_ordered', 'ordered', 'delivered')),
  add column dumpster_status text not null default 'needed' check (dumpster_status in ('not_needed', 'needed', 'ordered', 'delivered', 'removed')),
  add column schedule_locked boolean not null default false,
  -- delivery / site
  add column delivery_type text not null default 'roof_load' check (delivery_type in ('roof_load', 'ground_drop')),
  add column delivery_notes text,
  add column gate_code text,
  add column site_hazards text,
  -- close-out
  add column completed_at timestamptz,
  add column walkthrough_signed_at timestamptz,
  add column walkthrough_name text,
  add column walkthrough_signature text,
  add column warranty_product text,
  add column warranty_registered_at timestamptz,
  add column warranty_registration_number text,
  add column review_requested_at timestamptz,
  -- liens / commercial
  add column last_furnished_on date,
  add column bid_due_on date;

create index on public.jobs (org_id, assigned_to);
create index on public.jobs (org_id, sales_rep_id);

-- Backfill job state/zip from the customer.
update public.jobs j set state = upper(c.state), zip = c.zip from public.customers c where c.id = j.customer_id;
update public.jobs j set lead_source = c.source::text from public.customers c where c.id = j.customer_id;

create or replace function public.jobs_stage_tracking() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    new.stage_changed_at = now();
    if new.stage = 'completed' and new.completed_at is null then new.completed_at = now(); end if;
  end if;
  return new;
end $$;
create trigger jobs_stage_tracking before update on public.jobs for each row execute function public.jobs_stage_tracking();

create table public.job_checklist_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  kind text not null default 'punch' check (kind in ('punch', 'closeout')),
  label text not null,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.job_checklist_items (job_id);

-- ---------------------------------------------------------------------------
-- Insurance claims (one per job) + money ledger + paperwork + supplements + scope diff
-- ---------------------------------------------------------------------------
create type public.claim_stage as enum (
  'contingency_signed', 'claim_filed', 'adjuster_scheduled', 'adjuster_met', 'scope_received',
  'supplementing', 'approved', 'built', 'coc_sent', 'depreciation_released', 'closed', 'denied'
);
create type public.policy_type as enum ('rcv', 'acv', 'roof_schedule', 'unknown');

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null unique references public.jobs(id) on delete cascade,
  carrier text,
  claim_number text,
  policy_number text,
  policy_type public.policy_type not null default 'unknown',
  date_of_loss date,
  cause_of_loss text,
  adjuster_name text,
  adjuster_phone text,
  adjuster_email text,
  adjuster_meeting_at timestamptz,
  rcv_amount numeric(12,2) not null default 0,
  depreciation_amount numeric(12,2) not null default 0,
  deductible numeric(12,2) not null default 0,
  o_and_p_included boolean not null default false,
  mortgagee_name text,
  mortgage_loan_number text,
  loss_draft_contact text,
  stage public.claim_stage not null default 'contingency_signed',
  stage_changed_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);
create index on public.claims (org_id, stage);

create or replace function public.claims_stage_tracking() returns trigger language plpgsql as $$
begin
  if new.stage is distinct from old.stage then new.stage_changed_at = now(); end if;
  return new;
end $$;
create trigger claims_stage_tracking before update on public.claims for each row execute function public.claims_stage_tracking();

-- Move insurance data from customers onto the job's claim.
insert into public.claims (org_id, job_id, carrier, claim_number, adjuster_name, adjuster_phone)
select j.org_id, j.id, c.insurance_company, c.claim_number, c.adjuster_name, c.adjuster_phone
from public.jobs j join public.customers c on c.id = j.customer_id
where j.is_insurance or c.claim_number is not null or c.insurance_company is not null
on conflict (job_id) do nothing;

create table public.claim_checks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  claim_id uuid not null references public.claims(id) on delete cascade,
  kind text not null check (kind in ('acv', 'depreciation', 'supplement', 'deductible', 'other')),
  payer text not null default 'carrier' check (payer in ('carrier', 'homeowner', 'mortgagee')),
  label text,
  expected_amount numeric(12,2) not null default 0,
  received_amount numeric(12,2) not null default 0,
  received_on date,
  check_number text,
  endorsement text not null default 'not_required' check (endorsement in ('not_required', 'needed', 'sent_to_lender', 'endorsed')),
  supplement_id uuid,
  payment_id uuid references public.payments(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index on public.claim_checks (claim_id);

create table public.claim_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  claim_id uuid not null references public.claims(id) on delete cascade,
  doc_type text not null check (doc_type in ('w9', 'contract', 'scope', 'coc', 'final_invoice', 'lien_waiver', 'license_coi', 'photos', 'endorsed_check', 'other')),
  status text not null default 'missing' check (status in ('missing', 'ready', 'sent', 'accepted')),
  file_id uuid,
  sent_on date,
  notes text,
  unique (claim_id, doc_type)
);

create table public.supplements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  claim_id uuid not null references public.claims(id) on delete cascade,
  round int not null default 1,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'partial', 'denied')),
  submitted_on date,
  responded_on date,
  requested_amount numeric(12,2) not null default 0,
  approved_amount numeric(12,2) not null default 0,
  carrier_response text,
  next_follow_up_on date,
  notes text,
  created_at timestamptz not null default now(),
  unique (claim_id, round)
);
alter table public.claim_checks add constraint claim_checks_supplement_fk foreign key (supplement_id) references public.supplements(id) on delete set null;

create table public.supplement_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  supplement_id uuid not null references public.supplements(id) on delete cascade,
  position int not null default 0,
  description text not null,
  xact_code text,
  quantity numeric(12,2) not null default 1,
  unit text not null default 'ea',
  unit_price numeric(12,2) not null default 0,
  code_citation text,
  justification text,
  file_ids uuid[] not null default '{}',
  status text not null default 'requested' check (status in ('requested', 'approved', 'denied')),
  approved_amount numeric(12,2) not null default 0
);
create index on public.supplement_items (supplement_id);

create table public.scope_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  claim_id uuid not null references public.claims(id) on delete cascade,
  source text not null check (source in ('carrier', 'contractor')),
  position int not null default 0,
  xact_code text,
  description text not null,
  quantity numeric(12,2) not null default 0,
  unit text not null default 'ea',
  unit_price numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0
);
create index on public.scope_items (claim_id, source);

-- ---------------------------------------------------------------------------
-- Estimates: good/better/best options, cost tracking, signatures
-- ---------------------------------------------------------------------------
create table public.estimate_options (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  position int not null default 0,
  name text not null,
  tier text check (tier in ('good', 'better', 'best')),
  description text,
  warranty text,
  recommended boolean not null default false
);
create index on public.estimate_options (estimate_id, position);

alter table public.estimate_items
  add column option_id uuid references public.estimate_options(id) on delete cascade, -- null = included in every option
  add column unit_cost numeric(12,2) not null default 0,
  add column calc_key text;

alter table public.estimates
  add column selected_option_id uuid references public.estimate_options(id) on delete set null,
  add column signature_data text,
  add column accepted_ip text,
  add column accepted_user_agent text,
  add column measurement_source text,
  add column legal_notices jsonb not null default '[]'::jsonb;

alter table public.catalog_items
  add column unit_cost numeric(12,2) not null default 0,
  add column tier text check (tier in ('good', 'better', 'best')),
  add column requires_certification text,
  add column warranty text;
alter table public.catalog_items drop constraint catalog_items_org_id_calc_key_key;
create unique index catalog_items_org_calc_tier on public.catalog_items (org_id, calc_key, tier) nulls not distinct;

alter table public.invoice_items
  add column unit_cost numeric(12,2) not null default 0;

-- ---------------------------------------------------------------------------
-- Invoices: milestones; payments: online/fees
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column kind text not null default 'standard' check (kind in ('standard', 'deposit', 'progress', 'final', 'supplement', 'change_order')),
  add column milestone_label text,
  add column milestone_trigger text,
  add column bill_to text not null default 'homeowner' check (bill_to in ('homeowner', 'carrier', 'mortgagee', 'other'));

alter table public.payments
  add column fee_amount numeric(12,2) not null default 0,
  add column provider text,
  add column provider_ref text unique;

-- ---------------------------------------------------------------------------
-- Field capture: files (photos, voice, documents), status events, messages
-- ---------------------------------------------------------------------------
create table public.job_files (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  client_id text,                      -- idempotency key from offline queue
  kind text not null default 'photo' check (kind in ('photo', 'voice', 'document', 'signature')),
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  caption text,
  category text not null default 'other' check (category in ('overview', 'damage', 'test_square', 'decking', 'progress', 'completion', 'delivery', 'document', 'other')),
  slope text,                          -- front / rear / left / right / garage / other
  test_square_hits int,
  annotations jsonb,
  shared_with_homeowner boolean not null default false,
  taken_at timestamptz,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, client_id)
);
create index on public.job_files (job_id, created_at desc);

alter table public.claim_documents add constraint claim_documents_file_fk foreign key (file_id) references public.job_files(id) on delete set null;

create table public.job_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  kind text not null,                  -- on_my_way, tear_off_started, dry_in, completed, cleanup_verified, materials_delivered, permit_approved, ...
  note text,
  file_id uuid references public.job_files(id) on delete set null,
  visible_to_homeowner boolean not null default true,
  notified boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);
create index on public.job_events (job_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  direction text not null check (direction in ('outbound', 'inbound')),
  channel text not null check (channel in ('sms', 'email')),
  to_address text,
  from_address text,
  subject text,
  body text not null,
  status text not null default 'queued',   -- queued / sent / failed / not_configured / received
  provider_ref text,
  error text,
  created_at timestamptz not null default now()
);
create index on public.messages (org_id, created_at desc);
create index on public.messages (job_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,  -- null = everyone in org
  kind text not null,
  title text not null,
  body text,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (org_id, user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Change orders
-- ---------------------------------------------------------------------------
create table public.change_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'approved', 'declined')),
  public_token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  file_ids uuid[] not null default '{}',
  approved_at timestamptz,
  approved_name text,
  signature_data text,
  invoice_id uuid references public.invoices(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.change_orders (job_id);

create table public.change_order_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  change_order_id uuid not null references public.change_orders(id) on delete cascade,
  position int not null default 0,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit text not null default 'ea',
  unit_price numeric(12,2) not null default 0,
  unit_cost numeric(12,2) not null default 0
);

-- ---------------------------------------------------------------------------
-- Job costing, material orders, returns
-- ---------------------------------------------------------------------------
create table public.material_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  supplier text not null default 'ABC Supply',
  branch text,
  po_number text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'confirmed', 'delivered', 'cancelled')),
  delivery_date date,
  delivery_type text not null default 'roof_load' check (delivery_type in ('roof_load', 'ground_drop')),
  color text,
  notes text,
  sent_at timestamptz,
  delivered_at timestamptz,
  delivery_file_ids uuid[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.material_orders (org_id, status);
create index on public.material_orders (job_id);

create table public.material_order_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.material_orders(id) on delete cascade,
  position int not null default 0,
  description text not null,
  sku text,
  quantity numeric(12,2) not null default 0,
  unit text not null default 'ea',
  unit_cost numeric(12,2) not null default 0
);

create table public.material_returns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.material_orders(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 0,
  credit_amount numeric(12,2) not null default 0,
  restocking_fee numeric(12,2) not null default 0,
  credit_window_ends_on date,
  status text not null default 'pending' check (status in ('pending', 'returned', 'credited', 'rejected')),
  created_at timestamptz not null default now()
);

create table public.job_costs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  category text not null check (category in ('materials', 'labor', 'dumpster', 'permit', 'dealer_fee', 'equipment', 'supplement_fee', 'other')),
  vendor text,
  description text,
  amount numeric(12,2) not null,      -- negative for credits / returns
  incurred_on date not null default current_date,
  source text not null default 'manual' check (source in ('manual', 'order', 'return', 'crew_pay', 'financing', 'quickbooks')),
  source_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.job_costs (job_id);

-- ---------------------------------------------------------------------------
-- Commissions
-- ---------------------------------------------------------------------------
create table public.commission_payouts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  kind text not null check (kind in ('advance', 'draw', 'final', 'chargeback', 'adjustment')),
  amount numeric(12,2) not null,
  paid_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);
create index on public.commission_payouts (org_id, user_id);

-- ---------------------------------------------------------------------------
-- Financing
-- ---------------------------------------------------------------------------
create table public.financing_applications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  lender text not null,
  amount numeric(12,2) not null default 0,
  status text not null default 'link_sent' check (status in ('link_sent', 'prequalified', 'approved', 'declined', 'funded', 'cancelled')),
  dealer_fee_pct numeric(5,2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
create index on public.financing_applications (job_id);

-- ---------------------------------------------------------------------------
-- Lead marketing spend & canvassing
-- ---------------------------------------------------------------------------
create table public.lead_spend (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  source text not null,
  month date not null,              -- first day of month
  amount numeric(12,2) not null default 0,
  unique (org_id, source, month)
);

create table public.territories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  kind text not null default 'territory' check (kind in ('territory', 'hail_swath')),
  geojson jsonb not null,
  color text not null default '#ea580c',
  assigned_to uuid references auth.users(id) on delete set null,
  storm_date date,
  created_at timestamptz not null default now()
);
create index on public.territories (org_id);

create table public.door_knocks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  territory_id uuid references public.territories(id) on delete set null,
  lat double precision not null,
  lng double precision not null,
  address text,
  status text not null default 'not_home' check (status in ('not_home', 'not_interested', 'come_back', 'interested', 'inspection_booked', 'customer')),
  notes text,
  setter_id uuid references auth.users(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.door_knocks (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Integrations (tokens are service-role only)
-- ---------------------------------------------------------------------------
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('quickbooks')),
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'error')),
  external_id text,      -- e.g. QuickBooks realm id
  connected_at timestamptz,
  last_synced_at timestamptz,
  unique (org_id, provider)
);

create table public.integration_secrets (
  integration_id uuid primary key references public.integrations(id) on delete cascade,
  access_token text,
  refresh_token text,
  expires_at timestamptz
);

create table public.integration_sync_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  entity text not null,
  entity_id uuid,
  status text not null check (status in ('ok', 'error')),
  message text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.integration_sync_log (org_id, created_at desc);

create table public.external_refs (
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  entity text not null,
  entity_id uuid not null,
  external_id text not null,
  primary key (provider, entity, entity_id)
);

-- ---------------------------------------------------------------------------
-- Same-org triggers for all new child tables
-- ---------------------------------------------------------------------------
create trigger t_org before insert or update on public.job_checklist_items for each row execute function public.check_parent_org('jobs', 'job_id');
create trigger t_org before insert or update on public.claims for each row execute function public.check_parent_org('jobs', 'job_id');
create trigger t_org before insert or update on public.claim_checks for each row execute function public.check_parent_org('claims', 'claim_id');
create trigger t_org before insert or update on public.claim_documents for each row execute function public.check_parent_org('claims', 'claim_id');
create trigger t_org before insert or update on public.supplements for each row execute function public.check_parent_org('claims', 'claim_id');
create trigger t_org before insert or update on public.supplement_items for each row execute function public.check_parent_org('supplements', 'supplement_id');
create trigger t_org before insert or update on public.scope_items for each row execute function public.check_parent_org('claims', 'claim_id');
create trigger t_org before insert or update on public.estimate_options for each row execute function public.check_parent_org('estimates', 'estimate_id');
create trigger t_org2 before insert or update on public.estimate_items for each row execute function public.check_parent_org('estimate_options', 'option_id');
create trigger t_org before insert or update on public.job_files for each row execute function public.check_parent_org('jobs', 'job_id');
create trigger t_org before insert or update on public.job_events for each row execute function public.check_parent_org('jobs', 'job_id');
create trigger t_org before insert or update on public.messages for each row execute function public.check_parent_org('jobs', 'job_id');
create trigger t_org before insert or update on public.change_orders for each row execute function public.check_parent_org('jobs', 'job_id');
create trigger t_org before insert or update on public.change_order_items for each row execute function public.check_parent_org('change_orders', 'change_order_id');
create trigger t_org before insert or update on public.material_orders for each row execute function public.check_parent_org('jobs', 'job_id');
create trigger t_org before insert or update on public.material_order_items for each row execute function public.check_parent_org('material_orders', 'order_id');
create trigger t_org before insert or update on public.material_returns for each row execute function public.check_parent_org('material_orders', 'order_id');
create trigger t_org before insert or update on public.job_costs for each row execute function public.check_parent_org('jobs', 'job_id');
create trigger t_org before insert or update on public.commission_payouts for each row execute function public.check_parent_org('jobs', 'job_id');
create trigger t_org before insert or update on public.financing_applications for each row execute function public.check_parent_org('jobs', 'job_id');
create trigger t_org before insert or update on public.door_knocks for each row execute function public.check_parent_org('territories', 'territory_id');
create trigger t_org before insert or update on public.memberships for each row execute function public.check_parent_org('commission_plans', 'commission_plan_id');
create trigger t_org2 before insert or update on public.memberships for each row execute function public.check_parent_org('crews', 'crew_id');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'job_checklist_items', 'claims', 'claim_checks', 'claim_documents', 'supplements', 'supplement_items', 'scope_items',
    'estimate_options', 'job_files', 'job_events', 'messages', 'change_orders', 'change_order_items',
    'material_orders', 'material_order_items', 'material_returns', 'job_costs', 'financing_applications',
    'territories', 'door_knocks', 'integration_sync_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id))', t || '_member', t);
  end loop;
end $$;

-- Admin-only tables
alter table public.commission_plans enable row level security;
create policy commission_plans_select on public.commission_plans for select using (public.is_org_member(org_id));
create policy commission_plans_write on public.commission_plans for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

alter table public.commission_payouts enable row level security;
create policy payouts_select on public.commission_payouts for select using (public.is_org_admin(org_id) or user_id = auth.uid());
create policy payouts_write on public.commission_payouts for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

alter table public.lead_spend enable row level security;
create policy lead_spend_select on public.lead_spend for select using (public.is_org_member(org_id));
create policy lead_spend_write on public.lead_spend for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

alter table public.integrations enable row level security;
create policy integrations_select on public.integrations for select using (public.is_org_member(org_id));
create policy integrations_write on public.integrations for all using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

alter table public.external_refs enable row level security;
create policy external_refs_member on public.external_refs for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- Tokens: no policies at all -> only the service role can read/write.
alter table public.integration_secrets enable row level security;

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select
  using (public.is_org_member(org_id) and (user_id is null or user_id = auth.uid()));
create policy notifications_update on public.notifications for update
  using (public.is_org_member(org_id) and (user_id is null or user_id = auth.uid()));
create policy notifications_insert on public.notifications for insert with check (public.is_org_member(org_id));

-- Role helper for app-level scoping.
create or replace function public.org_role(p_org uuid) returns public.member_role
language sql stable security definer set search_path = public as $$
  select role from memberships where org_id = p_org and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Storage: private bucket, objects keyed "<org_id>/<job_id>/<file>"
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('job-files', 'job-files', false) on conflict (id) do nothing;
    execute $p$create policy "job files read" on storage.objects for select to authenticated
      using (bucket_id = 'job-files' and public.is_org_member(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$create policy "job files insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'job-files' and public.is_org_member(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$create policy "job files update" on storage.objects for update to authenticated
      using (bucket_id = 'job-files' and public.is_org_member(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$create policy "job files delete" on storage.objects for delete to authenticated
      using (bucket_id = 'job-files' and public.is_org_member(((storage.foldername(name))[1])::uuid))$p$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Seed new price-book entries for existing orgs, and extend create_organization
-- ---------------------------------------------------------------------------
create or replace function public.seed_catalog_v2(p_org uuid) returns void
language sql security definer set search_path = public as $$
  insert into catalog_items (org_id, calc_key, tier, name, unit, unit_price, unit_cost, category, warranty, requires_certification) values
    (p_org, 'shingles', 'better', 'Designer shingles',                     'bundle', 58.00, 38.00, 'material', null, null),
    (p_org, 'shingles', 'best',   'Class 4 impact-resistant shingles',     'bundle', 72.00, 47.00, 'material', null, null),
    (p_org, 'warranty', 'good',   'Manufacturer standard limited warranty', 'ea',    0.00,  0.00,  'other', 'Standard limited warranty', null),
    (p_org, 'warranty', 'better', 'Enhanced system warranty (50-yr non-prorated materials)', 'ea', 395.00, 150.00, 'other', 'Enhanced system warranty', null),
    (p_org, 'warranty', 'best',   'Premium system warranty (materials + workmanship)', 'ea', 795.00, 300.00, 'other', 'Premium system warranty', 'GAF Master Elite'),
    (p_org, 'steep_high', null,   'Very steep charge (10/12 and up)',     'sq',     45.00, 30.00, 'labor', null, null),
    (p_org, 'low_slope', null,    'Low-slope membrane (under 3/12)',      'sq',     425.00, 260.00, 'material', null, null),
    (p_org, 'decking', null,      'Decking replacement (per 4x8 sheet)',  'sheet',  72.00, 38.00, 'material', null, null),
    (p_org, 'extra_layer', null,  'Additional layer tear-off',            'sq',     35.00, 22.00, 'labor', null, null)
  on conflict do nothing;
  -- rough default costs for the original items (~65% of price) so margin warnings work out of the box
  update catalog_items set unit_cost = round(unit_price * 0.65, 2) where org_id = p_org and unit_cost = 0 and unit_price > 0;
$$;

select public.seed_catalog_v2(id) from public.organizations;

-- New companies get the v2 price-book entries too (after the original starter items exist).
create or replace function public.create_organization(p_name text, p_full_name text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_email text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into organizations (name, email) values (p_name, v_email) returning id into v_org;
  insert into memberships (org_id, user_id, role, full_name, email) values (v_org, auth.uid(), 'owner', p_full_name, v_email);
  insert into catalog_items (org_id, calc_key, name, unit, unit_price, category) values
    (v_org, 'tearoff',      'Tear-off & disposal (per layer)',        'sq',     65.00,  'labor'),
    (v_org, 'labor',        'Installation labor',                     'sq',     95.00,  'labor'),
    (v_org, 'steep',        'Steep-pitch charge (8/12 to 9/12)',      'sq',     25.00,  'labor'),
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
  perform public.seed_catalog_v2(v_org);
  return v_org;
end $$;
revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

-- Claim paperwork checklist auto-created with each claim.
create or replace function public.seed_claim_documents() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into claim_documents (org_id, claim_id, doc_type)
  select new.org_id, new.id, d from unnest(array['w9', 'contract', 'scope', 'coc', 'final_invoice', 'lien_waiver', 'license_coi', 'photos']) d
  on conflict do nothing;
  return new;
end $$;
create trigger claims_seed_docs after insert on public.claims for each row execute function public.seed_claim_documents();
insert into public.claim_documents (org_id, claim_id, doc_type)
select c.org_id, c.id, d from public.claims c, unnest(array['w9', 'contract', 'scope', 'coc', 'final_invoice', 'lien_waiver', 'license_coi', 'photos']) d
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Public lead intake (web form, webhook, instant quote) by org intake key
-- ---------------------------------------------------------------------------
create or replace function public.submit_public_lead(p_key text, p_lead jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org organizations; v_customer uuid; v_job uuid; v_name text;
begin
  select * into v_org from organizations where intake_key = p_key and subscription_status <> 'cancelled';
  if v_org.id is null then raise exception 'unknown intake key'; end if;
  v_name := nullif(trim(coalesce(p_lead->>'name', '')), '');
  if v_name is null then raise exception 'name is required'; end if;
  if coalesce(p_lead->>'phone', p_lead->>'email') is null then raise exception 'phone or email is required'; end if;

  insert into customers (org_id, name, email, phone, address, city, state, zip, source, notes)
  values (v_org.id, left(v_name, 200), left(p_lead->>'email', 200), left(p_lead->>'phone', 50), left(p_lead->>'address', 300),
          left(p_lead->>'city', 100), upper(left(p_lead->>'state', 2)), left(p_lead->>'zip', 20),
          case when p_lead->>'source' in ('referral','website','door_knock','storm','repeat','ads','other') then (p_lead->>'source')::customer_source else 'website' end,
          left(p_lead->>'message', 4000))
  returning id into v_customer;

  insert into jobs (org_id, customer_id, title, site_address, state, zip, lead_source, notes, is_insurance)
  values (v_org.id, v_customer, coalesce(left(p_lead->>'title', 200), 'New web lead'),
          nullif(concat_ws(', ', p_lead->>'address', p_lead->>'city', p_lead->>'state', p_lead->>'zip'), ''),
          upper(left(p_lead->>'state', 2)), left(p_lead->>'zip', 20), coalesce(left(p_lead->>'source_detail', 100), left(p_lead->>'source', 50), 'website'),
          left(p_lead->>'quote_summary', 4000), coalesce((p_lead->>'insurance')::boolean, false))
  returning id into v_job;

  insert into notifications (org_id, kind, title, body, url)
  values (v_org.id, 'new_lead', 'New lead: ' || v_name, coalesce(p_lead->>'phone', p_lead->>'email'), '/app/jobs/' || v_job);

  return jsonb_build_object('job_id', v_job, 'org_name', v_org.name);
end $$;
revoke all on function public.submit_public_lead(text, jsonb) from public;
grant execute on function public.submit_public_lead(text, jsonb) to anon, authenticated;

create or replace function public.get_intake_org(p_key text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', name, 'phone', phone, 'website', website, 'instant_quote', instant_quote, 'state', state)
  from organizations where intake_key = p_key and subscription_status <> 'cancelled';
$$;
revoke all on function public.get_intake_org(text) from public;
grant execute on function public.get_intake_org(text) to anon, authenticated;
