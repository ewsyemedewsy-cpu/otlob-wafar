import crypto from 'crypto';

export function verifyPaymobTransactionHmac(obj, secret, supplied){
  if(!secret || !supplied || !obj) return false;
  const keys=['amount_cents','created_at','currency','error_occured','has_parent_transaction','id','integration_id','is_3d_secure','is_auth','is_capture','is_refunded','is_standalone_payment','is_voided','order.id','owner','pending','source_data.pan','source_data.sub_type','source_data.type','success'];
  const get=(k)=>k.split('.').reduce((v,x)=>v?.[x],obj);
  const raw=keys.map(k=>String(get(k) ?? '')).join('');
  const digest=crypto.createHmac('sha512',secret).update(raw).digest('hex');
  const a=Buffer.from(String(supplied)); const b=Buffer.from(digest);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}

export async function createPaymobIntention({amountEGP, reference, customer, items}){
  const secret=process.env.PAYMOB_SECRET_KEY;
  const methods=(process.env.PAYMOB_INTEGRATION_IDS||'').split(',').map(x=>x.trim()).filter(Boolean).map(Number);
  if(!secret || !methods.length) throw new Error('Paymob credentials/integration IDs are not configured');
  const r=await fetch(`${(process.env.PAYMOB_BASE_URL||'https://accept.paymob.com').replace(/\/$/,'')}/v1/intention/`,{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Token ${secret}`},
    body:JSON.stringify({amount:Math.round(amountEGP*100),currency:'EGP',payment_methods:methods,special_reference:reference,items:(items||[]).map(i=>({...i,amount:Math.round(Number(i.amount)*100)})),notification_url:process.env.PAYMOB_NOTIFICATION_URL,redirection_url:process.env.PAYMOB_REDIRECTION_URL,billing_data:{first_name:customer.name,last_name:'Customer',phone_number:customer.phone,email:'customer@emadstore.com',street:customer.address,city:customer.governorate,country:'EG',building:'NA',floor:'NA',apartment:'NA',postal_code:'NA',extra_description:'Emad Store'}})
  });
  if(!r.ok) throw new Error(`Paymob intention ${r.status}`);
  return r.json();
}

export async function createBostaDelivery(order){
  const base=process.env.BOSTA_BASE_URL||'https://app.bosta.co/api/v2';
  const r=await fetch(`${base}/deliveries?apiVersion=1`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':process.env.BOSTA_API_KEY},body:JSON.stringify({type:'Deliver',specs:{packageDetails:{itemsCount:order.itemsCount,description:order.manifest,packageType:'Small'}},pickupAddress:order.pickupAddress,dropOffAddress:order.dropOffAddress,cashOnDelivery:order.cashOnDelivery||0})});
  if(!r.ok) throw new Error(`Bosta ${r.status}`); return r.json();
}

export async function sendSupplierWhatsApp({to,body}){
  if(!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) throw new Error('WhatsApp credentials are not configured');
  const url=`https://graph.facebook.com/v23.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const r=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',text:{body}})});
  if(!r.ok) throw new Error(`WhatsApp ${r.status}`); return r.json();
}
