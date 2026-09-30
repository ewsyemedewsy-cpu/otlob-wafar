// Cache only public application assets within this deployment scope.
const BASE=new URL('./',self.location.href);
const CACHE='otlob-static-v19:'+BASE.pathname;
const url=p=>new URL(p,BASE).href;
const shell=[url(''),url('icon.svg'),url('manifest.webmanifest')];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(shell))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('otlob-static-')&&k.endsWith(':'+BASE.pathname)&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==BASE.origin||u.search||!(shell.includes(u.href)||u.pathname.startsWith(BASE.pathname+'assets/')))return;
e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy))}return r}).catch(()=>caches.match(e.request).then(r=>r||new Response('تعذر الاتصال. أعد المحاولة عند عودة الإنترنت.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}}))))});
