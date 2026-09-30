import test from 'node:test';
import assert from 'node:assert/strict';
import {deliveryRegions,deliveryRegionCodes} from '../services/api/src/delivery-regions.js';

test('delivery rollout preserves all regions and supports an explicit Fayoum-only scope',()=>{
  assert.deepEqual(deliveryRegions(undefined),deliveryRegionCodes);
  assert.deepEqual(deliveryRegions('FAYOUM'),['FAYOUM']);
  assert.deepEqual(deliveryRegions(' FAYOUM, CAIRO,FAYOUM '),['FAYOUM','CAIRO']);
  for(const invalid of ['', ' ', 'FAYOUM,', 'FAYOM', '*', 'FAYOUM,UNKNOWN']) {
    assert.throws(()=>deliveryRegions(invalid),/Invalid ORDER_GOVERNORATES/);
  }
});
