-- Referrals: any contact (customer, builder, contractor, other) can send us a job.
-- jobs.referred_by holds the referring contact (a customers row). It is deliberately NOT a foreign key:
-- a second jobs->customers FK would make every existing `jobs ... customers(...)` API embed ambiguous.
-- Triggers keep it honest instead: same organisation on write, cleared when the contact is deleted.
alter table public.jobs add column if not exists referred_by uuid;
create index if not exists jobs_referred_by_idx on public.jobs (referred_by) where referred_by is not null;
comment on column public.jobs.referred_by is 'Contact (customers.id) who referred this job. Not a FK on purpose; see 20261123000100_referrals.sql.';

create or replace function public.jobs_check_referrer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.referred_by is null then return new; end if;
  if new.referred_by = new.customer_id then
    raise exception 'a job cannot be referred by its own customer';
  end if;
  if not exists (select 1 from public.customers c where c.id = new.referred_by and c.org_id = new.org_id) then
    raise exception 'referrer belongs to another organization';
  end if;
  return new;
end $$;
revoke execute on function public.jobs_check_referrer() from public, anon, authenticated;
drop trigger if exists t_jobs_check_referrer on public.jobs;
create trigger t_jobs_check_referrer before insert or update of referred_by, customer_id on public.jobs
  for each row execute function public.jobs_check_referrer();

create or replace function public.customers_clear_referrals() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.jobs set referred_by = null where referred_by = old.id;
  return old;
end $$;
revoke execute on function public.customers_clear_referrals() from public, anon, authenticated;
drop trigger if exists t_customers_clear_referrals on public.customers;
create trigger t_customers_clear_referrals before delete on public.customers
  for each row execute function public.customers_clear_referrals();
