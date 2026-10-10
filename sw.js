/* Tonora service worker — offline-first */
const CACHE = 'tonora-v7';
const ASSETS = [
  './', './index.html', './manifest.json',
  './css/style.css?v=7',
  './js/i18n.js?v=7', './js/achievements.js?v=7', './js/audio.js?v=7', './js/piano.js?v=7',
  './js/play.js?v=7', './js/learn.js?v=7', './js/compose.js?v=7',
  './data/instruments.json?v=7', './data/songs.json?v=7',
  './icons/icon-192.png', './icons/icon-512.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit ||
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => hit))
  );
});
