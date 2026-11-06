-- State compliance (C2): per-job compliance checklist ticks + evidence, and the job facts the
-- Australian state rules engine (src/lib/au-rules.ts) needs. Additive only.

-- Checklist ticks: one row per job per checklist item. Items themselves are computed in the app from
-- the job's state, value and date; this table stores what a person ticked and the evidence.
create table if not exists public.job_compliance_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  item_key text not null check (item_key ~ '^[a-z0-9_]{2,60}$'),
  status text not null default 'todo' check (status in ('done', 'todo', 'not_needed')),
  note text check (note is null or length(note) <= 1000),
  reference text check (reference is null or length(reference) <= 200),   -- e.g. certificate / policy number
  file_id uuid references public.job_files(id) on delete set null,        -- evidence (certificate, SWMS, guide receipt)
  updated_by uuid references auth.users(id) on delete set null,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, item_key)
);
create index if not exists job_compliance_items_org on public.job_compliance_items (org_id);
create index if not exists job_compliance_items_file on public.job_compliance_items (file_id) where file_id is not null;

-- Facts about the job that change which rules apply (owner-occupier, permit needed, built before 1990 ...).
create table if not exists public.job_compliance_profiles (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  roof_system text check (roof_system is null or roof_system in ('metal', 'concrete_tile', 'terracotta_tile', 'membrane')),
  au_job_type text check (au_job_type is null or au_job_type in ('re_roof', 'restoration', 'repair', 'gutters', 'asbestos_replacement', 'new_build', 'other')),
  owner_occupier boolean not null default true,
  existing_house boolean not null default true,
  building_approval_required boolean,          -- null = not decided yet
  built_before_1990 boolean,                    -- null = unknown
  door_knock_sale boolean,                      -- null = follow jobs.lead_source
  urgent_work boolean not null default false,
  paint_or_coat_only boolean not null default false,
  mixed_work boolean not null default false,
  subcontract boolean not null default false,
  disaster_emergency_repair boolean not null default false,
  contract_copy_given_on date,                  -- starts most state cooling-off periods
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists job_compliance_profiles_org on public.job_compliance_profiles (org_id);

alter table public.job_compliance_items enable row level security;
alter table public.job_compliance_profiles enable row level security;

drop policy if exists job_compliance_items_member on public.job_compliance_items;
create policy job_compliance_items_member on public.job_compliance_items
  for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
drop policy if exists job_compliance_profiles_member on public.job_compliance_profiles;
create policy job_compliance_profiles_member on public.job_compliance_profiles
  for all using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- Same-org guards: the job and the evidence file must belong to the row's organization.
drop trigger if exists t_org on public.job_compliance_items;
create trigger t_org before insert or update on public.job_compliance_items
  for each row execute function public.check_parent_org('jobs', 'job_id');
drop trigger if exists t_org_file on public.job_compliance_items;
create trigger t_org_file before insert or update on public.job_compliance_items
  for each row execute function public.check_parent_org('job_files', 'file_id');
drop trigger if exists t_touch on public.job_compliance_items;
create trigger t_touch before update on public.job_compliance_items
  for each row execute function public.touch_updated_at();

drop trigger if exists t_org on public.job_compliance_profiles;
create trigger t_org before insert or update on public.job_compliance_profiles
  for each row execute function public.check_parent_org('jobs', 'job_id');
drop trigger if exists t_touch on public.job_compliance_profiles;
create trigger t_touch before update on public.job_compliance_profiles
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete on public.job_compliance_items, public.job_compliance_profiles to authenticated;
