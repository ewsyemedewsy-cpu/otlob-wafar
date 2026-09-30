import test from 'node:test';import assert from 'node:assert/strict';
process.env.NODE_ENV='test';process.env.SUPABASE_URL='https://local-test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='local-test-not-a-real-key';process.env.ADMIN_API_KEY='test-admin-key';
process.env.ORDER_GOVERNORATES='FAYOUM';
test('HTTP guards prevent unauthorized admin/payment/invoice access and invalid orders',async()=>{
 const {app}=await import('../services/api/src/server.js');const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{
 assert.equal((await fetch(base+'/health')).status,200);
 const capabilities=await(await fetch(base+'/capabilities')).json();assert.equal(capabilities.onlinePayment,false);
 assert.deepEqual(capabilities.deliveryGovernorates,['FAYOUM']);
 const outsideRegion=await fetch(base+'/orders',{method:'POST',headers:{'content-type':'application/json','Idempotency-Key':'test-outside-region-key'},body:JSON.stringify({customer_name:'عميل اختبار',address:'عنوان اختبار',governorate:'CAIRO',payment_method:'cod',items:[{product_id:'00000000-0000-0000-0000-000000000001',quantity:1}]})});
 assert.equal(outsideRegion.status,400);assert.equal((await outsideRegion.json()).error,'delivery_region_unavailable');
 assert.equal((await fetch(base+'/admin/products')).status,401);
 assert.equal((await fetch(base+'/admin/suppliers')).status,401);
 assert.equal((await fetch(base+'/admin/alerts')).status,401);
 assert.equal((await fetch(base+'/admin/orders/00000000-0000-0000-0000-000000000001/details')).status,401);
 assert.equal((await fetch(base+'/admin/orders/not-an-id/details',{headers:{'x-admin-key':'test-admin-key'}})).status,400);
 assert.equal((await fetch(base+'/admin/orders/00000000-0000-0000-0000-000000000001/status',{method:'PATCH',headers:{'content-type':'application/json'},body:'{}'})).status,401);
 assert.equal((await fetch(base+'/admin/orders/not-an-id/status',{method:'PATCH',headers:{'content-type':'application/json','x-admin-key':'test-admin-key'},body:'{}'})).status,400);
 assert.equal((await fetch(base+'/admin/support')).status,401);
 assert.equal((await fetch(base+'/admin/support/not-an-id',{method:'PATCH',headers:{'content-type':'application/json'},body:'{}'})).status,401);
 assert.equal((await fetch(base+'/orders/not-an-id/support')).status,403);
 assert.equal((await fetch(base+'/orders/not-an-id/support',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(base+'/admin/suppliers',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
 assert.equal((await fetch(base+'/catalog/search?q=phone')).status,503);
 assert.equal((await fetch(base+'/admin/pricing/preview',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
 const quote=await fetch(base+'/admin/pricing/preview',{method:'POST',headers:{'content-type':'application/json','x-admin-key':'test-admin-key'},body:JSON.stringify({baseCost:1000,marketMin:1100,paymentFees:{rate:.0275,fixed:3,taxRate:0}})});
 assert.equal(quote.status,200);assert.ok((await quote.json()).profitRate>=.05);
 assert.equal((await fetch(base+'/admin/kpis',{headers:{'x-admin-key':'wrong'}})).status,401);
 assert.equal((await fetch(base+'/payments/paymob/intention',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,401);
 assert.equal((await fetch(base+'/orders/not-an-id/invoice')).status,403);
 assert.equal((await fetch(base+'/orders/not-an-id/status')).status,403);
 const denied=await fetch(base+'/orders/not-an-id/status',{headers:{Authorization:'Bearer invoice:wrong'}});assert.equal(denied.status,403);assert.equal(denied.headers.get('cache-control'),'no-store');
 assert.equal((await fetch(base+'/orders',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,400);
 assert.equal((await fetch(base+'/webhooks/paymob',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({obj:{success:true}})})).status,401);
 }finally{await new Promise(r=>server.close(r))}
});
