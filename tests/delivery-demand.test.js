import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PGlite} from '@electric-sql/pglite';import {demandAlerts} from '../services/api/src/delivery-demand.js';
test('private delivery signals deduplicate without modifying orders and summarize sources',async()=>{
 const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role;create table orders(id int);insert into orders values(1);");
 const migration=fs.readFileSync('supabase/migrations/20260930232625_delivery_demand_signals.sql','utf8');await db.exec(migration);await db.exec(migration);
 await db.exec('set role service_role');
 const record=async(region,source,key)=>db.query('select record_delivery_demand($1,$2,$3) as inserted',[region,source,key]);
 assert.equal((await record('CAIRO','customer_interest','anonymous-test-key-1')).rows[0].inserted,true);
 assert.equal((await record('CAIRO','customer_interest','anonymous-test-key-1')).rows[0].inserted,false);
 await record('CAIRO','blocked_checkout','anonymous-test-key-1');await record('GIZA','customer_interest','anonymous-test-key-2');
 const rows=(await db.query('select delivery_demand_summary(30) as summary')).rows[0].summary;
 assert.equal(rows[0].region,'CAIRO');assert.equal(rows[0].interest_count,1);assert.equal(rows[0].blocked_count,1);assert.equal(rows.length,2);
 for(const args of [['UNKNOWN','customer_interest','anonymous-test-key'],['CAIRO','purchase','anonymous-test-key'],['CAIRO','customer_interest','short']])await assert.rejects(record(...args),/invalid_delivery_demand/);
 await assert.rejects(db.query('select delivery_demand_summary(91)'),/invalid_summary_window/);
 await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n,1);
 const columns=(await db.query("select column_name from information_schema.columns where table_name='delivery_demand_events'" )).rows.map(r=>r.column_name);assert.ok(!columns.some(c=>/phone|address|customer|ip/.test(c)));
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from delivery_demand_events'),/permission denied/);await assert.rejects(record('CAIRO','customer_interest','anonymous-test-key-3'),/permission denied/);await assert.rejects(db.query('select delivery_demand_summary(30)'),/permission denied/);await db.exec('reset role')}
 const alerts=demandAlerts(rows);assert.match(alerts[0].detail,/ليست طلبات مؤكدة/);assert.ok(alerts[0].id.includes(rows[0].last_signal));
 }finally{await db.close()}
});
