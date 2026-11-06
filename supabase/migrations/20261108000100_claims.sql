-- Claims & insurance money (builder A): supplement rounds, follow-ups, approved-supplement checks,
-- claim balances. Additive only; tables were created in 20261107000100_platform.sql.

-- ---------------------------------------------------------------------------
-- Supplements: follow-up tracking + automatic round numbers + requested total
-- ---------------------------------------------------------------------------
alter table public.supplements
  add column if not exists follow_up_count int not null default 0,
  add column if not exists last_followed_up_at timestamptz;

create index if not exists supplements_follow_up_idx on public.supplements (org_id, next_follow_up_on) where status = 'submitted';

-- Round = next number for the claim (1, 2, 3...). Serialised per claim so concurrent inserts don't collide.
create or replace function public.assign_supplement_round() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('supplement_round:' || new.claim_id::text, 0));
  select coalesce(max(round), 0) + 1 into new.round from supplements where claim_id = new.claim_id;
  return new;
end $$;
drop trigger if exists supplements_round on public.supplements;
create trigger supplements_round before insert on public.supplements
  for each row execute function public.assign_supplement_round();

-- Requested amount = sum of the round's line items.
create or replace function public.sync_supplement_requested() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  v_id := coalesce(new.supplement_id, old.supplement_id);
  update supplements s set requested_amount = coalesce((
    select sum(round(i.quantity * i.unit_price, 2)) from supplement_items i where i.supplement_id = v_id), 0)
  where s.id = v_id;
  return null;
end $$;
drop trigger if exists supplement_items_sync on public.supplement_items;
create trigger supplement_items_sync after insert or update or delete on public.supplement_items
  for each row execute function public.sync_supplement_requested();

-- ---------------------------------------------------------------------------
-- Approved (or partially approved) supplements add an expected 'supplement' check to the ledger.
-- One ledger row per supplement; it follows the approved amount while nothing has been received.
-- ---------------------------------------------------------------------------
create unique index if not exists claim_checks_one_per_supplement on public.claim_checks (supplement_id) where supplement_id is not null;

create or replace function public.sync_supplement_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_check claim_checks; v_mortgagee text;
begin
  select * into v_check from claim_checks where supplement_id = new.id;
  if new.status in ('approved', 'partial') and new.approved_amount > 0 then
    if v_check.id is null then
      select mortgagee_name into v_mortgagee from claims where id = new.claim_id;
      insert into claim_checks (org_id, claim_id, kind, payer, label, expected_amount, endorsement, supplement_id)
      values (new.org_id, new.claim_id, 'supplement', 'carrier', 'Supplement round ' || new.round, new.approved_amount,
              case when nullif(trim(coalesce(v_mortgagee, '')), '') is null then 'not_required' else 'needed' end, new.id);
    elsif v_check.expected_amount is distinct from new.approved_amount then
      update claim_checks set expected_amount = new.approved_amount where id = v_check.id;
    end if;
  elsif v_check.id is not null then
    -- No longer approved: drop the expectation unless money already came in.
    if coalesce(v_check.received_amount, 0) = 0 then
      delete from claim_checks where id = v_check.id;
    else
      update claim_checks set expected_amount = 0 where id = v_check.id;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists supplements_check_sync on public.supplements;
create trigger supplements_check_sync after insert or update of status, approved_amount on public.supplements
  for each row execute function public.sync_supplement_check();

-- ---------------------------------------------------------------------------
-- Claim balances: expected vs received per claim (lists, board, dashboards agree)
-- ---------------------------------------------------------------------------
create or replace view public.claim_balances with (security_invoker = true) as
select c.id as claim_id, c.org_id,
  coalesce(sum(k.expected_amount), 0) as expected,
  coalesce(sum(k.received_amount), 0) as received,
  coalesce(sum(greatest(k.expected_amount - k.received_amount, 0)), 0) as outstanding,
  count(k.id) filter (where k.endorsement in ('needed', 'sent_to_lender')) as awaiting_endorsement
from public.claims c
left join public.claim_checks k on k.claim_id = c.id
group by c.id;

grant select on public.claim_balances to authenticated;

-- Basic sanity on money columns.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'claim_checks_amounts_nonneg') then
    alter table public.claim_checks add constraint claim_checks_amounts_nonneg check (expected_amount >= 0 and received_amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'claims_amounts_nonneg') then
    alter table public.claims add constraint claims_amounts_nonneg check (rcv_amount >= 0 and depreciation_amount >= 0 and deductible >= 0);
  end if;
end $$;
