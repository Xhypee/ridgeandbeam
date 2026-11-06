-- Estimating (builder B): options, totals view, atomic save, public payload, signed acceptance, isolation.
--   psql -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/estimating_test.sql
-- Every check raises (or prints FAIL and quits) on failure; a clean run ends with ESTIMATING TESTS PASSED.
\set QUIET on
begin;

select gen_random_uuid() as ua, gen_random_uuid() as ub \gset
insert into auth.users (id, email) values (:'ua', 'est-a-' || :'ua' || '@test.dev'), (:'ub', 'est-b-' || :'ub' || '@test.dev');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ub', true);
insert into ids values ('b_org', public.create_organization('B Roofing', 'B'));
select null from set_config('request.jwt.claim.sub', :'ua', true);
insert into ids values ('a_org', public.create_organization('A Roofing', 'A'));

insert into customers (org_id, name, state) select v, 'Tex Homeowner', 'TX' from ids where k = 'a_org' returning id \gset cust_
insert into jobs (org_id, customer_id, title, state, is_insurance) select (select v from ids where k = 'a_org'), :'cust_id', 'Hail job', 'TX', true returning id \gset job_
insert into estimates (org_id, job_id, tax_rate) select (select v from ids where k = 'a_org'), :'job_id', 0 returning id, public_token \gset est_
insert into ids values ('est', :'est_id');

-- Atomic save with options: shared labor 1000; Good shingles 2000, Better 3000, Best 4000; Better recommended.
select null from public.save_estimate_content(:'est_id',
  '{"measurements":{"sections":[{"label":"Main","area":2000,"pitch":6}]},"tax_rate":10,"discount":100,"notes":"n","terms":"t","option_label":"options","measurement_source":"eagleview"}'::jsonb,
  '[{"key":"g","name":"Good","tier":"good","recommended":false},
    {"key":"b","name":"Better","tier":"better","recommended":true},
    {"key":"c","name":"Best","tier":"best","recommended":false}]'::jsonb,
  '[{"option_key":null,"description":"Labor","quantity":10,"unit":"sq","unit_price":100,"unit_cost":60,"category":"labor","calc_key":"labor"},
    {"option_key":"g","description":"Arch shingles","quantity":50,"unit":"bundle","unit_price":40,"unit_cost":30,"category":"material","calc_key":"shingles"},
    {"option_key":"b","description":"Designer shingles","quantity":50,"unit":"bundle","unit_price":60,"unit_cost":38,"category":"material","calc_key":"shingles"},
    {"option_key":"c","description":"Class 4 shingles","quantity":50,"unit":"bundle","unit_price":80,"unit_cost":47,"category":"material","calc_key":"shingles"}]'::jsonb);

do $$ declare r record; begin
  if (select count(*) from estimate_options) <> 3 then raise exception 'expected 3 options'; end if;
  if (select count(*) from estimate_options where recommended) <> 1 then raise exception 'expected one recommended'; end if;
  if (select count(*) from estimate_items where option_id is null) <> 1 then raise exception 'expected one shared line'; end if;
  if (select measurement_source from estimates limit 1) <> 'eagleview' then raise exception 'measurement_source not saved'; end if;
  -- recommended (Better): (1000 + 3000 - 100) * 1.10 = 4290
  select * into r from estimate_totals;
  if r.total <> 4290.00 then raise exception 'recommended total wrong: %', r.total; end if;
  if r.cost <> 600 + 1900 then raise exception 'cost wrong: %', r.cost; end if;
  if r.option_id <> (select id from estimate_options where name = 'Better') then raise exception 'effective option should be Better'; end if;
  if (select total from estimate_option_totals t join estimate_options o on o.id = t.option_id where o.name = 'Good') <> 3190.00 then raise exception 'Good total wrong'; end if;
  if (select total from estimate_option_totals t join estimate_options o on o.id = t.option_id where o.name = 'Best') <> 5390.00 then raise exception 'Best total wrong'; end if;
  -- computed relationship used by PostgREST embedding (estimates?select=estimate_totals(total))
  if (select t.total from estimates e, public.estimate_totals(e) t limit 1) <> 4290.00 then raise exception 'computed relationship wrong'; end if;
end $$;

-- Re-save keeps option ids passed back, adds new ones, and keeps a single recommended option.
select id as better_id from estimate_options where name = 'Better' \gset
select id as good_id from estimate_options where name = 'Good' \gset
select null from public.save_estimate_content(:'est_id', '{"tax_rate":10,"discount":100}'::jsonb,
  jsonb_build_array(
    jsonb_build_object('key', 'g', 'id', :'good_id', 'name', 'Good', 'tier', 'good', 'recommended', false),
    jsonb_build_object('key', 'b', 'id', :'better_id', 'name', 'Better', 'tier', 'better', 'recommended', true),
    jsonb_build_object('key', 'c2', 'name', 'Best', 'tier', 'best', 'recommended', true)),
  '[{"option_key":null,"description":"Labor","quantity":10,"unit":"sq","unit_price":100,"unit_cost":60},
    {"option_key":"g","description":"Arch shingles","quantity":50,"unit":"bundle","unit_price":40,"unit_cost":30},
    {"option_key":"b","description":"Designer shingles","quantity":50,"unit":"bundle","unit_price":60,"unit_cost":38},
    {"option_key":"c2","description":"Class 4 shingles","quantity":50,"unit":"bundle","unit_price":80,"unit_cost":47}]'::jsonb);
select (select count(*) from estimate_options where id = :'better_id') = 1 as kept,
       (select count(*) from estimate_options) = 3 as three,
       (select count(*) from estimate_options where recommended) = 1 as one_rec,
       (select recommended from estimate_options where id = :'better_id') as better_rec \gset
\if :kept \else \echo 'FAIL option id not kept' \quit \endif
\if :three \else \echo 'FAIL option count after resave' \quit \endif
\if :one_rec \else \echo 'FAIL more than one recommended' \quit \endif
\if :better_rec \else \echo 'FAIL first recommended should win' \quit \endif

-- A line can't point at another estimate's option; an estimate without options totals every line.
insert into estimates (org_id, job_id) select (select v from ids where k = 'a_org'), :'job_id' returning id \gset est2_
insert into ids values ('est2', :'est2_id'), ('good', :'good_id');
do $$ begin
  begin
    insert into estimate_items (org_id, estimate_id, description, option_id)
      values ((select v from ids where k = 'a_org'), (select v from ids where k = 'est2'), 'x', (select v from ids where k = 'good'));
    raise exception 'cross-estimate option allowed';
  exception when raise_exception then
    if sqlerrm not like '%another estimate%' then raise; end if;
  end;
  begin
    update estimates set selected_option_id = (select v from ids where k = 'good') where id = (select v from ids where k = 'est2');
    raise exception 'cross-estimate selected option allowed';
  exception when raise_exception then
    if sqlerrm not like '%another estimate%' then raise; end if;
  end;
end $$;
insert into estimate_items (org_id, estimate_id, description, quantity, unit_price) select (select v from ids where k = 'a_org'), :'est2_id', 'Roof', 1, 500;
do $$ begin
  if (select total from estimate_totals where estimate_id = (select v from ids where k = 'est2')) <> 500 then raise exception 'no-option total wrong'; end if;
end $$;

-- Other tenant: cannot see options/totals or save into the estimate.
select null from set_config('request.jwt.claim.sub', :'ub', true);
do $$ begin
  if (select count(*) from estimate_options) <> 0 then raise exception 'B sees A options'; end if;
  if (select count(*) from estimate_totals) <> 0 then raise exception 'B sees A totals'; end if;
  if (select count(*) from estimate_option_totals) <> 0 then raise exception 'B sees A option totals'; end if;
  begin
    perform public.save_estimate_content((select v from ids where k = 'est'), '{}'::jsonb, '[]'::jsonb, '[]'::jsonb);
    raise exception 'B saved into A estimate';
  exception when raise_exception then
    if sqlerrm not like 'Estimate not found%' then raise; end if;
  end;
  begin
    insert into estimate_options (org_id, estimate_id, name) values ((select v from ids where k = 'b_org'), (select v from ids where k = 'est'), 'evil');
    raise exception 'B attached option to A estimate';
  exception when raise_exception then
    if sqlerrm not like '%another organization%' then raise; end if;
  end;
end $$;
select null from set_config('request.jwt.claim.sub', :'ua', true);
do $$ begin
  if (select count(*) from estimate_options) <> 3 then raise exception 'B changed A options'; end if;
end $$;

-- Draft is not public; sent estimate exposes options, per-option items, financing and state context.
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
select public.get_public_document('estimate', :'est_public_token') is null as hidden \gset
\if :hidden \else \echo 'FAIL draft estimate public' \quit \endif
set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ua', true);
update estimates set status = 'sent', sent_at = now() where id = :'est_id';
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
select public.get_public_document('estimate', :'est_public_token') as doc \gset
select jsonb_array_length((:'doc'::jsonb)->'options') = 3 as opts,
       jsonb_array_length((:'doc'::jsonb)->'items') = 4 as items,
       ((:'doc'::jsonb)->'items'->1) ? 'option_id' as item_opt,
       ((:'doc'::jsonb)->'job'->>'state') = 'TX' as st,
       ((:'doc'::jsonb)->'job'->>'is_insurance')::boolean as ins,
       ((:'doc'::jsonb)->'financing') ? 'apr' as fin,
       ((:'doc'::jsonb)->'org') ? 'certifications' as certs,
       ((:'doc'::jsonb)->'signature_data') = 'null'::jsonb as nosig \gset
\if :opts \else \echo 'FAIL public options' \quit \endif
\if :items \else \echo 'FAIL public items' \quit \endif
\if :item_opt \else \echo 'FAIL public item option_id' \quit \endif
\if :st \else \echo 'FAIL public state' \quit \endif
\if :ins \else \echo 'FAIL public is_insurance' \quit \endif
\if :fin \else \echo 'FAIL public financing' \quit \endif
\if :certs \else \echo 'FAIL public certifications' \quit \endif
\if :nosig \else \echo 'FAIL signature exposed before acceptance' \quit \endif

-- Acceptance needs a drawn signature and one of this estimate's options.
select null from set_config('my.tok', :'est_public_token', true);
select null from set_config('my.sig', 'data:image/png;base64,' || repeat('A', 200), true);
do $$ begin
  begin
    perform public.accept_public_estimate(current_setting('my.tok'), 'Jane Tex', null, current_setting('my.sig'), '1.2.3.4', 'UA', '[]'::jsonb);
    raise exception 'accept without option allowed';
  exception when raise_exception then if sqlerrm not like '%choose an option%' then raise; end if; end;
  begin
    perform public.accept_public_estimate(current_setting('my.tok'), 'Jane Tex', gen_random_uuid(), current_setting('my.sig'), '1.2.3.4', 'UA', '[]'::jsonb);
    raise exception 'accept with foreign option allowed';
  exception when raise_exception then if sqlerrm not like '%choose an option%' then raise; end if; end;
  begin
    perform public.accept_public_estimate(current_setting('my.tok'), 'Jane Tex', null, 'not-a-png', '1.2.3.4', 'UA', '[]'::jsonb);
    raise exception 'accept without signature allowed';
  exception when raise_exception then if sqlerrm not like '%draw your signature%' then raise; end if; end;
  begin
    perform public.accept_public_estimate(current_setting('my.tok'), 'Jane Tex');
    raise exception 'legacy accept allowed on options estimate';
  exception when raise_exception then if sqlerrm not like '%choose an option%' then raise; end if; end;
end $$;
select public.accept_public_estimate(:'est_public_token', 'Jane Tex', :'good_id'::uuid, current_setting('my.sig'), '1.2.3.4', 'Mozilla/5.0',
  '[{"id":"tx_27_02","title":"Texas deductible notice","text":"TEXAS LAW REQUIRES","citation":"Tex. Bus. & Com. Code §27.02","state":"TX"}]'::jsonb) as accepted \gset
\if :accepted \else \echo 'FAIL accept' \quit \endif
select public.accept_public_estimate(:'est_public_token', 'Jane Tex', :'good_id'::uuid, current_setting('my.sig'), '1.2.3.4', 'Mozilla/5.0', '[]'::jsonb) as again \gset
\if :again \echo 'FAIL double accept' \quit \endif
select (public.get_public_document('estimate', :'est_public_token')->>'signature_data') like 'data:image/png%' as sig_shown \gset
\if :sig_shown \else \echo 'FAIL signature not on receipt' \quit \endif

set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ua', true);
do $$ declare e estimates; begin
  select * into e from estimates where status = 'accepted';
  if e.selected_option_id <> (select id from estimate_options where name = 'Good') then raise exception 'selected option not stored'; end if;
  if e.accepted_ip <> '1.2.3.4' or e.accepted_user_agent <> 'Mozilla/5.0' or e.accepted_name <> 'Jane Tex' then raise exception 'acceptance audit fields missing'; end if;
  if e.legal_notices->0->>'id' <> 'tx_27_02' then raise exception 'notices not snapshotted'; end if;
  if (select stage from jobs where id = e.job_id) <> 'sold' then raise exception 'job not sold'; end if;
  -- totals now follow the SELECTED option (Good): (1000 + 2000 - 100) * 1.1 = 3190
  if (select total from estimate_totals where estimate_id = e.id) <> 3190.00 then raise exception 'selected total wrong'; end if;
  if not exists (select 1 from notifications where kind = 'estimate_accepted') then raise exception 'no acceptance notification'; end if;
  begin
    perform public.save_estimate_content(e.id, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb);
    raise exception 'accepted estimate edited';
  exception when raise_exception then if sqlerrm not like '%locked%' then raise; end if; end;
end $$;

-- The B tenant still cannot read the accepted estimate through the totals helpers.
select null from set_config('request.jwt.claim.sub', :'ub', true);
do $$ begin
  if exists (select 1 from estimates) then raise exception 'B sees A estimates'; end if;
end $$;

\echo 'ESTIMATING TESTS PASSED'
rollback;
