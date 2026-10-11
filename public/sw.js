const CACHE_NAME = 'echostars-shell-v179';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-monochrome.svg', '/icon-192.png', '/icon-512.png'];
const FORCE_STALE_CLIENT_REFRESH = true;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const oldShellKeys = keys.filter(key => key.startsWith('echostars-shell-') && key !== CACHE_NAME);
    const upgradingExistingClient = oldShellKeys.length > 0;

    await Promise.all(oldShellKeys.map(key => caches.delete(key)));
    await self.clients.claim();

    if (FORCE_STALE_CLIENT_REFRESH && upgradingExistingClient) {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await Promise.all(windows.map(async client => {
        if (typeof client.navigate !== 'function') return;
        try {
          await client.navigate(client.url);
        } catch {
          // A closed/navigating tab is harmless; the next normal open gets the latest bundle.
        }
      }));
    }
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  ) return;

  const navigation = event.request.mode === 'navigate';
  const staticAsset =
    url.pathname.startsWith('/assets/') ||
    APP_SHELL.includes(url.pathname);

  if (!navigation && !staticAsset) return;

  event.respondWith((async () => {
    try {
      if (url.pathname.startsWith('/assets/') && /-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i.test(url.pathname)) {
        const cached = await (await caches.open(CACHE_NAME)).match(event.request);
        if (cached) return cached;
      }
      const response = await fetch(event.request);
      const cacheableNavigation = navigation && (url.pathname === '/' || url.pathname === '/index.html');
      if (response.ok && (!navigation || cacheableNavigation)) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(navigation ? '/index.html' : event.request, response.clone());
      }
      return response;
    } catch {
      return (
        (await caches.match(event.request)) ||
        (navigation ? await caches.match('/index.html') : undefined) ||
        new Response('目前無法連線，請恢復網路後重試。', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        })
      );
    }
  })());
});
