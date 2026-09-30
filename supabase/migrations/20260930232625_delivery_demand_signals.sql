-- Anonymous demand signals, never purchase orders or personal customer records.
create table if not exists public.delivery_demand_events (
 id bigint generated always as identity primary key,
 region text not null check (region in ('FAYOUM','CAIRO','GIZA','ALEXANDRIA','DELTA_CANAL','UPPER_EGYPT')),
 source text not null check (source in ('customer_interest','blocked_checkout')),
 signal_day date not null default (now() at time zone 'Africa/Cairo')::date,
 request_hash text not null,
 created_at timestamptz not null default now(),
 unique(region,source,signal_day,request_hash)
);
create index if not exists delivery_demand_day_idx on public.delivery_demand_events(signal_day);
alter table public.delivery_demand_events enable row level security;
revoke all on public.delivery_demand_events from public,anon,authenticated;
create or replace function public.record_delivery_demand(p_region text,p_source text,p_request_key text)
returns boolean language plpgsql security definer set search_path=public as $$
declare affected integer;
begin
 if p_region is null or p_region not in ('FAYOUM','CAIRO','GIZA','ALEXANDRIA','DELTA_CANAL','UPPER_EGYPT') or p_source is null or p_source not in ('customer_interest','blocked_checkout') or p_request_key is null or length(p_request_key) not between 16 and 200 then
 raise exception 'invalid_delivery_demand';
 end if;
 insert into public.delivery_demand_events(region,source,request_hash)
 values(p_region,p_source,encode(pg_catalog.sha256(pg_catalog.convert_to(p_request_key,'UTF8')),'hex'))
 on conflict(region,source,signal_day,request_hash) do nothing;
 get diagnostics affected=row_count;
 return affected=1;
end $$;
create or replace function public.delivery_demand_summary(p_days integer default 30)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if p_days is null or p_days not between 1 and 90 then raise exception 'invalid_summary_window'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(s) order by s.interest_count+s.blocked_count desc,s.region),'[]'::jsonb)
 from (select region,count(*) filter(where source='customer_interest') as interest_count,
 count(*) filter(where source='blocked_checkout') as blocked_count,max(created_at) as last_signal
 from public.delivery_demand_events where signal_day >= (now() at time zone 'Africa/Cairo')::date-(p_days-1)
 group by region) s);
end $$;
revoke all on function public.record_delivery_demand(text,text,text) from public,anon,authenticated;
revoke all on function public.delivery_demand_summary(integer) from public,anon,authenticated;
grant execute on function public.record_delivery_demand(text,text,text) to service_role;
grant execute on function public.delivery_demand_summary(integer) to service_role;
