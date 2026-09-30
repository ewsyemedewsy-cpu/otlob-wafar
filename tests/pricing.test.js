import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatePrice,PAYMOB_CARD_PREVIEW} from '../services/api/src/pricing.js';
test('normal floor includes independent reserve',()=>{const p=calculatePrice({marketMin:110,baseCost:100});assert.equal(p.finalPrice,109.45);assert.ok(p.profitRate>=.05)});
test('above 20% gives half extra to customer and preserves more than 20%',()=>{const p=calculatePrice({marketMin:200,baseCost:100});assert.equal(p.finalPrice,159.5);assert.equal(p.mode,'optimized')});
test('emergency never activates automatically',()=>{assert.equal(calculatePrice({marketMin:105,baseCost:100}).mode,'blocked');assert.equal(calculatePrice({marketMin:105,baseCost:100,emergencyApproved:true}).mode,'emergency')});
test('approval cannot permit a loss',()=>assert.equal(calculatePrice({marketMin:99,baseCost:100,emergencyApproved:true}).mode,'blocked'));
test('invalid costs rejected',()=>{for(const c of [0,-1,NaN,Infinity])assert.throws(()=>calculatePrice({baseCost:c,marketMin:100}))});
test('10000 price scenarios preserve floor and target',()=>{for(let i=1;i<=10000;i++){const c=i/17,m=c*(1+(i%80)/100);const p=calculatePrice({baseCost:c,marketMin:m});if(p.finalPrice!=null){assert.ok(p.finalPrice+1e-8>=c*1.055);assert.ok(p.finalPrice<=p.target+1e-8);assert.ok(p.profitRate+1e-8>=.05)}}});
test('published card fee is taken before profit and reserve',()=>{
 const p=calculatePrice({baseCost:1000,marketMin:1100,paymentFees:PAYMOB_CARD_PREVIEW});
 assert.equal(p.finalPrice,1094.5);assert.equal(p.paymentFee,33.1);
 assert.equal(p.riskReserve,5);assert.ok(p.profitRate>=.05);
 assert.equal(calculatePrice({baseCost:1000,marketMin:1070,paymentFees:PAYMOB_CARD_PREVIEW}).mode,'blocked');
});
test('one fixed fee per multi-item order, percentage includes shipping',()=>{
 const p=calculatePrice({baseCost:2000,marketMin:2200,paymentFees:PAYMOB_CARD_PREVIEW,shippingCharge:50,shippingCost:50});
 assert.equal(p.paymentFee,Math.ceil(((p.finalPrice+50)*.0275+3)*100-1e-8)/100);
 assert.ok(p.profitRate>=.05);
});
test('fee tax and settlement rounding never consume protected margin',()=>{
 for(let i=1;i<=10000;i++){
  const c=i/17,p=calculatePrice({baseCost:c,marketMin:c*1.6,paymentFees:{rate:.0275,fixed:3,taxRate:.14},shippingCharge:50,shippingCost:50});
  if(p.finalPrice!==null){assert.ok(p.profitRate+1e-8>=.05);assert.ok(p.finalPrice<=p.target);}
 }
});
test('invalid or unknown fee settings rejected',()=>{
 for(const paymentFees of [{rate:1,fixed:0,taxRate:0},{rate:-.1,fixed:0,taxRate:0},{rate:.0275,fixed:3,taxRate:null},{rate:0,fixed:NaN,taxRate:0}])
 assert.throws(()=>calculatePrice({baseCost:100,marketMin:200,paymentFees}));
});
