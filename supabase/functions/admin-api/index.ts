import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function secretKey() {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) return JSON.parse(raw).default;
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
}

function allowedAdminIds() {
  return new Set((Deno.env.get("ADMIN_USER_IDS") || "")
    .split(",").map(x => x.trim()).filter(Boolean));
}

async function getCaller(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, secretKey());
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const user = await getCaller(req);
  if (!user) return json({ ok:false, error:"unauthorized" }, 401);

  if (!allowedAdminIds().has(user.id)) {
    return json({ ok:false, error:"admin_required" }, 403);
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, secretKey());
  const url = new URL(req.url);
  let body:any = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch {}
  }
  const action = body.action || url.searchParams.get("action") || "orders";

  try {
    if (req.method === "GET" && action === "orders") {
      const q = url.searchParams.get("q");
      const status = url.searchParams.get("status");
      const limit = Number(url.searchParams.get("limit") || 50);
      const offset = Number(url.searchParams.get("offset") || 0);
      const { data, error } = await db.rpc("admin_list_orders", {
        p_q: q, p_status: status, p_limit: limit, p_offset: offset
      });
      if (error) throw error;
      return json({ok:true, data});
    }

    if (req.method === "GET" && action === "order") {
      const id = url.searchParams.get("id");
      if (!id) return json({ok:false,error:"order_id_required"},400);

      const [{data: order, error: oe}, {data: items, error: ie}, {data: shipment, error: se}] =
        await Promise.all([
          db.from("orders").select("*").eq("id",id).single(),
          db.from("order_items").select("id,product_id,quantity,unit_price,pricing_mode_snapshot").eq("order_id",id),
          db.from("shipments").select("*").eq("order_id",id).maybeSingle()
        ]);
      if (oe) throw oe; if (ie) throw ie; if (se) throw se;
      return json({ok:true,order,items,shipment});
    }

    if (req.method === "POST") {
      const orderId = body.order_id;
      if (!orderId) return json({ok:false,error:"order_id_required"},400);

      if (action === "shipment") {
        const patch:any = {};
        if (body.provider !== undefined) patch.provider = String(body.provider);
        if (body.awb !== undefined) patch.provider_awb = body.awb ? String(body.awb) : null;
        if (body.status !== undefined) patch.status = String(body.status);
        patch.updated_at = new Date().toISOString();

        const { data, error } = await db.from("shipments")
          .upsert({order_id:orderId,...patch},{onConflict:"order_id"}).select().single();
        if (error) throw error;

        await db.from("admin_audit_log").insert({
          actor_user_id:user.id, action:"shipment_update", order_id:orderId,
          details:{patch}
        });
        return json({ok:true,data});
      }

      if (action === "status") {
        const allowed = new Set(["pending","processing","shipped","delivered","returned","cancelled","delivery_failed"]);
        if (!allowed.has(body.status)) return json({ok:false,error:"invalid_status"},400);
        const { data, error } = await db.from("orders").update({
          status:body.status
        }).eq("id",orderId).select("id,order_number,status").single();
        if (error) throw error;
        await db.from("admin_audit_log").insert({
          actor_user_id:user.id, action:"order_status_update", order_id:orderId,
          details:{status:body.status,note:body.note||null}
        });
        return json({ok:true,data});
      }

      if (action === "claim") {
        const decision = String(body.decision || "");
        if (!["approved","waived","disputed"].includes(decision))
          return json({ok:false,error:"invalid_claim_decision"},400);
        const amount = Math.max(0,Number(body.amount || 0));
        const { data, error } = await db.from("orders").update({
          shipping_claim_amount: amount,
          shipping_claim_status: decision
        }).eq("id",orderId).select("id,order_number,shipping_claim_amount,shipping_claim_status").single();
        if (error) throw error;
        await db.from("admin_audit_log").insert({
          actor_user_id:user.id, action:"shipping_claim_review", order_id:orderId,
          details:{decision,amount,reason:body.reason||null}
        });
        return json({ok:true,data});
      }
    }

    return json({ok:false,error:"unknown_action"},404);
  } catch (e) {
    console.error(e);
    return json({ok:false,error:String(e instanceof Error ? e.message : e)},500);
  }
});
