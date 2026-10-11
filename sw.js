/* Tonora service worker — offline-first */
const CACHE = 'tonora-v18';
const ASSETS = [
  './', './index.html', './manifest.json',
  './css/style.css?v=18',
  './js/i18n.js?v=18', './js/achievements.js?v=18', './js/audio.js?v=18', './js/piano.js?v=18',
  './js/play.js?v=18', './js/learn.js?v=18', './js/compose.js?v=18', './js/theory.js?v=18',
  './js/midi.js?v=18', './js/backing.js?v=18', './js/theory-content.js?v=18', './js/notation.js?v=18',
  './data/instruments.json?v=18', './data/songs.json?v=18',
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
