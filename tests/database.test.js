import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
test('upgrade, orders, stock, payment atomicity, and role permissions',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
 await db.exec('create role anon;create role authenticated;create role service_role;create schema extensions;create extension pgcrypto with schema extensions;');
 for(const file of ['db/schema.sql','db/V12_compatible_upgrade.sql','db/V17_production_upgrade.sql','legacy-v17/V15_paymob_migration.sql','legacy-v17/V16_fulfillment_migration.sql','legacy-v17/V17_hardening_migration.sql','db/V14_admin_security_migration.sql','db/V18_compatibility_and_transactions.sql','db/V18_pricing_and_catalog.sql','db/V18_shipping_events.sql','db/V21_supabase_runtime_compatibility.sql']){if(file==='db/V21_supabase_runtime_compatibility.sql')await db.exec('grant execute on function public.claim_fulfillment_jobs(integer) to anon,authenticated;grant execute on function public.release_cancelled_stock_v18() to anon,authenticated;');await db.exec(fs.readFileSync(file,'utf8'));}
 await db.exec(fs.readFileSync('db/V18_compatibility_and_transactions.sql','utf8'));
 const product=(await db.query("insert into products(sku,title_ar,supplier_cost,retail_price,stock_quantity)values('T1','اختبار',100,110,3)returning id")).rows[0];
 const args=['order-test-key-0001','عماد','01012345678','CAIRO','عنوان اختبار كامل','cod',JSON.stringify([{product_id:product.id,quantity:2}])];
 const call=async(a=args)=>(await db.query("select create_order_v18($1,$2,$3,$4,$5,$6,$7::jsonb,null,'shipping-v1',true) as result",a)).rows[0].result;
 const order=await call();const replay=await call();assert.equal(order.id,replay.id);assert.equal(replay.replayed,true);
 assert.equal((await db.query('select stock_quantity from products')).rows[0].stock_quantity,1);
 await assert.rejects(call([...args.slice(0,4),'عنوان مختلف',...args.slice(5)]));
 await assert.rejects(call(['order-test-key-0002',...args.slice(1)]));
 assert.equal((await db.query('select count(*)::integer as n from orders')).rows[0].n,1);
 assert.equal((await db.query('select count(*)::integer as n from notification_outbox')).rows[0].n,1);
 const event=async(id,status,amount=27000)=>(await db.query("select apply_paymob_event_v18($1,$2,$3,$4,'EGP','provider123','{}') as result",[order.id,id,status,amount])).rows[0].result;
 await assert.rejects(event('wrong','paid',100));assert.equal((await db.query('select count(*)::integer as n from payment_event_log')).rows[0].n,0);
 await event('e1','paid');assert.equal((await event('e1','paid')).duplicate,true);
 await event('e2','failed');assert.equal((await db.query('select payment_status from orders')).rows[0].payment_status,'paid');
 assert.equal((await db.query('select count(*)::integer as n from fulfillment_jobs')).rows[0].n,1);
 await event('e3','refunded');await event('e4','paid');assert.equal((await db.query('select payment_status from orders')).rows[0].payment_status,'refunded');
 await db.query("insert into competitors_pricing(product_id,competitor,price,verified_match)values($1,'amazon',200,true)",[product.id]);
 const priced=(await db.query('select recalculate_price_v18($1) as result',[product.id])).rows[0].result;assert.equal(Number(priced.finalPrice),159.5);
 await db.query("insert into shipments(order_id,provider_awb,status)values($1,'AWB1','created')",[order.id]);
 await db.query("select apply_bosta_event_v18($1,'b1','delivered',200,'AWB1','{}')",[order.id]);
 await db.query("select apply_bosta_event_v18($1,'b2','in_transit',100,'AWB1','{}')",[order.id]);
 assert.equal((await db.query('select status from orders')).rows[0].status,'delivered');
 await db.query("update orders set status='pending',bosta_awb=null where id=$1",[order.id]);await db.query("update orders set status='cancelled' where id=$1",[order.id]);assert.equal((await db.query('select stock_quantity from products')).rows[0].stock_quantity,3);
 await db.query("update orders set status='processing' where id=$1",[order.id]);await db.query("update orders set status='cancelled' where id=$1",[order.id]);assert.equal((await db.query('select stock_quantity from products')).rows[0].stock_quantity,3);
 const privileges=(await db.query("select has_table_privilege('anon','products','SELECT') as cost_access,has_function_privilege('anon','create_order_v18(text,text,text,text,text,text,jsonb,uuid,text,boolean)','EXECUTE') as order_access")).rows[0];assert.equal(privileges.cost_access,false);assert.equal(privileges.order_access,false);
 const locked=(await db.query("select has_function_privilege('anon','claim_fulfillment_jobs(integer)','EXECUTE') as queue,has_function_privilege('authenticated','release_cancelled_stock_v18()','EXECUTE') as stock")).rows[0];assert.deepEqual(locked,{queue:false,stock:false});
 const boundary=(await db.query("insert into products(sku,title_ar,supplier_cost,retail_price)values('BOUNDARY','حد الربح',100,105.50)returning id")).rows[0].id;
 const floorOrder=await call(['boundary-order-key1',...args.slice(1,6),JSON.stringify([{product_id:boundary,quantity:1}])]);assert.equal(Number(floorOrder.total),155.5);
 }finally{await db.close()}
});
