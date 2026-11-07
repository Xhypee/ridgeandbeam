-- Measure from plans orders metal-roof battens and fascia, so the Australian price book gets rows for both
-- (new companies via seed_catalog_au, existing companies backfilled below). Prices start at $0 like every seeded item.
create or replace function public.seed_catalog_au(p_org uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_org_admin(p_org) then raise exception 'only owners and admins can add price-book items'; end if;
  insert into catalog_items (org_id, calc_key, tier, name, unit, unit_price, unit_cost, category, profile, finish, cover_width_mm) values
    (p_org, 'metal_sheet',      'good',   'ZINCALUME Custom Orb 0.42 BMT',            'lm',    0, 0, 'material', 'custom_orb', 'ZINCALUME', 762),
    (p_org, 'metal_sheet',      'better', 'COLORBOND Trimdek 0.42 BMT',               'lm',    0, 0, 'material', 'trimdek',    'COLORBOND', 762),
    (p_org, 'metal_sheet',      'best',   'COLORBOND Klip-Lok 700 0.48 BMT',          'lm',    0, 0, 'material', 'klip_lok',   'COLORBOND', 700),
    (p_org, 'ridge_capping',    null,     'Ridge & hip capping',                      'lm',    0, 0, 'material', null, null, null),
    (p_org, 'barge_capping',    null,     'Barge capping',                            'lm',    0, 0, 'material', null, null, null),
    (p_org, 'valley_iron',      null,     'Valley iron',                              'lm',    0, 0, 'material', null, null, null),
    (p_org, 'flashing',         null,     'Apron / wall flashing',                    'lm',    0, 0, 'material', null, null, null),
    (p_org, 'roof_screws',      null,     'Roofing screws (box)',                     'box',   0, 0, 'material', null, null, null),
    (p_org, 'roof_tile',        null,     'Roof tiles',                               'ea',    0, 0, 'material', null, null, null),
    (p_org, 'ridge_tile',       null,     'Ridge / hip tiles',                        'ea',    0, 0, 'material', null, null, null),
    (p_org, 'roof_battens',     null,     'Roof battens (top hat)',                   'lm',    0, 0, 'material', null, null, null),
    (p_org, 'fascia',           null,     'Metal fascia',                             'lm',    0, 0, 'material', null, null, null),
    (p_org, 'tile_battens',     null,     'Tile battens',                             'lm',    0, 0, 'material', null, null, null),
    (p_org, 'pointing',         null,     'Flexible pointing',                        'bag',   0, 0, 'material', null, null, null),
    (p_org, 'sarking',          null,     'Sarking (roll)',                           'roll',  0, 0, 'material', null, null, null),
    (p_org, 'safety_mesh',      null,     'Safety mesh (roll)',                       'roll',  0, 0, 'material', null, null, null),
    (p_org, 'membrane_roof',    null,     'Membrane roofing system',                  'm2',    0, 0, 'material', null, null, null),
    (p_org, 'gutter',           null,     'Gutter',                                   'lm',    0, 0, 'material', null, null, null),
    (p_org, 'downpipe',         null,     'Downpipe',                                 'ea',    0, 0, 'material', null, null, null),
    (p_org, 'whirlybird',       null,     'Whirlybird roof vent',                     'ea',    0, 0, 'material', null, null, null),
    (p_org, 'restore_clean',    null,     'High-pressure clean',                      'm2',    0, 0, 'labor',    null, null, null),
    (p_org, 'rebed_repoint',    null,     'Rebed & repoint ridge capping',            'lm',    0, 0, 'labor',    null, null, null),
    (p_org, 'roof_coating',     null,     'Roof coating (membrane paint)',            'm2',    0, 0, 'material', null, null, null),
    (p_org, 'tile_replace',     null,     'Replace broken tiles',                     'ea',    0, 0, 'labor',    null, null, null),
    (p_org, 'labour_strip',     null,     'Strip & dispose of old roof',              'm2',    0, 0, 'labor',    null, null, null),
    (p_org, 'labour_install',   null,     'Installation labour',                      'm2',    0, 0, 'labor',    null, null, null),
    (p_org, 'labour_steep',     null,     'Steep roof allowance',                     'm2',    0, 0, 'labor',    null, null, null),
    (p_org, 'asbestos_removal', null,     'Licensed asbestos removal & disposal',     'm2',    0, 0, 'other',    null, null, null),
    (p_org, 'edge_protection',  null,     'Edge protection / scaffold',               'job',   0, 0, 'other',    null, null, null),
    (p_org, 'skip_bin',         null,     'Skip bin',                                 'ea',    0, 0, 'other',    null, null, null)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.seed_catalog_au(uuid) from public, anon;
grant execute on function public.seed_catalog_au(uuid) to authenticated;

insert into public.catalog_items (org_id, calc_key, tier, name, unit, unit_price, unit_cost, category)
select o.org_id, k.calc_key, null, k.name, 'lm', 0, 0, 'material'
from (select distinct org_id from public.catalog_items where calc_key = 'metal_sheet') o
cross join (values ('roof_battens', 'Roof battens (top hat)'), ('fascia', 'Metal fascia')) as k(calc_key, name)
where not exists (select 1 from public.catalog_items c where c.org_id = o.org_id and c.calc_key = k.calc_key);
