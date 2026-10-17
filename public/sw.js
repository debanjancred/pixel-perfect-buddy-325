// Pujo Khata service worker (SPEC Story 5.2). Approach documented in AGENTS.md.
// Data never goes through here: it lives on the device (api.ts). This only makes the
// app shell — pages, JS/CSS, fonts, icons — open without a network after the first visit.

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const PAGES = `pk-pages-${VERSION}`;
const ASSETS = `pk-assets-${VERSION}`;
const FONTS = "pk-fonts-v1"; // font files are immutable; keep them across app versions
const KEEP = [PAGES, ASSETS, FONTS];
const SHELL = "/home";

const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
const STATIC_FILES = [
  "/manifest.webmanifest",
  "/favicon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(ASSETS)
      .then((c) => c.addAll(STATIC_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/** The page sends what it already loaded before this worker controlled it. */
self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || msg.type !== "CACHE_URLS" || !Array.isArray(msg.urls)) return;
  event.waitUntil(Promise.all(msg.urls.map((u) => warm(u))));
});

async function warm(url) {
  try {
    const u = new URL(url, self.location.origin);
    const req = new Request(u.href, {
      mode: FONT_HOSTS.includes(u.hostname) ? "cors" : "same-origin",
    });
    if (await caches.match(req)) return;
    const res = await fetch(req);
    if (res.ok) await (await caches.open(cacheFor(u))).put(req, res);
  } catch {
    /* best effort: a URL that can't be fetched now is cached on its next use */
  }
}

/** Pages are extension-less app routes; everything else same-origin is a static asset. */
function cacheFor(url) {
  if (FONT_HOSTS.includes(url.hostname)) return FONTS;
  if (url.pathname.startsWith("/assets/") || /\.[a-z0-9]+$/i.test(url.pathname)) return ASSETS;
  return PAGES;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(req, FONTS));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirstPage(req));
    return;
  }
  // Hashed build output and public files: immutable for a given version.
  if (url.pathname.startsWith("/assets/") || STATIC_FILES.includes(url.pathname)) {
    event.respondWith(cacheFirst(req, ASSETS));
  }
});

async function cacheFirst(req, cacheName) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") (await caches.open(cacheName)).put(req, res.clone());
  return res;
}

async function networkFirstPage(req) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    // Offline: this page as last seen, else the app shell (the client router takes over).
    return (
      (await cache.match(req, { ignoreSearch: true })) ||
      (await cache.match(SHELL)) ||
      new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
    );
  }
}
