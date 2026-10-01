// Refund totals are not covered by the transaction callback HMAC.
// Use an authenticated provider inquiry before classifying a refund.
export async function paymobStatus(obj, {apiKey='', baseUrl='https://accept.paymob.com', fetchImpl=fetch}={}) {
  if (obj.is_refunded === true) {
    if (!apiKey || !/^\d+$/.test(String(obj.id))) throw new Error('refund_inquiry_required');
    const base=baseUrl.replace(/\/$/,'');
    const auth=await fetchImpl(`${base}/api/auth/tokens`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({api_key:apiKey}),signal:AbortSignal.timeout(10000)});
    if (!auth.ok) throw new Error('refund_inquiry_auth_failed');
    const token=(await auth.json()).token;
    if (typeof token!=='string'||!token) throw new Error('refund_inquiry_auth_failed');
    const response=await fetchImpl(`${base}/api/acceptance/transactions/${obj.id}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error('refund_inquiry_failed');
    const confirmed=await response.json();
    for (const key of ['id','integration_id','amount_cents','currency']) if(String(confirmed[key])!==String(obj[key])) throw new Error('refund_inquiry_mismatch');
    if(String(confirmed.order?.id)!==String(obj.order?.id)||confirmed.is_refunded!==true) throw new Error('refund_inquiry_mismatch');
    const amount=Number(confirmed.amount_cents), refunded=Number(confirmed.refunded_amount_cents);
    if (!Number.isSafeInteger(amount)||amount<=0||!Number.isSafeInteger(refunded)||refunded<=0||refunded>amount) throw new Error('refund_inquiry_amount_invalid');
    return refunded===amount?'refunded':'partially_refunded';
  }
  return obj.is_voided===true?'cancelled':obj.pending===true?'requires_action':obj.success===true?(obj.is_auth===true&&obj.is_capture!==true?'authorized':'paid'):'failed';
}
