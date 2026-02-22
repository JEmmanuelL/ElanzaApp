const CACHE_NAME = 'elanza-cache-v1';
const ASSETS_TO_CACHE = [
  './',
  './login.html',
  './dashboard.html',
  './appointments.html',
  './history.html',
  './src/main.js',
  './styles/base.css',
  './styles/layout.css',
  './styles/components.css',
  './styles/responsive.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching App Shell');
      // Use catch() since some resources might not exist yet during local dev
      return Promise.allSettled(ASSETS_TO_CACHE.map(url => cache.add(url)));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[Service Worker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
