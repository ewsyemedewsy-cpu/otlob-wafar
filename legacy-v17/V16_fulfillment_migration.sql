-- Emad Store V16: paid-order fulfillment queue + shipment notification events
create table if not exists public.fulfillment_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','created','failed','cancelled')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fulfillment_jobs_due_idx on public.fulfillment_jobs(status,next_attempt_at);
revoke all on table public.fulfillment_jobs from anon, authenticated;

create or replace function public.enqueue_fulfillment_for_paid_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid;
begin
  insert into public.fulfillment_jobs(order_id,status,next_attempt_at)
  values(p_order_id,'pending',now())
  on conflict(order_id) do update set
    status=case when fulfillment_jobs.status='failed' then 'pending' else fulfillment_jobs.status end,
    next_attempt_at=now(), updated_at=now();
  select id into v_id from public.fulfillment_jobs where order_id=p_order_id;
  return v_id;
end;
$$;
revoke all on function public.enqueue_fulfillment_for_paid_order(uuid) from public;
grant execute on function public.enqueue_fulfillment_for_paid_order(uuid) to service_role;
