-- The quote margin sticks: the last margin someone set on a quote becomes the margin new quotes are priced at,
-- until they change it again. Anyone who can see money (everyone but crew leads) sets it from a quote, so it goes
-- through a small function rather than the admin-only organisations update.
alter table public.organizations
  add column if not exists quote_margin_pct numeric(5,2) check (quote_margin_pct is null or (quote_margin_pct >= 0 and quote_margin_pct < 95));

create or replace function public.set_quote_margin(p_org uuid, p_pct numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from memberships where org_id = p_org and user_id = auth.uid() and role <> 'crew_lead') then
    raise exception 'not allowed';
  end if;
  if p_pct is null or p_pct < 0 or p_pct >= 95 then
    raise exception 'margin out of range';
  end if;
  update organizations set quote_margin_pct = round(p_pct, 2) where id = p_org;
end;
$$;

revoke all on function public.set_quote_margin(uuid, numeric) from public, anon;
grant execute on function public.set_quote_margin(uuid, numeric) to authenticated;
