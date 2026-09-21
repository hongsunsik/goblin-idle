// 고블린 키우기 - 서비스 워커 (웹 앱 설치·안드로이드 앱(TWA)에서 오프라인으로도 열리게 한다)
// 원칙: 항상 네트워크에서 최신 파일을 먼저 받고, 못 받을 때(오프라인)만 저장해 둔 것을 쓴다. 그래서 배포하면 바로 새 버전이 뜬다.
// 건드리지 않는 것: GET이 아닌 요청(서버 시각을 재는 HEAD 요청, Firebase 저장 등)과 다른 사이트로 가는 요청(글꼴·Firebase SDK·구글 로그인)은 그대로 통과시킨다.
const CACHE = 'goblin-idle-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') { const c = await caches.open(CACHE); c.put(req, res.clone()); }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: false }) || await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
