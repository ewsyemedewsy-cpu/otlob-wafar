import {calculatePrice,PAYMOB_CARD_PREVIEW} from './pricing.js';

// Failed sourcing evaluations remain available to the review worker only.
export function publicSourceQuotes(evaluations) {
 return evaluations.filter(q=>q.status==='preview'&&q.pricing?.mode!=='emergency'&&Number.isFinite(q.pricing?.finalPrice)&&q.pricing.finalPrice>0&&q.pricing.profitRate>=.05-1e-8).map(q=>({productKey:q.productKey,title:q.title,status:'preview',price:q.pricing.finalPrice,comparisons:q.comparisons,provisional:true}));
}

// Offers are normalized by an approved feed adapter. Never match by title alone.
export function quoteSources(offers,{now=Date.now(),paymentFees=PAYMOB_CARD_PREVIEW}={}) {
 const fresh=offers.filter(o=>o.currency==='EGP'&&typeof o.productKey==='string'&&o.productKey.length>0&&o.verifiedMatch===true&&o.marketMinQuantity===1&&o.inStock===true&&Number.isFinite(Date.parse(o.observedAt))&&now-Date.parse(o.observedAt)>=0&&now-Date.parse(o.observedAt)<=3600000&&Number.isFinite(o.marketTotal)&&o.marketTotal>0);
 const groups=new Map();for(const o of fresh){if(!groups.has(o.productKey))groups.set(o.productKey,[]);groups.get(o.productKey).push(o);}
 return [...groups].map(([productKey,rows])=>{
  const marketMin=Math.min(...rows.map(o=>o.marketTotal));
  const candidates=rows.filter(o=>o.directFulfillmentAgreed===true&&o.allowsSingleUnits===true&&o.minQuantity===1&&o.priceBasis==='unit'&&typeof o.supplierId==='string'&&o.supplierId&&Number.isFinite(o.purchaseCost)&&o.purchaseCost>0&&Number.isFinite(o.supplierShipping)&&o.supplierShipping>=0).sort((a,b)=>(a.purchaseCost+a.supplierShipping)-(b.purchaseCost+b.supplierShipping));
  const supplier=candidates[0];
  if(!supplier)return {productKey,status:'supplier_agreement_required',marketMin};
  const pricing=calculatePrice({marketMin,baseCost:supplier.purchaseCost+supplier.supplierShipping,paymentFees});
  return {productKey,status:pricing.finalPrice===null?'margin_unavailable':'preview',supplierId:supplier.supplierId,title:supplier.title,pricing,marketMin,comparisons:rows.map(o=>({store:o.store,total:o.marketTotal,observedAt:o.observedAt,sourceUrl:o.sourceUrl})),provisional:true};
 });
}

// Server-owned endpoints only: clients cannot submit a URL or credentials.
export async function searchSourceFeeds(query,{feeds=[],fetchImpl=fetch,referenceUrl}={}) {
 const q=String(query||'').trim();if(q.length<2||q.length>120)throw Error('invalid_search_query');
 if(feeds.length>10)throw Error('too_many_source_feeds');
 let reference;
 if(referenceUrl!==undefined){if(typeof referenceUrl!=='string'||referenceUrl.length>2000)throw Error('invalid_reference_url');const u=new URL(referenceUrl);if(u.protocol!=='https:'||u.username||u.password)throw Error('invalid_reference_url');u.hash='';reference=u.href;}
 const responses=await Promise.allSettled(feeds.map(async f=>{
  const url=new URL(f.endpoint);if(url.protocol!=='https:')throw Error('https_feed_required');
  url.searchParams.set('q',q);
  if(reference)url.searchParams.set('reference_url',reference);
  const r=await fetchImpl(url,{redirect:'error',signal:AbortSignal.timeout(8000),headers:{Accept:'application/json',...(f.token?{Authorization:'Bearer '+f.token}:{})}});
  if(!r.ok)throw Error('source_unavailable');
  const size=Number(r.headers.get('content-length'));if(size>1024*1024)throw Error('feed_too_large');
  const reader=r.body.getReader();let length=0;const chunks=[];
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>1024*1024)throw Error('feed_too_large');chunks.push(value);}}finally{await reader.cancel();}
  const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  const body=JSON.parse(new TextDecoder().decode(bytes));if(!Array.isArray(body.offers)||body.offers.length>100)throw Error('invalid_source_feed');
  return body.offers.map(o=>({...o,store:f.name,supplierId:f.supplierId,directFulfillmentAgreed:f.directFulfillmentAgreed===true,allowsSingleUnits:f.allowsSingleUnits===true}));
 }));
 return {offers:responses.flatMap(r=>r.status==='fulfilled'?r.value:[]),sourcesChecked:responses.filter(r=>r.status==='fulfilled').length,sourcesUnavailable:responses.filter(r=>r.status==='rejected').length};
}
