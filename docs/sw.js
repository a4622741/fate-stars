// Service Worker — 命運之星 PWA v32
const CACHE_NAME = 'fate-stars-v93';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './assets/icon-192.svg',
  './assets/icon-512.svg',
];

// Install: cache assets + FORCE skip waiting
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

// Activate: delete ALL old caches + claim
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => caches.open(CACHE_NAME))
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.clients.claim())
  );
});

// Message: force update
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  if (e.data === 'clearCache') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});

// Fetch: ALWAYS network-first for local files
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.hostname === 'api.anthropic.com') return;

  // Pollinations: cache-first (images don't change)
  if (url.hostname === 'image.pollinations.ai') {
    e.respondWith(
      caches.match(e.request).then(c => c || fetch(e.request).then(r => {
        const cl = r.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, cl));
        return r;
      }))
    );
    return;
  }

  // External: network → cache fallback
  if (url.hostname !== location.hostname) {
    e.respondWith(
      fetch(e.request).then(r => {
        const cl = r.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, cl));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Local: NETWORK FIRST, always
  e.respondWith(
    fetch(e.request).then(r => {
      const cl = r.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(e.request, cl));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
