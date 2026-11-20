// 오프라인에서도 열리도록 정적 파일 캐시
const CACHE = 'ssok-v8';
const FILES = ['./', 'index.html', 'css/style.css', 'css/calm.css', 'js/feedback.js', 'js/styles.js', 'js/game.js', 'js/app.js', 'js/calm.js', 'icon.svg', 'manifest.webmanifest'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// 네트워크 우선, 실패하면 캐시
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request))
  );
});
