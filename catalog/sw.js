const CACHE_NAME = 'catalog-viewer-v3-text-layer';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './favicon-32.png',
  './apple-touch-icon.png',
  './social-preview.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Nu interceptăm PDF-ul: PDF.js poate folosi byte-range requests,
  // ceea ce este mai eficient pe conexiuni lente și pentru fișiere mari.
  if (url.pathname.toLowerCase().endsWith('.pdf')) return;

  // Pentru navigare, întoarcem aplicația și când GitHub Pages răspunde lent.
  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Cache-first pentru fișierele aplicației și PDF.js după prima utilizare.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || (response.status !== 200 && response.type !== 'opaque')) return response;
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      });
    })
  );
});
