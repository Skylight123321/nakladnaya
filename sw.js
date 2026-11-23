const CACHE_PREFIX='jaan-v12-1-3-';
const scope=new URL(self.registration.scope);
const scopeKey=encodeURIComponent(scope.pathname);
const CACHE=CACHE_PREFIX+scopeKey;
const ASSETS=['./viewport.js','./vault-cloud.js','./app-display.js','./','./app.html','./app-gate.js','./app-security.js','./vault-crypto.js','./vault-store.js','./vault-shell.js','./vault.css','./vault.css?v=12.1.3','./icon-ios27-180.png','./icon-ios27-192.png','./icon-ios27-512.png','./index.html','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./catalog-pdf.js','./warehouse-excel.js','./warehouse-excel-worker.js','./warehouse-excel-ui.js','./vendor/xlsx.mini.min.js','./vendor/pdf-lib.min.js','./vendor/fontkit.umd.min.js','./fonts/LiberationSans-Regular.ttf','./fonts/LiberationSans-Bold.ttf'];
const urls=new Set(ASSETS.map(asset=>new URL(asset,scope).href));

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    // Do not activate a release until the entire offline app is available.
    await cache.addAll([...urls].map(url=>new Request(url,{cache:'reload'})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('jaan-')&&key!==CACHE).map(async key=>{
      // Versioned caches also encode their scope in their name. This removes
      // empty caches left behind by older workers while they were replaced.
      const versionedScope=/^jaan-v\d+-\d+-\d+-(.+)$/.exec(key)?.[1];
      if(versionedScope===scopeKey){
        await caches.delete(key);
        return;
      }
      const requests=await (await caches.open(key)).keys();
      // GitHub Pages projects can share an origin. Remove only caches
      // containing this app's entry page and no other project's entry page.
      const entryPages=requests.filter(request=>new URL(request.url).pathname.endsWith('/index.html'));
      if(entryPages.length===1&&entryPages[0].url===new URL('./index.html',scope).href)await caches.delete(key);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  let url=request.url;
  if(request.mode==='navigate'){
    const target=new URL(url);
    target.search='';
    if(urls.has(target.href))url=target.href;
  }
  if(!urls.has(url))return;
  event.respondWith((async()=>{
    return (await caches.match(url,{cacheName:CACHE}))||fetch(request);
  })());
});
