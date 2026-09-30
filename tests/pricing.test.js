import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatePrice} from '../services/api/src/pricing.js';
test('normal floor includes independent reserve',()=>{const p=calculatePrice({marketMin:110,baseCost:100});assert.equal(p.finalPrice,109.45);assert.ok(p.profitRate>=.05)});
test('above 20% gives half extra to customer and preserves more than 20%',()=>{const p=calculatePrice({marketMin:200,baseCost:100});assert.equal(p.finalPrice,159.5);assert.equal(p.mode,'optimized')});
test('emergency never activates automatically',()=>{assert.equal(calculatePrice({marketMin:105,baseCost:100}).mode,'blocked');assert.equal(calculatePrice({marketMin:105,baseCost:100,emergencyApproved:true}).mode,'emergency')});
test('approval cannot permit a loss',()=>assert.equal(calculatePrice({marketMin:99,baseCost:100,emergencyApproved:true}).mode,'blocked'));
test('invalid costs rejected',()=>{for(const c of [0,-1,NaN,Infinity])assert.throws(()=>calculatePrice({baseCost:c,marketMin:100}))});
test('10000 price scenarios preserve floor and target',()=>{for(let i=1;i<=10000;i++){const c=i/17,m=c*(1+(i%80)/100);const p=calculatePrice({baseCost:c,marketMin:m});if(p.finalPrice!=null){assert.ok(p.finalPrice+1e-8>=c*1.055);assert.ok(p.finalPrice<=p.target+1e-8);assert.ok(p.profitRate+1e-8>=.05)}}});
