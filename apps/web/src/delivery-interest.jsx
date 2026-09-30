import React,{useState} from 'react';
const labels={FAYOUM:'الفيوم',CAIRO:'القاهرة',GIZA:'الجيزة',ALEXANDRIA:'الإسكندرية',DELTA_CANAL:'الدلتا والقناة',UPPER_EGYPT:'الصعيد'};
export function DeliveryInterest({api,available}){
 const outside=Object.keys(labels).filter(x=>!available.includes(x));
 const [region,setRegion]=useState('CAIRO'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 if(!api||!available.length||!outside.length)return null;
 const selected=outside.includes(region)?region:outside[0];
 async function record(){setBusy(true);setMessage('');try{
  const storageKey='delivery-interest:'+selected;let key;try{key=localStorage.getItem(storageKey);if(!key){key=crypto.randomUUID();localStorage.setItem(storageKey,key)}}catch{key=crypto.randomUUID()}
  const response=await fetch(api+'/delivery-interest',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({governorate:selected})});
  if(!response.ok)throw Error();setMessage('تم تسجيل اهتمامك. هذه إشارة للتوسع وليست طلب شراء أو وعدًا بموعد التوصيل.');
 }catch{setMessage('تعذر تسجيل الاهتمام. حاول لاحقًا.')}finally{setBusy(false)}}
 return <section className="notice delivery-interest"><h3>محافظتك خارج نطاق التوصيل؟</h3><p>اختر محافظتك لنحدد أين نوسع الخدمة. لا نطلب اسمك أو رقم هاتفك.</p><label>محافظة الاهتمام<select aria-label="محافظة الاهتمام" value={selected} onChange={e=>{setRegion(e.target.value);setMessage('')}}>{outside.map(x=><option key={x} value={x}>{labels[x]}</option>)}</select></label><button className="checkout" disabled={busy} onClick={record}>{busy?'جارٍ التسجيل…':'سجّل اهتمامك بالتوصيل'}</button>{message&&<p role="status">{message}</p>}</section>;
}
