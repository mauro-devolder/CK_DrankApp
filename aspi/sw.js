// Service worker voor de aspi-app (scope /aspi/). Cachet de eigen shell + de
// gedeelde bestanden uit de hoofdmap, zodat de app ook zonder bereik opent.
const CACHE = 'drank-aspi-v5';
const PREFIX = 'drank-aspi-v'; // enkel eigen oude versies opruimen (niet die van de leiding-app)
const ASSETS = [
  '.', 'index.html', 'manifest.json',
  '../styles.css', '../app.js', '../store.js', '../members.js',
  '../api.js', '../config.js',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  '../img/pint.png', '../img/frisdrank.png', '../img/chips.png', '../img/water.png',
  '../img/sterkbier.png', '../img/kriek.png', '../img/desperados.png',
  '../img/bak.png', '../img/halvebak.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      // Enkel onze eigen oudere caches wissen — de leiding-app deelt dezelfde
      // origin/CacheStorage, dus we laten haar caches (drank-v*) met rust.
      Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first: verse bestanden zolang er bereik is, val terug op de cache.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
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
