import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';import {supplierRecord} from '../services/api/src/suppliers.js';
test('supplier contacts and unit purchase rules are validated without activating purchases',()=>{
 const row=supplierRecord({name:'مورد',phone:'01012345678',order_method:'visit',address:'القاهرة'});assert.equal(row.allows_single_units,false);assert.equal(row.direct_fulfillment,false);
 assert.throws(()=>supplierRecord({name:'مورد',phone:'01012345678',allows_single_units:true,min_order_quantity:10}));
 assert.throws(()=>supplierRecord({name:'مورد',website:'javascript:alert(1)'}));assert.throws(()=>supplierRecord({name:'مورد'}));
 assert.equal(supplierRecord({name:'مورد',email:'shop@example.com',allows_single_units:true,min_order_quantity:1}).allows_single_units,true);
});
test('supplier directory migration preserves contacts and blocks public access',async()=>{
 const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role;create table suppliers(id integer primary key,name text not null,whatsapp_phone text not null);insert into suppliers values(1,'مورد محفوظ','201012345678');");
 const sql=fs.readFileSync('supabase/migrations/20260930134059_supplier_directory.sql','utf8');await db.exec(sql);await db.exec(sql);
 const row=(await db.query('select * from suppliers')).rows[0];assert.equal(row.whatsapp_phone,'201012345678');assert.equal(row.allows_single_units,false);assert.equal(row.order_method,'contact');
 await assert.rejects(db.exec('update suppliers set allows_single_units=true,min_order_quantity=10'));
 await db.exec('set role anon');await assert.rejects(db.query('select * from suppliers'));await db.exec('reset role');
 }finally{await db.close();}
});
