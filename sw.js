/* Tonora service worker — offline-first */
const CACHE = 'tonora-v13';
const ASSETS = [
  './', './index.html', './manifest.json',
  './css/style.css?v=13',
  './js/i18n.js?v=13', './js/achievements.js?v=13', './js/audio.js?v=13', './js/piano.js?v=13',
  './js/play.js?v=13', './js/learn.js?v=13', './js/compose.js?v=13', './js/theory.js?v=13',
  './js/midi.js?v=13',
  './data/instruments.json?v=13', './data/songs.json?v=13',
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
