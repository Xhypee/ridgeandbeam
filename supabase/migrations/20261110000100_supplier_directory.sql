-- Suppliers & price sheets (builder S): Australian supplier directory seed, versioned price-list
-- imports, supplier-aware material orders, and crew-lead price privacy.
-- Additive only. Trade pricing is account-specific and confidential: NO prices are seeded, and
-- each organisation's imported sheet stays private to that organisation.

-- ---------------------------------------------------------------------------
-- Directory seed. Coverage ("states") is filled ONLY where the Nov 2026 research found it
-- (research_notes/Australian roofing law by state/suppliers_price_sheets.md); everything there
-- came from search snippets, not full reads of the supplier's own site, so verified = false.
-- ---------------------------------------------------------------------------
insert into public.suppliers (slug, name, category, website, states, notes, verified) values
  ('lysaght', 'Lysaght (BlueScope)', 'metal_roofing', 'https://lysaght.com', '{NSW,QLD,VIC,SA,TAS}',
   'Custom Orb, Trimdek, Klip-Lok, Spandek. Branch directory lists NSW, QLD, VIC, SA and TAS; WA, NT and ACT not confirmed.', false),
  ('stramit', 'Stramit', 'metal_roofing', 'https://stramit.com.au', '{NSW,SA,WA,NT}',
   'Publishes state product & service guides for NSW, SA, WA and NT (at least those states).', false),
  ('metroll', 'Metroll', 'metal_roofing', 'https://www.metroll.com.au', '{NSW,VIC,QLD,WA,SA,TAS}',
   'A directory says branches are spread across every state; territories and branch count not confirmed.', false),
  ('fielders', 'Fielders', 'metal_roofing', 'https://www.fielders.com.au', '{SA,WA,VIC}',
   'Manufacturing at Mile End SA, Wangara WA and Campbellfield VIC; "10 branches nationwide" (other states not confirmed).', false),
  ('steeline', 'Steeline', 'metal_roofing', 'https://www.steeline.com.au', '{NSW,VIC,QLD,WA,SA,TAS,ACT,NT}',
   'National network of independently owned roll-formers; a directory lists all states and territories.', false),
  ('roofing-centre-tas', 'The Roofing Centre Tasmania', 'metal_roofing', null, '{TAS}',
   'BlueScope subsidiary combined with the Tasmanian Lysaght business.', false),
  ('stratco', 'Stratco', 'metal_roofing', 'https://www.stratco.com.au', '{}',
   'Listed as a Colorbond/Zincalume sheeting brand; state coverage not confirmed.', false),
  ('bunnings-trade', 'Bunnings Trade', 'general_trade', 'https://trade.bunnings.com.au', '{}',
   'PowerPass trade account; prices shown are your own account price.', false),
  ('mitre10-trade', 'Mitre 10 Trade', 'general_trade', 'https://www.mitre10.com.au', '{}',
   'Independently owned stores; pricing reportedly set store by store.', false),
  ('reece', 'Reece', 'roof_plumbing', 'https://www.reece.com.au', '{}',
   'Plumbing & drainage merchant (676 ANZ branches, FY25). Account pricing via maX.', false),
  ('tradelink', 'Tradelink', 'roof_plumbing', 'https://www.tradelink.com.au', '{}',
   'TradeDoor lets account holders download prices as CSV, TAB or XML.', false),
  ('monier', 'Monier (CSR/Saint-Gobain)', 'tiles', 'https://www.monier.com.au', '{}',
   'Concrete and terracotta roof tiles made in Australia.', false),
  ('bristile', 'Bristile Roofing', 'tiles', 'https://www.brickworks.com.au', '{}',
   'Part of Brickworks Building Products; concrete and terracotta tiles.', false),
  ('boral-lutum', 'Boral Roofing tiles (Lutum)', 'tiles', null, '{}',
   'Boral sold its roofing business to Lutum in Sept 2021; whether the tile brand was renamed is not confirmed.', false),
  ('bradford', 'Bradford (CSR) sarking & insulation', 'sarking_insulation', 'https://www.csrbradford.com.au', '{}',
   'Anticon roof blankets, Thermoseal and Enviroseal sarking; stocked by many merchants.', false)
on conflict (slug) do update set
  name = excluded.name, category = excluded.category, website = excluded.website,
  states = excluded.states, notes = excluded.notes, verified = excluded.verified;

-- ---------------------------------------------------------------------------
-- Org suppliers: one row per directory supplier per org; remembered import column mapping.
-- ---------------------------------------------------------------------------
alter table public.org_suppliers add column if not exists import_mapping jsonb;
create unique index if not exists org_suppliers_one_per_directory on public.org_suppliers (org_id, supplier_id) where supplier_id is not null;

-- ---------------------------------------------------------------------------
-- Price lists: versioned imports. A list is written while 'importing' (inactive), then
-- activate_supplier_price_list() makes it the one active version and keeps older ones inactive.
-- ---------------------------------------------------------------------------
alter table public.supplier_price_lists
  add column if not exists status text not null default 'ready' check (status in ('importing', 'ready')),
  add column if not exists authorised_at timestamptz,
  add column if not exists authorised_by uuid references auth.users(id) on delete set null;
create unique index if not exists supplier_price_lists_one_active on public.supplier_price_lists (org_supplier_id) where is_active;

-- Stock length of a sheet / length item (for per-sheet and per-length -> per-lm conversion).
alter table public.supplier_price_items add column if not exists length_mm numeric(10,1);

create or replace function public.activate_supplier_price_list(p_list uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare v_os uuid;
begin
  select org_supplier_id into v_os from supplier_price_lists where id = p_list;
  if v_os is null then raise exception 'price list not found'; end if;
  update supplier_price_lists set is_active = false where org_supplier_id = v_os and is_active and id <> p_list;
  update supplier_price_lists set is_active = true, status = 'ready' where id = p_list;
  if not found then raise exception 'price list not found'; end if;
end $$;
grant execute on function public.activate_supplier_price_list(uuid) to authenticated;

-- Default supplier: keep org_suppliers.is_default and organizations.default_supplier_id in step.
create or replace function public.set_default_supplier(p_org uuid, p_org_supplier uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_org_admin(p_org) then raise exception 'only owners and admins can change the default supplier'; end if;
  if p_org_supplier is not null and not exists (select 1 from org_suppliers where id = p_org_supplier and org_id = p_org) then
    raise exception 'supplier belongs to another organization';
  end if;
  update org_suppliers set is_default = false where org_id = p_org and is_default and id is distinct from p_org_supplier;
  if p_org_supplier is not null then update org_suppliers set is_default = true where id = p_org_supplier; end if;
  update organizations set default_supplier_id = p_org_supplier where id = p_org;
end $$;
grant execute on function public.set_default_supplier(uuid, uuid) to authenticated;

create or replace function public.check_default_supplier_org() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.default_supplier_id is not null
     and not exists (select 1 from org_suppliers where id = new.default_supplier_id and org_id = new.id) then
    raise exception 'default supplier belongs to another organization';
  end if;
  return new;
end $$;
drop trigger if exists t_default_supplier on public.organizations;
create trigger t_default_supplier before insert or update of default_supplier_id on public.organizations
  for each row execute function public.check_default_supplier_org();

-- Price items linked from other tables must belong to the same org.
drop trigger if exists t_org_spi on public.catalog_items;
create trigger t_org_spi before insert or update on public.catalog_items
  for each row execute function public.check_parent_org('supplier_price_items', 'supplier_price_item_id');

-- ---------------------------------------------------------------------------
-- Material orders: lines remember their calc key and supplier row so a supplier switch can
-- re-fill product codes; the US default supplier name goes.
-- ---------------------------------------------------------------------------
alter table public.material_orders alter column supplier set default 'Supplier';
alter table public.material_order_items
  add column if not exists calc_key text,
  add column if not exists supplier_price_item_id uuid references public.supplier_price_items(id) on delete set null;
drop trigger if exists t_org_spi on public.material_order_items;
create trigger t_org_spi before insert or update on public.material_order_items
  for each row execute function public.check_parent_org('supplier_price_items', 'supplier_price_item_id');

-- ---------------------------------------------------------------------------
-- Crew leads are org members but never see trade prices.
-- ---------------------------------------------------------------------------
drop policy if exists supplier_price_items_read on public.supplier_price_items;
create policy supplier_price_items_read on public.supplier_price_items for select
  using (public.is_org_member(org_id) and public.org_role(org_id) <> 'crew_lead');
drop policy if exists supplier_price_lists_read on public.supplier_price_lists;
create policy supplier_price_lists_read on public.supplier_price_lists for select
  using (public.is_org_member(org_id) and public.org_role(org_id) <> 'crew_lead');
