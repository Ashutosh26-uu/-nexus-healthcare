// Sehatra service worker.
// - App shell (HTML, hashed JS/CSS, icons, fonts) is cached so the app opens instantly and offline.
// - /api/* is NEVER cached: health data always comes fresh from the server and never sits on disk here.
// - Hashed /assets/ files from older builds are dropped whenever a new index.html arrives, so the cache can't grow forever.
const VERSION = 'nexus-v2';
// Only '/index.html' is ever served from here (see the navigate branch), so '/' isn't cached — it would just sit stale.
const SHELL = ['/index.html', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

const assetsIn = (html) => new Set((html.match(/\/assets\/[^"'\s)]+/g) || []));
const entryOf = (html) => (html.match(/<script[^>]+src="([^"]+)"/) || [])[1] || '';

// A new build (different entry script) → delete cached assets the new index.html doesn't reference.
// Lazy chunks of the current build are simply refetched and re-cached on demand.
async function pruneAssets(html) {
  const keep = assetsIn(html);
  const cache = await caches.open(VERSION);
  for (const req of await cache.keys()) {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith('/assets/') && !keep.has(pathname)) await cache.delete(req);
  }
}

async function saveShell(res) {
  const cache = await caches.open(VERSION);
  const old = await cache.match('/index.html');
  const oldHtml = old ? await old.text() : '';
  const html = await res.clone().text();
  await cache.put('/index.html', res);
  if (entryOf(html) !== entryOf(oldHtml)) await pruneAssets(html);
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    const shell = await caches.match('/index.html');
    if (shell) await pruneAssets(await shell.text());
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return; // health data: network only

  // Page navigations: network first, fall back to the cached shell when offline.
  // Only a good HTML response replaces the shell — never cache a 404/500 page.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) e.waitUntil(saveShell(res.clone()).catch(() => {}));
      return res;
    }).catch(() => caches.match('/index.html')));
    return;
  }
  // Hashed build assets, icons and Google Fonts: cache first, then network (and remember it).
  const cacheable = (url.origin === self.location.origin && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')))
    || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (cacheable) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      // waitUntil: the worker may be stopped as soon as it has responded, before the put lands.
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); e.waitUntil(caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {})); }
      return res;
    })));
  }
});

self.addEventListener('message', (e) => { if (e.data === 'skip-waiting') self.skipWaiting(); });
