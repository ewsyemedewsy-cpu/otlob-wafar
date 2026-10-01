import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';
test('support migration preserves orders, restricts client access and deduplicates requests',async()=>{
 const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role;create table orders(id uuid primary key,status text);insert into orders values('00000000-0000-4000-8000-000000000001','delivered');");
 const sql=fs.readFileSync('supabase/migrations/20260930152217_customer_support_requests.sql','utf8');await db.exec(sql);await db.exec(sql);
 const insert="insert into customer_support_requests(order_id,kind,message,request_key) values('00000000-0000-4000-8000-000000000001','return','طلب استرجاع المنتج بسبب عيب','00000000-0000-4000-8000-000000000002')";
 await db.exec(insert);await assert.rejects(db.exec(insert));assert.equal((await db.query('select status from orders')).rows[0].status,'delivered');
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from customer_support_requests'));await assert.rejects(db.exec(insert));await assert.rejects(db.exec("update customer_support_requests set status='resolved'"));await assert.rejects(db.exec('delete from customer_support_requests'));await db.exec('reset role');}
 await assert.rejects(db.exec("update customer_support_requests set status='refunded'"));
 }finally{await db.close();}
});
