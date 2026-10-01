import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {buildSeo,renderProductPage} from '../scripts/build-seo.mjs';
test('product pages escape untrusted content and accurately represent availability',()=>{
 const html=renderProductPage({id:'p-1',title_ar:'</script><script>alert(1)</script>',description_ar:'<img onerror=evil>',retail_price:100,stock_quantity:null},'https://example.com/store/');
 assert.ok(html.includes('https://schema.org/PreOrder'));assert.ok(html.includes('https://example.com/store/products/p-1/'));assert.ok(!html.includes('<script>alert(1)</script>'));assert.ok(html.includes('\\u003c'));
});
test('SEO builds real product pages and sitemap; unconfigured previews stay unindexed',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'store-seo-'));try{
 await fs.writeFile(path.join(directory,'index.html'),'<head></head><body></body>');
 assert.equal((await buildSeo({directory})).indexed,false);assert.match(await fs.readFile(path.join(directory,'index.html'),'utf8'),/noindex/);
 await fs.writeFile(path.join(directory,'index.html'),'<head></head><body></body>');
 const result=await buildSeo({directory,site:'https://example.com/store/',catalogUrl:'https://api.example.com/products',fetchImpl:async()=>new Response(JSON.stringify([{id:'p-1',title_ar:'منتج',retail_price:100,available:true},{id:'../bad',title_ar:'bad',retail_price:100,available:true}]))});
 assert.equal(result.count,1);assert.match(await fs.readFile(path.join(directory,'sitemap.xml'),'utf8'),/products\/p-1/);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
