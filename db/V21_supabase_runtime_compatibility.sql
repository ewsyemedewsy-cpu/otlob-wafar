-- Preserve SHA-256 fingerprints using built-in functions regardless of pgcrypto schema.
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
 fingerprint:=encode(pg_catalog.sha256(pg_catalog.convert_to(jsonb_build_object('name',p_customer_name,'phone',p_whatsapp_phone,'gov',p_governorate,'address',p_address,'payment',p_payment_method,'items',p_items,'user',p_user_id,'policy',p_policy_version,'accepted',p_policy_accepted)::text,'UTF8')),'hex');
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


-- Supabase explicitly grants default EXECUTE privileges to API roles.
revoke all on function public.claim_fulfillment_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_fulfillment_jobs(integer) to service_role;
revoke all on function public.release_cancelled_stock_v18() from public,anon,authenticated;
grant execute on function public.release_cancelled_stock_v18() to service_role;
alter function public.set_updated_at() set search_path=public;
-- Current clients use the API; preserve this view for privileged compatibility.
alter view public.public_products set (security_invoker=true);
revoke all on public.public_products from public,anon,authenticated;
grant select on public.public_products to service_role;
