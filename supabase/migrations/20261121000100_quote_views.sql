-- Quoting: each time the customer opens their quote page (not the office previewing it), and when we last
-- sent them a reminder. Views are counted at most once per 30 minutes so a refresh isn't "opened again".
alter table public.estimates
  add column if not exists view_count integer not null default 0,
  add column if not exists first_viewed_at timestamptz,
  add column if not exists last_viewed_at timestamptz,
  add column if not exists reminded_at timestamptz;

create or replace function public.log_estimate_view(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update estimates
     set view_count = view_count + 1,
         first_viewed_at = coalesce(first_viewed_at, now()),
         last_viewed_at = now()
   where public_token = p_token and status = 'sent'
     and (last_viewed_at is null or last_viewed_at < now() - interval '30 minutes');
end $$;
revoke all on function public.log_estimate_view(text) from public;
grant execute on function public.log_estimate_view(text) to anon, authenticated;
