import { createClient } from "npm:@supabase/supabase-js@2.117.2";

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
  if(!expected)return json({ok:false,error:"webhook_not_configured"},503);
  if(expected){
    const supplied=req.headers.get(headerName);
    if(!supplied || supplied!==expected) return json({ok:false,error:"invalid_signature"},401);
  }

  const body=await req.json().catch(()=>null);if(!body)return json({ok:false,error:'invalid_payload'},400);
  const timestamp=Number(body.timeStamp);if(!Number.isSafeInteger(timestamp)||timestamp<=0)return json({ok:false,error:'timestamp_required'},400);
  const eventId=String(body.eventId||body.event_id||`${body._id||body.trackingNumber||body.businessReference}:${body.state}:${timestamp}`);
  const awb=body?.trackingNumber || body?.awb || body?.data?.trackingNumber || null;

  const db=createClient(Deno.env.get("SUPABASE_URL")!,key());
  const state = Number(body?.state);
  const stateMap:any={
    10:"pending", 11:"pending", 20:"pending", 21:"picked_up", 22:"picked_up",
    23:"picked_up", 24:"in_transit", 25:"in_transit", 30:"in_transit",
    40:"out_for_delivery", 41:"out_for_delivery", 45:"delivered",
    46:"returned", 47:"failed", 48:"cancelled", 49:"cancelled",
    60:"returned", 100:"failed", 101:"failed", 102:"in_transit",
    103:"in_transit", 104:"in_transit", 105:"in_transit"
  };
  const shipmentStatus = stateMap[state];
  if(!shipmentStatus)return json({ok:false,error:'unknown_state'},422);
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


  if(!orderId)return json({ok:false,error:'order_not_found'},404);
  const applied=await db.rpc('apply_bosta_event_v18',{p_order_id:orderId,p_event_id:eventId,p_status:shipmentStatus,p_timestamp:timestamp,p_awb:awb?String(awb):null,p_payload:body});
  if(applied.error)return json({ok:false,error:'shipment_update_failed'},500);
  return json({ok:true,...applied.data});
});
