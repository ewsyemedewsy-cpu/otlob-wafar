import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {runSourceCycle} from './source-cycle.js';

const queries=JSON.parse(process.env.SOURCE_WATCH_QUERIES||'[]');
const feeds=JSON.parse(process.env.APPROVED_SOURCE_FEEDS||'[]').map(({tokenEnv,...feed})=>({...feed,...(tokenEnv?{token:process.env[tokenEnv]}:{})}));
const path=resolve(process.env.SOURCE_REVIEW_PATH||'var/source-review.json');
const interval=Number(process.env.SOURCE_INTERVAL_SECONDS||900);
if(!Number.isInteger(interval)||interval<60)throw Error('source_interval_must_be_at_least_60_seconds');
let stopping=false;for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stopping=true;});
async function cycle(){
 let previous={};try{previous=JSON.parse(await readFile(path,'utf8')).results||{};}catch(e){if(e.code!=='ENOENT')throw e;}
 const snapshot=await runSourceCycle({queries,feeds,previous});
 await mkdir(dirname(path),{recursive:true});
 const temporary=path+'.'+process.pid+'.tmp';
 await writeFile(temporary,JSON.stringify(snapshot,null,2),{mode:0o600});await rename(temporary,path);
 console.log(JSON.stringify({event:'source_cycle_completed',queries:Object.keys(snapshot.results).length,unavailable:Object.values(snapshot.results).filter(r=>r.status!=='checked').length}));
}
do {
 try{await cycle();}catch {console.error('source_cycle_failed; previous snapshot retained');if(process.argv.includes('--once'))process.exitCode=1;}
 if(process.argv.includes('--once')||stopping)break;
 const end=Date.now()+interval*1000;while(!stopping&&Date.now()<end)await new Promise(r=>setTimeout(r,Math.min(1000,end-Date.now())));
}while(!stopping);
