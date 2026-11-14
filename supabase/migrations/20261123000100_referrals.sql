-- Referrals: any contact (customer, builder, contractor, other) or supplier can send us a job.
-- jobs.referred_by + jobs.referred_by_type ('contact' = customers.id, 'supplier' = org_suppliers.id).
-- Deliberately NOT foreign keys: a second jobs->customers FK would make every existing `jobs ... customers(...)`
-- API embed ambiguous. Triggers keep it honest instead: same organisation on write, cleared on delete.
alter table public.jobs
  add column if not exists referred_by uuid,
  add column if not exists referred_by_type text;
alter table public.jobs drop constraint if exists jobs_referred_by_type_check;
alter table public.jobs add constraint jobs_referred_by_type_check
  check ((referred_by is null and referred_by_type is null) or (referred_by is not null and referred_by_type in ('contact', 'supplier')));
create index if not exists jobs_referred_by_idx on public.jobs (referred_by) where referred_by is not null;
comment on column public.jobs.referred_by is 'Who referred this job: customers.id or org_suppliers.id (see referred_by_type). Not a FK on purpose; see 20261123000100_referrals.sql.';

create or replace function public.jobs_check_referrer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.referred_by is null then return new; end if;
  if new.referred_by_type = 'contact' then
    if new.referred_by = new.customer_id then raise exception 'a job cannot be referred by its own customer'; end if;
    if not exists (select 1 from public.customers c where c.id = new.referred_by and c.org_id = new.org_id) then
      raise exception 'referrer belongs to another organization';
    end if;
  elsif not exists (select 1 from public.org_suppliers s where s.id = new.referred_by and s.org_id = new.org_id) then
    raise exception 'referrer belongs to another organization';
  end if;
  return new;
end $$;
revoke execute on function public.jobs_check_referrer() from public, anon, authenticated;
drop trigger if exists t_jobs_check_referrer on public.jobs;
create trigger t_jobs_check_referrer before insert or update of referred_by, referred_by_type, customer_id on public.jobs
  for each row execute function public.jobs_check_referrer();

create or replace function public.clear_referrals() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.jobs set referred_by = null, referred_by_type = null
   where referred_by = old.id and referred_by_type = tg_argv[0];
  return old;
end $$;
revoke execute on function public.clear_referrals() from public, anon, authenticated;
drop trigger if exists t_customers_clear_referrals on public.customers;
create trigger t_customers_clear_referrals before delete on public.customers
  for each row execute function public.clear_referrals('contact');
drop trigger if exists t_org_suppliers_clear_referrals on public.org_suppliers;
create trigger t_org_suppliers_clear_referrals before delete on public.org_suppliers
  for each row execute function public.clear_referrals('supplier');
