import {paymobStatus} from '../../../shared/paymob-status.js';
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { createHmac, timingSafeEqual } from 'node:crypto';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PAYMOB_HMAC_SECRET = Deno.env.get('PAYMOB_HMAC_SECRET')!;
const PAYMOB_INTEGRATION_IDS = new Set((Deno.env.get('PAYMOB_INTEGRATION_IDS') || '').split(',').map(x=>x.trim()).filter(Boolean).map(Number).filter(n=>Number.isInteger(n)&&n>0));

const hmacKeys = [
  'amount_cents','created_at','currency','error_occured','has_parent_transaction','id',
  'integration_id','is_3d_secure','is_auth','is_capture','is_refunded','is_standalone_payment',
  'is_voided','order.id','owner','pending','source_data.pan','source_data.sub_type',
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
  const suppliedHmac = String(new URL(req.url).searchParams.get('hmac') || body?.hmac || obj?.hmac || req.headers.get('x-paymob-hmac') || '');
  if (!verifyHmac(obj, suppliedHmac)) return new Response('Invalid HMAC', { status: 401 });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const providerEventId = String(obj.id);
  const integrationId = Number(obj.integration_id);
  if (!Number.isFinite(integrationId) || (!PAYMOB_INTEGRATION_IDS.size || !PAYMOB_INTEGRATION_IDS.has(integrationId))) return new Response('Invalid integration', { status: 403 });
  const providerOrderId = String(obj.order?.id || '');
  const merchantOrderId = String(obj.order?.merchant_order_id || obj.payment_key_claims?.extra?.emad_store_order_id || '');
  const eventType = obj.success === true ? 'payment_succeeded' : (obj.pending === true ? 'payment_pending' : 'payment_failed');

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

  let status: string;
  try { status=await paymobStatus(obj,{apiKey:Deno.env.get('PAYMOB_API_KEY'),baseUrl:Deno.env.get('PAYMOB_BASE_URL')}); }
  catch { return new Response('Refund verification unavailable',{status:503}); }
  const applied=await admin.rpc('apply_paymob_event_v18',{p_order_id:order.id,p_event_id:providerEventId+':'+status,p_status:status,p_amount_cents:amountCents,p_currency:obj.currency,p_provider_order_id:providerOrderId,p_payload:body});
  if(applied.error)return new Response('Payment update failed',{status:409});
  return new Response('OK',{status:200});
});
