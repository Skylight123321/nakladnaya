const CACHE='jaan-v12-0-1-ios27-1';
const ASSETS=['./','./app.html','./app-gate.js','./app-security.js','./vault-crypto.js','./vault-store.js','./vault-shell.js','./vault.css','./vault.css?v=12.0.1','./icon-ios27-180.png','./icon-ios27-192.png','./icon-ios27-512.png','./index.html','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./catalog-pdf.js','./warehouse-excel.js','./warehouse-excel-worker.js','./warehouse-excel-ui.js','./vendor/xlsx.mini.min.js','./vendor/pdf-lib.min.js','./vendor/fontkit.umd.min.js','./fonts/LiberationSans-Regular.ttf','./fonts/LiberationSans-Bold.ttf'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('jaan-')&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
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
