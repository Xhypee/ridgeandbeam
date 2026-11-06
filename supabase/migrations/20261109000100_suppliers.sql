-- Suppliers & price sheets. Trade pricing is account-specific and confidential, so each roofer
-- imports THEIR OWN sheet; nothing is pooled or shared between organisations.

-- Global directory of Australian suppliers (read-only reference data, no prices).
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text not null check (category in ('metal_roofing', 'tiles', 'roof_plumbing', 'general_trade', 'sarking_insulation', 'fasteners', 'coatings', 'hire')),
  website text,
  states text[] not null default '{}',   -- states/territories served (as published by the supplier)
  notes text,
  verified boolean not null default false -- coverage confirmed from the supplier's own site
);
alter table public.suppliers enable row level security;
create policy suppliers_read on public.suppliers for select to authenticated using (true);

-- Which suppliers an org buys from, with their account details.
create table public.org_suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete restrict,   -- null = custom supplier
  custom_name text,
  account_number text,
  branch_name text,
  branch_email text,
  branch_phone text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  check (supplier_id is not null or custom_name is not null)
);
create index on public.org_suppliers (org_id);
create unique index org_suppliers_one_default on public.org_suppliers (org_id) where is_default;

-- An imported price sheet (one file/version from one supplier).
create table public.supplier_price_lists (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  org_supplier_id uuid not null references public.org_suppliers(id) on delete cascade,
  name text not null,
  effective_date date,
  prices_include_gst boolean not null default false,
  source_filename text,
  is_active boolean not null default true,
  imported_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.supplier_price_lists (org_id, org_supplier_id);

-- Rows of a price sheet, normalised.
create table public.supplier_price_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  price_list_id uuid not null references public.supplier_price_lists(id) on delete cascade,
  product_code text,
  description text not null,
  profile text,          -- e.g. Custom Orb, Trimdek, Klip-Lok 700
  finish text,           -- e.g. COLORBOND Monument, ZINCALUME
  thickness_mm numeric(6,3),
  cover_width_mm numeric(8,1),
  girth_mm numeric(8,1),
  unit text not null default 'ea',   -- lm, m2, sheet, ea, box, roll, length
  pack_qty numeric(12,3),            -- e.g. screws per box, m² per roll
  cost_ex_gst numeric(12,2) not null default 0,
  calc_key text,                     -- mapped estimating key (set by the import mapper or the user)
  raw jsonb
);
create index on public.supplier_price_items (price_list_id);
create index on public.supplier_price_items (org_id, calc_key);

alter table public.catalog_items add column supplier_price_item_id uuid references public.supplier_price_items(id) on delete set null;
alter table public.estimates add column org_supplier_id uuid references public.org_suppliers(id) on delete set null;
alter table public.material_orders add column org_supplier_id uuid references public.org_suppliers(id) on delete set null;

-- Markup applied to supplier cost to get the GST-inclusive sell price, per category.
alter table public.organizations
  add column markup_pct jsonb not null default '{"material": 35, "labor": 0, "other": 20}'::jsonb,
  add column default_supplier_id uuid references public.org_suppliers(id) on delete set null;

do $$
declare t text;
begin
  foreach t in array array['org_suppliers', 'supplier_price_lists', 'supplier_price_items'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (public.is_org_member(org_id))', t || '_read', t);
    execute format('create policy %I on public.%I for all using (public.is_org_admin(org_id) or public.org_role(org_id) = ''member'') with check (public.is_org_admin(org_id) or public.org_role(org_id) = ''member'')', t || '_write', t);
  end loop;
end $$;

create trigger t_org before insert or update on public.supplier_price_lists for each row execute function public.check_parent_org('org_suppliers', 'org_supplier_id');
create trigger t_org before insert or update on public.supplier_price_items for each row execute function public.check_parent_org('supplier_price_lists', 'price_list_id');
create trigger t_org3 before insert or update on public.estimates for each row execute function public.check_parent_org('org_suppliers', 'org_supplier_id');
create trigger t_org3 before insert or update on public.material_orders for each row execute function public.check_parent_org('org_suppliers', 'org_supplier_id');
