import test from 'node:test';import assert from 'node:assert/strict';
import {runSourceCycle} from '../services/scraper/source-cycle.js';
const feeds=[{endpoint:'https://example.invalid/feed',name:'source'}];
test('periodic sourcing preserves outage evidence without current cached quotes',async()=>{
 const old={checkedAt:'2026-01-01',quotes:[{price:100}]};
 const result=await runSourceCycle({queries:['هاتف','هاتف'],feeds,previous:{هاتف:old},fetchImpl:async()=>{throw Error('offline');}});
 assert.equal(Object.keys(result.results).length,1);assert.equal(result.preview,true);
 assert.equal(result.results.هاتف.status,'unavailable');assert.deepEqual(result.results.هاتف.quotes,[]);
 assert.deepEqual(result.results.هاتف.previousSnapshot,old);assert.equal(result.results.هاتف.previousSnapshotUsableForPricing,false);
});
test('successful empty search clears prior quotes and invalid configuration fails',async()=>{
 const result=await runSourceCycle({queries:['هاتف'],feeds,previous:{هاتف:{quotes:[{price:100}]}},fetchImpl:async()=>new Response(JSON.stringify({offers:[]}))});
 assert.equal(result.results.هاتف.status,'checked');assert.deepEqual(result.results.هاتف.quotes,[]);assert.equal(result.results.هاتف.previousSnapshot,undefined);
 await assert.rejects(runSourceCycle({queries:['هاتف'],feeds:[]}));
 await assert.rejects(runSourceCycle({queries:['x'],feeds}));
});
