/* Tonora service worker — offline-first */
const CACHE = 'tonora-v14';
const ASSETS = [
  './', './index.html', './manifest.json',
  './css/style.css?v=14',
  './js/i18n.js?v=14', './js/achievements.js?v=14', './js/audio.js?v=14', './js/piano.js?v=14',
  './js/play.js?v=14', './js/learn.js?v=14', './js/compose.js?v=14', './js/theory.js?v=14',
  './js/midi.js?v=14',
  './data/instruments.json?v=14', './data/songs.json?v=14',
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
