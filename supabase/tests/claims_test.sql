-- Claims & insurance money tests. Run against the migrated DB:
--   psql "<db>" -v ON_ERROR_STOP=1 -f supabase/tests/claims_test.sql
-- Every check raises on failure; everything is rolled back.
\set QUIET on
begin;

select gen_random_uuid() as ua, gen_random_uuid() as ub \gset
insert into auth.users (id, email) values (:'ua', 'ann-' || :'ua' || '@claims.test'), (:'ub', 'ben-' || :'ub' || '@claims.test');

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, anon;
insert into ids values ('ua', :'ua'), ('ub', :'ub');

set local role authenticated;
select null from set_config('request.jwt.claim.sub', :'ua', true);
insert into ids values ('org_a', public.create_organization('Ann Roofing', 'Ann'));
select null from set_config('request.jwt.claim.sub', :'ub', true);
insert into ids values ('org_b', public.create_organization('Ben Roofing', 'Ben'));
insert into customers (org_id, name) select v, 'Ben Customer' from ids where k = 'org_b' returning id \gset bcust_
insert into jobs (org_id, customer_id, title) select (select v from ids where k = 'org_b'), :'bcust_id', 'Ben job' returning id \gset bjob_
insert into ids values ('bjob', :'bjob_id');

-- Ann: customer, job, claim
select null from set_config('request.jwt.claim.sub', :'ua', true);
insert into customers (org_id, name) select v, 'Hail Homeowner' from ids where k = 'org_a' returning id \gset cust_
insert into jobs (org_id, customer_id, title, is_insurance) select (select v from ids where k = 'org_a'), :'cust_id', 'Hail job', true returning id \gset job_
insert into claims (org_id, job_id, carrier, claim_number, policy_type, rcv_amount, depreciation_amount, deductible, mortgagee_name)
  select (select v from ids where k = 'org_a'), :'job_id', 'State Farm', 'HAIL-1', 'rcv', 20000, 6000, 1000, 'Big Bank'
  returning id \gset claim_
insert into ids values ('claim', :'claim_id'), ('job', :'job_id');

do $$ begin
  if (select count(*) from claim_documents where claim_id = (select v from ids where k = 'claim')) <> 9 then
    raise exception 'paperwork checklist not seeded';
  end if;
  if (select stage from claims where id = (select v from ids where k = 'claim')) <> 'lodged' then raise exception 'default stage wrong'; end if;
end $$;

-- One claim per job
do $$ begin
  begin
    insert into claims (org_id, job_id) select (select v from ids where k = 'org_a'), (select v from ids where k = 'job');
    raise exception 'second claim on a job allowed';
  exception when unique_violation then null; end;
end $$;

-- Stage tracking
update claims set stage_changed_at = now() - interval '10 days' where id = :'claim_id';
update claims set stage = 'assessor_booked' where id = :'claim_id';
do $$ begin
  if (select stage_changed_at from claims where id = (select v from ids where k = 'claim')) < now() - interval '1 minute' then raise exception 'stage_changed_at not reset'; end if;
end $$;

-- Ledger + balances
insert into claim_checks (org_id, claim_id, kind, payer, expected_amount, received_amount, endorsement)
  select (select v from ids where k = 'org_a'), :'claim_id', 'acv', 'carrier', 13000, 13000, 'needed';
insert into claim_checks (org_id, claim_id, kind, payer, expected_amount)
  select (select v from ids where k = 'org_a'), :'claim_id', 'depreciation', 'carrier', 6000;
do $$ declare b record; begin
  select * into b from claim_balances where claim_id = (select v from ids where k = 'claim');
  if b.expected <> 19000 or b.received <> 13000 or b.outstanding <> 6000 or b.awaiting_endorsement <> 1 then
    raise exception 'claim_balances wrong: % % % %', b.expected, b.received, b.outstanding, b.awaiting_endorsement;
  end if;
  begin
    insert into claim_checks (org_id, claim_id, kind, expected_amount) select (select v from ids where k = 'org_a'), (select v from ids where k = 'claim'), 'other', -5;
    raise exception 'negative check amount allowed';
  exception when check_violation then null; end;
  begin
    insert into claim_checks (org_id, claim_id, kind) select (select v from ids where k = 'org_a'), (select v from ids where k = 'claim'), 'bogus';
    raise exception 'bad check kind allowed';
  exception when check_violation then null; end;
end $$;

-- Supplements: auto round numbers, requested total from items, approval adds an expected check
insert into supplements (org_id, claim_id) select (select v from ids where k = 'org_a'), :'claim_id' returning id, round \gset s1_
insert into supplements (org_id, claim_id, round) select (select v from ids where k = 'org_a'), :'claim_id', 1 returning id, round \gset s2_
select :s1_round = 1 as r1, :s2_round = 2 as r2 \gset
\if :r1 \else \echo 'FAIL supplement round 1' \quit \endif
\if :r2 \else \echo 'FAIL supplement round 2' \quit \endif
insert into ids values ('s1', :'s1_id');

insert into supplement_items (org_id, supplement_id, description, quantity, unit, unit_price, code_citation)
  select (select v from ids where k = 'org_a'), :'s1_id', 'Drip edge', 180, 'LF', 2.85, 'IRC R905.2.8.5';
insert into supplement_items (org_id, supplement_id, description, quantity, unit, unit_price)
  select (select v from ids where k = 'org_a'), :'s1_id', 'Starter', 180, 'LF', 1.92;
do $$ begin
  if (select requested_amount from supplements where id = (select v from ids where k = 's1')) <> 858.60 then
    raise exception 'requested_amount not synced: %', (select requested_amount from supplements where id = (select v from ids where k = 's1'));
  end if;
end $$;
delete from supplement_items where supplement_id = :'s1_id' and description = 'Starter';
do $$ begin
  if (select requested_amount from supplements where id = (select v from ids where k = 's1')) <> 513.00 then raise exception 'requested_amount not synced after delete'; end if;
end $$;

update supplements set status = 'submitted', submitted_on = current_date where id = :'s1_id';
do $$ begin
  if exists (select 1 from claim_checks where supplement_id = (select v from ids where k = 's1')) then raise exception 'check created before approval'; end if;
end $$;
update supplements set status = 'partial', approved_amount = 400 where id = :'s1_id';
do $$ declare c claim_checks; begin
  select * into c from claim_checks where supplement_id = (select v from ids where k = 's1');
  if c.id is null or c.kind <> 'variation' or c.expected_amount <> 400 or c.endorsement <> 'not_required' then
    raise exception 'approved supplement did not add expected check: %', row_to_json(c);
  end if;
end $$;
update supplements set approved_amount = 450 where id = :'s1_id';
update supplements set status = 'approved' where id = :'s1_id';
do $$ begin
  if (select count(*) from claim_checks where supplement_id = (select v from ids where k = 's1')) <> 1 then raise exception 'duplicate supplement checks'; end if;
  if (select expected_amount from claim_checks where supplement_id = (select v from ids where k = 's1')) <> 450 then raise exception 'supplement check did not follow approved amount'; end if;
end $$;
update supplements set status = 'denied', approved_amount = 0 where id = :'s1_id';
do $$ begin
  if exists (select 1 from claim_checks where supplement_id = (select v from ids where k = 's1')) then raise exception 'denied supplement kept an unpaid expected check'; end if;
end $$;

-- Scope lines
insert into scope_items (org_id, claim_id, source, description, quantity, unit, unit_price, total)
  select (select v from ids where k = 'org_a'), :'claim_id', 'carrier', 'Shingles', 25, 'SQ', 265, 6625;
do $$ begin
  begin
    insert into scope_items (org_id, claim_id, source, description) select (select v from ids where k = 'org_a'), (select v from ids where k = 'claim'), 'adjuster', 'x';
    raise exception 'bad scope source allowed';
  exception when check_violation then null; end;
end $$;

-- Milestone invoice columns
insert into invoices (org_id, job_id, kind, milestone_label, milestone_trigger, bill_to)
  select (select v from ids where k = 'org_a'), :'job_id', 'deposit', 'Deposit', 'signed', 'homeowner';
do $$ begin
  begin
    insert into invoices (org_id, job_id, kind) select (select v from ids where k = 'org_a'), (select v from ids where k = 'job'), 'weird';
    raise exception 'bad invoice kind allowed';
  exception when check_violation then null; end;
end $$;

-- Tenant isolation: Ben sees and changes nothing of Ann's
select null from set_config('request.jwt.claim.sub', :'ub', true);
do $$ begin
  if (select count(*) from claims) <> 0 then raise exception 'ben sees ann claims'; end if;
  if (select count(*) from claim_checks) <> 0 then raise exception 'ben sees ann checks'; end if;
  if (select count(*) from claim_documents) <> 0 then raise exception 'ben sees ann documents'; end if;
  if (select count(*) from supplements) <> 0 then raise exception 'ben sees ann supplements'; end if;
  if (select count(*) from supplement_items) <> 0 then raise exception 'ben sees ann supplement items'; end if;
  if (select count(*) from scope_items) <> 0 then raise exception 'ben sees ann scope'; end if;
  if (select count(*) from claim_balances) <> 0 then raise exception 'ben sees ann balances'; end if;
  begin
    insert into claim_checks (org_id, claim_id, kind, expected_amount) select (select v from ids where k = 'org_a'), (select v from ids where k = 'claim'), 'other', 1;
    raise exception 'ben inserted into ann ledger';
  exception when insufficient_privilege then null; end;
  begin
    insert into claim_checks (org_id, claim_id, kind, expected_amount) select (select v from ids where k = 'org_b'), (select v from ids where k = 'claim'), 'other', 1;
    raise exception 'cross-org check on ann claim allowed';
  exception when raise_exception then
    if sqlerrm not like '%another organization%' then raise; end if;
  end;
  begin
    insert into claims (org_id, job_id) select (select v from ids where k = 'org_a'), (select v from ids where k = 'bjob');
    raise exception 'ben created claim in ann org';
  exception when insufficient_privilege then null;
    when raise_exception then if sqlerrm not like '%another organization%' then raise; end if;
  end;
  begin
    insert into supplements (org_id, claim_id) select (select v from ids where k = 'org_b'), (select v from ids where k = 'claim');
    raise exception 'cross-org supplement allowed';
  exception when raise_exception then
    if sqlerrm not like '%another organization%' then raise; end if;
  end;
end $$;
update claims set carrier = 'hacked';
update supplements set status = 'approved', approved_amount = 99999;

select null from set_config('request.jwt.claim.sub', :'ua', true);
do $$ begin
  if exists (select 1 from claims where carrier = 'hacked') then raise exception 'cross-tenant claim update'; end if;
  if exists (select 1 from supplements where approved_amount = 99999) then raise exception 'cross-tenant supplement update'; end if;
  if (select count(*) from supplements) <> 2 then raise exception 'ann lost supplements'; end if;
end $$;

-- Anonymous users see nothing
set local role anon;
select null from set_config('request.jwt.claim.sub', '', true);
do $$ begin
  if (select count(*) from claims) <> 0 or (select count(*) from claim_checks) <> 0 or (select count(*) from supplements) <> 0 then
    raise exception 'anon can read claims data';
  end if;
end $$;

\echo 'PASSED claims_test'
rollback;
