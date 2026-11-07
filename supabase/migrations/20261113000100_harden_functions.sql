-- Hardening before going live (Supabase security advisor findings).

-- 1. The original 2-argument "accept quote" function accepted a quote from its link with just a
--    typed name: no signature, no frozen state notices, no extras/colour/version checks. The app
--    uses the full version; the 7- and 8-argument versions only forward to it. Remove the old one.
drop function if exists public.accept_public_estimate(text, text);

-- 2. Trigger functions are never meant to be called through the API.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- 3. Pin search_path on functions that didn't set it.
alter function public.touch_updated_at() set search_path = public;
alter function public.jobs_stage_tracking() set search_path = public;
alter function public.claims_stage_tracking() set search_path = public;
alter function public.org_is_live(public.organizations) set search_path = public;
alter function public.invoice_totals(public.invoices) set search_path = public;
alter function public.docket_colours() set search_path = public;
alter function public.colour_finish(text) set search_path = public;
alter function public.estimates_bump_version() set search_path = public;
