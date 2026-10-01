import test from 'node:test';import assert from 'node:assert/strict';
import {normalProductFloor} from '../services/api/src/product-floor.js';
test('admin floor includes packaging and rejects unsafe cost data',()=>{
 const p={supplier_cost:265,retail_price:280,specifications:{packaging_cost:.4}};
 assert.equal(normalProductFloor(p),true);
 assert.equal(normalProductFloor({...p,retail_price:279.99}),false);
 assert.equal(normalProductFloor({...p,specifications:{packaging_cost:1}}),false);
 for(const packaging_cost of [-1,'invalid',Infinity])assert.equal(normalProductFloor({...p,specifications:{packaging_cost}}),false);
 assert.equal(normalProductFloor({...p,supplier_cost:null}),false);
 assert.equal(p.supplier_cost,265);
});
