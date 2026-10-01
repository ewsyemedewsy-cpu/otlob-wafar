import test from 'node:test';
import assert from 'node:assert/strict';
import {paymobStatus} from '../shared/paymob-status.js';

test('refund classification ignores unsigned totals and checks provider identity',async()=>{
  const obj={id:123,integration_id:456,amount_cents:10000,currency:'EGP',order:{id:789},is_refunded:true,refunded_amount_cents:10000};
  const inquiry={...obj,refunded_amount_cents:2000};
  const fake=data=>async url=>({ok:true,json:async()=>url.endsWith('/api/auth/tokens')?{token:'test-only'}:data});
  assert.equal(await paymobStatus(obj,{apiKey:'test-only',fetchImpl:fake(inquiry)}),'partially_refunded');
  assert.equal(await paymobStatus({...obj,refunded_amount_cents:1},{apiKey:'test-only',fetchImpl:fake(obj)}),'refunded');
  await assert.rejects(paymobStatus(obj),/refund_inquiry_required/);
  for(const changed of [{id:124},{currency:'USD'},{order:{id:790}},{integration_id:457},{amount_cents:10001},{refunded_amount_cents:0},{refunded_amount_cents:10001},{is_refunded:false}]) {
    await assert.rejects(paymobStatus(obj,{apiKey:'test-only',fetchImpl:fake({...inquiry,...changed})}));
  }
  await assert.rejects(paymobStatus(obj,{apiKey:'test-only',fetchImpl:async()=>({ok:false})}));
  assert.equal(await paymobStatus({success:true}),'paid');
  assert.equal(await paymobStatus({success:true,is_auth:true,is_capture:false}),'authorized');
});
