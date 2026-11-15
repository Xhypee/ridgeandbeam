-- Job record: plan revisions and what Claude read off a document (an Applicad roof report's numbers), and the
-- homeowner signing off the finished roof from their project page (/p/<token>) instead of only on site.

alter table public.job_files add column if not exists revision text check (revision is null or length(revision) <= 40);
alter table public.job_files add column if not exists superseded_at timestamptz;
alter table public.job_files add column if not exists meta jsonb;

-- Sign off the finished roof online. Only once the job is finished and only once; records who and when (and the
-- device's IP on the job's timeline) like the on-site walkthrough does.
create or replace function public.sign_public_walkthrough(p_token text, p_name text, p_signature text, p_ip text default null, p_user_agent text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.jobs%rowtype;
  v_name text := left(trim(coalesce(p_name, '')), 200);
begin
  if p_token is null or length(p_token) < 10 or length(v_name) < 2
     or p_signature is null or p_signature not like 'data:image/png;base64,%' or length(p_signature) > 400000 then
    return false;
  end if;
  select * into v_job from public.jobs where public_token = p_token;
  if not found or v_job.stage not in ('completed', 'paid') or v_job.walkthrough_signed_at is not null then
    return false;
  end if;
  update public.jobs set walkthrough_signed_at = now(), walkthrough_name = v_name, walkthrough_signature = p_signature where id = v_job.id;
  insert into public.job_events (org_id, job_id, kind, note, created_by_name, visible_to_homeowner)
  values (v_job.org_id, v_job.id, 'walkthrough_signed',
          'Signed off online by ' || v_name || coalesce(' · ' || left(p_ip, 60), '') || coalesce(' · ' || left(p_user_agent, 120), ''),
          v_name, true);
  return true;
end;
$$;

revoke all on function public.sign_public_walkthrough(text, text, text, text, text) from public;
grant execute on function public.sign_public_walkthrough(text, text, text, text, text) to anon, authenticated;
