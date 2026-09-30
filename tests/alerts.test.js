import test from 'node:test';import assert from 'node:assert/strict';import {operationalAlerts} from '../services/api/src/alerts.js';
test('operational alerts include new orders, failed delivery and ambiguous payment attempts',()=>{
 const now=Date.now(),at=new Date(now-300000).toISOString();const alerts=operationalAlerts({orders:[{id:'o1',order_number:'N1',status:'pending',created_at:at},{id:'o2',order_number:'N2',status:'delivered',payment_status:'refunded',created_at:at}],payments:[{id:'p1',order_id:'o1',metadata:{creation_token:'claim',claimed_at:at},status:'pending'},{id:'p2',metadata:{creation_token:'claim',claimed_at:new Date(now).toISOString()}}],notifications:[{id:'n1',event_type:'shipped'}],fulfillments:[{id:'f1'}]},now);
 assert.equal(alerts.length,5);assert.equal(alerts.filter(a=>a.id==='order:o2').length,0);assert.equal(alerts.filter(a=>a.id==='payment-review:p2').length,0);
});
test('confirmed payment and authorization are independently visible to the store owner',()=>{
 const alerts=operationalAlerts({orders:[{id:'p',order_number:'N1',status:'processing',payment_status:'paid'},{id:'a',order_number:'N2',status:'processing',payment_status:'authorized'}]});
 assert.equal(alerts.length,2);assert.ok(alerts.some(a=>a.title==='تم تأكيد الدفع'));
});
