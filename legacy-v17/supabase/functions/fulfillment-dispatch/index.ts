import { createClient } from 'npm:@supabase/supabase-js@2';
const URL=Deno.env.get('SUPABASE_URL')!;
const KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BOSTA_KEY=Deno.env.get('BOSTA_API_KEY')||'';
const BOSTA_BASE=(Deno.env.get('BOSTA_API_BASE')||'https://app.bosta.co/api/v2').replace(/\/$/,'');
const PICKUP=Deno.env.get('BOSTA_PICKUP_ADDRESS')||'';
const db=createClient(URL,KEY);
function json(x:any,s=200){return new Response(JSON.stringify(x),{status:s,headers:{'Content-Type':'application/json'}})}
function val(o:any, keys:string[], fallback=''){for(const k of keys){if(o?.[k]!=null && String(o[k]).trim()) return String(o[k])}return fallback}
async function createShipment(order:any, items:any[]){
  if(!BOSTA_KEY||!PICKUP) throw new Error('bosta_not_configured');
  const payload:any={type:10,cod:String(order.payment_method||'')==='cod'?Number(order.total||order.total_amount||0):0,
    dropOffAddress:{firstLine:val(order,['address','shipping_address'],'NA'),city:val(order,['governorate','shipping_city','city'],'NA')},
    pickupAddress:{firstLine:PICKUP},receiver:{firstName:val(order,['customer_name','first_name'],'Customer'),phone:val(order,['whatsapp_phone','phone','customer_phone','phone_number'],'')},
    businessReference:val(order,['order_number','reference'],order.id),notes:`Emad Store ${val(order,['order_number'],order.id)}`,
    specs:{packageDetails:{description:`Emad Store ${val(order,['order_number'],order.id)}`,itemsCount:(items||[]).reduce((n,x)=>n+Number(x.quantity||0),0)},packageType:Deno.env.get('BOSTA_PACKAGE_TYPE')||'Small'}};
  const webhookUrl=Deno.env.get('BOSTA_WEBHOOK_URL')||'';
  const webhookHeaderName=Deno.env.get('BOSTA_WEBHOOK_HEADER_NAME')||'';
  const webhookSecret=Deno.env.get('BOSTA_WEBHOOK_SECRET')||'';
  if(webhookUrl){ payload.webhookUrl=webhookUrl; if(webhookHeaderName && webhookSecret) payload.webhookCustomHeaders={[webhookHeaderName]:webhookSecret}; }
  const r=await fetch(`${BOSTA_BASE}/deliveries?apiVersion=1`,{method:'POST',headers:{Authorization:BOSTA_KEY,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const raw=await r.text(); let data:any; try{data=JSON.parse(raw)}catch{data={raw}};
  if(!r.ok) throw new Error(`bosta_${r.status}:${raw.slice(0,500)}`);
  return data;
}
Deno.serve(async(req)=>{
  if(req.method!=='POST') return json({error:'method_not_allowed'},405);
  const secret=Deno.env.get('FULFILLMENT_DISPATCH_SECRET')||'';
  if(secret && req.headers.get('x-fulfillment-secret')!==secret) return json({error:'unauthorized'},401);
  // Recover workers that died while processing.
  await db.from('fulfillment_jobs').update({status:'pending',next_attempt_at:new Date().toISOString(),updated_at:new Date().toISOString()})
    .eq('status','processing').lt('updated_at',new Date(Date.now()-15*60*1000).toISOString());
  const {data:jobs,error:claimError}=await db.rpc('claim_fulfillment_jobs',{p_limit:10});
  if(claimError) return json({ok:false,error:claimError.message},500);
  const results=[];
  for(const job of jobs||[]){
    try{
      const {data:order}=await db.from('orders').select('*').eq('id',job.order_id).single();
      if(!order) throw new Error('order_not_found');
      if(order.payment_status!=='paid') throw new Error('order_not_paid');
      const {data:existing}=await db.from('shipments').select('id,provider_awb,status').eq('order_id',job.order_id).maybeSingle();
      if(existing?.provider_awb){await db.from('fulfillment_jobs').update({status:'created',provider:'bosta',updated_at:new Date().toISOString()}).eq('id',job.id);results.push({order_id:job.order_id,status:'already_created'});continue;}
      const {data:items}=await db.from('order_items').select('quantity,unit_price,product_id').eq('order_id',job.order_id);
      const data=await createShipment(order,items||[]);
      const awb=data?.trackingNumber||data?.data?.trackingNumber||data?.data?.tracking?.number||null;
      const providerOrderId=data?.id||data?.data?.id||null;
      if(!awb) throw new Error('bosta_missing_tracking_number');
      const trackingUrl=`https://tracking.bosta.co/shipments/track/${encodeURIComponent(awb)}`;
      await db.from('shipments').upsert({order_id:job.order_id,provider:'bosta',provider_awb:awb,provider_order_id:providerOrderId,tracking_url:trackingUrl,status:'created',last_provider_status:'created',last_synced_at:new Date().toISOString(),payload:data,updated_at:new Date().toISOString()},{onConflict:'order_id'});
      await db.from('orders').update({bosta_awb:awb,status:'shipped'}).eq('id',job.order_id);
      const recipient=val(order,['whatsapp_phone','phone','customer_phone','phone_number'],'');
      if(recipient) await db.rpc('enqueue_notification',{p_channel:'whatsapp',p_event_type:'shipped',p_order_id:job.order_id,p_recipient:recipient,p_payload:{order_number:val(order,['order_number'],job.order_id),awb,tracking_url:trackingUrl}});
      await db.from('fulfillment_jobs').update({status:'created',provider:'bosta',last_error:null,updated_at:new Date().toISOString()}).eq('id',job.id);
      results.push({order_id:job.order_id,status:'created',awb});
    }catch(e){
      const attempts=Number(job.attempts||0)+1; const terminal=attempts>=5;
      await db.from('fulfillment_jobs').update({status:terminal?'failed':'pending',last_error:String(e?.message||e),next_attempt_at:new Date(Date.now()+(terminal?0:Math.min(60*60*1000,Math.pow(2,attempts)*60*1000))).toISOString(),updated_at:new Date().toISOString()}).eq('id',job.id);
      results.push({order_id:job.order_id,status:terminal?'failed':'retrying',error:String(e?.message||e)});
    }
  }
  return json({ok:true,processed:results.length,results});
});
