/* 買い物チェックリスト サービスワーカー */

const CACHE = 'kaimono-v2';
const CORE = [
  './', './index.html', './manifest.webmanifest',
  './favicon.svg', './favicon-32.png', './apple-touch-icon.png',
  './icon-192.png', './icon-512.png',
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      // 個別にキャッシュ（1つ失敗しても install は成功させる）
      Promise.all(CORE.map(u => cache.add(u).catch(() => {})))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // アプリ本体（同一オリジン）: ネット優先→失敗時キャッシュ（常に最新を取りつつオフラインでも開ける）
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req).then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() =>
        caches.match(req).then(r => r || caches.match('./index.html')).then(r => r || caches.match('./'))
      )
    );
    return;
  }

  // MQTTライブラリ（CDN）: キャッシュ優先→裏で更新（オフラインでも同期ライブラリを読める）
  if (url.href.indexOf('unpkg.com/mqtt') !== -1) {
    event.respondWith(
      caches.match(req).then(cached => {
        const net = fetch(req).then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => cached);
        return cached || net;
      })
    );
  }
});

self.addEventListener('push', event => {
  if (!event.data) return;
  let data;
  try { data = event.data.json(); }
  catch { data = { title: '買い物チェックリスト', body: event.data.text() }; }

  const opts = {
    body: data.body || '',
    icon: './apple-touch-icon.png',
    badge: './favicon-32.png',
    tag: 'kaimono',
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: self.registration.scope },
  };
  event.waitUntil(
    self.registration.showNotification(data.title || '買い物チェックリスト', opts)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope) && 'focus' in c) { c.focus(); return; }
      }
      return clients.openWindow(url);
    })
  );
});
