import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
test('admin order details use recorded quantities and prices and fail closed on unavailable history',async()=>{
 const id='00000000-0000-0000-0000-000000000001';let mode='ok',requests=0;const selections=[];
 const database=http.createServer((req,res)=>{requests++;const url=new URL(req.url,'http://localhost');selections.push(url.searchParams.get('select'));res.setHeader('Content-Type','application/json');
 if(url.pathname==='/rest/v1/orders')return res.end(JSON.stringify(mode==='missing'?[]:[{id}]));
 if(url.pathname==='/rest/v1/order_items')return res.end(JSON.stringify([{id:1,product_id:'p1',quantity:2,unit_price:230,product:{sku:'SHOE-41',title_ar:'كوتشي',specifications:{size:'41',color:'أسود',internal:'private'}}}]));
 if(url.pathname==='/rest/v1/admin_audit_log'){if(mode==='history-failed'){res.statusCode=500;return res.end(JSON.stringify({message:'unavailable'}));}return res.end(JSON.stringify([{id:1,action:'manual_order_status_update',details:{from:'pending',to:'processing',note:'تأكدنا من المقاس'},created_at:'2026-09-30T20:00:00Z'}]));}
 res.statusCode=404;res.end('{}');});
 await new Promise(resolve=>database.listen(0,'127.0.0.1',resolve));
 process.env.NODE_ENV='test';process.env.SUPABASE_URL='http://127.0.0.1:'+database.address().port;process.env.SUPABASE_SERVICE_ROLE_KEY='local-test-not-a-real-key';process.env.ADMIN_API_KEY='test-admin-key';
 const {app}=await import('../services/api/src/server.js');const api=app.listen(0,'127.0.0.1');await new Promise(resolve=>api.once('listening',resolve));const url='http://127.0.0.1:'+api.address().port+'/admin/orders/'+id+'/details';
 try{
 assert.equal((await fetch(url)).status,401);assert.equal(requests,0);
 const response=await fetch(url,{headers:{'x-admin-key':'test-admin-key'}});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const data=await response.json();
 assert.deepEqual(data.items,[{id:1,product_id:'p1',quantity:2,unit_price:230,sku:'SHOE-41',title:'كوتشي',size:'41',color:'أسود'}]);assert.equal(data.history[0].details.note,'تأكدنا من المقاس');assert.equal(data.catalogDetailsAreCurrent,true);assert.ok(selections.every(value=>!value.includes('supplier_cost')));
 mode='missing';assert.equal((await fetch(url,{headers:{'x-admin-key':'test-admin-key'}})).status,404);
 mode='history-failed';const failed=await fetch(url,{headers:{'x-admin-key':'test-admin-key'}});assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{error:'order_details_unavailable'});
 }finally{await new Promise(resolve=>api.close(resolve));await new Promise(resolve=>database.close(resolve));}
});
