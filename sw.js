/* Tonora service worker — offline-first */
const CACHE = 'tonora-v27';
const ASSETS = [
  './', './index.html', './manifest.json',
  './css/style.css?v=27',
  './js/i18n.js?v=27', './js/store.js?v=27', './js/achievements.js?v=27', './js/audio.js?v=27', './js/piano.js?v=27',
  './js/play.js?v=27', './js/learn.js?v=27', './js/compose.js?v=27', './js/theory.js?v=27',
  './js/midi.js?v=27', './js/backing.js?v=27', './js/theory-content.js?v=27', './js/notation.js?v=27',
  './js/vendor/abcjs-basic-min.js?v=27', './js/vendor/tonal.min.js?v=27',
  './js/store.js?v=27', './js/share.js?v=27',
  './data/instruments.json?v=27', './data/songs.json?v=27',
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
