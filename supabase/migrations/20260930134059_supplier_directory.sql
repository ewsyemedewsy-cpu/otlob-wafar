-- Apply after the existing V18/V19 compatibility sequence on staging.
-- Preserves all supplier rows and their existing WhatsApp contacts.
begin;
alter table public.suppliers add column if not exists phone text not null default '';
alter table public.suppliers add column if not exists email text not null default '';
alter table public.suppliers add column if not exists website text not null default '';
alter table public.suppliers add column if not exists source_url text not null default '';
alter table public.suppliers add column if not exists address text not null default '';
alter table public.suppliers add column if not exists contact_name text not null default '';
alter table public.suppliers add column if not exists notes text not null default '';
alter table public.suppliers add column if not exists order_method text not null default 'contact';
alter table public.suppliers add column if not exists allows_single_units boolean not null default false;
alter table public.suppliers add column if not exists min_order_quantity integer not null default 1;
alter table public.suppliers add column if not exists direct_fulfillment boolean not null default false;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.suppliers'::regclass and conname='supplier_purchase_terms_check') then
  alter table public.suppliers add constraint supplier_purchase_terms_check check(
   order_method in ('automatic','contact','visit') and min_order_quantity>=1 and
   (not allows_single_units or min_order_quantity=1));
 end if;
end $$;
alter table public.suppliers enable row level security;
revoke all on public.suppliers from public,anon,authenticated;
grant select,insert,update on public.suppliers to service_role;
commit;
