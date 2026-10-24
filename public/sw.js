/* 台本メーカーの Service Worker
 * 台本はブラウザの中（localStorage）にあるので、画面さえ開ければ圏外でも使える。
 * - ページ：ネットワーク優先。繋がらなければ最後に開いたものを出す
 * - /_next/static（ハッシュ付き）：一度取れば以後はキャッシュから
 * - アイコンなど：キャッシュを出しつつ裏で更新
 * - 別オリジン（Supabase など）や POST は触らない
 */
const VERSION = 'v2';
const CACHE = `script-maker-${VERSION}`;
const PRECACHE = ['/', '/stage', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

/** ページの HTML を取り、その中の /_next/static の部品も一緒にキャッシュする */
async function precachePage(cache, path) {
  const res = await fetch(path, { cache: 'reload' });
  if (!res.ok) return;
  await cache.put(path, res.clone());
  const html = await res.text();
  const assets = new Set(html.match(/\/_next\/static\/[A-Za-z0-9_./-]+\.(?:js|css)/g) || []);
  await Promise.allSettled([...assets].map((u) => cache.match(u).then((hit) => hit || cache.add(u))));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        Promise.allSettled([
          precachePage(c, '/'),
          precachePage(c, '/stage'),
          ...PRECACHE.filter((u) => u !== '/' && u !== '/stage').map((u) => c.add(u)),
        ]),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('script-maker-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.headers.has('range')) return;

  // ページ遷移：ネットワーク優先 → 失敗したらキャッシュ → なければ '/'
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match(url.pathname) || caches.match('/'))),
    );
    return;
  }

  // ハッシュ付きの静的ファイル：キャッシュ優先
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // それ以外（アイコン・マニフェスト・RSC など）：キャッシュを出しつつ裏で更新
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
