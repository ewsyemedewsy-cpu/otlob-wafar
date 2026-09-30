import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {verifyPaymobTransactionHmac} from '../services/api/src/integrations.js';
test('official Paymob canonical field order and tamper rejection',()=>{
 const obj={amount_cents:100,created_at:'2020-03-25T18:39:44.719228',currency:'EGP',error_occured:false,has_parent_transaction:false,id:2556706,integration_id:6741,is_3d_secure:true,is_auth:false,is_capture:false,is_refunded:false,is_standalone_payment:true,is_voided:false,order:{id:4778239},owner:4705,pending:false,source_data:{pan:'2346',sub_type:'MasterCard',type:'card'},success:true};
 const raw='1002020-03-25T18:39:44.719228EGPfalsefalse25567066741truefalsefalsefalsetruefalse47782394705false2346MasterCardcardtrue';
 const sig=crypto.createHmac('sha512','test-secret').update(raw).digest('hex');
 assert.equal(verifyPaymobTransactionHmac(obj,'test-secret',sig),true);assert.equal(verifyPaymobTransactionHmac({...obj,amount_cents:101},'test-secret',sig),false);assert.equal(verifyPaymobTransactionHmac(obj,'test-secret','invalid'),false);
});
