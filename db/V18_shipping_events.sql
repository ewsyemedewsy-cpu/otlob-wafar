begin;
alter table public.shipments add column if not exists provider_event_timestamp bigint;
create or replace function public.apply_bosta_event_v18(p_order_id uuid,p_event_id text,p_status text,p_timestamp bigint,p_awb text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.shipments; o public.orders; inserted integer; next_status text;begin
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'order_not_found';end if;
 select * into s from public.shipments where order_id=p_order_id for update;
 if p_status not in ('pending','picked_up','out_for_delivery','in_transit','delivered','returned','failed','cancelled') then raise exception 'invalid_shipment_status';end if;
 insert into public.integration_events(provider,event_id,event_type,order_id,payload,processed_at)
 values('bosta',p_event_id,p_status,p_order_id,p_payload,now()) on conflict(provider,event_id) do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then return jsonb_build_object('duplicate',true);end if;
 if s.provider_event_timestamp is not null and p_timestamp<=s.provider_event_timestamp then return jsonb_build_object('stale',true);end if;
 -- Older progress reports must not reverse a terminal delivery status.
 if o.status in ('delivered','returned','cancelled') and p_status in ('pending','picked_up','out_for_delivery','in_transit','failed') then return jsonb_build_object('stale',true);end if;
 update public.shipments set status=p_status,provider_awb=coalesce(p_awb,provider_awb),payload=p_payload,provider_event_timestamp=p_timestamp,last_synced_at=now(),updated_at=now() where order_id=p_order_id;
 next_status:=case p_status when 'delivered' then 'delivered' when 'returned' then 'returned' when 'failed' then 'delivery_failed' when 'cancelled' then 'cancelled' else 'shipped' end;
 update public.orders set status=next_status,bosta_awb=coalesce(p_awb,bosta_awb) where id=p_order_id;
 if next_status in ('shipped','delivered','returned') then perform public.queue_order_notifications(p_order_id,next_status);end if;
 return jsonb_build_object('status',next_status);
end $$;
revoke all on function public.apply_bosta_event_v18(uuid,text,text,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.apply_bosta_event_v18(uuid,text,text,bigint,text,jsonb) to service_role;
commit;
