-- State compliance: job_compliance_items / job_compliance_profiles are tenant-isolated, same-org
-- guarded (job and evidence file), and keep one tick per job per item.
--   psql -v ON_ERROR_STOP=1 -d <db> -f supabase/tests/compliance_test.sql
\set QUIET on
begin;

create temp table t (k text primary key, v uuid);
grant all on t to authenticated, anon;
insert into t values ('ua', gen_random_uuid()), ('ub', gen_random_uuid());
insert into auth.users (id, email) select v, k || '-' || v || '@compliance.test' from t;

set local role authenticated;
select null from set_config('request.jwt.claim.sub', (select v::text from t where k = 'ua'), true);
insert into t values ('a', public.create_organization('Compliance A', 'Ann'));
select null from set_config('request.jwt.claim.sub', (select v::text from t where k = 'ub'), true);
insert into t values ('b', public.create_organization('Compliance B', 'Ben'));
reset role;

do $$
declare a uuid := (select v from t where k = 'a'); b uuid := (select v from t where k = 'b'); c uuid; j uuid; f uuid; cb uuid; jb uuid; fb uuid;
begin
  insert into customers (org_id, name) values (a, 'A owner') returning id into c;
  insert into jobs (org_id, customer_id, title, state, lead_source) values (a, c, 'A re-roof', 'NSW', 'door_knock') returning id into j;
  insert into job_files (org_id, job_id, kind, storage_path, category) values (a, j, 'document', a || '/' || j || '/compliance/hbc.pdf', 'document') returning id into f;
  insert into customers (org_id, name) values (b, 'B owner') returning id into cb;
  insert into jobs (org_id, customer_id, title, state) values (b, cb, 'B job', 'VIC') returning id into jb;
  insert into job_files (org_id, job_id, kind, storage_path) values (b, jb, 'document', b || '/' || jb || '/x.pdf') returning id into fb;
  insert into t values ('job', j), ('file', f), ('jobb', jb), ('fileb', fb);
end $$;

-- Ann ticks items and records job facts
set local role authenticated;
select null from set_config('request.jwt.claim.sub', (select v::text from t where k = 'ua'), true);
do $$
declare a uuid := (select v from t where k = 'a'); j uuid := (select v from t where k = 'job'); f uuid := (select v from t where k = 'file');
begin
  insert into job_compliance_items (org_id, job_id, item_key, status, file_id, reference)
    values (a, j, 'insurance_certificate', 'done', f, 'HBC-12345');
  insert into job_compliance_items (org_id, job_id, item_key, status) values (a, j, 'swms', 'todo');
  insert into job_compliance_profiles (org_id, job_id, roof_system, owner_occupier, building_approval_required, built_before_1990)
    values (a, j, 'concrete_tile', true, false, true);

  -- upsert keeps one row per item
  insert into job_compliance_items (org_id, job_id, item_key, status) values (a, j, 'swms', 'done')
    on conflict (job_id, item_key) do update set status = excluded.status;
  if (select count(*) from job_compliance_items where job_id = j and item_key = 'swms') <> 1 then raise exception 'A: duplicate tick rows'; end if;
  if (select status from job_compliance_items where job_id = j and item_key = 'swms') <> 'done' then raise exception 'A: upsert did not update'; end if;

  -- invalid status / key rejected
  begin
    insert into job_compliance_items (org_id, job_id, item_key, status) values (a, j, 'licence_on_quote', 'maybe');
    raise exception 'A: bad status accepted';
  exception when check_violation then null; end;
  begin
    insert into job_compliance_items (org_id, job_id, item_key) values (a, j, 'Bad Key!');
    raise exception 'A: bad key accepted';
  exception when check_violation then null; end;
  begin
    insert into job_compliance_profiles (org_id, job_id, roof_system) values (a, (select v from t where k = 'job'), 'asphalt_shingle')
      on conflict (job_id) do update set roof_system = excluded.roof_system;
    raise exception 'A: US roof system accepted';
  exception when check_violation then null; end;

  -- Ann can't attach company B's file or write against B's job
  begin
    update job_compliance_items set file_id = (select v from t where k = 'fileb') where job_id = j and item_key = 'swms';
    raise exception 'A: linked another company''s file';
  exception when others then
    if sqlerrm like 'A:%' then raise; end if;
  end;
  begin
    insert into job_compliance_items (org_id, job_id, item_key) values (a, (select v from t where k = 'jobb'), 'swms');
    raise exception 'A: ticked another company''s job';
  exception when others then
    if sqlerrm like 'A:%' then raise; end if;
  end;

  if (select count(*) from job_compliance_items) <> 2 then raise exception 'A: expected 2 items, got %', (select count(*) from job_compliance_items); end if;
  if (select count(*) from job_compliance_profiles) <> 1 then raise exception 'A: expected 1 profile'; end if;
end $$;

-- Ben (company B) sees none of A's rows and can't change them
select null from set_config('request.jwt.claim.sub', (select v::text from t where k = 'ub'), true);
do $$
declare n int; b uuid := (select v from t where k = 'b');
begin
  if (select count(*) from job_compliance_items) + (select count(*) from job_compliance_profiles) <> 0 then raise exception 'B sees A compliance rows'; end if;
  update job_compliance_items set status = 'todo' where job_id = (select v from t where k = 'job');
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B updated A ticks'; end if;
  delete from job_compliance_profiles where job_id = (select v from t where k = 'job');
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B deleted A profile'; end if;
  begin
    -- B pretending the row is its own, pointing at A's job
    insert into job_compliance_profiles (org_id, job_id) values (b, (select v from t where k = 'job'));
    raise exception 'B: created a profile on A''s job';
  exception when others then
    if sqlerrm like 'B:%' then raise; end if;
  end;
  begin
    insert into job_compliance_items (org_id, job_id, item_key) values ((select v from t where k = 'a'), (select v from t where k = 'job'), 'swms_b');
    raise exception 'B: inserted into company A';
  exception when others then
    if sqlerrm like 'B:%' then raise; end if;
  end;
end $$;

-- Deleting the evidence file keeps the tick but clears the link
reset role;
delete from job_files where id = (select v from t where k = 'file');
do $$ begin
  if (select file_id from job_compliance_items where item_key = 'insurance_certificate' and job_id = (select v from t where k = 'job')) is not null then raise exception 'file link not cleared'; end if;
  if (select reference from job_compliance_items where item_key = 'insurance_certificate' and job_id = (select v from t where k = 'job')) <> 'HBC-12345' then raise exception 'tick lost with file'; end if;
end $$;

\echo 'compliance_test PASSED'
rollback;
