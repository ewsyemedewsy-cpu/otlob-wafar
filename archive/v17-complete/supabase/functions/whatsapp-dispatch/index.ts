import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN')!;
const PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')!;
const GRAPH = Deno.env.get('WHATSAPP_GRAPH_VERSION') || 'v23.0';
const TEMPLATE = Deno.env.get('WHATSAPP_TEMPLATE_NAME') || '';
const TEMPLATE_LANG = Deno.env.get('WHATSAPP_TEMPLATE_LANGUAGE') || 'en_US';
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

function messageFor(row:any) {
  const n = row.payload?.order_number || row.order_id;
  switch (row.event_type) {
    case 'order_created': return `Emad Store: تم تأكيد طلبك رقم ${n} بنجاح. شكراً لثقتك بنا.`;
    case 'shipped': return `Emad Store: طلبك رقم ${n} تم شحنه وأصبح في الطريق إليك.`;
    case 'delivered': return `Emad Store: تم تسجيل تسليم طلبك رقم ${n}. شكراً لك.`;
    case 'returned': return `Emad Store: تم تسجيل إرجاع طلبك رقم ${n}. سنتابع معك الإجراءات المطلوبة.`;
    default: return `Emad Store: تحديث على طلبك رقم ${n}.`;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', {status:405});
  if (!TOKEN || !PHONE_ID) return new Response('WhatsApp not configured', {status:500});
  const { data: rows, error } = await admin.from('notification_outbox').select('*').eq('channel','whatsapp').eq('status','pending').lte('next_attempt_at',new Date().toISOString()).order('created_at').limit(20);
  if (error) return new Response(error.message,{status:500});
  let sent=0, failed=0;
  for (const row of rows || []) {
    await admin.from('notification_outbox').update({status:'processing',attempts:row.attempts+1,updated_at:new Date().toISOString()}).eq('id',row.id).eq('status','pending');
    const message = TEMPLATE ? {messaging_product:'whatsapp',to:row.recipient,type:'template',template:{name:TEMPLATE,language:{code:TEMPLATE_LANG},components:[{type:'body',parameters:[{type:'text',text:String(row.payload?.order_number||row.order_id)},{type:'text',text:String(row.payload?.awb||'')}]}]}} : {messaging_product:'whatsapp',to:row.recipient,type:'text',text:{preview_url:false,body:messageFor(row)}};
    const resp = await fetch(`https://graph.facebook.com/${GRAPH}/${PHONE_ID}/messages`, { method:'POST', headers:{Authorization:`Bearer ${TOKEN}`,'Content-Type':'application/json'}, body:JSON.stringify(message) });
    const result = await resp.json().catch(()=>({}));
    if (resp.ok) {
      const mid = result?.messages?.[0]?.id || null;
      await admin.from('notification_outbox').update({status:'sent',provider_message_id:mid,last_error:null,updated_at:new Date().toISOString()}).eq('id',row.id);
      sent++;
    } else {
      const attempts = row.attempts + 1;
      const terminal = attempts >= 5;
      const delay = Math.min(3600, 30 * 2 ** Math.min(attempts,6));
      await admin.from('notification_outbox').update({status:terminal?'failed':'pending',last_error:JSON.stringify(result).slice(0,2000),next_attempt_at:new Date(Date.now()+delay*1000).toISOString(),updated_at:new Date().toISOString()}).eq('id',row.id);
      failed++;
    }
  }
  return new Response(JSON.stringify({processed:(rows||[]).length,sent,failed}),{headers:{'Content-Type':'application/json'}});
});
