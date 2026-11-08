-- Wrapping up: when the handover pack (warranty + photos) went to the customer, and when the job was closed
-- (closed jobs leave the Jobs board). The company's workmanship warranty length goes on the certificate.
alter table public.jobs
  add column if not exists handover_sent_at timestamptz,
  add column if not exists closed_at timestamptz;
alter table public.organizations
  add column if not exists workmanship_years integer not null default 7 check (workmanship_years between 0 and 25);
