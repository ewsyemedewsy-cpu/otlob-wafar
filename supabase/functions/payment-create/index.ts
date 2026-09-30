import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const PAYMOB_BASE = Deno.env.get('PAYMOB_BASE_URL') || 'https://accept.paymob.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const PAYMOB_SECRET = Deno.env.get('PAYMOB_SECRET_KEY')!;
const PAYMOB_INTEGRATION_IDS = (Deno.env.get('PAYMOB_INTEGRATION_IDS') || '')
  .split(',').map(s => s.trim()).filter(Boolean).map(Number).filter(n=>Number.isInteger(n)&&n>0);
const PAYMENT_NOTIFICATION_URL = Deno.env.get('PAYMOB_NOTIFICATION_URL')!;
const PAYMENT_REDIRECTION_URL = Deno.env.get('PAYMOB_REDIRECTION_URL')!;

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('CORS_ORIGIN') || '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function pick(obj: Record<string, unknown>, keys: string[], fallback = '') {
  for (const k of keys) if (obj[k] != null && String(obj[k]).trim()) return String(obj[k]);
  return fallback;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!PAYMOB_SECRET || !PAYMOB_INTEGRATION_IDS.length || !PAYMENT_NOTIFICATION_URL || !PAYMENT_REDIRECTION_URL) {
    return json({ error: 'paymob_not_configured' }, 500);
  }

  const auth = req.headers.get('Authorization') || '';
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const orderId = String(body.order_id || '');
  if (!orderId) return json({ error: 'order_id_required' }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: order, error: orderError } = await admin.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (orderError || !order) return json({ error: 'order_not_found' }, 404);

  const ownerId = pick(order as Record<string, unknown>, ['user_id','customer_id','account_id']);
  if (!ownerId || ownerId !== user.id) return json({ error: 'forbidden' }, 403);

  if (order.payment_method !== 'wallet' || ['cancelled','returned','delivered'].includes(order.status)) {
    return json({ error: 'order_not_payable' }, 409);
  }
  if (['paid','authorized','refunded','partially_refunded'].includes(order.payment_status)) {
    return json({ error: 'order_already_paid' }, 409);
  }

  const paymentMethod = String(body.payment_method || 'online');
  if (paymentMethod === 'cod') return json({ error: 'cod_does_not_use_paymob' }, 400);

  const rawAmount = order.total_amount ?? order.grand_total ?? order.total ?? order.amount;
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'invalid_order_amount' }, 400);

  const currency = String(order.currency || 'EGP');
  if (currency !== 'EGP') return json({ error: 'unsupported_currency', currency }, 400);

  const orderNumber = pick(order as Record<string, unknown>, ['order_number','number','reference'], orderId);
  const billing = {
    apartment: pick(order as Record<string, unknown>, ['apartment'], 'NA'),
    first_name: pick(order as Record<string, unknown>, ['first_name','customer_first_name','customer_name','name'], 'Customer').slice(0,50),
    last_name: pick(order as Record<string, unknown>, ['last_name','customer_last_name'], 'EmadStore').slice(0,50),
    street: pick(order as Record<string, unknown>, ['street','address','shipping_address'], 'NA').slice(0,100),
    building: pick(order as Record<string, unknown>, ['building'], 'NA'),
    floor: pick(order as Record<string, unknown>, ['floor'], 'NA'),
    phone_number: pick(order as Record<string, unknown>, ['whatsapp_phone','phone','customer_phone','phone_number'], '+201000000000'),
    city: pick(order as Record<string, unknown>, ['city','shipping_city'], 'Egypt'),
    country: 'EG',
    email: pick(order as Record<string, unknown>, ['email','customer_email'], user.email || 'customer@example.com'),
    state: pick(order as Record<string, unknown>, ['state','governorate'], 'EG'),
  };

  const { data: orderItems, error: itemsError } = await admin.from('order_items').select('*').eq('order_id', orderId).limit(50);
  if (itemsError || !orderItems?.length) return json({ error: 'order_items_unavailable' }, 503);
  const sourceItems = Array.isArray((order as Record<string, unknown>).items) ? ((order as Record<string, unknown>).items as Array<Record<string, unknown>>) : (orderItems || []);
  const items = sourceItems.slice(0, 50).map((i: Record<string, unknown>) => ({
      name: pick(i, ['name','product_name'], 'Emad Store item').slice(0, 100),
      amount: Math.max(1, Math.round(Number(i.price ?? i.unit_price ?? i.amount ?? 0) * 100)),
      description: pick(i, ['description'], '').slice(0, 200),
      quantity: Math.max(1, Number(i.quantity ?? 1)),
    }));

  const existing = await admin.from('payment_intents').select('*').eq('order_id', orderId).maybeSingle();
  if (existing.error) return json({ error: 'payment_intent_unavailable' }, 503);
  if (['paid','authorized','refunded','partially_refunded'].includes(existing.data?.status)) return json({ error: 'order_already_paid' }, 409);
  const expiresAt=Date.parse(existing.data?.metadata?.expires_at || '');
  if (existing.data?.checkout_url && ['pending','requires_action'].includes(existing.data.status) && expiresAt>Date.now()) {
    return json({payment_intent_id:existing.data.id,checkout_url:existing.data.checkout_url,status:existing.data.status,reused:true});
  }

  const payload: Record<string, unknown> = {
    amount: Math.round(amount * 100),
    currency,
    payment_methods: PAYMOB_INTEGRATION_IDS,
    items,
    billing_data: billing,
    extras: { emad_store_order_id: orderId },
    special_reference: orderNumber,
    expiration: 3600,
    notification_url: PAYMENT_NOTIFICATION_URL,
    redirection_url: PAYMENT_REDIRECTION_URL,
  };

  const creationToken=crypto.randomUUID();
  const claim=await admin.rpc('claim_paymob_creation',{p_order_id:orderId,p_token:creationToken});
  if(claim.error)return json({error:'payment_claim_failed'},503);
  if(claim.data?.state==='reused')return json({payment_intent_id:claim.data.id,checkout_url:claim.data.checkout_url,status:claim.data.status,reused:true});
  if(claim.data?.state!=='claimed')return json({error:'payment_creation_requires_review'},409);

  const paymob = await fetch(`${PAYMOB_BASE}/v1/intention/`, {
    method: 'POST',
    headers: { Authorization: `Token ${PAYMOB_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await paymob.json().catch(() => ({}));
  if (!paymob.ok) return json({ error: 'paymob_intention_failed' }, 502);

  const intentionId = String(result.id || '');
  const clientSecret = String(result.client_secret || '');
  const providerOrderId = String(result.intention_order_id || '');
  if (!intentionId || !clientSecret || !providerOrderId) return json({ error: 'paymob_invalid_response' }, 502);

  const checkoutUrl = `${PAYMOB_BASE}/unifiedcheckout/?publicKey=${encodeURIComponent(Deno.env.get('PAYMOB_PUBLIC_KEY') || '')}&clientSecret=${encodeURIComponent(clientSecret)}`;

  const row = {
    order_id: orderId,
    provider: 'paymob',
    provider_order_id: providerOrderId || null,
    intention_id: intentionId,
    amount,
    currency,
    status: 'requires_action',
    checkout_url: checkoutUrl,
    client_secret: clientSecret,
    metadata: { order_number: orderNumber, expires_at: new Date(Date.now()+45*60*1000).toISOString() },
    updated_at: new Date().toISOString(),
  };
  const { data: saved, error: saveError } = await admin.rpc('finish_paymob_creation',{p_order_id:orderId,p_token:creationToken,p_row:row});
  if (saveError) return json({ error: 'payment_intent_save_failed' }, 500);

  return json({ payment_intent_id: saved.id, intention_id: intentionId, checkout_url: checkoutUrl, status: 'requires_action' });
});
