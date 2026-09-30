import test from 'node:test';import assert from 'node:assert/strict';
import {quoteSources,searchSourceFeeds} from '../services/api/src/sourcing.js';
const now=Date.now(),offer={productKey:'GTIN-EXACT-VARIANT',title:'منتج',currency:'EGP',verifiedMatch:true,marketMinQuantity:1,inStock:true,observedAt:new Date(now).toISOString(),marketTotal:200,supplierId:'supplier-1',purchaseCost:100,supplierShipping:10,directFulfillmentAgreed:true,allowsSingleUnits:true,minQuantity:1,priceBasis:'unit'};
test('source selection uses delivered purchase cost and protected net margin',()=>{
 const rows=quoteSources([offer,{...offer,supplierId:'supplier-2',purchaseCost:95,supplierShipping:30}],{now});
 assert.equal(rows[0].supplierId,'supplier-1');assert.ok(rows[0].pricing.profitRate>=.05);assert.ok(rows[0].pricing.finalPrice<200);
});
test('retail arbitrage cannot promise cheaper prices when the margin is unavailable',()=>{
 assert.equal(quoteSources([{...offer,marketTotal:100}],{now})[0].status,'margin_unavailable');
 assert.equal(quoteSources([{...offer,directFulfillmentAgreed:false}],{now})[0].status,'supplier_agreement_required');
});
test('wholesale and pack prices cannot masquerade as a purchasable single item',()=>{
 for(const change of [{minQuantity:10},{priceBasis:'pack'},{allowsSingleUnits:false},{minQuantity:undefined}])assert.equal(quoteSources([{...offer,...change}],{now})[0].status,'supplier_agreement_required');
 const result=quoteSources([{...offer,purchaseCost:1,minQuantity:100},{...offer,supplierId:'single-item-supplier'}],{now});assert.equal(result[0].supplierId,'single-item-supplier');
});
test('unverified, stale, future, unavailable or wrong-currency offers are excluded',()=>{
 for(const changes of [{verifiedMatch:false},{marketMinQuantity:10},{marketMinQuantity:undefined},{inStock:false},{currency:'USD'},{observedAt:new Date(now-3600001).toISOString()},{observedAt:new Date(now+1).toISOString()},{productKey:''}])assert.deepEqual(quoteSources([{...offer,...changes}],{now}),[]);
});
test('source outages do not invent results and configured identity wins',async()=>{
 const result=await searchSourceFeeds('هاتف',{feeds:[{endpoint:'https://example.invalid/feed',name:'مورد',supplierId:'approved',directFulfillmentAgreed:false},{endpoint:'https://down.invalid/feed'}],fetchImpl:async url=>{if(url.host==='down.invalid')throw Error('down');return new Response(JSON.stringify({offers:[offer]}),{headers:{'content-type':'application/json'}});}});
 assert.equal(result.sourcesChecked,1);assert.equal(result.sourcesUnavailable,1);assert.equal(result.offers[0].supplierId,'approved');assert.equal(result.offers[0].directFulfillmentAgreed,false);
 await assert.rejects(searchSourceFeeds('x'));
});
test('customer reference links never become fetch targets or carry URL credentials',async()=>{
 const targets=[];const fetchImpl=async url=>{targets.push(new URL(url));return new Response(JSON.stringify({offers:[]}));};
 await searchSourceFeeds('هاتف',{feeds:[{endpoint:'https://approved.invalid/feed'}],referenceUrl:'https://shop.invalid/product#section',fetchImpl});
 assert.equal(targets[0].host,'approved.invalid');assert.equal(targets[0].searchParams.get('reference_url'),'https://shop.invalid/product');
 for(const referenceUrl of ['http://shop.invalid/item','https://user:password@shop.invalid/item','not-a-url',123])await assert.rejects(searchSourceFeeds('هاتف',{feeds:[],referenceUrl,fetchImpl}));
});
