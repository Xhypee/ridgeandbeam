-- Claude chat history: each person's conversations with Claude, kept like Claude does (a list of past chats to
-- go back to). Private to the person who had the chat. A chat started on a job, contact or supplier remembers it,
-- so that sidebar lists its own chats; general chats (Jobs / Contacts with nothing open) have none.
create table if not exists public.ai_chats (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  contact_id uuid,
  supplier_id uuid,
  title text not null default 'Chat' check (length(title) <= 120),
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_chats_user_recent on public.ai_chats (user_id, org_id, updated_at desc);

alter table public.ai_chats enable row level security;
drop policy if exists ai_chats_own on public.ai_chats;
create policy ai_chats_own on public.ai_chats for all
  using (user_id = auth.uid() and public.is_org_member(org_id))
  with check (user_id = auth.uid() and public.is_org_member(org_id));
