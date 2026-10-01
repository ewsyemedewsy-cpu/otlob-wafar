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

import {deliveryAreas,validateDeliveryArea} from '../services/api/src/delivery-regions.js';
test('Fayoum city rollout requires a supported city and excludes Youssef El Seddik addresses',()=>{
 assert.deepEqual(deliveryAreas(undefined),{});assert.throws(()=>deliveryAreas('anything'));
 const areas=deliveryAreas('fayoum_cities');assert.equal(areas.FAYOUM.length,5);
 assert.equal(validateDeliveryArea({governorate:'FAYOUM',deliveryArea:'ITSA',address:'شارع في مدينة إطسا'},areas),null);
 for(const deliveryArea of [undefined,'','YOUSSEF_EL_SEDDIK','OTHER'])assert.equal(validateDeliveryArea({governorate:'FAYOUM',deliveryArea,address:'عنوان'},areas),'delivery_area_required');
 for(const address of ['مركز يوسف الصديق','يوسف الصديـق','يوسف الصدىق'])assert.equal(validateDeliveryArea({governorate:'FAYOUM',deliveryArea:'FAYOUM_CITY',address},areas),'delivery_area_unavailable');
});
