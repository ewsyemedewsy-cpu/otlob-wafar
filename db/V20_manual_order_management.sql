-- Apply after V18/V19 on a verified test environment first.
-- Manual local COD workflow; carrier and payment workflows remain authoritative.
create or replace function public.update_manual_order_status(
 p_order_id uuid,p_expected_status text,p_status text,p_note text
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare o public.orders%rowtype;
begin
 if p_note is null or length(trim(p_note))<5 or length(p_note)>2000 then raise exception 'note_required'; end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'order_not_found'; end if;
 if o.status is distinct from p_expected_status then raise exception 'order_changed'; end if;
 if o.payment_method is distinct from 'cod' or o.payment_status is null or o.payment_status not in ('unpaid','pending','failed') then raise exception 'manual_cod_only'; end if;
 if o.bosta_awb is not null
 or exists(select 1 from public.shipments where order_id=o.id and status<>'cancelled')
 or exists(select 1 from public.fulfillment_jobs where order_id=o.id and status<>'cancelled')
 or exists(select 1 from public.fulfillment_queue where order_id=o.id and status<>'cancelled')
 then raise exception 'fulfillment_requires_review'; end if;
 if not coalesce((o.status='pending' and p_status in ('processing','cancelled'))
 or (o.status='processing' and p_status in ('delivered','cancelled')),false) then raise exception 'invalid_transition'; end if;
 update public.orders set status=p_status where id=o.id;
 insert into public.admin_audit_log(action,order_id,details)
 values('manual_order_status_update',o.id,jsonb_build_object('from',o.status,'to',p_status,'note',trim(p_note),'actor','admin_api'));
 return jsonb_build_object('id',o.id,'status',p_status,'payment_status',o.payment_status);
end $$;
revoke all on function public.update_manual_order_status(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.update_manual_order_status(uuid,text,text,text) to service_role;

-- Dispatch and manual changes acquire the same order lock.
create or replace function public.enqueue_fulfillment_for_paid_order(p_order_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare o public.orders%rowtype; v_id uuid;
begin
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'order_not_found'; end if;
 if o.status in ('cancelled','returned','delivered') then raise exception 'order_not_dispatchable'; end if;
 if o.payment_method<>'cod' and o.payment_status<>'paid' then raise exception 'payment_not_confirmed'; end if;
 insert into public.fulfillment_jobs(order_id,status,next_attempt_at)
 values(p_order_id,'pending',now()) on conflict(order_id) do update set
 status=case when fulfillment_jobs.status='failed' then 'pending' else fulfillment_jobs.status end,
 next_attempt_at=now(),updated_at=now();
 select id into v_id from public.fulfillment_jobs where order_id=p_order_id;
 return v_id;
end $$;
revoke all on function public.enqueue_fulfillment_for_paid_order(uuid) from public,anon,authenticated;
grant execute on function public.enqueue_fulfillment_for_paid_order(uuid) to service_role;
