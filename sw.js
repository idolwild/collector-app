// Bump this on every deploy.
const CACHE = 'collector-shell-v50';

// The app shell is revalidated against the network on every reload (`no-cache`
// means the server is asked, not the local copy). Serving it from cache first
// is what hid a fix — the client kept the previous build until this name
// changed, so a deploy could look like it did nothing.
const SHELL = ['./', './index.html', './app.js', './db.js', './color.js', './style.css', './icon.svg', './logo.svg', './manifest.webmanifest'];
const SHELL_PATHS = new Set(SHELL.map((p) => new URL(p, self.location.href).pathname));
SHELL_PATHS.add(new URL('./', self.location.href).pathname);

function isShell(request) {
  if (request.mode === 'navigate') return true;
  return SHELL_PATHS.has(new URL(request.url).pathname);
}

async function cachedShell(request) {
  const cache = await caches.open(CACHE);
  const hit = (await cache.match(request)) || (await cache.match('./index.html'));
  return hit || Response.error();
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // One missing file must not abort the whole install: a partial offline
      // cache is still better than a worker that never comes up.
      await Promise.all(SHELL.map((p) => cache.add(p).catch(() => {})));
    })()
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      if (isShell(request)) {
        try {
          const fresh = await fetch(request, { cache: 'no-cache' });
          if (fresh && fresh.status === 200 && !fresh.headers.has('set-cookie')) {
            const copy = fresh.clone();
            cache.put(request, copy).catch(() => {});
          }
          return fresh;
        } catch {
          return cachedShell(request); // offline: fall back to the precache
        }
      }

      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && response.status === 200) {
          const copy = response.clone();
          cache.put(request, copy).catch(() => {});
        }
        return response;
      } catch {
        return cachedShell(request);
      }
    })()
  );
});
