create extension if not exists pgcrypto;
create table if not exists categories(id uuid primary key default gen_random_uuid(),name_ar text not null unique,slug text not null unique);
create table if not exists suppliers(id uuid primary key default gen_random_uuid(),name text not null,whatsapp_phone text not null,active boolean not null default true,created_at timestamptz not null default now());
create table if not exists products(id uuid primary key default gen_random_uuid(),sku text not null unique,title_ar text not null,category_id uuid references categories(id),image_url text,retail_price numeric(12,2) not null default 0,supplier_cost numeric(12,2) not null,available boolean not null default true,supplier_id uuid references suppliers(id),pricing_updated_at timestamptz,pricing_mode text not null default 'normal',created_at timestamptz not null default now());
alter table public.products add column if not exists pricing_mode text not null default 'normal';
create table if not exists competitors_pricing(id bigserial primary key,product_id uuid not null references products(id) on delete cascade,competitor text not null check(competitor in('amazon','noon','btech')),price numeric(12,2) not null,source_url text,observed_at timestamptz not null default now());

-- V7 pricing engine: normal 5% profit + 0.5% risk reserve; emergency 3% + 0.5%.
create table if not exists pricing_history(
  id bigserial primary key, product_id uuid not null references products(id) on delete cascade,
  competitor_min numeric(12,2), target_price numeric(12,2), final_price numeric(12,2) not null,
  base_cost numeric(12,2) not null, risk_reserve numeric(12,2) not null,
  profit_rate numeric(8,5) not null, pricing_mode text not null, reason text,
  created_at timestamptz not null default now()
);
create index if not exists pricing_history_product_idx on pricing_history(product_id,created_at desc);

create table if not exists orders(id uuid primary key default gen_random_uuid(),order_number text not null unique default ('EM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),customer_name text not null,whatsapp_phone text not null,governorate text not null,address text not null,payment_method text not null,subtotal numeric(12,2) not null,shipping_fee numeric(12,2) not null,total numeric(12,2) not null,status text not null default 'pending',payment_status text not null default 'unpaid',payment_provider text,bosta_awb text,whatsapp_dispatch_status text not null default 'pending',created_at timestamptz not null default now());
create table if not exists order_items(id bigserial primary key,order_id uuid not null references orders(id) on delete cascade,product_id uuid not null references products(id),quantity integer not null check(quantity>0),unit_price numeric(12,2) not null,supplier_cost_snapshot numeric(12,2) not null,profit_snapshot numeric(12,2) not null,
  risk_reserve_snapshot numeric(12,2) not null default 0,
  pricing_mode_snapshot text not null default 'normal');
create or replace function create_order_secure(p_customer_name text,p_whatsapp_phone text,p_governorate text,p_address text,p_payment_method text,p_items jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order orders; v_sub numeric:=0; v_ship numeric; x jsonb; v_product products; v_qty int; v_unit numeric; v_profit numeric; v_risk numeric; v_mode text;begin
  if p_payment_method not in ('cod','wallet') then raise exception 'invalid payment method'; end if;
  v_ship:=case p_governorate when 'FAYOUM' then 35 when 'CAIRO' then 50 when 'GIZA' then 50 when 'ALEXANDRIA' then 60 when 'DELTA_CANAL' then 65 when 'UPPER_EGYPT' then 75 else 75 end;
  for x in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id=(x->>'product_id')::uuid and available=true for update;
    if not found then raise exception 'product unavailable'; end if;
    v_qty:=greatest(1,least(100,(x->>'quantity')::int)); v_unit:=v_product.retail_price; v_risk:=v_product.supplier_cost*0.005;
    if v_unit < ceil(v_product.supplier_cost*1.035) then raise exception 'price_below_emergency_floor'; end if;
    v_profit:=(v_unit-v_product.supplier_cost-v_risk)*v_qty;
    v_sub:=v_sub+v_unit*v_qty;
  end loop;
  insert into orders(customer_name,whatsapp_phone,governorate,address,payment_method,subtotal,shipping_fee,total) values(p_customer_name,p_whatsapp_phone,p_governorate,p_address,p_payment_method,v_sub,v_ship,v_sub+v_ship) returning * into v_order;
  for x in select * from jsonb_array_elements(p_items) loop
    select * into v_product from products where id=(x->>'product_id')::uuid; v_qty:=greatest(1,least(100,(x->>'quantity')::int)); v_risk:=v_product.supplier_cost*0.005;
    v_mode:=case when v_product.retail_price < ceil(v_product.supplier_cost*1.055) then 'emergency' else 'normal' end;
    v_profit:=(v_product.retail_price-v_product.supplier_cost-v_risk)*v_qty;
    insert into order_items(order_id,product_id,quantity,unit_price,supplier_cost_snapshot,profit_snapshot,risk_reserve_snapshot,pricing_mode_snapshot) values(v_order.id,v_product.id,v_qty,v_product.retail_price,v_product.supplier_cost,v_profit,v_risk*v_qty,v_mode);
  end loop;
  return jsonb_build_object('id',v_order.id,'order_number',v_order.order_number,'total',v_order.total);
end$$;
alter table products enable row level security;alter table suppliers enable row level security;alter table orders enable row level security;alter table order_items enable row level security;alter table competitors_pricing enable row level security;
create policy public_products on products for select using(available=true);
create policy public_categories on categories for select using(true);
create policy public_competitors on competitors_pricing for select using(true);
-- Never expose supplier_cost/supplier_id through a public view; use a dedicated public product view.
create or replace view public_products as select id,sku,title_ar,category_id,image_url,retail_price,available from products where available=true;
revoke all on public.public_products from anon, authenticated;
grant select on public.public_products to anon, authenticated;

revoke all on function create_order_secure(text,text,text,text,text,jsonb) from public;
grant execute on function create_order_secure(text,text,text,text,text,jsonb) to anon, authenticated;

-- Production hardening: sensitive tables are not reachable by browser roles.
revoke all on table public.suppliers from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on table public.competitors_pricing from anon, authenticated;
revoke all on table public.products from anon, authenticated;
revoke all on table public.categories from anon, authenticated;
grant select on public.categories to anon, authenticated;

-- Public comparison response intentionally excludes supplier cost, supplier identity and profit.
create or replace function public_price_compare(p_product_id uuid)
returns table(competitor text, price numeric, our_price numeric, savings numeric)
language sql stable security definer set search_path=public as $$
  select cp.competitor, cp.price, p.retail_price, greatest(cp.price - p.retail_price,0)
  from public.competitors_pricing cp
  join public.products p on p.id=cp.product_id
  where cp.product_id=p_product_id and p.available=true
  order by cp.price asc;
$$;
revoke all on function public_price_compare(uuid) from public;
grant execute on function public_price_compare(uuid) to anon, authenticated;


-- Production controls
create table if not exists order_idempotency(
  idempotency_key text primary key,
  order_id uuid not null references orders(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists payment_events(
  provider text not null,
  event_id text not null,
  order_id uuid references orders(id) on delete set null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key(provider,event_id)
);
create table if not exists shipments(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references orders(id) on delete cascade,
  provider text not null default 'bosta',
  provider_awb text,
  status text not null default 'pending',
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists audit_log(
  id bigserial primary key,
  actor text not null,
  action text not null,
  entity text,
  entity_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists orders_created_idx on orders(created_at desc);
create index if not exists orders_status_idx on orders(status,payment_status);
create index if not exists payment_events_order_idx on payment_events(order_id);

revoke all on order_idempotency, payment_events, shipments, audit_log, pricing_history from anon, authenticated;
