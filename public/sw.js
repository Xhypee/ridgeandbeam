/* Ridge & Beam service worker: offline app shell for the job Field tab and the homeowner portal.
 * - /_next/static/* : cache-first (immutable, content-hashed)
 * - Field tab, photo report, homeowner portal pages: network-first, fall back to the last good copy
 * - Everything else (API, Supabase, server actions, RSC fetches) passes straight through.
 * Captures themselves live in IndexedDB (see src/lib/field-queue.ts), not here.
 */
const VERSION = "rb-sw-v1";
const STATIC = VERSION + "-static";
const PAGES = VERSION + "-pages";
const OFFLINE_PAGES = [/^\/app\/jobs\/[0-9a-f-]+\/field(\/report)?\/?$/, /^\/p\/[A-Za-z0-9]+\/?$/];

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

const isOfflinePage = (url) => url.origin === self.location.origin && OFFLINE_PAGES.some((r) => r.test(url.pathname));
const isStatic = (url) => url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");

async function putPage(request, response) {
  if (!response || !response.ok || response.redirected || response.type !== "basic") return;
  const ct = response.headers.get("content-type") || "";
  if (!ct.includes("text/html")) return;
  const cache = await caches.open(PAGES);
  await cache.put(new URL(request.url).pathname, response);
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "warm" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const staticCache = await caches.open(STATIC);
      for (const u of data.urls) {
        try {
          const url = new URL(u, self.location.origin);
          if (isStatic(url)) {
            if (!(await staticCache.match(url.href))) {
              const res = await fetch(url.href);
              if (res.ok) await staticCache.put(url.href, res);
            }
          } else if (isOfflinePage(url)) {
            const req = new Request(url.href, { credentials: "include", headers: { Accept: "text/html" } });
            const res = await fetch(req);
            await putPage(req, res);
          }
        } catch (e) {
          /* offline while warming: ignore */
        }
      }
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isStatic(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC);
        const hit = await cache.match(req.url);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req.url, res.clone());
        return res;
      })(),
    );
    return;
  }

  // Full page loads of the offline-capable pages (not RSC/prefetch requests).
  if (req.mode === "navigate" && isOfflinePage(url) && !req.headers.get("RSC")) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          putPage(req, res.clone());
          return res;
        } catch (e) {
          const cache = await caches.open(PAGES);
          const hit = await cache.match(url.pathname, { ignoreVary: true, ignoreSearch: true });
          if (hit) return hit;
          return new Response(
            "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'><title>Offline</title>" +
              "<body style='font-family:system-ui;padding:24px;background:#f8fafc;color:#0f172a'><h1>No signal</h1>" +
              "<p>Open this page once with signal and it will work offline next time. Photos you already took are safe on this phone.</p></body>",
            { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
      })(),
    );
  }
});
