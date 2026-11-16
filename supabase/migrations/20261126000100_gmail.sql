-- Gmail: a company connects its Gmail so customer emails go out from their own address (and land in their Sent
-- folder), and customers' replies come back into the app, threaded and linked to the customer and job.

alter table public.integrations drop constraint if exists integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check check (provider in ('xero', 'quickbooks', 'gmail'));

alter table public.messages add column if not exists thread_ref text;      -- Gmail thread id
alter table public.messages add column if not exists rfc_message_id text;  -- Message-ID header, for In-Reply-To
alter table public.messages add column if not exists read_at timestamptz;  -- inbound: when someone in the office opened it

-- One row per Gmail message per company (sync can run again without duplicating).
create unique index if not exists messages_org_gmail_ref on public.messages (org_id, provider_ref) where channel = 'email' and provider_ref like 'gmail:%';
create index if not exists messages_org_thread on public.messages (org_id, thread_ref) where thread_ref is not null;
create index if not exists messages_unread on public.messages (org_id) where direction = 'inbound' and read_at is null;
