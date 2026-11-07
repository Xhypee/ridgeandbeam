-- Measure from plans: plans PDFs are stored as job files (category 'plans'), tenant-isolated like every job file,
-- and the takeoff saves into estimates.measurements with measurement_source 'plans'.
--   psql -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/plans_test.sql
-- Every check raises on failure; a clean run ends with PLANS TESTS PASSED.
\set QUIET on
begin;

select gen_random_uuid() as ua, gen_random_uuid() as ub \gset
insert into auth.users (id, email) values (:'ua', 'plans-a-' || :'ua' || '@test.dev'), (:'ub', 'plans-b-' || :'ub' || '@test.dev');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;

set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ub', true);
insert into ids values ('b_org', public.create_organization('Plans B Roofing', 'B'));
select null from set_config('request.jwt.claim.sub', :'ua', true);
insert into ids values ('a_org', public.create_organization('Plans A Roofing', 'A'));
with c as (insert into customers (org_id, name) values ((select v from ids where k = 'a_org'), 'Bluegum Homes Pty Ltd') returning id)
insert into ids select 'a_cust', id from c;
with j as (insert into jobs (org_id, customer_id, title) values ((select v from ids where k = 'a_org'), (select v from ids where k = 'a_cust'), 'New residence') returning id)
insert into ids select 'a_job', id from j;
with e as (insert into estimates (org_id, job_id) values ((select v from ids where k = 'a_org'), (select v from ids where k = 'a_job')) returning id)
insert into ids select 'a_est', id from e;

-- 1. A plans PDF is a job file with category 'plans'; unknown categories are still refused.
do $$
declare o uuid := (select v from ids where k = 'a_org'); j uuid := (select v from ids where k = 'a_job');
begin
  insert into job_files (org_id, job_id, kind, category, storage_path, mime_type, caption)
  values (o, j, 'document', 'plans', o || '/' || j || '/plans/x-plans.pdf', 'application/pdf', 'Plans: plans.pdf');
  if (select count(*) from job_files where job_id = j and category = 'plans') <> 1 then raise exception 'plans file not stored'; end if;
  begin
    insert into job_files (org_id, job_id, kind, category, storage_path) values (o, j, 'document', 'blueprints', 'x');
    raise exception 'unknown category accepted';
  exception when check_violation then null;
  end;
end $$;

-- 2. The takeoff saves into measurements with source 'plans'.
do $$
declare e uuid := (select v from ids where k = 'a_est');
begin
  update estimates set measurement_source = 'plans',
    measurements = jsonb_build_object('units', 'metric', 'sections', jsonb_build_array(jsonb_build_object('label', 'Panel A', 'area', 60, 'pitch', 25)),
                                      'plans', jsonb_build_object('scale', 100, 'pitch', 25))
  where id = e;
  if (select measurement_source from estimates where id = e) <> 'plans' then raise exception 'source not saved'; end if;
  if (select (measurements->'plans'->>'scale')::int from estimates where id = e) <> 100 then raise exception 'plans takeoff not saved'; end if;
end $$;

-- 3. Another company can't see or add plans on A's job.
select null from set_config('request.jwt.claim.sub', :'ub', true);
do $$
declare o uuid := (select v from ids where k = 'a_org'); j uuid := (select v from ids where k = 'a_job'); b uuid := (select v from ids where k = 'b_org');
begin
  if exists (select 1 from job_files where job_id = j) then raise exception 'B sees A plans'; end if;
  if exists (select 1 from estimates where job_id = j) then raise exception 'B sees A estimate'; end if;
  begin
    insert into job_files (org_id, job_id, kind, category, storage_path) values (o, j, 'document', 'plans', 'x');
    raise exception 'B inserted into A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into job_files (org_id, job_id, kind, category, storage_path) values (b, j, 'document', 'plans', 'x');
    raise exception 'B attached a file to A job';
  exception when others then
    if sqlerrm = 'B attached a file to A job' then raise; end if;
  end;
end $$;

\echo 'PLANS TESTS PASSED'
rollback;
