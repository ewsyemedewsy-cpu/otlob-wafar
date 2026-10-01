import test from 'node:test';import assert from 'node:assert/strict';import {reviewCatalogProduct} from '../shared/catalog-review.js';
const fees={rate:.0275,fixed:3,taxRate:0,shippingCharge:50,shippingCost:50};
test('catalog audit catches fees and shipping consuming apparent profit without mutating products',()=>{
 const p={retail_price:106,supplier_cost:100,available:true};
 assert.equal(reviewCatalogProduct(p,fees).status,'below_floor');assert.equal(p.available,true);assert.equal(p.retail_price,106);
 assert.equal(reviewCatalogProduct({...p,retail_price:120},fees).status,'passes_scenario');
 assert.equal(reviewCatalogProduct({...p,retail_price:120},{...fees,shippingCost:80}).status,'below_floor');
 assert.equal(reviewCatalogProduct({...p,supplier_cost:null},fees).status,'invalid_data');
});
test('packaging is included in the floor while preserving purchase cost',()=>{
 const p={retail_price:280,supplier_cost:265,specifications:{packaging_cost:.4}};
 const cod={rate:0,fixed:0,taxRate:0,shippingCharge:35,shippingCost:35};
 const result=reviewCatalogProduct(p,cod);
 assert.equal(result.status,'passes_scenario');
 assert.equal(result.totalProductCost,265.4);
 assert.ok(Math.abs(result.profit-13.273)<1e-8);
 assert.equal(p.supplier_cost,265);
 assert.equal(reviewCatalogProduct({...p,specifications:{packaging_cost:1}},cod).status,'below_floor');
 assert.equal(reviewCatalogProduct({...p,specifications:{packaging_cost:-1}},cod).status,'invalid_data');
});
