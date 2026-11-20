// Service Worker untuk PWA & Caching Responsif CBT
const CACHE_NAME = 'cbt-pwa-v3.61';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/default-questions.js',
  './js/default-teachers.js',
  './js/default-students.js',
  './js/supabase-config.js',
  './js/exam-engine.js',
  './js/admin.js',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg',
  './assets/dev-emblem-mf.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => console.log('Pre-caching assets:', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  try {
    const reqUrl = new URL(event.request.url);
    if (reqUrl.pathname.startsWith('/api/')) return;
  } catch (e) {}

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then(res => res || caches.match('./index.html')))
  );
});
