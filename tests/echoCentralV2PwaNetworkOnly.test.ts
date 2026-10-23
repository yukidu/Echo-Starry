import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/** Execute the actual Echo PWA service-worker code with isolated fake browser APIs. */
function newServiceWorker() {
  const handlers = new Map<string, (event: any) => void>();
  let cacheReads = 0;
  let requests = 0;
  const self = {
    location: { origin: 'https://echo.starry.phd' },
    addEventListener(name: string, callback: (event: any) => void) {
      handlers.set(name, callback);
    },
    skipWaiting() {},
    clients: { claim: async () => undefined, matchAll: async () => [] }
  };
  const caches = {
    open: async () => ({
      match: async () => { cacheReads += 1; return undefined; },
      put: async () => undefined,
      addAll: async () => undefined
    }),
    match: async () => { cacheReads += 1; return undefined; },
    keys: async () => []
  };
  const fetcher = async () => {
    requests += 1;
    return new Response('<html>normal echo app shell</html>', { status: 200 });
  };
  const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  vm.runInNewContext(source, { self, caches, fetch: fetcher, URL, Response });
  const intercept = async (path: string, mode: string = 'navigate') => {
    const replies: Promise<Response>[] = [];
    handlers.get('fetch')!({
      request: { method: 'GET', url: 'https://echo.starry.phd' + path, mode },
      respondWith(value: Promise<Response>) { replies.push(value); }
    });
    if (replies.length) await replies[0];
    return replies.length;
  };
  return { intercept, reads: () => cacheReads, requests: () => requests };
}

test('PWA never intercepts new central login /auth/central-v2', async () => {
  const sw = newServiceWorker();
  assert.equal(await sw.intercept('/auth/central-v2'), 0);
  assert.equal(sw.reads(), 0);
  assert.equal(sw.requests(), 0);
});

test('PWA never caches or replaces callback with a one-time ticket query', async () => {
  const sw = newServiceWorker();
  assert.equal(await sw.intercept('/auth/callback?code=' + 'T'.repeat(43)), 0);
  assert.equal(sw.reads(), 0);
  assert.equal(sw.requests(), 0);
});

test('PWA also leaves all existing auth callbacks and API authentication uncached', async () => {
  const sw = newServiceWorker();
  assert.equal(await sw.intercept('/auth/gratitude'), 0);
  assert.equal(await sw.intercept('/auth/other-app?code=private-ticket'), 0);
  assert.equal(await sw.intercept('/api/auth/ecosystem-exchange', 'navigate'), 0);
  assert.equal(sw.reads(), 0);
  assert.equal(sw.requests(), 0);
});

test('PWA normal homepage remains eligible for shell caching', async () => {
  const sw = newServiceWorker();
  assert.equal(await sw.intercept('/'), 1);
  assert.equal(sw.requests(), 1);
});
