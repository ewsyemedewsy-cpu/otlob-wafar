import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac, timingSafeEqual } from 'node:crypto';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PAYMOB_HMAC_SECRET = Deno.env.get('PAYMOB_HMAC_SECRET')!;
const PAYMOB_INTEGRATION_IDS = new Set((Deno.env.get('PAYMOB_INTEGRATION_IDS') || '').split(',').map(x=>Number(x.trim())).filter(Number.isFinite));

const hmacKeys = [
  'amount_cents','created_at','currency','error_occured','has_parent_transaction','id',
  'integration_id','is_3d_secure','is_auth','is_capture','is_refunded','is_standalone_payment',
  'is_void','is_voided','order','owner','pending','source_data.pan','source_data.sub_type',
  'source_data.type','success'
];

function getPath(obj: any, path: string) {
  return path.split('.').reduce((v, k) => v?.[k], obj);
}

function canonicalValue(v: any) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return String(v.id ?? '');
  return String(v);
}

function verifyHmac(obj: any, supplied: string) {
  if (!PAYMOB_HMAC_SECRET || !supplied) return false;
  const raw = hmacKeys.map(k => canonicalValue(getPath(obj, k))).join('');
  const digest = createHmac('sha512', PAYMOB_HMAC_SECRET).update(raw).digest('hex');
  return digest.length === supplied.length && timingSafeEqual(new TextEncoder().encode(digest), new TextEncoder().encode(supplied));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const body = await req.json().catch(() => null);
  const obj = body?.obj;
  if (!obj || body?.type !== 'TRANSACTION') return new Response('Bad Request', { status: 400 });
  const suppliedHmac = String(body?.hmac || obj?.hmac || req.headers.get('x-paymob-hmac') || '');
  if (!verifyHmac(obj, suppliedHmac)) return new Response('Invalid HMAC', { status: 401 });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const providerEventId = String(obj.id);
  const integrationId = Number(obj.integration_id);
  if (!Number.isFinite(integrationId) || (PAYMOB_INTEGRATION_IDS.size && !PAYMOB_INTEGRATION_IDS.has(integrationId))) return new Response('Invalid integration', { status: 403 });
  const providerOrderId = String(obj.order?.id || '');
  const merchantOrderId = String(obj.order?.merchant_order_id || obj.payment_key_claims?.extra?.emad_store_order_id || '');
  const eventType = obj.success === true ? 'payment_succeeded' : (obj.pending === true ? 'payment_pending' : 'payment_failed');

  const { data: existing } = await admin.from('payment_event_log').select('provider,event_id').eq('provider','paymob').eq('event_id',providerEventId).maybeSingle();
  if (existing) return new Response('OK', { status: 200 });

  let order: any = null;
  if (merchantOrderId) {
    const byId = await admin.from('orders').select('*').eq('id', merchantOrderId).maybeSingle();
    order = byId.data;
    if (!order) {
      const byNumber = await admin.from('orders').select('*').eq('order_number', merchantOrderId).maybeSingle();
      order = byNumber.data;
    }
  }
  if (!order && providerOrderId) {
    const pi = await admin.from('payment_intents').select('*').eq('provider_order_id', providerOrderId).maybeSingle();
    if (pi.data) {
      const found = await admin.from('orders').select('*').eq('id', pi.data.order_id).maybeSingle();
      order = found.data;
    }
  }
  if (!order) return new Response('Order not found', { status: 404 });

  const amountCents = Number(obj.amount_cents || 0);
  const expected = Number(order.total_amount ?? order.grand_total ?? order.total ?? order.amount ?? 0) * 100;
  if (!Number.isFinite(expected) || Math.round(expected) !== amountCents) return new Response('Amount mismatch', { status: 409 });

  const status = obj.is_refunded ? (Number(obj.refunded_amount_cents || 0) >= amountCents ? 'refunded' : 'partially_refunded') :
    obj.success === true ? 'paid' : obj.pending === true ? 'requires_action' : 'failed';

  const pi = await admin.from('payment_intents').select('*').eq('order_id', order.id).maybeSingle();
  const { error: eventInsertError } = await admin.from('payment_event_log').insert({ provider:'paymob', event_id:providerEventId, order_id:order.id, payment_intent_id:pi.data?.id || null, event_type:eventType, payload:body, processed_at:new Date().toISOString() });
  if (eventInsertError && !String(eventInsertError.message||'').toLowerCase().includes('duplicate')) return new Response('Event log failed', { status: 500 });

  await admin.from('payment_intents').update({ status, provider_payment_id:String(obj.id), provider_order_id:providerOrderId || pi.data?.provider_order_id || null, updated_at:new Date().toISOString() }).eq('order_id', order.id);
  const orderPatch: any = { payment_status: status, payment_provider:'paymob', payment_transaction_id:String(obj.id), payment_metadata:{ paymob_order_id:providerOrderId, event_type:eventType } };
  if (status === 'paid') orderPatch.paid_at = new Date().toISOString();
  await admin.from('orders').update(orderPatch).eq('id', order.id);

  if (status === 'paid') {
    const recipient = String(order.phone ?? order.customer_phone ?? order.phone_number ?? '');
    if (recipient) await admin.rpc('enqueue_notification', { p_channel:'whatsapp', p_event_type:'order_created', p_order_id:order.id, p_recipient:recipient, p_payload:{ order_number:String(order.order_number ?? order.id), status:'paid' } });
    await admin.rpc('enqueue_fulfillment_for_paid_order', { p_order_id: order.id });
  }
  return new Response('OK', { status: 200 });
});
