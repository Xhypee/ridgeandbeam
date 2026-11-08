-- Staff on jobs, payment plans and how the customer may pay.
--  * job_members: people from the company (with a login) put on a job, each with a role on that job.
--  * Payment plans are milestone invoices plus monthly/fortnightly "instalment" invoices due on a date.
--  * jobs.pay_methods: which ways this customer may pay (bank transfer / PayID, card online, cash).
--  * get_public_payment_plan: the whole plan for the homeowner's links (upcoming parts show without a pay link).
--  * record_cash_payment: cash handed to the crew, recorded from the job (crew leads only on their own jobs).

-- ---------------------------------------------------------------------------
-- Team on a job
-- ---------------------------------------------------------------------------
create table public.job_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'crew' check (role in ('sales', 'office', 'crew_lead', 'crew', 'subcontractor')),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (job_id, user_id)
);
create index job_members_user on public.job_members (user_id);
create index job_members_org on public.job_members (org_id);
create trigger t_org before insert or update on public.job_members for each row execute function public.check_parent_org('jobs', 'job_id');

-- Only people who belong to the company can be put on its jobs.
create or replace function public.job_members_check_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from memberships where org_id = new.org_id and user_id = new.user_id) then
    raise exception 'That person is not on this company''s team';
  end if;
  return new;
end $$;
revoke execute on function public.job_members_check_member() from public, anon, authenticated;
create trigger t_member before insert or update on public.job_members for each row execute function public.job_members_check_member();

-- Owners, admins, office and sales manage the team on a job; crew leads can only see it.
create or replace function public.can_manage_jobs(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships where org_id = p_org and user_id = auth.uid() and role <> 'crew_lead');
$$;
revoke execute on function public.can_manage_jobs(uuid) from public, anon;
grant execute on function public.can_manage_jobs(uuid) to authenticated;

alter table public.job_members enable row level security;
create policy job_members_select on public.job_members for select using (public.is_org_member(org_id));
create policy job_members_insert on public.job_members for insert with check (public.can_manage_jobs(org_id));
create policy job_members_update on public.job_members for update using (public.can_manage_jobs(org_id)) with check (public.can_manage_jobs(org_id));
create policy job_members_delete on public.job_members for delete using (public.can_manage_jobs(org_id));

-- ---------------------------------------------------------------------------
-- Payment plans
-- ---------------------------------------------------------------------------
alter table public.invoices drop constraint if exists invoices_kind_check;
alter table public.invoices add constraint invoices_kind_check
  check (kind in ('standard', 'deposit', 'progress', 'final', 'instalment', 'supplement', 'change_order'));
-- signed / delivered / completed = milestone; date = due on invoices.due_date (instalments).
alter table public.invoices drop constraint if exists invoices_milestone_trigger_check;
alter table public.invoices add constraint invoices_milestone_trigger_check
  check (milestone_trigger is null or milestone_trigger in ('signed', 'delivered', 'completed', 'date'));

-- The daily job remembers the last reminder so nobody gets two on the same day.
alter table public.invoices add column last_reminder_on date;

alter table public.jobs
  add column pay_methods text[] not null default array['bank', 'card', 'cash'],
  add column pay_reminders boolean not null default true;
alter table public.jobs add constraint jobs_pay_methods_check
  check (cardinality(pay_methods) > 0 and pay_methods <@ array['bank', 'card', 'cash']);

-- ---------------------------------------------------------------------------
-- Homeowner: the whole plan (job link or any issued invoice link)
-- ---------------------------------------------------------------------------
create or replace function public.get_public_payment_plan(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  with j as (
    select jb.id, jb.pay_methods
    from jobs jb join organizations o on o.id = jb.org_id
    where o.subscription_status <> 'cancelled'
      and (jb.public_token = p_token
           or jb.id = (select v.job_id from invoices v where v.public_token = p_token and v.status not in ('draft', 'void')))
    limit 1
  )
  select jsonb_build_object(
    'methods', to_jsonb(j.pay_methods),
    'parts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'number', v.number, 'label', coalesce(nullif(v.milestone_label, ''), v.kind), 'kind', v.kind,
               'trigger', v.milestone_trigger, 'due_date', v.due_date, 'status', v.status,
               'total', t.total, 'paid', t.paid, 'balance', t.balance,
               'public_token', case when v.status = 'draft' then null else v.public_token end)
             order by v.number)
      from invoices v join invoice_totals t on t.invoice_id = v.id
      where v.job_id = j.id and v.kind in ('deposit', 'progress', 'final', 'instalment') and v.status <> 'void'), '[]'::jsonb)
  )
  from j;
$$;
revoke all on function public.get_public_payment_plan(text) from public;
grant execute on function public.get_public_payment_plan(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cash to the crew
-- ---------------------------------------------------------------------------
create or replace function public.record_cash_payment(p_invoice uuid, p_amount numeric, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v invoices; j jobs; m memberships; bal numeric; pid uuid; tz text;
begin
  select * into v from invoices where id = p_invoice;
  if not found or v.status in ('draft', 'void') then raise exception 'That invoice hasn''t been issued yet'; end if;
  select * into m from memberships where org_id = v.org_id and user_id = auth.uid();
  if not found then raise exception 'Not allowed'; end if;
  select * into j from jobs where id = v.job_id;
  if not ('cash' = any (j.pay_methods)) then raise exception 'Cash isn''t turned on for this job'; end if;
  if m.role = 'crew_lead'
     and not (m.crew_id is not null and j.crew_id = m.crew_id)
     and not exists (select 1 from job_members jm where jm.job_id = j.id and jm.user_id = auth.uid()) then
    raise exception 'Not your job';
  end if;
  select balance into bal from invoice_totals where invoice_id = v.id;
  if p_amount is null or p_amount <= 0 or round(p_amount, 2) > bal then
    raise exception 'Enter an amount up to the % still owing', to_char(bal, 'FM$999,999,990.00');
  end if;
  tz := case upper(coalesce(j.state, '')) when 'QLD' then 'Australia/Brisbane' when 'WA' then 'Australia/Perth' when 'SA' then 'Australia/Adelaide'
          when 'NT' then 'Australia/Darwin' when 'TAS' then 'Australia/Hobart' when 'VIC' then 'Australia/Melbourne' else 'Australia/Sydney' end;
  insert into payments (org_id, invoice_id, amount, method, paid_on, reference, created_by)
  values (v.org_id, v.id, round(p_amount, 2), 'cash', (now() at time zone tz)::date,
          left(coalesce(nullif(trim(p_note), ''), 'Cash to ' || coalesce(nullif(trim(m.full_name), ''), 'the crew')), 200), auth.uid())
  returning id into pid;
  return pid;
end $$;
revoke all on function public.record_cash_payment(uuid, numeric, text) from public, anon;
grant execute on function public.record_cash_payment(uuid, numeric, text) to authenticated;

notify pgrst, 'reload schema';
