// Configuration presence only; never prints credentials or claims provider connectivity.
import { pathToFileURL } from 'node:url';
export function launchConfiguration(env,mode='full') {
 if(!['full','local-cod'].includes(mode))throw Error('Unsupported launch mode');
 const present=name=>{const value=env[name]||'';return !!value&&!/REPLACE|YOUR_|XXXXXXXX|example\.(com|invalid)/i.test(value);};
 const check=(label,names,required=true)=>({label,required,configured:names.every(present),missing:names.filter(n=>!present(n))});
 const full=mode==='full';
 const digest=env.ADMIN_API_KEY_SHA256;
 const adminConfigured=digest? /^[a-f\d]{64}$/i.test(digest):present('ADMIN_API_KEY');
 const checks=[
 check('store_api',['VITE_API_URL','PUBLIC_ORIGIN','SUPABASE_URL']),
 {label:'admin_access',required:true,configured:adminConfigured,missing:adminConfigured?[]:['valid ADMIN_API_KEY_SHA256 or ADMIN_API_KEY']},
 {label:'supabase_server_key',required:true,configured:present('SUPABASE_SECRET_KEY')||present('SUPABASE_SERVICE_ROLE_KEY'),missing:present('SUPABASE_SECRET_KEY')||present('SUPABASE_SERVICE_ROLE_KEY')?[]:['SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY']},
 {...check('online_payment',['PAYMOB_SECRET_KEY','PAYMOB_PUBLIC_KEY','PAYMOB_HMAC_SECRET','PAYMOB_INTEGRATION_IDS','PAYMOB_NOTIFICATION_URL','PAYMOB_REDIRECTION_URL'],full),enabled:env.PAYMOB_ONLINE_ENABLED==='true'},
 check('bosta_credentials',['BOSTA_API_KEY'],full),
 check('whatsapp_credentials',['WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID'],full),
 check('search_sources',['APPROVED_SOURCE_FEEDS'],full),
 check('public_seo',['STORE_PUBLIC_URL','SEO_CATALOG_URL']),
 check('store_contact',['STORE_CONTACT_PHONE','STORE_ADDRESS','STORE_HOURS'],!full)
 ];
 const source=checks.find(c=>c.label==='search_sources');try{const feeds=JSON.parse(env.APPROVED_SOURCE_FEEDS||'[]');source.configured=Array.isArray(feeds)&&feeds.length>0&&feeds.every(f=>f.name&&f.endpoint&&new URL(f.endpoint).protocol==='https:'&&(!f.tokenEnv||present(f.tokenEnv)));if(!source.configured)source.missing=['valid APPROVED_SOURCE_FEEDS and referenced credentials'];}catch{source.configured=false;source.missing=['valid APPROVED_SOURCE_FEEDS'];}
 if(!full)checks.push({label:'local_delivery_scope',required:true,configured:env.ORDER_DELIVERY_SCOPE==='fayoum_cities',missing:env.ORDER_DELIVERY_SCOPE==='fayoum_cities'?[]:['ORDER_DELIVERY_SCOPE=fayoum_cities']});
 return {configurationOnly:true,liveConnectivityTested:false,mode,checks,configured:checks.every(c=>!c.required||c.configured)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2);
 if(args.some(a=>a!=='--local-cod')){console.error('Usage: node scripts/check-launch-config.mjs [--local-cod]');process.exitCode=2;}
 else {const report=launchConfiguration(process.env,args.includes('--local-cod')?'local-cod':'full');console.log(JSON.stringify(report,null,2));if(!report.configured)process.exitCode=1;}
}
