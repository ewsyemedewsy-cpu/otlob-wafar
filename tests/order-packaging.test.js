import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
test('database order floor includes packaging and rejection never reserves stock',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
 await db.exec('create role anon;create role authenticated;create role service_role;');
 for(const f of ['db/schema.sql','db/V12_compatible_upgrade.sql','db/V17_production_upgrade.sql','legacy-v17/V15_paymob_migration.sql','legacy-v17/V16_fulfillment_migration.sql','legacy-v17/V17_hardening_migration.sql','db/V14_admin_security_migration.sql','db/V18_compatibility_and_transactions.sql','db/V20_manual_order_management.sql','db/V21_supabase_runtime_compatibility.sql','supabase/migrations/20261001123849_order_packaging_floor.sql'])await db.exec(fs.readFileSync(f,'utf8'));
 const id=(await db.query("insert into products(sku,title_ar,supplier_cost,retail_price,stock_quantity,specifications)values('BAG','اختبار تغليف',265,279.99,2,'{\"packaging_cost\":0.4}')returning id")).rows[0].id;
 const create=key=>db.query("select create_order_v18($1,'عميل اختبار','01012345678','FAYOUM','عنوان اختبار','cod',$2::jsonb,null,'shipping-v1',true) result",[key,JSON.stringify([{product_id:id,quantity:1}])]);
 await assert.rejects(create('packaging-reject-0001'),/price_below_normal_floor/);
 assert.equal((await db.query('select stock_quantity from products where id=$1',[id])).rows[0].stock_quantity,2);
 assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n,0);
 await db.query('update products set retail_price=280 where id=$1',[id]);
 assert.ok((await create('packaging-accept-0001')).rows[0].result.id);
 assert.equal((await db.query('select stock_quantity from products where id=$1',[id])).rows[0].stock_quantity,1);
 for(const bag of [-1,'NaN','Infinity']){
  await db.query('update products set specifications=$2::jsonb where id=$1',[id,JSON.stringify({packaging_cost:bag})]);
  await assert.rejects(create('packaging-invalid-'+String(bag)),/invalid_packaging_cost/);
 }
 const roles=(await db.query("select has_function_privilege('anon','create_order_v18(text,text,text,text,text,text,jsonb,uuid,text,boolean)','EXECUTE') anon,has_function_privilege('authenticated','create_order_v18(text,text,text,text,text,text,jsonb,uuid,text,boolean)','EXECUTE') customer")).rows[0];assert.deepEqual(roles,{anon:false,customer:false});
 }finally{await db.close()}
});
