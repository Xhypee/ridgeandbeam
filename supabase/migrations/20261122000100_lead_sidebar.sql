-- New-lead sidebar: when the inspection is booked, and why a lead didn't go ahead.
-- Call attempts with no answer are job_events (kind 'call_no_answer', not shown to the homeowner).
alter table public.jobs
  add column if not exists inspection_at timestamptz,
  add column if not exists lost_reason text check (lost_reason is null or lost_reason in ('price', 'competitor', 'not_ready', 'no_response', 'out_of_area', 'not_a_fit', 'other'));

comment on column public.jobs.inspection_at is 'Booked roof inspection (set from the New lead sidebar).';
comment on column public.jobs.lost_reason is 'Why the lead or quote did not go ahead (set when marked lost).';
