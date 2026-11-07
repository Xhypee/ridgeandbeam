-- Receipt docket (20261112000100_docket.sql): main / added / offered lines, totals without offered extras,
-- profile + colour on save, the public payload, acceptance with the customer's extras (only offered ones,
-- validated server-side), the crew job sheet, price-book Extra flag, tenant isolation.
--   psql -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/docket_test.sql
-- Every check raises on failure; a clean run ends with DOCKET TESTS PASSED.
\set QUIET on
begin;

select gen_random_uuid() as ua, gen_random_uuid() as ub \gset
insert into auth.users (id, email) values (:'ua', 'docket-a-' || :'ua' || '@test.dev'), (:'ub', 'docket-b-' || :'ub' || '@test.dev');

create temp table ids (k text primary key, v uuid);
create temp table t (k text primary key, v text);
grant all on ids, t to authenticated, anon;

set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ub', true);
insert into ids values ('b_org', public.create_organization('Byron Roofing', 'B'));
select null from set_config('request.jwt.claim.sub', :'ua', true);
insert into ids values ('a_org', public.create_organization('Augusta Roofing', 'A'));

insert into customers (org_id, name, state) select v, 'Pat Sample', 'QLD' from ids where k = 'a_org' returning id \gset cust_
insert into jobs (org_id, customer_id, title, state) select (select v from ids where k = 'a_org'), :'cust_id', 'New roof', 'QLD' returning id \gset job_
insert into estimates (org_id, job_id, tax_rate, gst_inclusive) select (select v from ids where k = 'a_org'), :'job_id', 10, true returning id, public_token \gset est_
insert into ids values ('est', :'est_id');

-- 1. Save: main line, an added extra, two offered extras; profile + colour.
select null from public.save_estimate_content(:'est_id',
  jsonb_build_object('tax_rate', 10, 'discount', 0, 'gst_inclusive', true, 'roof_profile', 'trimdek', 'roof_colour', 'Surfmist',
                     'measurements', jsonb_build_object('units', 'metric', 'sections', jsonb_build_array(jsonb_build_object('label', 'A', 'area', 100, 'pitch', 22.5)),
                       'plans', jsonb_build_object('lines', '[]'::jsonb, 'scale', 100, 'pitch', 22.5, 'file', jsonb_build_object('name', 'secret.pdf'), 'details', '[{"key":"client","value":"Someone"}]'::jsonb))),
  '[]'::jsonb,
  jsonb_build_array(
    jsonb_build_object('description', 'COLORBOND Trimdek · Surfmist', 'quantity', 100, 'unit', 'lm', 'unit_price', 30, 'calc_key', 'metal_sheet'),
    jsonb_build_object('description', 'Sarking (roll)', 'quantity', 2, 'unit', 'roll', 'unit_price', 150, 'calc_key', 'sarking', 'extra_status', 'added', 'blurb', 'Keeps heat out'),
    jsonb_build_object('description', 'Gutter', 'quantity', 10, 'unit', 'lm', 'unit_price', 30, 'calc_key', 'gutter', 'extra_status', 'offered', 'customer_added', true),
    jsonb_build_object('description', 'Skip bin', 'quantity', 1, 'unit', 'ea', 'unit_price', 550, 'calc_key', 'skip_bin', 'extra_status', 'offered'),
    jsonb_build_object('description', 'Bogus', 'quantity', 1, 'unit', 'ea', 'unit_price', 1, 'extra_status', 'nonsense')));

do $$
declare e uuid := (select v from ids where k = 'est');
begin
  if (select roof_profile || '|' || roof_colour from estimates where id = e) <> 'trimdek|Surfmist' then raise exception 'profile/colour not saved'; end if;
  if (select blurb from estimate_items where estimate_id = e and calc_key = 'sarking') <> 'Keeps heat out' then raise exception 'blurb not saved'; end if;
  if (select extra_status from estimate_items where estimate_id = e and description = 'Bogus') is not null then raise exception 'unknown extra_status must be stored as main'; end if;
  if (select customer_added from estimate_items where estimate_id = e and calc_key = 'gutter') then raise exception 'customer_added only applies to added extras'; end if;
  -- 2. Totals leave offered extras out: 3000 + 300 + 1 = 3301 inc GST.
  if (select total from estimate_totals where estimate_id = e) <> 3301 then raise exception 'estimate_totals counts offered extras: %', (select total from estimate_totals where estimate_id = e); end if;
  if (select tax from estimate_totals where estimate_id = e) <> 300.09 then raise exception 'GST wrong: %', (select tax from estimate_totals where estimate_id = e); end if;
  -- Omitting roof_profile/roof_colour leaves them alone.
  perform public.save_estimate_content(e, jsonb_build_object('tax_rate', 10), '[]'::jsonb,
    (select jsonb_agg(jsonb_build_object('description', description, 'quantity', quantity, 'unit', unit, 'unit_price', unit_price, 'calc_key', calc_key, 'extra_status', extra_status, 'blurb', blurb) order by position)
     from estimate_items where estimate_id = e and description <> 'Bogus'));
  if (select roof_profile from estimates where id = e) <> 'trimdek' then raise exception 'profile lost on a save without it'; end if;
  if (select total from estimate_totals where estimate_id = e) <> 3300 then raise exception 'total after resave'; end if;
end $$;

-- Bad profile is refused.
do $$ begin
  begin
    update estimates set roof_profile = 'shingle' where id = (select v from ids where k = 'est');
    raise exception 'bad profile accepted';
  exception when check_violation then null;
  end;
end $$;

-- Option totals skip offered extras too.
do $$
declare e uuid := (select v from ids where k = 'est'); o uuid; a uuid := (select v from ids where k = 'a_org');
begin
  insert into estimates (org_id, job_id, tax_rate, gst_inclusive) values (a, (select job_id from estimates where id = e), 10, true) returning id into e;
  insert into estimate_options (org_id, estimate_id, name, recommended) values (a, e, 'Better', true) returning id into o;
  insert into estimate_items (org_id, estimate_id, description, quantity, unit_price, option_id) values (a, e, 'Sheet', 1, 1000, o);
  insert into estimate_items (org_id, estimate_id, description, quantity, unit_price, extra_status) values (a, e, 'Offered', 1, 500, 'offered'), (a, e, 'Added', 1, 200, 'added');
  if (select total from estimate_option_totals where option_id = o) <> 1200 then raise exception 'option total counts offered'; end if;
  if (select total from estimate_totals where estimate_id = e) <> 1200 then raise exception 'effective option total counts offered'; end if;
  delete from estimates where id = e;
end $$;

-- 3. Public payload: line ids, calc keys, extra status, blurb, profile/colour; the plans file and details stay private.
update estimates set status = 'sent', sent_at = now() where id = :'est_id';
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
insert into t select 'doc', public.get_public_estimate(:'est_public_token')::text;
do $$
declare d jsonb := (select v::jsonb from t where k = 'doc');
begin
  if d->>'roof_profile' <> 'trimdek' or d->>'roof_colour' <> 'Surfmist' then raise exception 'profile/colour not public'; end if;
  if jsonb_array_length(d->'items') <> 4 then raise exception 'expected 4 items'; end if;
  if (select count(*) from jsonb_array_elements(d->'items') x where x->>'extra_status' = 'offered' and x ? 'id' and x->>'calc_key' is not null) <> 2 then raise exception 'offered items missing id/calc_key'; end if;
  if (d->'roof'->'sections'->0->>'area')::numeric <> 100 then raise exception 'roof sections missing'; end if;
  if d->'roof'->'plan' is null or d->'roof'->'plan'->>'scale' <> '100' then raise exception 'plan lines missing'; end if;
  if d::text like '%secret.pdf%' or d::text like '%Someone%' then raise exception 'plans file/details leaked'; end if;
  if exists (select 1 from jsonb_array_elements(d->'items') x where x ? 'unit_cost') then raise exception 'cost leaked'; end if;
end $$;

-- 4. Acceptance: only offered lines of THIS quote can be added.
set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ua', true);
insert into estimates (org_id, job_id, tax_rate, gst_inclusive, status) select (select v from ids where k = 'a_org'), :'job_id', 10, true, 'sent' returning id, public_token \gset other_
insert into estimate_items (org_id, estimate_id, description, quantity, unit_price, extra_status) select (select v from ids where k = 'a_org'), :'other_id', 'Other quote extra', 1, 99, 'offered' returning id \gset otheritem_
insert into t select 'gutter', id::text from estimate_items where estimate_id = :'est_id' and calc_key = 'gutter';
insert into t select 'skip', id::text from estimate_items where estimate_id = :'est_id' and calc_key = 'skip_bin';
insert into t select 'sark', id::text from estimate_items where estimate_id = :'est_id' and calc_key = 'sarking';
insert into t values ('other', :'otheritem_id'), ('token', :'est_public_token');

set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
do $$
declare tok text := (select v from t where k = 'token');
  sig text := 'data:image/png;base64,' || repeat('A', 200);
begin
  -- an item from another quote
  begin
    perform public.accept_public_estimate(tok, 'Pat Sample', null, sig, '1.2.3.4', 'test', '[]'::jsonb, array[(select v from t where k = 'other')::uuid]);
    raise exception 'accepted another quote''s extra';
  exception when raise_exception then if sqlerrm not like 'That extra is no longer on offer%' then raise; end if;
  end;
  -- a main / already-added line
  begin
    perform public.accept_public_estimate(tok, 'Pat Sample', null, sig, '1.2.3.4', 'test', '[]'::jsonb, array[(select v from t where k = 'sark')::uuid]);
    raise exception 'accepted a non-offered line as an extra';
  exception when raise_exception then if sqlerrm not like 'That extra is no longer on offer%' then raise; end if;
  end;
  -- a random id
  begin
    perform public.accept_public_estimate(tok, 'Pat Sample', null, sig, '1.2.3.4', 'test', '[]'::jsonb, array[gen_random_uuid()]);
    raise exception 'accepted a made-up extra';
  exception when raise_exception then if sqlerrm not like 'That extra is no longer on offer%' then raise; end if;
  end;
  -- the anon role can't touch lines directly
  begin
    update estimate_items set extra_status = 'added' where id = (select v from t where k = 'skip')::uuid;
  exception when insufficient_privilege then null;
  end;
  -- the real thing: add the gutter (twice in the list is fine)
  if not public.accept_public_estimate(tok, 'Pat Sample', null, sig, '1.2.3.4', 'test', '[]'::jsonb,
       array[(select v from t where k = 'gutter')::uuid, (select v from t where k = 'gutter')::uuid]) then raise exception 'accept failed'; end if;
  -- accepting again does nothing
  if public.accept_public_estimate(tok, 'Pat Sample', null, sig, '1.2.3.4', 'test', '[]'::jsonb, '{}'::uuid[]) then raise exception 'accepted twice'; end if;
end $$;

set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ua', true);
do $$
declare e uuid := (select v from ids where k = 'est');
begin
  if (select status from estimates where id = e) <> 'accepted' then raise exception 'not accepted'; end if;
  if (select extra_status || '|' || customer_added from estimate_items where estimate_id = e and calc_key = 'gutter') <> 'added|true' then raise exception 'gutter not added by customer'; end if;
  if (select extra_status || '|' || customer_added from estimate_items where estimate_id = e and calc_key = 'skip_bin') <> 'offered|false' then raise exception 'skip bin should stay offered'; end if;
  if (select extra_status from estimate_items where id = (select v from t where k = 'other')::uuid) <> 'offered' then raise exception 'other quote touched'; end if;
  -- 3000 + 300 + 300 (gutter) = 3600
  if (select total from estimate_totals where estimate_id = e) <> 3600 then raise exception 'accepted total wrong: %', (select total from estimate_totals where estimate_id = e); end if;
  if (select body from notifications where kind = 'estimate_accepted' and url = '/app/estimates/' || e order by created_at desc limit 1) not like '%added Gutter%' then raise exception 'notification missing the extra'; end if;
  -- locked
  begin
    perform public.save_estimate_content(e, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb);
    raise exception 'accepted quote saved';
  exception when raise_exception then if sqlerrm not like 'This estimate was accepted%' then raise; end if;
  end;
end $$;

-- The 7-argument acceptance still works (no extras) and goes through the same checks.
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
select public.accept_public_estimate(:'other_public_token', 'Pat Sample', null, 'data:image/png;base64,' || repeat('A', 200), '1.2.3.4', 'ua', '[]'::jsonb) as ok7 \gset
\if :ok7 \else \echo 'FAIL 7-argument accept' \quit \endif
set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ua', true);
do $$ begin
  if (select extra_status from estimate_items where id = (select v from t where k = 'other')::uuid) <> 'offered' then raise exception '7-arg accept added an extra'; end if;
  if (select total from estimate_totals where estimate_id = (select estimate_id from estimate_items where id = (select v from t where k = 'other')::uuid)) <> 0 then raise exception 'offered-only quote total should be 0'; end if;
end $$;

-- 5. Crew job sheet: no offered extras on the materials list.
do $$
declare a uuid := (select v from ids where k = 'a_org'); c uuid; tok text; j uuid := (select job_id from estimates where id = (select v from ids where k = 'est')); r jsonb;
begin
  insert into crews (org_id, name) values (a, 'Crew 1') returning id, public_token into c, tok;
  update jobs set crew_id = c where id = j;
  -- only the most recent accepted quote counts; make ours the latest
  update estimates set accepted_at = now() + interval '1 hour' where id = (select v from ids where k = 'est');
  r := public.get_crew_job(tok, j);
  if r is null then raise exception 'crew job missing'; end if;
  if exists (select 1 from jsonb_array_elements(r->'estimate_items') x where x->>'description' = 'Skip bin') then raise exception 'offered skip bin on the crew sheet'; end if;
  if not exists (select 1 from jsonb_array_elements(r->'estimate_items') x where x->>'description' = 'Gutter') then raise exception 'customer-added gutter missing from crew sheet'; end if;
end $$;

-- 6. Price book: Extra flag and blurb; B can't see or change A's.
do $$
declare a uuid := (select v from ids where k = 'a_org');
begin
  update catalog_items set is_extra = false, blurb = 'Always included' where org_id = a and calc_key = 'sarking';
  if (select is_extra::text || blurb from catalog_items where org_id = a and calc_key = 'sarking') <> 'falseAlways included' then raise exception 'extra flag not stored'; end if;
  if exists (select 1 from catalog_items where org_id = a and calc_key = 'gutter' and is_extra is not null) then raise exception 'seeded items should default (null)'; end if;
end $$;

select null from set_config('request.jwt.claim.sub', :'ub', true);
do $$
declare a uuid := (select v from ids where k = 'a_org'); n int;
begin
  if exists (select 1 from estimate_items where estimate_id = (select v from ids where k = 'est')) then raise exception 'B sees A lines'; end if;
  if exists (select 1 from estimate_totals where estimate_id = (select v from ids where k = 'est')) then raise exception 'B sees A totals'; end if;
  update catalog_items set is_extra = true where org_id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B changed A price book'; end if;
  begin
    perform public.save_estimate_content((select v from ids where k = 'est'), '{}'::jsonb, '[]'::jsonb, '[]'::jsonb);
    raise exception 'B saved A estimate';
  exception when raise_exception then if sqlerrm not like 'Estimate not found%' then raise; end if;
  end;
end $$;

-- 7. Stable line ids and the version.
set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ua', true);
insert into estimates (org_id, job_id, tax_rate, gst_inclusive, roof_profile, roof_colour)
  select (select v from ids where k = 'a_org'), :'job_id', 10, true, 'trimdek', 'Surfmist' returning id, public_token \gset c_
insert into ids values ('c', :'c_id');
insert into t values ('c_token', :'c_public_token');
do $$
declare e uuid := (select v from ids where k = 'c'); r jsonb; v0 int; sheet uuid := gen_random_uuid(); sark uuid := gen_random_uuid(); keep uuid[];
  items jsonb;
begin
  items := jsonb_build_array(
    jsonb_build_object('id', sheet, 'description', 'COLORBOND Trimdek 0.42 BMT · Surfmist', 'quantity', 100, 'unit', 'lm', 'unit_price', 30, 'unit_cost', 18, 'calc_key', 'metal_sheet',
      'variants', jsonb_build_object('colorbond', jsonb_build_object('name', 'COLORBOND Trimdek 0.42 BMT', 'unit_price', 30, 'unit_cost', 18),
                                     'zincalume', jsonb_build_object('name', 'ZINCALUME Trimdek 0.42 BMT', 'unit_price', 25, 'unit_cost', 15))),
    jsonb_build_object('id', sark, 'description', 'Sarking (roll)', 'quantity', 2, 'unit', 'roll', 'unit_price', 150, 'calc_key', 'sarking', 'extra_status', 'added'),
    jsonb_build_object('description', 'Edge protection', 'quantity', 1, 'unit', 'job', 'unit_price', 1000, 'calc_key', 'edge_protection', 'extra_status', 'added', 'required', true),
    jsonb_build_object('description', 'Gutter', 'quantity', 10, 'unit', 'lm', 'unit_price', 30, 'calc_key', 'gutter', 'extra_status', 'offered', 'required', true));
  v0 := (select version from estimates where id = e);
  r := public.save_estimate_content(e, jsonb_build_object('tax_rate', 10), '[]'::jsonb, items);
  if (select version from estimates where id = e) <> v0 + 1 then raise exception 'save did not bump the version'; end if;
  if jsonb_array_length(r->'__items') <> 4 or (r->'__items'->>0)::uuid <> sheet or (r->'__items'->>1)::uuid <> sark then raise exception 'browser ids not kept: %', r; end if;
  if (select required from estimate_items where estimate_id = e and calc_key = 'gutter') then raise exception 'only added extras can be required'; end if;
  if not (select required from estimate_items where estimate_id = e and calc_key = 'edge_protection') then raise exception 'required not saved'; end if;
  keep := array(select id from estimate_items where estimate_id = e order by position);
  -- Save again: same ids, a price change in place, sarking dropped, a new line added.
  items := jsonb_build_array(
    jsonb_set(items->0, '{unit_price}', '31'),
    jsonb_build_object('id', keep[3], 'description', 'Edge protection', 'quantity', 1, 'unit', 'job', 'unit_price', 1000, 'calc_key', 'edge_protection', 'extra_status', 'added', 'required', true),
    jsonb_build_object('id', keep[4], 'description', 'Gutter', 'quantity', 10, 'unit', 'lm', 'unit_price', 30, 'calc_key', 'gutter', 'extra_status', 'offered'),
    jsonb_build_object('description', 'Skylight reflash', 'quantity', 1, 'unit', 'ea', 'unit_price', 350));
  r := public.save_estimate_content(e, jsonb_build_object('tax_rate', 10), '[]'::jsonb, items);
  if (select array_agg(id order by position) from estimate_items where estimate_id = e and description <> 'Skylight reflash') <> array[keep[1], keep[3], keep[4]] then raise exception 'ids changed on resave'; end if;
  if exists (select 1 from estimate_items where id = sark) then raise exception 'dropped line not deleted'; end if;
  if (select unit_price from estimate_items where id = sheet) <> 31 then raise exception 'price not updated in place'; end if;
  if (select count(*) from estimate_items where estimate_id = e) <> 4 then raise exception 'expected 4 lines'; end if;
  -- an id from another quote becomes a new line on this one (the other quote is untouched)
  r := public.save_estimate_content(e, jsonb_build_object('tax_rate', 10), '[]'::jsonb,
         items || jsonb_build_array(jsonb_build_object('id', (select v from t where k = 'other'), 'description', 'Stolen id', 'quantity', 1, 'unit_price', 1)));
  if (select estimate_id from estimate_items where id = (select v from t where k = 'other')::uuid) = e then raise exception 'took another quote''s line'; end if;
  if not exists (select 1 from estimate_items where estimate_id = e and description = 'Stolen id') then raise exception 'line with a foreign id dropped'; end if;
  -- direct edits that change what the customer sees bump the version too
  v0 := (select version from estimates where id = e);
  update estimates set notes = 'New note' where id = e;
  if (select version from estimates where id = e) <> v0 + 1 then raise exception 'notes change did not bump version'; end if;
  -- back to the quote under test: sarking optional again
  r := public.save_estimate_content(e, jsonb_build_object('tax_rate', 10), '[]'::jsonb, jsonb_build_array(
    jsonb_set(items->0, '{unit_price}', '30'),
    jsonb_build_object('id', sark, 'description', 'Sarking (roll)', 'quantity', 2, 'unit', 'roll', 'unit_price', 150, 'calc_key', 'sarking', 'extra_status', 'added'),
    items->1, items->2));
  update estimates set status = 'sent', sent_at = now() where id = e;
end $$;
insert into t select 'c_version', version::text from estimates where id = :'c_id';
insert into t select 'edge', id::text from estimate_items where estimate_id = :'c_id' and calc_key = 'edge_protection';
insert into t select 'c_gutter', id::text from estimate_items where estimate_id = :'c_id' and calc_key = 'gutter';
insert into t select 'c_sark', id::text from estimate_items where estimate_id = :'c_id' and calc_key = 'sarking';

-- 8. The customer's choices on acceptance.
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
do $$
declare tok text := (select v from t where k = 'c_token'); ver int := (select v::int from t where k = 'c_version');
  sig text := 'data:image/png;base64,' || repeat('A', 200); d jsonb;
begin
  d := public.get_public_estimate(tok);
  if (d->>'version')::int <> ver or not (d->>'customer_colour')::boolean then raise exception 'version / colour flag not public'; end if;
  if (select x->'variants'->'zincalume'->>'unit_price' from jsonb_array_elements(d->'items') x where x->>'calc_key' = 'metal_sheet') <> '25' then raise exception 'variants not public'; end if;
  if d::text like '%unit_cost%' then raise exception 'variant cost leaked'; end if;
  if (select (x->>'required')::boolean from jsonb_array_elements(d->'items') x where x->>'calc_key' = 'edge_protection') is not true then raise exception 'required not public'; end if;
  if public.public_estimate_version(tok) <> ver then raise exception 'public_estimate_version'; end if;
  -- a stale version is refused
  begin
    perform public.accept_public_estimate(tok, 'Pat Sample', null, sig, '1.2.3.4', 't', '[]'::jsonb, '{}'::uuid[], '{}'::uuid[], null, ver - 1);
    raise exception 'stale version accepted';
  exception when raise_exception then if sqlerrm not like 'QUOTE_CHANGED%' then raise; end if;
  end;
  -- a required extra can't be removed
  begin
    perform public.accept_public_estimate(tok, 'Pat Sample', null, sig, '1.2.3.4', 't', '[]'::jsonb, '{}'::uuid[], array[(select v from t where k = 'edge')::uuid], null, ver);
    raise exception 'required extra removed';
  exception when raise_exception then if sqlerrm not like 'That extra can''t be removed%' then raise; end if;
  end;
  -- an offered (not added) line can't be "removed"
  begin
    perform public.accept_public_estimate(tok, 'Pat Sample', null, sig, '1.2.3.4', 't', '[]'::jsonb, '{}'::uuid[], array[(select v from t where k = 'c_gutter')::uuid], null, ver);
    raise exception 'offered line removed';
  exception when raise_exception then if sqlerrm not like 'That extra can''t be removed%' then raise; end if;
  end;
  -- a colour that isn't on the list
  begin
    perform public.accept_public_estimate(tok, 'Pat Sample', null, sig, '1.2.3.4', 't', '[]'::jsonb, '{}'::uuid[], '{}'::uuid[], 'Hot Pink', ver);
    raise exception 'unknown colour accepted';
  exception when raise_exception then if sqlerrm not like 'Please choose one of the colours%' then raise; end if;
  end;
  -- the real thing: ZINCALUME, sarking off, gutter on
  if not public.accept_public_estimate(tok, 'Pat Sample', null, sig, '1.2.3.4', 't', '[]'::jsonb,
       array[(select v from t where k = 'c_gutter')::uuid], array[(select v from t where k = 'c_sark')::uuid], 'ZINCALUME', ver) then
    raise exception 'accept with choices failed';
  end if;
end $$;

set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ua', true);
do $$
declare e uuid := (select v from ids where k = 'c');
begin
  if (select roof_colour || '|' || colour_by_customer from estimates where id = e) <> 'ZINCALUME|true' then raise exception 'colour choice not stored'; end if;
  if (select description || '|' || unit_price || '|' || unit_cost from estimate_items where estimate_id = e and calc_key = 'metal_sheet') <> 'ZINCALUME Trimdek 0.42 BMT|25.00|15.00' then
    raise exception 'sheet not re-priced from the ZINCALUME price: %', (select description || '|' || unit_price || '|' || unit_cost from estimate_items where estimate_id = e and calc_key = 'metal_sheet');
  end if;
  if (select extra_status || '|' || customer_removed from estimate_items where estimate_id = e and calc_key = 'sarking') <> 'offered|true' then raise exception 'sarking not removed by customer'; end if;
  if (select extra_status from estimate_items where estimate_id = e and calc_key = 'edge_protection') <> 'added' then raise exception 'required extra lost'; end if;
  -- 2500 sheet + 1000 edge + 300 gutter
  if (select total from estimate_totals where estimate_id = e) <> 3800 then raise exception 'total with choices: %', (select total from estimate_totals where estimate_id = e); end if;
  if (select body from notifications where url = '/app/estimates/' || e order by created_at desc limit 1) not like '%removed Sarking%colour ZINCALUME%' then raise exception 'notification missing choices'; end if;
end $$;

-- The roofer can keep the colour: a quote with customer_colour off refuses a colour change; the same colour is fine.
do $$
declare a uuid := (select v from ids where k = 'a_org'); e uuid; tok text; ok boolean;
begin
  insert into estimates (org_id, job_id, tax_rate, gst_inclusive, roof_colour, customer_colour, status)
    values (a, (select job_id from estimates where id = (select v from ids where k = 'c')), 10, true, 'Monument', false, 'sent') returning id, public_token into e, tok;
  insert into estimate_items (org_id, estimate_id, description, quantity, unit_price, calc_key) values (a, e, 'COLORBOND Trimdek · Monument', 100, 30, 'metal_sheet');
  insert into t values ('d_token', tok), ('d_id', e::text);
end $$;
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
do $$
declare tok text := (select v from t where k = 'd_token'); sig text := 'data:image/png;base64,' || repeat('A', 200);
begin
  begin
    perform public.accept_public_estimate(tok, 'Pat Sample', null, sig, '1.2.3.4', 't', '[]'::jsonb, '{}'::uuid[], '{}'::uuid[], 'Surfmist', null);
    raise exception 'colour changed although the roofer set it';
  exception when raise_exception then if sqlerrm not like 'The colour on this quote is set by%' then raise; end if;
  end;
  if not public.accept_public_estimate(tok, 'Pat Sample', null, sig, '1.2.3.4', 't', '[]'::jsonb, '{}'::uuid[], '{}'::uuid[], 'Monument', null) then raise exception 'same colour refused'; end if;
end $$;

-- A COLORBOND -> ZINCALUME change without a ZINCALUME price is refused (never another finish's price).
set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ua', true);
do $$
declare a uuid := (select v from ids where k = 'a_org'); e uuid; tok text;
begin
  insert into estimates (org_id, job_id, tax_rate, gst_inclusive, roof_colour, status)
    values (a, (select job_id from estimates where id = (select v from ids where k = 'c')), 10, true, 'Monument', 'sent') returning id, public_token into e, tok;
  insert into estimate_items (org_id, estimate_id, description, quantity, unit_price, calc_key, variants)
    values (a, e, 'COLORBOND Trimdek · Monument', 100, 30, 'metal_sheet', '{"colorbond": {"name": "COLORBOND Trimdek", "unit_price": 30}}');
  insert into t values ('z_token', tok), ('z_id', e::text);
end $$;
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
do $$
declare tok text := (select v from t where k = 'z_token'); sig text := 'data:image/png;base64,' || repeat('A', 200);
begin
  begin
    perform public.accept_public_estimate(tok, 'Pat Sample', null, sig, '1.2.3.4', 't', '[]'::jsonb, '{}'::uuid[], '{}'::uuid[], 'ZINCALUME', null);
    raise exception 'priced ZINCALUME from the COLORBOND price';
  exception when raise_exception then if sqlerrm not like 'That colour isn''t available%' then raise; end if;
  end;
  -- Same finish: just renamed, price unchanged.
  if not public.accept_public_estimate(tok, 'Pat Sample', null, sig, '1.2.3.4', 't', '[]'::jsonb, '{}'::uuid[], '{}'::uuid[], 'Basalt', null) then raise exception 'Basalt refused'; end if;
end $$;
set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ua', true);
do $$ begin
  if (select description || '|' || unit_price from estimate_items where estimate_id = (select v from t where k = 'z_id')::uuid) <> 'COLORBOND Trimdek · Basalt|30.00' then
    raise exception 'same-finish rename wrong: %', (select description || '|' || unit_price from estimate_items where estimate_id = (select v from t where k = 'z_id')::uuid);
  end if;
end $$;

-- 9. Every sheet profile in both finishes in a new company's price book.
do $$ begin
  if (select count(*) from catalog_items where org_id = (select v from ids where k = 'a_org') and calc_key = 'metal_sheet') <> 6 then raise exception 'expected 6 sheet rows'; end if;
  if (select string_agg(profile || ':' || finish, ',' order by profile, finish) from catalog_items where org_id = (select v from ids where k = 'a_org') and calc_key = 'metal_sheet')
     <> 'custom_orb:COLORBOND,custom_orb:ZINCALUME,klip_lok:COLORBOND,klip_lok:ZINCALUME,trimdek:COLORBOND,trimdek:ZINCALUME' then raise exception 'sheet profile x finish rows wrong'; end if;
end $$;

\echo 'DOCKET TESTS PASSED'
rollback;
