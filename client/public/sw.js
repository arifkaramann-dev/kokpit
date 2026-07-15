/*
 * Kokpit service worker (PWA kurulabilirliği + güvenli önbellek).
 * Strateji:
 *  - /assets/ altındaki hash'li dosyalar: cache-first (içerik değişmez, isim değişir)
 *  - Navigasyon (HTML): her zaman network-first — yeni deploy anında görünür;
 *    ağ yoksa son bilinen kabuk gösterilir
 *  - API istekleri (/api/): asla önbelleğe alınmaz
 */
const CACHE = "kokpit-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // API'ye dokunma

  // Hash'li statik dosyalar: cache-first.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const res = await fetch(event.request);
        if (res.ok) cache.put(event.request, res.clone());
        return res;
      })
    );
    return;
  }

  // Navigasyon: network-first, çevrimdışında son kabuk.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/").then(hit => hit ?? Response.error()))
    );
  }
});
