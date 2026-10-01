-- EMAD STORE V14 — ADMIN / SHIPMENT SECURITY MIGRATION
-- Run after V12/V13 schema.
-- Privileged mutations stay behind Edge Functions; no service/secret key in browser.

create table if not exists public.admin_audit_log(
  id bigserial primary key,
  actor_user_id uuid,
  action text not null,
  order_id uuid references public.orders(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_order_idx
  on public.admin_audit_log(order_id, created_at desc);

create table if not exists public.integration_events(
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
  on public.integration_events(order_id, created_at desc);

alter table public.shipments
  add column if not exists provider_order_id text,
  add column if not exists tracking_url text,
  add column if not exists last_provider_status text,
  add column if not exists last_synced_at timestamptz;

create index if not exists shipments_provider_awb_idx
  on public.shipments(provider, provider_awb);

-- Keep these tables inaccessible directly to public/anon roles.
revoke all on public.admin_audit_log from anon, authenticated;
revoke all on public.integration_events from anon, authenticated;

-- Helper used by the Edge Function only.
create or replace function public.admin_list_orders(
  p_q text default null,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid,
  order_number text,
  customer_name text,
  whatsapp_phone text,
  governorate text,
  address text,
  payment_method text,
  subtotal numeric,
  shipping_fee numeric,
  total numeric,
  status text,
  payment_status text,
  bosta_awb text,
  delivery_outcome text,
  shipping_claim_amount numeric,
  shipping_claim_status text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select o.id,o.order_number,o.customer_name,o.whatsapp_phone,o.governorate,o.address,
         o.payment_method,o.subtotal,o.shipping_fee,o.total,o.status,o.payment_status,
         o.bosta_awb,o.delivery_outcome,o.shipping_claim_amount,o.shipping_claim_status,
         o.created_at
  from public.orders o
  where
    (nullif(trim(p_q),'') is null
      or o.order_number ilike '%'||trim(p_q)||'%'
      or o.customer_name ilike '%'||trim(p_q)||'%'
      or o.whatsapp_phone ilike '%'||trim(p_q)||'%')
    and (nullif(trim(p_status),'') is null or o.status = trim(p_status))
  order by o.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),100))
  offset greatest(0,coalesce(p_offset,0));
$$;

revoke all on function public.admin_list_orders(text,text,integer,integer) from public, anon, authenticated;

-- Ensure shipment table has safe provider states.
alter table public.shipments
  drop constraint if exists shipments_status_check;
alter table public.shipments
  add constraint shipments_status_check check (
    status in ('pending','created','picked_up','in_transit',
               'out_for_delivery','delivered','returned','cancelled','failed')
  );

-- V14 policy notes:
-- 1) Browser uses only publishable/anon key + authenticated user session.
-- 2) Admin mutations are Edge Function only.
-- 3) BOSTA_API_KEY and Supabase secret key are Edge Function secrets.
