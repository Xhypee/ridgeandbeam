-- New-lead sidebar: when the inspection is booked, and why a lead didn't go ahead.
-- Call attempts with no answer are job_events (kind 'call_no_answer', not shown to the homeowner).
alter table public.jobs
  add column if not exists inspection_at timestamptz,
  add column if not exists lost_reason text check (lost_reason is null or lost_reason in ('price', 'competitor', 'not_ready', 'no_response', 'out_of_area', 'not_a_fit', 'other'));

comment on column public.jobs.inspection_at is 'Booked roof inspection (set from the New lead sidebar).';
comment on column public.jobs.lost_reason is 'Why the lead or quote did not go ahead (set when marked lost).';

-- Every job has someone looking after it: a new job with no one assigned goes to the business owner
-- (covers the New lead sidebar, web/instant-quote intake, imports). Jobs already without one get the owner too.
create or replace function public.jobs_default_assignee() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.assigned_to is null then
    select m.user_id into new.assigned_to from public.memberships m
     where m.org_id = new.org_id and m.role = 'owner' order by m.created_at limit 1;
  end if;
  return new;
end $$;
revoke execute on function public.jobs_default_assignee() from public, anon, authenticated;
drop trigger if exists t_jobs_default_assignee on public.jobs;
create trigger t_jobs_default_assignee before insert on public.jobs
  for each row execute function public.jobs_default_assignee();

update public.jobs j set assigned_to = o.user_id
  from (select distinct on (org_id) org_id, user_id from public.memberships where role = 'owner' order by org_id, created_at) o
 where j.org_id = o.org_id and j.assigned_to is null;
