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

\echo 'DOCKET TESTS PASSED'
rollback;
