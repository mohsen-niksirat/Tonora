/* Tonora service worker — offline-first */
const CACHE = 'tonora-v28';
const ASSETS = [
  './', './index.html', './manifest.json',
  './css/style.css?v=28',
  './js/i18n.js?v=28', './js/store.js?v=28', './js/achievements.js?v=28', './js/audio.js?v=28', './js/piano.js?v=28',
  './js/play.js?v=28', './js/learn.js?v=28', './js/compose.js?v=28', './js/theory.js?v=28',
  './js/midi.js?v=28', './js/backing.js?v=28', './js/theory-content.js?v=28', './js/notation.js?v=28',
  './js/vendor/abcjs-basic-min.js?v=28', './js/vendor/tonal.min.js?v=28',
  './js/store.js?v=28', './js/share.js?v=28',
  './data/instruments.json?v=28', './data/songs.json?v=28',
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
