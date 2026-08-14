const CACHE='jaan-v11-warehouse-3';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET'||new URL(req.url).origin!==location.origin)return;
  e.respondWith((async()=>{
    try{
      const networkReq=new Request(req,{cache:'no-store'});
      const r=await fetch(networkReq);
      if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{})}
      return r;
    }catch(err){
      const cached=await caches.match(req);if(cached)return cached;
      if(req.mode==='navigate')return (await caches.match('./index.html'))||Response.error();
      return Response.error();
    }
  })());
});
