import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
test('payment callback requires saved provider order, currency, amount and open online order',async()=>{
const db=new PGlite({extensions:{pgcrypto}});try{
await db.exec('create role anon;create role authenticated;create role service_role;');
for(const f of ['db/schema.sql','db/V12_compatible_upgrade.sql','db/V17_production_upgrade.sql','legacy-v17/V15_paymob_migration.sql','legacy-v17/V16_fulfillment_migration.sql','legacy-v17/V17_hardening_migration.sql','db/V14_admin_security_migration.sql','db/V18_compatibility_and_transactions.sql','db/V18_pricing_and_catalog.sql','db/V18_shipping_events.sql','db/V19_payment_binding.sql'])await db.exec(fs.readFileSync(f,'utf8'));
await db.exec(fs.readFileSync('db/V19_payment_binding.sql','utf8'));
const id=(await db.query("insert into orders(customer_name,whatsapp_phone,governorate,address,payment_method,subtotal,shipping_fee,total) values('عميل','01012345678','CAIRO','عنوان تجربة','wallet',100,50,150) returning id")).rows[0].id;
const event=async(key,ref='123',currency='EGP',amount=15000,status='paid')=>(await db.query("select apply_paymob_event_v18($1,$2,$3,$4,$5,$6,'{}') as result",[id,key,status,amount,currency,ref])).rows[0].result;
await assert.rejects(event('missing'));
await db.query("insert into payment_intents(order_id,provider_order_id,amount) values($1,'123',150)",[id]);
for(const args of [['wrong-ref','999'],['currency','123','USD'],['null-currency','123',null],['null-amount','123','EGP',null],['amount','123','EGP',14999]])await assert.rejects(event(...args));
assert.equal((await db.query('select count(*)::int as n from payment_event_log')).rows[0].n,0);
await db.query("update orders set status='cancelled' where id=$1",[id]);await assert.rejects(event('closed'));
await db.query("update orders set status='pending' where id=$1",[id]);await event('paid');assert.equal((await event('paid')).duplicate,true);
await event('stale','123','EGP',15000,'failed');assert.equal((await db.query('select payment_status from orders')).rows[0].payment_status,'paid');
assert.equal((await db.query('select count(*)::int as n from fulfillment_jobs')).rows[0].n,1);
}finally{await db.close()}
});
