import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
test('legacy products and orders survive upgrades and historical consent is not invented',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});try{
 await db.exec('create role anon;create role authenticated;create role service_role;');await db.exec(fs.readFileSync('db/schema.sql','utf8'));
 const oldProduct=(await db.query("insert into products(sku,title_ar,supplier_cost,retail_price)values('OLD-1','منتج سابق',100,110)returning id")).rows[0].id;
 const oldOrder=(await db.query("insert into orders(customer_name,whatsapp_phone,governorate,address,payment_method,subtotal,shipping_fee,total)values('عميل سابق','01012345678','CAIRO','عنوان قديم','cod',110,50,160)returning id")).rows[0].id;
 for(const file of ['db/V12_compatible_upgrade.sql','db/V17_production_upgrade.sql','legacy-v17/V15_paymob_migration.sql','legacy-v17/V16_fulfillment_migration.sql','legacy-v17/V17_hardening_migration.sql','db/V14_admin_security_migration.sql','db/V18_compatibility_and_transactions.sql','db/V18_pricing_and_catalog.sql','db/V18_shipping_events.sql'])await db.exec(fs.readFileSync(file,'utf8'));
 assert.equal((await db.query('select sku from products where id=$1',[oldProduct])).rows[0].sku,'OLD-1');
 const row=(await db.query('select total,policy_accepted_at from orders where id=$1',[oldOrder])).rows[0];assert.equal(Number(row.total),160);assert.equal(row.policy_accepted_at,null);
 for(const file of ['db/V18_compatibility_and_transactions.sql','db/V18_pricing_and_catalog.sql','db/V18_shipping_events.sql'])await db.exec(fs.readFileSync(file,'utf8'));
 assert.equal((await db.query('select count(*)::integer as n from orders')).rows[0].n,1);
 }finally{await db.close()}
});
