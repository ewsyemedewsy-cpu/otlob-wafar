-- Public storefront comparisons are served by the API; internal RPC remains service-only.
revoke all on function public.public_price_compare(uuid) from public,anon,authenticated;
grant execute on function public.public_price_compare(uuid) to service_role;
