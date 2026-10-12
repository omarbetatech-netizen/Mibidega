// Service Worker — Mi Bodega (cache offline básico)
const CACHE='mibodega-v1';
const ASSETS=['index.html','app.js','manifest.json','icon-192.png','icon-512.png'];
self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS).catch(()=>{})));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',e=>{
  const url=e.request.url;
  // no cachear APIs de tasa ni CDN dinámico: siempre red
  if(url.includes('dolarapi')||url.includes('pydolarve')){return;}
  e.respondWith(
    caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{
      if(e.request.method==='GET'&&resp&&resp.status===200&&url.startsWith(self.location.origin)){
        const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));
      }
      return resp;
    }).catch(()=>caches.match('index.html')))
  );
});
