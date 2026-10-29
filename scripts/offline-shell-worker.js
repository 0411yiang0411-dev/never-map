/* Versioned static shell only. Authenticated API responses are NEVER cached. */
const PREFIX='never-map-shell-',CACHE=PREFIX+'__CACHE_VERSION__';
const CORE=__CORE_ASSETS__;
const ENTRY=__ENTRY_SCRIPT__;
function staticURL(url){return url.origin===self.location.origin && /^\/(assets|fonts)\//.test(url.pathname) && !url.search;}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  // A failed core download leaves the previous working shell in control.
  const resources=await Promise.all(CORE.map(async url=>{
    const response=await fetch(new Request(url,{cache:'reload',credentials:'omit'}));
    if(!response.ok)throw new Error('Core asset unavailable');
    if(url==='/index.html'){if(!(await response.clone().text()).includes(ENTRY))throw new Error('Mixed shell versions');}
    else if((response.headers.get('Content-Type') || '').includes('text/html'))throw new Error('Invalid static asset');
    return [url,response];
  }));
  await Promise.all(resources.map(([url,response])=>cache.put(url,response)));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=(await caches.keys()).filter(key=>key.startsWith(PREFIX));
  const previous=keys.filter(key=>key!==CACHE).slice(-1);
  await Promise.all(keys.filter(key=>key!==CACHE&&!previous.includes(key)).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET' || url.origin!==self.location.origin || url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate' && (url.pathname==='/'||url.pathname==='/index.html')){
    event.respondWith((async()=>{const cached=await(await caches.open(CACHE)).match('/index.html');return cached || fetch(request);})());return;
  }
  if(staticURL(url))event.respondWith((async()=>{
    const cache=await caches.open(CACHE),cached=await cache.match(request) || await caches.match(request);
    if(cached)return cached;
    const response=await fetch(request);
    if(response.ok && response.type!=='opaque' && !(response.headers.get('Content-Type') || '').includes('text/html'))await cache.put(request,response.clone());
    return response;
  })());
});
self.addEventListener('message',event=>{
  if(!event.data || event.data.type!=='WARM_STATIC' || !Array.isArray(event.data.urls))return;
  const urls=[...new Set(event.data.urls)].filter(value=>{try{return staticURL(new URL(value,self.location.origin));}catch{return false;}}).slice(0,50);
  event.waitUntil((async()=>{const cache=await caches.open(CACHE);for(const url of urls){try{if(!await cache.match(url)){const response=await fetch(new Request(url,{credentials:'omit'}));if(response.ok && !(response.headers.get('Content-Type') || '').includes('text/html'))await cache.put(url,response);}}catch{}}})());
});
