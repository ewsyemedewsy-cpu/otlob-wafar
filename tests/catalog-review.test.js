import test from 'node:test';import assert from 'node:assert/strict';import {reviewCatalogProduct} from '../shared/catalog-review.js';
const fees={rate:.0275,fixed:3,taxRate:0,shippingCharge:50,shippingCost:50};
test('catalog audit catches fees and shipping consuming apparent profit without mutating products',()=>{
 const p={retail_price:106,supplier_cost:100,available:true};
 assert.equal(reviewCatalogProduct(p,fees).status,'below_floor');assert.equal(p.available,true);assert.equal(p.retail_price,106);
 assert.equal(reviewCatalogProduct({...p,retail_price:120},fees).status,'passes_scenario');
 assert.equal(reviewCatalogProduct({...p,retail_price:120},{...fees,shippingCost:80}).status,'below_floor');
 assert.equal(reviewCatalogProduct({...p,supplier_cost:null},fees).status,'invalid_data');
});
