import { createClient } from "npm:@supabase/supabase-js@2.117.2";

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

  const db=createClient(Deno.env.get('SUPABASE_URL')!,secretKey());
  const {data:order,error}=await db.from('orders').select('id,status,payment_method,payment_status').eq('id',orderId).single();
  if(error||!order)return json({ok:false,error:'order_not_found'},404);
  if(order.payment_method!=='cod'&&order.payment_status!=='paid')return json({ok:false,error:'payment_not_confirmed'},409);
  if(['cancelled','returned','delivered'].includes(order.status))return json({ok:false,error:'order_not_dispatchable'},409);
  const queued=await db.rpc('enqueue_fulfillment_for_paid_order',{p_order_id:orderId});
  if(queued.error)return json({ok:false,error:'queue_failed'},500);
  return json({ok:true,queued:true,message:'Shipment queued for the trusted fulfillment worker'},202);
});
