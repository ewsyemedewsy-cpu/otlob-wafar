-- Emad Store V15 — Paymob payments + notification outbox
-- Run after V14 schema.

create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  provider text not null default 'paymob',
  provider_payment_id text,
  provider_order_id text,
  intention_id text,
  amount numeric(14,2) not null,
  currency text not null default 'EGP',
  status text not null default 'pending' check (status in ('pending','requires_action','authorized','paid','failed','refunded','partially_refunded','cancelled')),
  checkout_url text,
  client_secret text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_event_log (
  provider text not null,
  event_id text not null,
  order_id uuid references public.orders(id) on delete set null,
  payment_intent_id uuid references public.payment_intents(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (provider, event_id)
);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp','email','sms')),
  event_type text not null,
  order_id uuid references public.orders(id) on delete cascade,
  recipient text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','cancelled')),
  attempts integer not null default 0,
  provider_message_id text,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_event_log_order_idx on public.payment_event_log(order_id);
create index if not exists notification_outbox_due_idx on public.notification_outbox(status, next_attempt_at);
create unique index if not exists notification_outbox_event_once_idx
  on public.notification_outbox(channel, event_type, order_id)
  where order_id is not null and status <> 'cancelled';

alter table public.orders add column if not exists payment_status text default 'unpaid';
alter table public.orders add column if not exists payment_provider text;
alter table public.orders add column if not exists payment_intent_id uuid;
alter table public.orders add column if not exists payment_transaction_id text;
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists payment_metadata jsonb not null default '{}'::jsonb;

create or replace function public.enqueue_notification(
  p_channel text,
  p_event_type text,
  p_order_id uuid,
  p_recipient text,
  p_payload jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  insert into public.notification_outbox(channel,event_type,order_id,recipient,payload)
  values (p_channel,p_event_type,p_order_id,p_recipient,coalesce(p_payload,'{}'::jsonb))
  on conflict (channel,event_type,order_id) where order_id is not null and status <> 'cancelled'
  do nothing
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on table public.payment_intents from anon, authenticated;
revoke all on table public.payment_event_log from anon, authenticated;
revoke all on table public.notification_outbox from anon, authenticated;
revoke all on function public.enqueue_notification(text,text,uuid,text,jsonb) from public;
grant execute on function public.enqueue_notification(text,text,uuid,text,jsonb) to service_role;

-- V15 intentionally does not invent customer auto-debit rules.
-- Payment callbacks update order payment state only after authenticated Paymob verification.
