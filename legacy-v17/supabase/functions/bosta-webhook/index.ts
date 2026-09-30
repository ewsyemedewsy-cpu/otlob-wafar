import { createClient } from "npm:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-bosta-signature","Content-Type":"application/json; charset=utf-8"};
function json(x:any,s=200){return new Response(JSON.stringify(x),{status:s,headers:cors})}
function key(){const r=Deno.env.get("SUPABASE_SECRET_KEYS");return r?JSON.parse(r).default:Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({ok:false,error:"method_not_allowed"},405);

  // Verify the webhook signature here if Bosta supplies one for the enabled account.
  // Keep the function behind this explicit integration endpoint and do not trust a
  // browser-originated request.
  const expected=Deno.env.get("BOSTA_WEBHOOK_SECRET");
  const headerName=Deno.env.get("BOSTA_WEBHOOK_HEADER_NAME") || "Authorization";
  if(expected){
    const supplied=req.headers.get(headerName);
    if(!supplied || supplied!==expected) return json({ok:false,error:"invalid_signature"},401);
  }

  const body=await req.json();
  const eventId=String(body?.id || body?.eventId || body?.event_id || crypto.randomUUID());
  const eventType=String(body?.event || body?.eventType || body?.status || "unknown");
  const awb=body?.trackingNumber || body?.awb || body?.data?.trackingNumber || null;

  const db=createClient(Deno.env.get("SUPABASE_URL")!,key());
  const {data:existing}=await db.from("integration_events").select("event_id").eq("provider","bosta").eq("event_id",eventId).maybeSingle();
  if(existing) return json({ok:true,duplicate:true});

  const state = Number(body?.state);
  const stateMap:any={
    10:"pending", 11:"pending", 20:"pending", 21:"picked_up", 22:"out_for_delivery",
    23:"picked_up", 24:"in_transit", 25:"delivered", 30:"in_transit",
    40:"out_for_delivery", 41:"out_for_delivery", 45:"delivered",
    46:"returned", 47:"failed", 48:"cancelled", 49:"cancelled",
    60:"returned", 100:"failed", 101:"failed", 102:"in_transit",
    103:"in_transit", 104:"in_transit", 105:"in_transit"
  };
  const shipmentStatus = stateMap[state] || "in_transit";
  const orderStatus:any={
    delivered:"delivered", returned:"returned",
    cancelled:"cancelled", failed:"delivery_failed"
  };
  const mappedOrderStatus=orderStatus[shipmentStatus] || "shipped";

  let orderId=null;
  if(awb){
    const {data:sh}=await db.from("shipments")
      .select("order_id").eq("provider","bosta").eq("provider_awb",String(awb)).maybeSingle();
    orderId=sh?.order_id || null;
  }
  if(!orderId && body?.businessReference){
    const {data:ord}=await db.from("orders")
      .select("id").eq("order_number",String(body.businessReference)).maybeSingle();
    orderId=ord?.id || null;
  }


  await db.from("integration_events").insert({
    provider:"bosta",event_id:eventId,event_type:eventType,order_id:orderId,payload:body
  });

  if(orderId){
    const patch:any={
      payload:body,
      updated_at:new Date().toISOString(),
      last_provider_status:String(state),
      last_synced_at:new Date().toISOString(),
      status:shipmentStatus
    };
    await db.from("shipments").update(patch).eq("order_id",orderId);
    const orderPatch:any={status:mappedOrderStatus};
    if(awb) orderPatch.bosta_awb=String(awb);
    if(state===47 || state===49 || state===100 || state===101){
      orderPatch.delivery_failure_reason=body?.exceptionReason || body?.exceptionCode
        ? `${body?.exceptionReason || ""}${body?.exceptionCode ? ` [${body.exceptionCode}]` : ""}`.trim()
        : null;
    }
    await db.from("orders").update(orderPatch).eq("id",orderId);
    const {data:ord}=await db.from('orders').select('order_number,phone,customer_phone,phone_number,whatsapp_phone').eq('id',orderId).maybeSingle();
    const recipient=ord?.whatsapp_phone||ord?.phone||ord?.customer_phone||ord?.phone_number||'';
    const eventMap:any={delivered:'delivered',returned:'returned',shipped:'shipped'};
    const eventName=eventMap[shipmentStatus];
    if(recipient && eventName) await db.rpc('enqueue_notification',{p_channel:'whatsapp',p_event_type:eventName,p_order_id:orderId,p_recipient:String(recipient),p_payload:{order_number:String(ord?.order_number||orderId),awb:awb||null,status:shipmentStatus}});
  }


  await db.from("integration_events").update({processed_at:new Date().toISOString()})
    .eq("provider","bosta").eq("event_id",eventId);

  return json({ok:true,orderId,eventId});
});
