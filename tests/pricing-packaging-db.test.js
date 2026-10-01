import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
test('database repricing preserves packaged floor and records actual base cost',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});try{
 await db.exec('create role anon;create role authenticated;create role service_role;');
 for(const f of ['db/schema.sql','db/V12_compatible_upgrade.sql','db/V17_production_upgrade.sql','legacy-v17/V15_paymob_migration.sql','legacy-v17/V16_fulfillment_migration.sql','legacy-v17/V17_hardening_migration.sql','db/V14_admin_security_migration.sql','db/V18_compatibility_and_transactions.sql','db/V18_pricing_and_catalog.sql','supabase/migrations/20261001124156_comparison_service_access.sql','supabase/migrations/20261001124241_pricing_packaging_cost.sql'])await db.exec(fs.readFileSync(f,'utf8'));
 const id=(await db.query("insert into products(sku,title_ar,supplier_cost,retail_price,specifications)values('PACKAGE-PRICE','اختبار',265,280,'{\"packaging_cost\":0.4}') returning id")).rows[0].id;
 assert.equal(Number((await db.query('select calculate_store_price($1) price',[id])).rows[0].price),280);
 await db.query("insert into competitors_pricing(product_id,competitor,price,verified_match,observed_at) values($1,'amazon',300,true,now())",[id]);
 const price=Number((await db.query('select recalculate_price_v18($1) result',[id])).rows[0].result.finalPrice);assert.ok(price>=280&&price<300);
 const h=(await db.query('select base_cost,profit_rate from pricing_history where product_id=$1',[id])).rows[0];assert.equal(Number(h.base_cost),265.4);assert.ok(Number(h.profit_rate)>=.05);
 assert.equal(Number((await db.query('select supplier_cost from products where id=$1',[id])).rows[0].supplier_cost),265);
 const roles=(await db.query("select has_function_privilege('anon','public_price_compare(uuid)','EXECUTE') anon,has_function_privilege('authenticated','public_price_compare(uuid)','EXECUTE') customer,has_function_privilege('service_role','public_price_compare(uuid)','EXECUTE') server")).rows[0];assert.deepEqual(roles,{anon:false,customer:false,server:true});
 }finally{await db.close()}
});
