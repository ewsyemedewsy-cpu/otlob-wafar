-- EMAD STORE V17 PRODUCTION UPGRADE
-- Existing V7-V16 project. Re-runnable. Does not delete existing orders/products.
-- Do not put Paymob/Bosta/WhatsApp secrets in this file.

create extension if not exists pgcrypto;

alter table if exists public.orders
  add column if not exists delivery_outcome text,
  add column if not exists non_delivery_reason text,
  add column if not exists actual_shipping_cost numeric(12,2),
  add column if not exists return_shipping_cost numeric(12,2),
  add column if not exists shipping_claim_amount numeric(12,2),
  add column if not exists shipping_claim_status text default 'not_applicable',
  add column if not exists payment_provider text,
  add column if not exists payment_status text default 'unpaid',
  add column if not exists bosta_awb text;

create index if not exists orders_awb_idx on public.orders(bosta_awb);

create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  provider text not null default 'paymob',
  provider_payment_id text,
  provider_order_id text,
  amount numeric(12,2) not null,
  currency text not null default 'EGP',
  status text not null default 'pending'
    check (status in ('pending','requires_action','authorized','paid','failed','refunded','partially_refunded','cancelled')),
  checkout_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_intents_provider_idx
  on public.payment_intents(provider, provider_payment_id);

create table if not exists public.payment_event_log (
  provider text not null,
  event_id text not null,
  order_id uuid references public.orders(id) on delete set null,
  payment_id uuid references public.payment_intents(id) on delete set null,
  event_type text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(provider, event_id)
);

create index if not exists payment_event_log_order_idx
  on public.payment_event_log(order_id);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('whatsapp','email','sms')),
  event_type text not null,
  order_id uuid references public.orders(id) on delete cascade,
  recipient text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','processing','sent','failed','cancelled')),
  attempts integer not null default 0,
  provider_message_id text,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_outbox_due_idx
  on public.notification_outbox(status, next_attempt_at);

create unique index if not exists notification_outbox_event_order_uq
  on public.notification_outbox(channel,event_type,order_id)
  where order_id is not null and status <> 'cancelled';

create table if not exists public.fulfillment_queue (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  provider text not null default 'bosta',
  status text not null default 'pending'
    check (status in ('pending','processing','completed','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  locked_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fulfillment_queue_due_idx
  on public.fulfillment_queue(status,next_attempt_at);

create table if not exists public.integration_events (
  provider text not null,
  event_id text not null,
  event_type text,
  order_id uuid references public.orders(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(provider,event_id)
);

create index if not exists integration_events_order_idx
  on public.integration_events(order_id);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  provider text not null default 'bosta',
  provider_awb text,
  status text not null default 'pending',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shipments_awb_idx on public.shipments(provider_awb);

create or replace function public.enqueue_notification(
  p_channel text,
  p_event_type text,
  p_order_id uuid,
  p_recipient text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notification_outbox(channel,event_type,order_id,recipient,payload)
  values(p_channel,p_event_type,p_order_id,p_recipient,coalesce(p_payload,'{}'::jsonb))
  on conflict (channel,event_type,order_id)
  where order_id is not null and status <> 'cancelled'
  do nothing
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.enqueue_notification(text,text,uuid,text,jsonb)
  from public, anon, authenticated;

create or replace function public.queue_order_notifications(
  p_order_id uuid,
  p_event text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_order_number text;
  v_total numeric;
begin
  select whatsapp_phone, order_number, total
    into v_phone, v_order_number, v_total
  from public.orders
  where id = p_order_id;

  if v_phone is null then return; end if;

  if p_event in ('order_created','shipped','delivered','returned') then
    perform public.enqueue_notification(
      'whatsapp',
      p_event,
      p_order_id,
      v_phone,
      jsonb_build_object('order_number',v_order_number,'total',v_total)
    );
  end if;
end;
$$;

revoke all on function public.queue_order_notifications(uuid,text)
  from public, anon, authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists payment_intents_updated_at on public.payment_intents;
create trigger payment_intents_updated_at
before update on public.payment_intents
for each row execute function public.set_updated_at();

drop trigger if exists notification_outbox_updated_at on public.notification_outbox;
create trigger notification_outbox_updated_at
before update on public.notification_outbox
for each row execute function public.set_updated_at();

drop trigger if exists fulfillment_queue_updated_at on public.fulfillment_queue;
create trigger fulfillment_queue_updated_at
before update on public.fulfillment_queue
for each row execute function public.set_updated_at();

drop trigger if exists shipments_updated_at on public.shipments;
create trigger shipments_updated_at
before update on public.shipments
for each row execute function public.set_updated_at();

alter table public.payment_intents enable row level security;
alter table public.payment_event_log enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.fulfillment_queue enable row level security;
alter table public.integration_events enable row level security;
alter table public.shipments enable row level security;

revoke all on public.payment_intents from anon, authenticated;
revoke all on public.payment_event_log from anon, authenticated;
revoke all on public.notification_outbox from anon, authenticated;
revoke all on public.fulfillment_queue from anon, authenticated;
revoke all on public.integration_events from anon, authenticated;
revoke all on public.shipments from anon, authenticated;

alter table if exists public.orders
  drop constraint if exists orders_shipping_claim_status_check;

alter table if exists public.orders
  add constraint orders_shipping_claim_status_check
  check (
    shipping_claim_status is null
    or shipping_claim_status in (
      'not_applicable','pending_review','approved',
      'waived','paid','disputed'
    )
  );

-- END OF V17 PRODUCTION UPGRADE
