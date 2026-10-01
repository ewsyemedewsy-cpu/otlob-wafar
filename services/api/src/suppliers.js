const fields=['name','whatsapp_phone','phone','email','website','address','contact_name','notes','source_url'];
export function supplierRecord(input){
 const row=Object.fromEntries(fields.map(k=>[k,String(input[k]??'').trim().slice(0,k==='notes'?4000:500)]));
 if(!row.name)throw Error('supplier_name_required');
 for(const k of ['website','source_url'])if(row[k]){const url=new URL(row[k]);if(url.protocol!=='https:')throw Error('https_required');}
 if(row.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))throw Error('invalid_email');
 for(const k of ['phone','whatsapp_phone'])if(row[k]&&!/^\+?[0-9 ()-]{6,30}$/.test(row[k]))throw Error('invalid_phone');
 row.order_method=input.order_method||'contact';if(!['automatic','contact','visit'].includes(row.order_method))throw Error('invalid_order_method');
 row.min_order_quantity=Number(input.min_order_quantity??1);if(!Number.isInteger(row.min_order_quantity)||row.min_order_quantity<1||row.min_order_quantity>100000)throw Error('invalid_minimum_quantity');
 row.allows_single_units=input.allows_single_units===true;
 if(row.allows_single_units&&row.min_order_quantity!==1)throw Error('single_unit_minimum_must_be_one');
 row.direct_fulfillment=input.direct_fulfillment===true;row.active=input.active!==false;
 if(!row.phone&&!row.whatsapp_phone&&!row.email&&!row.website&&!row.address)throw Error('supplier_contact_required');
 return row;
}
