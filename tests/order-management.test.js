import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
test('manual COD changes preserve stock, audit atomically and reject stale or dispatched orders',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
 try{
 await db.exec('create role anon;create role authenticated;create role service_role;');
 for(const file of ['db/schema.sql','db/V12_compatible_upgrade.sql','db/V17_production_upgrade.sql','legacy-v17/V15_paymob_migration.sql','legacy-v17/V16_fulfillment_migration.sql','legacy-v17/V17_hardening_migration.sql','db/V14_admin_security_migration.sql','db/V18_compatibility_and_transactions.sql','db/V20_manual_order_management.sql'])await db.exec(fs.readFileSync(file,'utf8'));
 await db.exec(fs.readFileSync('db/V20_manual_order_management.sql','utf8'));
 const product=(await db.query("insert into products(sku,title_ar,supplier_cost,retail_price,stock_quantity)values('LOCAL','منتج محلي',100,110,10)returning id")).rows[0].id;
 const create=async key=>(await db.query("select create_order_v18($1,'عميل','01012345678','FAYOUM','عنوان تجربة محلية','cod',$2::jsonb,null,'shipping-v1',true) as result",[key,JSON.stringify([{product_id:product,quantity:2}])])).rows[0].result;
 const update=async(id,from,to,note='تحقق الموظف من الطلب')=>(await db.query('select update_manual_order_status($1,$2,$3,$4) as result',[id,from,to,note])).rows[0].result;
 const stock=async()=>(await db.query('select stock_quantity from products where id=$1',[product])).rows[0].stock_quantity;
 const a=await create('manual-order-key-0001');assert.equal(await stock(),8);
 await assert.rejects(update(a.id,'pending','delivered'),/invalid_transition/);
 await assert.rejects(update(a.id,'pending','processing',''),/note_required/);
 await update(a.id,'pending','processing');
 await assert.rejects(update(a.id,'pending','cancelled'),/order_changed/);
 await update(a.id,'processing','cancelled');assert.equal(await stock(),10);
 await assert.rejects(update(a.id,'cancelled','processing'),/invalid_transition/);assert.equal(await stock(),10);
 await assert.rejects(db.query('select enqueue_fulfillment_for_paid_order($1)',[a.id]),/order_not_dispatchable/);
 assert.equal((await db.query('select count(*)::int as n from admin_audit_log where order_id=$1',[a.id])).rows[0].n,2);
 const b=await create('manual-order-key-0002');await update(b.id,'pending','processing');await update(b.id,'processing','delivered');assert.equal(await stock(),8);
 assert.equal((await db.query('select payment_status from orders where id=$1',[b.id])).rows[0].payment_status,'unpaid');
 const c=await create('manual-order-key-0003');await db.query('select enqueue_fulfillment_for_paid_order($1)',[c.id]);await assert.rejects(update(c.id,'pending','cancelled'),/fulfillment_requires_review/);assert.equal(await stock(),6);
 const d=await create('manual-order-key-0004');await db.query("update orders set payment_method='wallet' where id=$1",[d.id]);await assert.rejects(update(d.id,'pending','processing'),/manual_cod_only/);
 const e=await create('manual-order-key-0005');
 await db.exec("create function fail_audit_test() returns trigger language plpgsql as $$begin raise exception 'audit_unavailable';end$$;create trigger fail_audit_test before insert on admin_audit_log for each row execute function fail_audit_test();");
 await assert.rejects(update(e.id,'pending','cancelled'),/audit_unavailable/);assert.equal(await stock(),2);assert.equal((await db.query('select status from orders where id=$1',[e.id])).rows[0].status,'pending');
 const roles=(await db.query("select has_function_privilege('anon','update_manual_order_status(uuid,text,text,text)','EXECUTE') as anon,has_function_privilege('authenticated','update_manual_order_status(uuid,text,text,text)','EXECUTE') as customer,has_function_privilege('service_role','update_manual_order_status(uuid,text,text,text)','EXECUTE') as server")).rows[0];assert.deepEqual(roles,{anon:false,customer:false,server:true});
 }finally{await db.close()}
});
