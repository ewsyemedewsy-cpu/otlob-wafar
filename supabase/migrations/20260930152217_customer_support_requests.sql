create table if not exists public.customer_support_requests (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id),
 kind text not null check(kind in ('return','cancellation','complaint')),
 message text not null check(char_length(message) between 10 and 2000),
 status text not null default 'pending' check(status in ('pending','reviewing','resolved','rejected')),
 customer_reply text not null default '' check(char_length(customer_reply)<=2000),
 request_key uuid not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(order_id,request_key)
);
create index if not exists customer_support_requests_order_idx on public.customer_support_requests(order_id,created_at desc);
alter table public.customer_support_requests enable row level security;
revoke all on public.customer_support_requests from public,anon,authenticated;
grant select,insert,update on public.customer_support_requests to service_role;
