import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body: unknown, status=200) {
  return new Response(JSON.stringify(body), {status,headers:cors});
}
function secretKey() {
  const raw=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(raw) return JSON.parse(raw).default;
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}
function adminIds() {
  return new Set((Deno.env.get("ADMIN_USER_IDS")||"").split(",").map(x=>x.trim()).filter(Boolean));
}
async function caller(req:Request) {
  const h=req.headers.get("Authorization")||"";
  if(!h.startsWith("Bearer ")) return null;
  const db=createClient(Deno.env.get("SUPABASE_URL")!,secretKey());
  const {data,error}=await db.auth.getUser(h.slice(7));
  return error?null:data.user;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  const user=await caller(req);
  if(!user || !adminIds().has(user.id)) return json({ok:false,error:"admin_required"},403);

  const body=await req.json();
  const orderId=body.order_id;
  if(!orderId) return json({ok:false,error:"order_id_required"},400);

  const apiKey=Deno.env.get("BOSTA_API_KEY");
  const base=(Deno.env.get("BOSTA_API_BASE")||"https://app.bosta.co/api/v2").replace(/\/$/,"");
  if(!apiKey) return json({ok:false,error:"bosta_not_configured"},503);

  const db=createClient(Deno.env.get("SUPABASE_URL")!,secretKey());
  const {data:order,error:oe}=await db.from("orders").select("*").eq("id",orderId).single();
  if(oe) return json({ok:false,error:oe.message},404);

  const {data:items}=await db.from("order_items")
    .select("quantity,unit_price,product_id").eq("order_id",orderId);

  // The exact Bosta address fields can differ by account/zone configuration. Keep mapping configurable
  // and intentionally require a pickup address supplied by deployment configuration.
  const pickupAddress=Deno.env.get("BOSTA_PICKUP_ADDRESS");
  if(!pickupAddress) return json({ok:false,error:"bosta_pickup_address_not_configured"},503);

  const payload={
    type:10,
    cod: order.payment_method === "cod" ? Number(order.total) : 0,
    dropOffAddress:{
      firstLine: order.address,
      city: order.governorate,
    },
    pickupAddress:{firstLine:pickupAddress},
    receiver:{
      firstName: order.customer_name,
      phone: order.whatsapp_phone,
    },
    businessReference: order.order_number,
    notes:`Emad Store ${order.order_number}`,
    specs:{
      packageDetails:{
        description:`Emad Store ${order.order_number}`,
        itemsCount:(items||[]).reduce((n,x)=>n+Number(x.quantity||0),0)
      },
      packageType:Deno.env.get("BOSTA_PACKAGE_TYPE") || "Small"
    },
  };

  const resp=await fetch(`${base}/deliveries?apiVersion=1`,{
    method:"POST",
    headers:{"Authorization":apiKey,"Content-Type":"application/json"},
    body:JSON.stringify(payload)
  });
  const raw=await resp.text();
  let data:any; try{data=JSON.parse(raw)}catch{data={raw}};

  if(!resp.ok){
    await db.from("admin_audit_log").insert({
      actor_user_id:user.id,action:"bosta_create_failed",order_id:orderId,
      details:{http_status:resp.status,response:data}
    });
    return json({ok:false,error:"bosta_create_failed",provider_status:resp.status,provider_response:data},502);
  }

  const awb=data?.trackingNumber || data?.data?.trackingNumber || data?.data?.tracking?.number || null;
  const providerOrderId=data?.id || data?.data?.id || null;
  const trackingUrl=awb ? `https://tracking.bosta.co/shipments/track/${encodeURIComponent(awb)}` : null;

  await db.from("shipments").upsert({
    order_id:orderId, provider:"bosta", provider_awb:awb,
    provider_order_id:providerOrderId, tracking_url:trackingUrl,
    status:"created", last_provider_status:"created",
    last_synced_at:new Date().toISOString(), payload:data, updated_at:new Date().toISOString()
  },{onConflict:"order_id"});

  await db.from("orders").update({bosta_awb:awb,status:"shipped"}).eq("id",orderId);
  await db.from("admin_audit_log").insert({
    actor_user_id:user.id,action:"bosta_create_success",order_id:orderId,
    details:{awb,providerOrderId}
  });

  return json({ok:true,awb,providerOrderId,trackingUrl,provider_response:data});
});
