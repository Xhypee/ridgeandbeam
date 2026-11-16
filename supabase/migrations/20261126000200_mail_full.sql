-- Inbox: keep the whole email (signature and quoted history) next to the short version shown in the chat, and
-- the files attached to it (name, size, type and Gmail's attachment id to download it on demand).
alter table public.messages add column if not exists full_body text;
alter table public.messages add column if not exists attachments jsonb;
