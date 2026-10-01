import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
test('outside-region signals are recorded separately and recording failure never creates an order',async()=>{
 const calls=[];let fail=false;
 const backend=http.createServer((req,res)=>{let raw='';req.on('data',x=>raw+=x);req.on('end',()=>{calls.push({path:req.url,body:JSON.parse(raw||'{}')});res.setHeader('Content-Type','application/json');if(fail){res.statusCode=503;res.end('{"message":"unavailable"}')}else res.end('true')})});
 await new Promise(r=>backend.listen(0,'127.0.0.1',r));
 process.env.NODE_ENV='test';process.env.SUPABASE_URL='http://127.0.0.1:'+backend.address().port;process.env.SUPABASE_SERVICE_ROLE_KEY='local-test-not-a-real-key';process.env.ORDER_GOVERNORATES='FAYOUM';process.env.ORDER_DELIVERY_SCOPE='fayoum_cities';
 const {app}=await import('../services/api/src/server.js');const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'anonymous-test-request'},body:JSON.stringify(body)});
 try{
 const local={customer_name:'test',address:'عنوان في المدينة',governorate:'FAYOUM',items:[{product_id:'test',quantity:1}]};
 assert.equal((await post('/orders',local)).status,400);assert.equal((await post('/orders',{...local,delivery_area:'YOUSSEF_EL_SEDDIK'})).status,400);assert.equal((await post('/orders',{...local,delivery_area:'ITSA',address:'مركز يوسف الصديق'})).status,400);assert.equal(calls.length,0);
 const signal=await post('/delivery-interest',{governorate:'CAIRO',customer_name:'must not be forwarded',address:'must not be forwarded'});assert.equal(signal.status,202);assert.deepEqual(await signal.json(),{recorded:true,orderCreated:false});assert.deepEqual(calls[0].body,{p_region:'CAIRO',p_source:'customer_interest',p_request_key:'anonymous-test-request'});
 assert.equal((await post('/delivery-interest',{governorate:'FAYOUM'})).status,400);assert.equal((await post('/delivery-interest',{governorate:'UNKNOWN'})).status,400);
 const payload={customer_name:'test',address:'test',governorate:'CAIRO',items:[{product_id:'test',quantity:1}]};
 const blocked=await post('/orders',payload);assert.equal(blocked.status,400);assert.equal((await blocked.json()).interestRecorded,true);assert.equal(calls.at(-1).body.p_source,'blocked_checkout');
 fail=true;const failed=await post('/orders',payload);assert.equal(failed.status,400);assert.equal((await failed.json()).interestRecorded,false);
 assert.equal((await post('/delivery-interest',{governorate:'CAIRO'})).status,503);assert.ok(calls.every(c=>c.path==='/rest/v1/rpc/record_delivery_demand'));
 }finally{await new Promise(r=>server.close(r));await new Promise(r=>backend.close(r))}
});
