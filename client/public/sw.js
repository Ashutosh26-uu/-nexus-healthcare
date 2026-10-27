// Sehatra service worker.
// - App shell (HTML, hashed JS/CSS, icons, fonts) is cached so the app opens instantly and offline.
// - /api/* is NEVER cached: health data always comes fresh from the server and never sits on disk here.
// - Hashed /assets/ files from older builds are dropped whenever a new index.html arrives, so the cache can't grow forever.
const VERSION = 'sehatra-v3';
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

// A new release's shell is saved for the NEXT open. Its old assets are not deleted yet — the page open right
// now may still be the old release and need them. Instead a marker says "prune once the new shell is in use".
const PRUNE = '/__sehatra_prune';
async function saveShell(res) {
  const cache = await caches.open(VERSION);
  const old = await cache.match('/index.html');
  const oldHtml = old ? await old.text() : '';
  const html = await res.clone().text();
  await cache.put('/index.html', res);
  if (oldHtml && entryOf(html) !== entryOf(oldHtml)) await cache.put(PRUNE, new Response(entryOf(html)));
}
// Called when a page opens from the saved shell: if that shell is the new release, the old assets can go.
async function pruneIfServing(hit) {
  const cache = await caches.open(VERSION);
  const marker = await cache.match(PRUNE);
  if (!marker) return;
  const html = await hit.clone().text();
  if ((await marker.text()) !== entryOf(html)) return;
  await pruneAssets(html);
  await cache.delete(PRUNE);
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

  // Page navigations: the saved app shell opens AT ONCE (no wait for the server — that round trip was most of
  // the 2–3 s on a phone), while a fresh copy is fetched in the background for next time. A new release
  // therefore shows from the following open. First visit / nothing saved yet: straight from the network.
  // Only a good HTML response replaces the shell — never cache a 404/500 page. Files (sitemap.xml, robots.txt…)
  // always go to the network.
  if (req.mode === 'navigate' && url.origin === self.location.origin && !/\.[a-z0-9]+$/i.test(url.pathname)) {
    const network = fetch(req).then((res) => {
      if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) return saveShell(res.clone()).catch(() => {}).then(() => res);
      return res;
    });
    e.waitUntil(network.catch(() => {}));
    e.respondWith(caches.match('/index.html').then((hit) => {
      if (!hit) return network;
      e.waitUntil(pruneIfServing(hit).catch(() => {}));
      return hit;
    }).catch(() => network).catch(() => caches.match('/index.html')));
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
