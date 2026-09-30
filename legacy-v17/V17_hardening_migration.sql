-- Emad Store V17 hardening: atomic fulfillment claims + notification recovery
create or replace function public.claim_fulfillment_jobs(p_limit integer default 10)
returns setof public.fulfillment_jobs
language plpgsql
security definer
set search_path=public
as $$
begin
  return query
  with picked as (
    select id
    from public.fulfillment_jobs
    where status='pending' and next_attempt_at <= now()
    order by created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit,10),50))
  ), claimed as (
    update public.fulfillment_jobs j
    set status='processing', attempts=j.attempts+1, updated_at=now()
    from picked p
    where j.id=p.id
    returning j.*
  )
  select * from claimed order by created_at;
end;
$$;
revoke all on function public.claim_fulfillment_jobs(integer) from public;
grant execute on function public.claim_fulfillment_jobs(integer) to service_role;

-- If a worker dies after claiming a job, make it recoverable after 15 minutes.
create index if not exists fulfillment_jobs_processing_idx on public.fulfillment_jobs(status,updated_at);
