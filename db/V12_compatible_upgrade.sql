-- Add missing legacy columns without changing old rows or inventing acceptance.
alter table public.orders add column if not exists policy_version text;
alter table public.orders add column if not exists policy_accepted_at timestamptz;
alter table public.orders add column if not exists policy_snapshot text;
alter table public.orders add column if not exists delivery_failure_reason text;
alter table public.orders add column if not exists shipping_cost_actual numeric(12,2);
alter table public.orders add column if not exists return_shipping_cost_actual numeric(12,2);
alter table public.orders add column if not exists non_delivery_charge numeric(12,2);
alter table public.orders add column if not exists non_delivery_charge_status text default 'none';
alter table public.orders add column if not exists delivery_outcome text default 'pending';
alter table public.orders add column if not exists non_delivery_reason text;
alter table public.orders add column if not exists actual_shipping_cost numeric(12,2);
alter table public.orders add column if not exists return_shipping_cost numeric(12,2);
alter table public.orders add column if not exists shipping_claim_amount numeric(12,2) default 0;
alter table public.orders add column if not exists shipping_claim_status text default 'not_applicable';
-- EMAD STORE V9 - SAFE / RE-RUNNABLE SUPABASE SCHEMA
-- Normal: 5% profit + 0.5% risk reserve
-- Emergency: 3% profit + 0.5% risk reserve ONLY for an approved customer product request
-- This script is designed to be safely re-run after a partial execution.

create extension if not exists pgcrypto;

create table if not exists public.categories(
  id uuid primary key default gen_random_uuid(),
  name_ar text not null unique,
  slug text not null unique
);

create table if not exists public.suppliers(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  whatsapp_phone text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products(
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  title_ar text not null,
  category_id uuid references public.categories(id),
  image_url text,
  retail_price numeric(12,2) not null default 0,
  supplier_cost numeric(12,2) not null,
  available boolean not null default true,
  supplier_id uuid references public.suppliers(id),
  pricing_updated_at timestamptz,
  pricing_mode text not null default 'normal',
  created_at timestamptz not null default now()
);

alter table public.products
  add column if not exists pricing_mode text not null default 'normal';

create table if not exists public.competitors_pricing(
  id bigserial primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  competitor text not null check(competitor in('amazon','noon','btech')),
  price numeric(12,2) not null,
  source_url text,
  observed_at timestamptz not null default now()
);

create table if not exists public.pricing_history(
  id bigserial primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  competitor_min numeric(12,2),
  target_price numeric(12,2),
  final_price numeric(12,2) not null,
  base_cost numeric(12,2) not null,
  risk_reserve numeric(12,2) not null,
  profit_rate numeric(8,5) not null,
  pricing_mode text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists pricing_history_product_idx
  on public.pricing_history(product_id,created_at desc);

create table if not exists public.store_policies(
  version text primary key, policy_type text not null, title text not null, body text not null,
  active boolean not null default false, created_at timestamptz not null default now()
);
insert into public.store_policies(version,policy_type,title,body,active) values(
 'shipping-v1','shipping_non_delivery','سياسة التوصيل وعدم الاستلام',
 'أوافق على مراجعة سياسة التوصيل والاستلام والاسترجاع. وفي حال عدم استلام الطلب أو رفضه دون سبب قانوني، يجوز للمتجر المطالبة بتكاليف الشحن الفعلية التي تكبدها، وفقًا للقانون والسياسة المعلنة. ولا تُفرض هذه التكاليف إذا كان سبب عدم الاستلام راجعًا إلى خطأ من المتجر أو عيب أو تلف في المنتج أو سبب يمنح العميل حقًا قانونيًا في الإرجاع أو الرفض.',true
) on conflict(version) do update set body=excluded.body,active=excluded.active;

create table if not exists public.orders(
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default
    ('EM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  customer_name text not null,
  whatsapp_phone text not null,
  governorate text not null,
  address text not null,
  payment_method text not null,
  subtotal numeric(12,2) not null,
  shipping_fee numeric(12,2) not null,
  total numeric(12,2) not null,
  policy_version text not null,
  policy_accepted_at timestamptz not null,
  policy_snapshot text not null,
  delivery_failure_reason text,
  shipping_cost_actual numeric(12,2),
  return_shipping_cost_actual numeric(12,2),
  non_delivery_charge numeric(12,2),
  non_delivery_charge_status text not null default 'none'
    check(non_delivery_charge_status in('none','pending_review','approved','waived','settled')),
  status text not null default 'pending',
  payment_status text not null default 'unpaid',
  payment_provider text,
  bosta_awb text,
  whatsapp_dispatch_status text not null default 'pending',
  created_at timestamptz not null default now(),
  delivery_outcome text not null default 'pending',
  non_delivery_reason text,
  actual_shipping_cost numeric(12,2),
  return_shipping_cost numeric(12,2),
  shipping_claim_amount numeric(12,2) not null default 0,
  shipping_claim_status text not null default 'not_applicable'
    check(shipping_claim_status in('not_applicable','pending_review','approved','waived','paid','disputed'))
);

create table if not exists public.order_items(
  id bigserial primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check(quantity>0),
  unit_price numeric(12,2) not null,
  supplier_cost_snapshot numeric(12,2) not null,
  profit_snapshot numeric(12,2) not null,
  risk_reserve_snapshot numeric(12,2) not null default 0,
  pricing_mode_snapshot text not null default 'normal'
);

create table if not exists public.order_idempotency(
  idempotency_key text primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_events(
  provider text not null,
  event_id text not null,
  order_id uuid references public.orders(id) on delete set null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key(provider,event_id)
);

create table if not exists public.shipments(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  provider text not null default 'bosta',
  provider_awb text,
  status text not null default 'pending',
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create index if not exists shipments_status_idx
  on public.shipments(status,updated_at desc);

create index if not exists orders_delivery_outcome_idx
  on public.orders(delivery_outcome,shipping_claim_status);

create table if not exists public.audit_log(
  id bigserial primary key,
  actor text not null,
  action text not null,
  entity text,
  entity_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.product_requests(
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  customer_name text not null,
  whatsapp_phone text not null,
  status text not null default 'open'
    check(status in('open','found','closed','cancelled')),
  emergency_approved boolean not null default false,
  emergency_approved_by text,
  emergency_approved_at timestamptz,
  emergency_reason text,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists product_requests_phone_idx
  on public.product_requests(whatsapp_phone,created_at desc);

create index if not exists product_requests_product_idx
  on public.product_requests(product_id,created_at desc);

create index if not exists orders_created_idx
  on public.orders(created_at desc);

create index if not exists orders_status_idx
  on public.orders(status,payment_status);

create index if not exists payment_events_order_idx
  on public.payment_events(order_id);

-- Remove only the policies that this script owns, then recreate them cleanly.
drop policy if exists public_products on public.products;
drop policy if exists public_categories on public.categories;
drop policy if exists public_competitors on public.competitors_pricing;

-- RLS on every table created by this script.
alter table public.categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.competitors_pricing enable row level security;
alter table public.pricing_history enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_idempotency enable row level security;
alter table public.payment_events enable row level security;
alter table public.shipments enable row level security;
alter table public.audit_log enable row level security;
alter table public.product_requests enable row level security;

-- Public policies expose only non-sensitive read data.
create policy public_products
  on public.products for select
  using (available=true);

create policy public_categories
  on public.categories for select
  using (true);

create policy public_competitors
  on public.competitors_pricing for select
  using (true);

-- Public product view deliberately excludes supplier identity/cost and profit.
create or replace view public.public_products as
select
  id,
  sku,
  title_ar,
  category_id,
  image_url,
  retail_price,
  available
from public.products
where available=true;

revoke all on public.public_products from anon, authenticated;
grant select on public.public_products to anon, authenticated;

grant select on public.categories to anon, authenticated;

-- Sensitive browser access is explicitly revoked.
revoke all on table public.suppliers from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on table public.products from anon, authenticated;
revoke all on table public.competitors_pricing from anon, authenticated;
revoke all on table public.pricing_history from anon, authenticated;
revoke all on table public.order_idempotency from anon, authenticated;
revoke all on table public.payment_events from anon, authenticated;
revoke all on table public.shipments from anon, authenticated;
revoke all on table public.audit_log from anon, authenticated;
revoke all on table public.product_requests from anon, authenticated;

-- Secure order creation. Supplier cost and profit remain server-side.
create or replace function public.create_order_secure(
  p_customer_name text,
  p_whatsapp_phone text,
  p_governorate text,
  p_address text,
  p_payment_method text,
  p_items jsonb,
  p_policy_version text,
  p_policy_accepted boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_sub numeric := 0;
  v_ship numeric;
  x jsonb;
  v_product public.products;
  v_qty int;
  v_unit numeric;
  v_profit numeric;
  v_risk numeric;
  v_mode text;
  v_request_id uuid;
  v_request public.product_requests;
  v_policy public.store_policies;
begin
  if nullif(trim(p_idempotency_key),'') is null then
    raise exception 'idempotency_key_required';
  end if;

  -- Serialize retries for the same checkout attempt.
  perform pg_advisory_xact_lock(hashtextextended(trim(p_idempotency_key), 0));

  -- If the client retries the same checkout, return the original order.
  select o into v_order
  from public.order_idempotency oi
  join public.orders o on o.id=oi.order_id
  where oi.idempotency_key=trim(p_idempotency_key);

  if found then
    return jsonb_build_object(
      'id',v_order.id,
      'order_number',v_order.order_number,
      'subtotal',v_order.subtotal,
      'shipping_fee',v_order.shipping_fee,
      'total',v_order.total,
      'policy_version',v_order.policy_version,
      'replayed',true
    );
  end if;

  if nullif(trim(p_customer_name),'') is null
     or nullif(trim(p_whatsapp_phone),'') is null
     or nullif(trim(p_governorate),'') is null
     or nullif(trim(p_address),'') is null then
    raise exception 'customer_data_required';
  end if;

  if p_payment_method not in ('cod','wallet') then
    raise exception 'invalid payment method';
  end if;

  if coalesce(p_policy_accepted,false) is not true then raise exception 'shipping_policy_acceptance_required'; end if;
  select * into v_policy from public.store_policies
   where version=coalesce(nullif(trim(p_policy_version),''),'shipping-v1')
     and policy_type='shipping_non_delivery' and active=true;
  if not found then raise exception 'invalid_or_inactive_policy_version'; end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'order_items_required';
  end if;

  v_ship := case upper(trim(p_governorate))
    when 'FAYOUM' then 35
    when 'CAIRO' then 50
    when 'GIZA' then 50
    when 'ALEXANDRIA' then 60
    when 'DELTA_CANAL' then 65
    when 'UPPER_EGYPT' then 75
    else 75
  end;

  for x in select * from jsonb_array_elements(p_items) loop
    if (x->>'product_id') is null then
      raise exception 'product_id_required';
    end if;

    select * into v_product
    from public.products
    where id=(x->>'product_id')::uuid
      and available=true
    for update;

    if not found then
      raise exception 'product unavailable';
    end if;

    v_qty := greatest(1,least(100,coalesce((x->>'quantity')::int,1)));
    v_unit := v_product.retail_price;
    v_risk := v_product.supplier_cost*0.005;

    /*
      NORMAL RULE:
      5% profit + 0.5% risk reserve = 5.5% above supplier cost.
      Emergency is NOT selected by price alone.
    */
    if v_unit < ceil(v_product.supplier_cost*1.055*100)/100 then
      v_request_id := nullif(x->>'request_id','')::uuid;

      if v_request_id is null then
        raise exception 'normal_price_rule_not_met_emergency_request_required';
      end if;

      select * into v_request
      from public.product_requests
      where id=v_request_id
        and product_id=v_product.id
        and status='found'
        and emergency_approved=true
        and used_at is null
        and whatsapp_phone=trim(p_whatsapp_phone)
      for update;

      if not found then
        raise exception 'invalid_emergency_authorization';
      end if;

      /*
        EMERGENCY EXCEPTION:
        Only an approved customer product request can use
        3% profit + 0.5% risk reserve.
      */
      if v_unit < ceil(v_product.supplier_cost*1.035*100)/100 then
        raise exception 'price_below_emergency_floor';
      end if;

      v_mode := 'emergency';
    else
      v_mode := 'normal';
    end if;

    v_profit := (v_unit-v_product.supplier_cost-v_risk)*v_qty;
    v_sub := v_sub+v_unit*v_qty;
  end loop;

  insert into public.orders(
    customer_name,whatsapp_phone,governorate,address,payment_method,
    subtotal,shipping_fee,total,policy_version,policy_accepted_at,policy_snapshot
  )
  values(
    trim(p_customer_name),trim(p_whatsapp_phone),trim(p_governorate),
    trim(p_address),p_payment_method,v_sub,v_ship,v_sub+v_ship,
    v_policy.version,now(),v_policy.body
  )
  returning * into v_order;

  insert into public.order_idempotency(idempotency_key,order_id)
  values(trim(p_idempotency_key),v_order.id);

  for x in select * from jsonb_array_elements(p_items) loop
    select * into v_product
    from public.products
    where id=(x->>'product_id')::uuid;

    v_qty := greatest(1,least(100,coalesce((x->>'quantity')::int,1)));
    v_risk := v_product.supplier_cost*0.005;

    if v_product.retail_price < ceil(v_product.supplier_cost*1.055*100)/100 then
      v_mode := 'emergency';
      v_request_id := nullif(x->>'request_id','')::uuid;

      update public.product_requests
      set used_at=now(), status='closed'
      where id=v_request_id
        and product_id=v_product.id
        and status='found'
        and emergency_approved=true
        and used_at is null
        and whatsapp_phone=trim(p_whatsapp_phone);
    else
      v_mode := 'normal';
    end if;

    v_profit :=
      (v_product.retail_price-v_product.supplier_cost-v_risk)*v_qty;

    insert into public.order_items(
      order_id,product_id,quantity,unit_price,
      supplier_cost_snapshot,profit_snapshot,
      risk_reserve_snapshot,pricing_mode_snapshot
    )
    values(
      v_order.id,v_product.id,v_qty,v_product.retail_price,
      v_product.supplier_cost,v_profit,
      v_risk*v_qty,v_mode
    );
  end loop;

  return jsonb_build_object(
    'id',v_order.id,
    'order_number',v_order.order_number,
    'total',v_order.total,
    'policy_version',v_order.policy_version,
    'replayed',false
  );
end;
$$;

revoke all on function public.create_order_secure(text,text,text,text,text,jsonb,text,boolean,text) from public;
grant execute on function public.create_order_secure(text,text,text,text,text,jsonb,text,boolean,text) to anon, authenticated;

-- Remove the older public function signature if V9 was previously installed.
do $$begin if to_regprocedure('public.create_order_secure(text,text,text,text,text,jsonb,text,boolean)') is not null then execute 'revoke all on function public.create_order_secure(text,text,text,text,text,jsonb,text,boolean) from public,anon,authenticated;';end if;end$$;

-- Staff/service-role only: create a customer product request after the item is found.
create or replace function public.register_product_request(
  p_product_id uuid,
  p_customer_name text,
  p_whatsapp_phone text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid;
begin
  insert into public.product_requests(
    product_id,customer_name,whatsapp_phone,status
  )
  values(
    p_product_id,trim(p_customer_name),trim(p_whatsapp_phone),'found'
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.approve_emergency_request(
  p_request_id uuid,
  p_actor text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.product_requests
  set emergency_approved=true,
      emergency_approved_by=trim(p_actor),
      emergency_approved_at=now(),
      emergency_reason=trim(p_reason)
  where id=p_request_id
    and status='found'
    and used_at is null;

  if not found then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.register_product_request(uuid,text,text) from public, anon, authenticated;
revoke all on function public.approve_emergency_request(uuid,text,text) from public, anon, authenticated;

-- Customer-safe invoice data. Supplier cost/profit remain inaccessible.
create or replace function public.get_order_invoice(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select jsonb_build_object(
    'order_number',o.order_number,
    'customer_name',o.customer_name,
    'governorate',o.governorate,
    'address',o.address,
    'payment_method',o.payment_method,
    'subtotal',o.subtotal,
    'shipping_fee',o.shipping_fee,
    'total',o.total,
    'policy_version',o.policy_version,
    'policy_accepted_at',o.policy_accepted_at,
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id',oi.product_id,
        'quantity',oi.quantity,
        'unit_price',oi.unit_price,
        'line_total',round(oi.quantity*oi.unit_price,2)
      ) order by oi.id)
      from public.order_items oi
      where oi.order_id=o.id
    ),'[]'::jsonb)
  )
  from public.orders o
  where o.id=p_order_id;
$$;

revoke all on function public.get_order_invoice(uuid) from public,anon,authenticated;
grant execute on function public.get_order_invoice(uuid) to service_role;

-- Post-order delivery lifecycle. These functions are service-role/admin only.
create or replace function public.record_delivery_outcome(
  p_order_id uuid,
  p_outcome text,
  p_reason text,
  p_actual_shipping_cost numeric,
  p_return_shipping_cost numeric
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_order public.orders;
  v_claim numeric := 0;
begin
  if p_outcome not in ('delivered','refused','unclaimed','returned','cancelled') then
    raise exception 'invalid_delivery_outcome';
  end if;

  if p_actual_shipping_cost is null or p_actual_shipping_cost < 0
     or p_return_shipping_cost is null or p_return_shipping_cost < 0 then
    raise exception 'invalid_shipping_cost';
  end if;

  select * into v_order from public.orders
  where id=p_order_id for update;

  if not found then raise exception 'order_not_found'; end if;

  if p_outcome in ('refused','unclaimed','returned') then
    v_claim := p_actual_shipping_cost + p_return_shipping_cost;
  end if;

  update public.orders
  set delivery_outcome=p_outcome,
      non_delivery_reason=nullif(trim(p_reason),''),
      actual_shipping_cost=p_actual_shipping_cost,
      return_shipping_cost=p_return_shipping_cost,
      shipping_claim_amount=v_claim,
      shipping_claim_status=case
        when p_outcome in ('refused','unclaimed','returned') then 'pending_review'
        else 'not_applicable'
      end,
      status=case
        when p_outcome='delivered' then 'delivered'
        when p_outcome in ('refused','unclaimed','returned') then 'returned'
        when p_outcome='cancelled' then 'cancelled'
        else status
      end
  where id=p_order_id;

  insert into public.audit_log(actor,action,entity,entity_id,metadata)
  values(
    'service_role','delivery_outcome_recorded','order',p_order_id::text,
    jsonb_build_object(
      'outcome',p_outcome,
      'reason',p_reason,
      'actual_shipping_cost',p_actual_shipping_cost,
      'return_shipping_cost',p_return_shipping_cost,
      'claim_amount',v_claim
    )
  );

  return jsonb_build_object(
    'order_id',p_order_id,
    'delivery_outcome',p_outcome,
    'claim_amount',v_claim,
    'claim_status',case when p_outcome in ('refused','unclaimed','returned') then 'pending_review' else 'not_applicable' end
  );
end;
$$;

create or replace function public.review_shipping_claim(
  p_order_id uuid,
  p_decision text,
  p_amount numeric,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_status text;
begin
  if p_decision not in ('approved','waived','disputed','paid') then
    raise exception 'invalid_claim_decision';
  end if;

  if p_amount is null or p_amount < 0 then
    raise exception 'invalid_claim_amount';
  end if;

  select shipping_claim_status into v_status
  from public.orders where id=p_order_id for update;

  if not found then raise exception 'order_not_found'; end if;

  update public.orders
  set shipping_claim_amount=p_amount,
      shipping_claim_status=p_decision
  where id=p_order_id;

  insert into public.audit_log(actor,action,entity,entity_id,metadata)
  values(
    'service_role','shipping_claim_reviewed','order',p_order_id::text,
    jsonb_build_object('decision',p_decision,'amount',p_amount,'reason',p_reason)
  );

  return jsonb_build_object(
    'order_id',p_order_id,
    'claim_status',p_decision,
    'claim_amount',p_amount
  );
end;
$$;

revoke all on function public.record_delivery_outcome(uuid,text,text,numeric,numeric) from public,anon,authenticated;
revoke all on function public.review_shipping_claim(uuid,text,numeric,text) from public,anon,authenticated;
grant execute on function public.record_delivery_outcome(uuid,text,text,numeric,numeric) to service_role;
grant execute on function public.review_shipping_claim(uuid,text,numeric,text) to service_role;


-- Public competitor comparison never returns supplier cost, supplier identity or profit.
create or replace function public.public_price_compare(p_product_id uuid)
returns table(
  competitor text,
  price numeric,
  our_price numeric,
  savings numeric
)
language sql
stable
security definer
set search_path=public
as $$
  select
    cp.competitor,
    cp.price,
    p.retail_price,
    greatest(cp.price-p.retail_price,0)
  from public.competitors_pricing cp
  join public.products p on p.id=cp.product_id
  where cp.id = (
      select c2.id
      from public.competitors_pricing c2
      where c2.product_id=p_product_id
        and c2.competitor=cp.competitor
      order by c2.observed_at desc, c2.id desc
      limit 1
  )
    and p.available=true
  order by cp.price asc;
$$;

revoke all on function public.public_price_compare(uuid) from public;
grant execute on function public.public_price_compare(uuid) to anon, authenticated;

/*
  COMPETITIVE PRICING ENGINE
  Base rule: 5% profit + 0.5% risk reserve.
  If normal margin is above 20%, part of the excess may be used to improve
  customer price advantage; 20% is an optimization trigger, NOT a profit ceiling.
  Emergency 3% + 0.5% is handled only by approved product requests.
*/
create or replace function public.calculate_store_price(p_product_id uuid)
returns numeric
language plpgsql
security definer
set search_path=public
as $$
declare
  p public.products;
  v_comp numeric;
  v_normal numeric;
  v_candidate numeric;
  v_margin numeric;
  v_min_floor numeric;
begin
  select * into p from public.products
  where id=p_product_id and available=true;

  if not found then
    raise exception 'product unavailable';
  end if;

  v_normal := ceil(p.supplier_cost*1.055);
  v_min_floor := v_normal;

  select min(price) into v_comp
  from public.competitors_pricing
  where product_id=p_product_id
    and price > 0;

  if v_comp is null then
    return v_normal;
  end if;

  /*
    Target a small customer advantage when competitors are sufficiently above
    the normal floor. Never cross the normal floor through this optimization.
  */
  v_candidate := ceil(v_comp*0.995);

  if v_candidate < v_normal then
    v_candidate := v_normal;
  end if;

  -- 20% is an optimization trigger, not a profit ceiling.
  -- Release half of the margin above 20% to improve the customer price.
  v_margin := (v_candidate-p.supplier_cost)/nullif(p.supplier_cost,0);
  if v_margin > 0.20 then
    v_candidate := greatest(
      v_normal,
      ceil(p.supplier_cost*(1+v_margin-((v_margin-0.20)*0.50)))
    );
  end if;

  return v_candidate;
end;
$$;

revoke all on function public.calculate_store_price(uuid) from public;
grant execute on function public.calculate_store_price(uuid) to service_role;



-- Delivery failure is recorded with actual costs; no automatic customer debit.
create or replace function public.record_delivery_failure(
  p_order_id uuid, p_reason text, p_shipping_cost_actual numeric, p_return_shipping_cost_actual numeric default 0
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_charge numeric;
begin
  if p_shipping_cost_actual is null or p_shipping_cost_actual<0 or coalesce(p_return_shipping_cost_actual,0)<0 then raise exception 'invalid_shipping_cost'; end if;
  if not exists(select 1 from public.orders where id=p_order_id) then raise exception 'order_not_found'; end if;
  v_charge:=round(p_shipping_cost_actual+coalesce(p_return_shipping_cost_actual,0),2);
  update public.orders set status='delivery_failed', delivery_failure_reason=nullif(trim(p_reason),''),
    shipping_cost_actual=p_shipping_cost_actual, return_shipping_cost_actual=coalesce(p_return_shipping_cost_actual,0),
    non_delivery_charge=v_charge, non_delivery_charge_status=case when v_charge>0 then 'pending_review' else 'none' end
    where id=p_order_id;
  insert into public.audit_log(actor,action,entity,entity_id,metadata) values('service_role','delivery_failure_recorded','orders',p_order_id::text,jsonb_build_object('charge',v_charge,'reason',p_reason));
  return jsonb_build_object('order_id',p_order_id,'status','delivery_failed','charge',v_charge,'charge_status',case when v_charge>0 then 'pending_review' else 'none' end);
end; $$;
revoke all on function public.record_delivery_failure(uuid,text,numeric,numeric) from public,anon,authenticated;
grant execute on function public.record_delivery_failure(uuid,text,numeric,numeric) to service_role;

-- Final explicit deny for sensitive tables/functions.
revoke all on public.suppliers from anon, authenticated;
revoke all on public.orders from anon, authenticated;
revoke all on public.order_items from anon, authenticated;
revoke all on public.pricing_history from anon, authenticated;
revoke all on public.order_idempotency from anon, authenticated;
revoke all on public.payment_events from anon, authenticated;
revoke all on public.shipments from anon, authenticated;
revoke all on public.audit_log from anon, authenticated;
revoke all on public.store_policies from anon, authenticated;

-- V9 explicit security posture: emergency approval and pricing are service-role only.
revoke all on public.product_requests from anon, authenticated;
revoke all on function public.calculate_store_price(uuid) from anon, authenticated;


-- V11 final security posture for delivery/claim operations.
revoke all on public.orders from anon, authenticated;
revoke all on public.shipments from anon, authenticated;
revoke all on public.audit_log from anon, authenticated;


-- V12 compatibility migrations: add any V12 columns to an existing V11 database.
alter table public.orders add column if not exists delivery_outcome text not null default 'pending';
alter table public.orders add column if not exists non_delivery_reason text;
alter table public.orders add column if not exists actual_shipping_cost numeric(12,2);
alter table public.orders add column if not exists return_shipping_cost numeric(12,2);
alter table public.orders add column if not exists shipping_claim_amount numeric(12,2) not null default 0;
alter table public.orders add column if not exists shipping_claim_status text not null default 'not_applicable';
alter table public.shipments add column if not exists provider_awb text;
alter table public.shipments add column if not exists status text not null default 'pending';
alter table public.shipments add column if not exists payload jsonb;
alter table public.shipments add column if not exists updated_at timestamptz not null default now();

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname='orders_shipping_claim_status_check'
      and conrelid='public.orders'::regclass
  ) then
    alter table public.orders add constraint orders_shipping_claim_status_check
      check(shipping_claim_status in('not_applicable','pending_review','approved','waived','paid','disputed'));
  end if;
end $$;

-- Shipment lifecycle.
create or replace function public.upsert_shipment(
  p_order_id uuid,
  p_provider text,
  p_awb text,
  p_status text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_shipment public.shipments;
  v_order public.orders;
begin
  if p_provider is null or nullif(trim(p_provider),'') is null then
    raise exception 'shipment_provider_required';
  end if;

  if p_status not in ('pending','created','picked_up','in_transit','out_for_delivery','delivered','returned','cancelled','failed') then
    raise exception 'invalid_shipment_status';
  end if;

  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;

  insert into public.shipments(order_id,provider,provider_awb,status,payload,updated_at)
  values(p_order_id,trim(p_provider),nullif(trim(p_awb),''),p_status,p_payload,now())
  on conflict(order_id) do update set
    provider=excluded.provider,
    provider_awb=coalesce(excluded.provider_awb,public.shipments.provider_awb),
    status=excluded.status,
    payload=excluded.payload,
    updated_at=now()
  returning * into v_shipment;

  update public.orders
  set bosta_awb=coalesce(v_shipment.provider_awb,bosta_awb),
      status=case
        when p_status='created' then 'processing'
        when p_status='picked_up' then 'shipped'
        when p_status='in_transit' then 'shipped'
        when p_status='out_for_delivery' then 'shipped'
        when p_status='delivered' then 'delivered'
        when p_status in ('returned','cancelled','failed') then
          case when p_status='returned' then 'returned' else p_status end
        else status
      end
  where id=p_order_id;

  insert into public.audit_log(actor,action,entity,entity_id,metadata)
  values('service_role','shipment_updated','shipment',v_shipment.id::text,
         jsonb_build_object('order_id',p_order_id,'provider',p_provider,'awb',p_awb,'status',p_status));

  return jsonb_build_object(
    'shipment_id',v_shipment.id,
    'order_id',p_order_id,
    'provider',v_shipment.provider,
    'awb',v_shipment.provider_awb,
    'status',v_shipment.status
  );
end;
$$;

create or replace function public.advance_order_status(
  p_order_id uuid,
  p_status text,
  p_actor text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_old text;
begin
  if p_status not in ('pending','processing','shipped','delivered','returned','cancelled','delivery_failed') then
    raise exception 'invalid_order_status';
  end if;

  select status into v_old from public.orders where id=p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;

  update public.orders set status=p_status where id=p_order_id;

  insert into public.audit_log(actor,action,entity,entity_id,metadata)
  values(coalesce(nullif(trim(p_actor),''),'service_role'),'order_status_changed','order',p_order_id::text,
         jsonb_build_object('from',v_old,'to',p_status,'note',p_note));

  return jsonb_build_object('order_id',p_order_id,'old_status',v_old,'status',p_status);
end;
$$;

revoke all on function public.upsert_shipment(uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.advance_order_status(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.upsert_shipment(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.advance_order_status(uuid,text,text,text) to service_role;

create index if not exists shipments_awb_idx on public.shipments(provider_awb);
