import {searchSourceFeeds,quoteSources} from '../api/src/sourcing.js';

// A review snapshot, never an instruction to change catalog prices or buy stock.
export async function runSourceCycle({queries,feeds,previous={},fetchImpl=fetch,now=Date.now()}) {
 if(!Array.isArray(queries)||queries.length===0||queries.length>100||queries.some(q=>typeof q!=='string'||q.trim().length<2||q.trim().length>120))throw Error('invalid_watch_queries');
 if(!Array.isArray(feeds)||feeds.length===0)throw Error('source_feeds_not_configured');
 const results={};
 for(const query of [...new Set(queries.map(q=>q.trim()))]) {
  const source=await searchSourceFeeds(query,{feeds,fetchImpl});
  const checkedAt=new Date(now).toISOString();
  results[query]={checkedAt,sourcesChecked:source.sourcesChecked,sourcesUnavailable:source.sourcesUnavailable,
   status:source.sourcesChecked===0?'unavailable':source.sourcesUnavailable?'partial':'checked',
   quotes:quoteSources(source.offers,{now}),
   // Preserve evidence after an outage, but never label cached prices as current.
   ...(source.sourcesUnavailable>0&&previous[query]?{previousSnapshot:previous[query].previousSnapshot||{checkedAt:previous[query].checkedAt,quotes:previous[query].quotes},previousSnapshotUsableForPricing:false}:{})};
 }
 return {version:1,preview:true,checkedAt:new Date(now).toISOString(),results};
}
