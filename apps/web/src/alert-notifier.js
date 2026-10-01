export function createAlertTracker(){
 let initialized=false;const seen=new Set();
 return rows=>{
  const fresh=[];
  for(const row of rows){if(!row?.id||seen.has(row.id))continue;seen.add(row.id);if(initialized)fresh.push(row);}
  initialized=true;
  while(seen.size>1000)seen.delete(seen.values().next().value);
  return fresh;
 };
}
