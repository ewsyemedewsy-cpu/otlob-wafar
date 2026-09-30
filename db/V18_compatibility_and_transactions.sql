-- Additive upgrade for existing Emad Store. Review staging before production.
begin;
create table if not exists public.order_stock_reservations(order_id uuid references public.orders(id) on delete cascade,product_id uuid references public.products(id),quantity integer not null,released_at timestamptz,primary key(order_id,product_id));
alter table public.order_stock_reservations enable row level security;
revoke all on public.order_stock_reservations from public,anon,authenticated;
create or replace function public.release_cancelled_stock_v18() returns trigger language plpgsql security definer set search_path=public as $$
declare r record;begin
 if new.status='cancelled' and old.status in ('pending','processing') and old.bosta_awb is null then
  for r in select * from public.order_stock_reservations where order_id=new.id and released_at is null for update loop
   update public.products set stock_quantity=stock_quantity+r.quantity where id=r.product_id and stock_quantity is not null;
   update public.order_stock_reservations set released_at=now() where order_id=r.order_id and product_id=r.product_id;
  end loop;
 end if;return new;
end $$;
drop trigger if exists release_cancelled_stock_v18 on public.orders;
create trigger release_cancelled_stock_v18 after update of status on public.orders for each row execute function public.release_cancelled_stock_v18();
alter table public.orders add column if not exists user_id uuid;
alter table public.orders add column if not exists payment_intent_id uuid;
alter table public.orders add column if not exists payment_transaction_id text;
alter table public.orders add column if not exists payment_metadata jsonb not null default '{}'::jsonb;
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.products add column if not exists stock_quantity integer;
alter table public.products add column if not exists description_ar text;
alter table public.products add column if not exists specifications jsonb not null default '{}'::jsonb;
alter table public.shipments add column if not exists provider_order_id text;
alter table public.shipments add column if not exists tracking_url text;
alter table public.shipments add column if not exists last_provider_status text;
alter table public.shipments add column if not exists last_synced_at timestamptz;
alter table public.orders add column if not exists delivery_failure_reason text;
alter table public.payment_intents add column if not exists intention_id text;
alter table public.payment_intents add column if not exists client_secret text;
alter table public.payment_event_log add column if not exists payment_intent_id uuid;
alter table public.order_idempotency add column if not exists request_fingerprint text;

revoke all on function public.create_order_secure(text,text,text,text,text,jsonb,text,boolean,text) from public,anon,authenticated;
grant execute on function public.create_order_secure(text,text,text,text,text,jsonb,text,boolean,text) to service_role;
grant execute on function public.admin_list_orders(text,text,integer,integer) to service_role;
-- Existing order function remains available to trusted code; browsers use API.
do $$begin if to_regprocedure('public.create_order_secure(text,text,text,text,text,jsonb)') is not null then execute 'revoke all on function public.create_order_secure(text,text,text,text,text,jsonb) from public,anon,authenticated';execute 'grant execute on function public.create_order_secure(text,text,text,text,text,jsonb) to service_role';end if;end$$;

create or replace function public.create_order_v18(
 p_key text,p_customer_name text,p_whatsapp_phone text,p_governorate text,
 p_address text,p_payment_method text,p_items jsonb,p_user_id uuid default null,p_policy_version text default null,p_policy_accepted boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare fingerprint text; prior public.order_idempotency; result jsonb; x jsonb; p public.products; qty integer;begin
 if length(p_key)<16 or length(p_key)>200 then raise exception 'invalid_idempotency_key';end if;
 if p_customer_name is null or p_address is null or p_whatsapp_phone is null then raise exception 'invalid_customer';end if;
 if length(trim(p_customer_name)) not between 2 and 120 or length(trim(p_address)) not between 5 and 1000
 or p_whatsapp_phone !~ '^(\+?20|0)1[0125][0-9]{8}$' then raise exception 'invalid_customer';end if;
 if p_governorate not in ('FAYOUM','CAIRO','GIZA','ALEXANDRIA','DELTA_CANAL','UPPER_EGYPT') then raise exception 'invalid_governorate';end if;
 if p_payment_method not in ('cod','wallet') or (p_payment_method='wallet' and p_user_id is null) then raise exception 'invalid_payment_method';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 30 then raise exception 'invalid_items';end if;
 fingerprint:=encode(digest(jsonb_build_object('name',p_customer_name,'phone',p_whatsapp_phone,'gov',p_governorate,'address',p_address,'payment',p_payment_method,'items',p_items,'user',p_user_id,'policy',p_policy_version,'accepted',p_policy_accepted)::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_key,0));
 select * into prior from public.order_idempotency where idempotency_key=p_key;
 if found then
   if prior.request_fingerprint is distinct from fingerprint then raise exception 'idempotency_conflict';end if;
   select jsonb_build_object('id',id,'order_number',order_number,'total',total,'replayed',true) into result from public.orders where id=prior.order_id;return result;
 end if;
 -- Stable lock order prevents deadlocks; duplicate product IDs are rejected.
 if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value->>'product_id') from jsonb_array_elements(p_items)) then raise exception 'duplicate_product';end if;
 for x in select value from jsonb_array_elements(p_items) order by value->>'product_id' loop
   if x->>'quantity' is null or (x->>'quantity') !~ '^[0-9]+$' then raise exception 'invalid_quantity';end if;
   qty:=(x->>'quantity')::integer;if qty not between 1 and 100 then raise exception 'invalid_quantity';end if;
   select * into p from public.products where id=(x->>'product_id')::uuid and available=true for update;
   if not found then raise exception 'product_unavailable';end if;
   if p.retail_price<ceil(p.supplier_cost*1.055*100)/100 then raise exception 'price_below_normal_floor';end if;
   if p.stock_quantity is not null and p.stock_quantity<qty then raise exception 'insufficient_stock';end if;
 end loop;
 result:=public.create_order_secure(p_customer_name,p_whatsapp_phone,p_governorate,p_address,p_payment_method,p_items,p_policy_version,p_policy_accepted,p_key);
 update public.orders set user_id=p_user_id where id=(result->>'id')::uuid;
 for x in select value from jsonb_array_elements(p_items) loop
   insert into public.order_stock_reservations(order_id,product_id,quantity) select (result->>'id')::uuid,(x->>'product_id')::uuid,(x->>'quantity')::integer from public.products where id=(x->>'product_id')::uuid and stock_quantity is not null;
   update public.products set stock_quantity=stock_quantity-(x->>'quantity')::integer where id=(x->>'product_id')::uuid and stock_quantity is not null;
 end loop;
 update public.order_idempotency set request_fingerprint=fingerprint where idempotency_key=p_key;
 if p_payment_method='cod' then perform public.queue_order_notifications((result->>'id')::uuid,'order_created');end if;
 return result;
end $$;
revoke all on function public.create_order_v18(text,text,text,text,text,text,jsonb,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.create_order_v18(text,text,text,text,text,text,jsonb,uuid,text,boolean) to service_role;

-- HMAC is checked by the server. Persist event, payment, and queues together.
create or replace function public.apply_paymob_event_v18(
 p_order_id uuid,p_event_id text,p_status text,p_amount_cents bigint,p_currency text,p_provider_order_id text,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.orders; pi public.payment_intents; inserted integer; effective text;begin
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'order_not_found';end if;
 if p_currency<>'EGP' or p_amount_cents<>round(o.total*100)::bigint then raise exception 'amount_mismatch';end if;
 if p_status not in ('requires_action','authorized','paid','failed','refunded','partially_refunded','cancelled') then raise exception 'invalid_payment_status';end if;
 select * into pi from public.payment_intents where order_id=p_order_id;
 insert into public.payment_event_log(provider,event_id,order_id,payment_intent_id,event_type,payload,processed_at)
 values('paymob',p_event_id,p_order_id,pi.id,p_status,p_payload,now()) on conflict(provider,event_id) do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return jsonb_build_object('duplicate',true);end if;
 effective:=p_status;
 if o.payment_status in ('paid','refunded','partially_refunded') and p_status in ('requires_action','authorized','failed','cancelled') then effective:=o.payment_status;end if;
 if o.payment_status='partially_refunded' and p_status='paid' then effective:=o.payment_status;end if;
 if o.payment_status='refunded' and p_status in ('paid','partially_refunded') then effective:=o.payment_status;end if;
 update public.payment_intents set status=effective,provider_payment_id=p_event_id,provider_order_id=coalesce(nullif(p_provider_order_id,''),provider_order_id),updated_at=now() where order_id=p_order_id;
 update public.orders set payment_status=effective,payment_provider='paymob',payment_transaction_id=p_event_id,payment_metadata=jsonb_build_object('paymob_order_id',p_provider_order_id),paid_at=case when effective='paid' then coalesce(paid_at,now()) else paid_at end where id=p_order_id;
 if effective='paid' and o.payment_status is distinct from 'paid' then
   perform public.queue_order_notifications(p_order_id,'order_created');
   perform public.enqueue_fulfillment_for_paid_order(p_order_id);
 end if;
 return jsonb_build_object('duplicate',false,'status',effective);
end $$;
revoke all on function public.apply_paymob_event_v18(uuid,text,text,bigint,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.apply_paymob_event_v18(uuid,text,text,bigint,text,text,jsonb) to service_role;
grant execute on function public.queue_order_notifications(uuid,text) to service_role;
grant execute on function public.enqueue_notification(text,text,uuid,text,jsonb) to service_role;
alter table public.fulfillment_jobs enable row level security;
alter table public.pricing_history enable row level security;
alter table public.order_idempotency enable row level security;
commit;
