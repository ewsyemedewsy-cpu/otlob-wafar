-- Apply after V18 on staging first. No deletion or replacement of tables.
begin;
create or replace function public.apply_paymob_event_v18(
 p_order_id uuid,p_event_id text,p_status text,p_amount_cents bigint,p_currency text,p_provider_order_id text,p_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare o public.orders; pi public.payment_intents; inserted integer; effective text;begin
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'order_not_found';end if;
 if p_currency is null or p_amount_cents is null or p_currency<>'EGP' or p_amount_cents<>round(o.total*100)::bigint then raise exception 'amount_mismatch';end if;
 if p_status not in ('requires_action','authorized','paid','failed','refunded','partially_refunded','cancelled') then raise exception 'invalid_payment_status';end if;
 select * into pi from public.payment_intents where order_id=p_order_id for update;
 if not found or o.payment_method<>'wallet' then raise exception 'payment_intent_missing';end if;
 if pi.provider<>'paymob' or pi.currency is distinct from p_currency
 or round(pi.amount*100)::bigint is distinct from p_amount_cents
 or nullif(pi.provider_order_id,'') is null
 or pi.provider_order_id is distinct from nullif(p_provider_order_id,'') then raise exception 'payment_intent_mismatch';end if;
 if o.status in ('cancelled','returned') and p_status in ('paid','authorized') then raise exception 'closed_order_requires_review';end if;
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
commit;
