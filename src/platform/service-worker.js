/* BUILD and PRECACHE are injected by scripts/build-sw.mjs. */
const PREFIX = `packcalendar:${new URL(self.registration.scope).pathname}:`;
const CACHE = PREFIX + BUILD;
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE))));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request, { ignoreSearch: event.request.mode === 'navigate' });
    if (cached) return cached;
    try { return await fetch(event.request); }
    catch (error) { if (event.request.mode === 'navigate') { const page = await cache.match('./index.html'); if (page) return page; } throw error; }
  })());
});
self.addEventListener('push', event => {
  let data = {}; try { data = event.data?.json() ?? {}; } catch { data = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'PackCalendarの準備', { body: data.body || '予定の準備を確認してください。', icon: './assets/icon-192.png', badge: './assets/icon-192.png', tag: data.id || 'packcalendar-prep', data: { url: '#home' } }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => { const url = new URL('./#home', self.registration.scope).href; for (const client of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) if (client.url.startsWith(self.registration.scope)) { await client.navigate(url); return client.focus(); } return self.clients.openWindow(url); })());
});
