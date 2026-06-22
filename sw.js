// Minimale service worker: app-shell cachen zodat de app ook zonder bereik
// opent. Bewust simpel gehouden voor de MVP.
const CACHE = 'drank-v7';
const ASSETS = [
  '.', 'index.html', 'styles.css', 'app.js', 'store.js', 'members.js',
  'api.js', 'config.js', 'manifest.json',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'img/pint.png', 'img/frisdrank.png', 'img/chips.png', 'img/water.png',
  'img/sterkbier.png', 'img/kriek.png', 'img/desperados.png',
  'img/bak.png', 'img/halvebak.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first: verse bestanden zolang er bereik is (geen stale code),
// val terug op de cache bij geen verbinding (de kelder). Elke geslaagde
// fetch ververst de cache.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Enkel bestanden van de app zelf; API-aanroepen (Supabase) niet cachen.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
