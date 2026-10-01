-- Packaging participates in normal margin, risk reserve and competitive optimization.
create or replace function public.recalculate_price_v18(p_product_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.products; market numeric; target numeric; floor_price numeric; price numeric; mode text; base_cost numeric; packaging numeric;begin
 select * into p from public.products where id=p_product_id for update;
 if not found or p.supplier_cost is null or p.supplier_cost<=0 or p.supplier_cost::text in ('NaN','Infinity','-Infinity') then raise exception 'invalid_product';end if;
 packaging:=coalesce((p.specifications->>'packaging_cost')::numeric,0);
 if packaging<0 or packaging::text in ('NaN','Infinity','-Infinity') then raise exception 'invalid_packaging_cost';end if;
 base_cost:=p.supplier_cost+packaging;
 select min(c.price) into market from public.public_price_compare(p_product_id)c;
 if market is null then raise exception 'no_recent_verified_competitor';end if;
 floor_price:=ceil(base_cost*1.055*100)/100;
 target:=floor(market*.995*100)/100;
 if target<floor_price then raise exception 'not_competitive_at_normal_floor';end if;
 price:=greatest(floor_price,floor((target-greatest(0,target-base_cost*1.20)/2)*100)/100);
 mode:=case when target>base_cost*1.20 then 'optimized' else 'normal' end;
 update public.products set retail_price=price,pricing_mode=mode,pricing_updated_at=now() where id=p_product_id;
 insert into public.pricing_history(product_id,competitor_min,target_price,final_price,base_cost,risk_reserve,profit_rate,pricing_mode,reason)
 values(p_product_id,market,target,price,base_cost,base_cost*.005,(price-base_cost-base_cost*.005)/base_cost,mode,'v18_verified_price');
 return jsonb_build_object('product_id',p_product_id,'finalPrice',price,'mode',mode);
end $$;
revoke all on function public.recalculate_price_v18(uuid) from public,anon,authenticated;
grant execute on function public.recalculate_price_v18(uuid) to service_role;
-- Legacy caller uses the same normal rule; authorized emergency requests remain separate.
create or replace function public.calculate_store_price(p_product_id uuid)
returns numeric language plpgsql security definer set search_path=public as $$
declare p public.products; m numeric; t numeric; f numeric; base_cost numeric; packaging numeric;begin
 select * into p from public.products where id=p_product_id and available=true;
 if not found or p.supplier_cost is null or p.supplier_cost<=0 or p.supplier_cost::text in ('NaN','Infinity','-Infinity') then raise exception 'invalid_product';end if;
 packaging:=coalesce((p.specifications->>'packaging_cost')::numeric,0);
 if packaging<0 or packaging::text in ('NaN','Infinity','-Infinity') then raise exception 'invalid_packaging_cost';end if;
 base_cost:=p.supplier_cost+packaging;
 f:=ceil(base_cost*1.055*100)/100;
 select min(c.price) into m from public.public_price_compare(p_product_id)c;
 if m is null then return f;end if;
 t:=floor(m*.995*100)/100;
 return greatest(f,floor((t-greatest(0,t-base_cost*1.20)/2)*100)/100);
end $$;
