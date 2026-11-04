const CACHE = 'cptf-shopping-v45';
const ASSETS = ['./','./index.html','./sync-helper.html','./sync-bookmarklet.js?v=3','./styles.css?v=33','./app.js?v=37','./manifest.webmanifest','./icons/icon.svg'];
ASSETS.push('./visitor-map.js?v=1','./data/cptf-map-7166.json',...['1.png','2.png','3.png','4.png','9.png','annotations.json','hall2.json','hall3.json','hall4.json'].map(name=>'./maps/'+name));
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put('./index.html', copy));
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(response => {
    const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); return response;
  }).catch(() => caches.match('./index.html'))));
});
