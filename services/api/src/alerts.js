export function operationalAlerts({orders=[],payments=[],notifications=[],fulfillments=[]},now=Date.now()){
 const alerts=[];
 for(const o of orders){
  if(['pending','confirmed'].includes(o.status))alerts.push({id:'order:'+o.id,type:'order',orderId:o.id,title:'طلب جديد يحتاج متابعة',detail:o.order_number,at:o.created_at});
  if(['failed','partially_refunded','refunded'].includes(o.payment_status))alerts.push({id:'payment:'+o.id+':'+o.payment_status,type:'payment',orderId:o.id,title:'معاملة دفع تحتاج متابعة',detail:o.order_number+' — '+o.payment_status,at:o.updated_at||o.created_at});
 }
 for(const p of payments){
  const pendingClaim=p.metadata?.creation_token&&Date.parse(p.metadata?.claimed_at||'')<now-120000;
  const expired=p.checkout_url&&Date.parse(p.metadata?.expires_at||'')<=now;
  if(pendingClaim||expired)alerts.push({id:'payment-review:'+p.id,type:'payment',orderId:p.order_id,title:'محاولة دفع تحتاج مراجعة قبل الإعادة',detail:pendingClaim?'نتيجة إنشاء الدفع غير محسومة':'انتهى رابط الدفع',at:p.updated_at});
 }
 for(const n of notifications)alerts.push({id:'notification:'+n.id,type:'notification',orderId:n.order_id,title:'تعذر إرسال تنبيه أو رسالة',detail:n.event_type,at:n.updated_at});
 for(const f of fulfillments)alerts.push({id:'fulfillment:'+f.id,type:'fulfillment',orderId:f.order_id,title:'توقف تنفيذ طلب ويحتاج متابعة',detail:'راجع المورد والشحنة قبل إعادة المحاولة',at:f.updated_at});
 return alerts.sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0));
}
