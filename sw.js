// Scope-specific caches keep separate GitHub Pages projects isolated.
const CACHE = `packcalendar:${self.registration.scope}:v2`;
const FILES = [
  "./",
  "./index.html",
  "./src/app.js",
  "./src/core.js",
  "./src/storage.js",
  "./src/ui.js",
  "./src/styles.css",
  "./manifest.webmanifest",
  "./assets/icon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
];
self.addEventListener("install", (event) =>
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES))),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      const prefix = `packcalendar:${self.registration.scope}:`;
      for (const key of await caches.keys())
        if (key.startsWith(prefix) && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (
    !url.href.startsWith(self.registration.scope) ||
    url.origin !== self.location.origin
  )
    return;
  const canonical = new URL(url);
  canonical.hash = "";
  canonical.search = "";
  if (
    !FILES.some(
      (file) => new URL(file, self.registration.scope).href === canonical.href,
    )
  )
    return;
  // One app version per cache. A new worker waits until existing tabs close.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const saved = await cache.match(canonical.href);
      return saved ?? fetch(event.request);
    }),
  );
});
