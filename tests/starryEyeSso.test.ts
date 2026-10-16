import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const router = readFileSync(new URL('../worker/starryEyeSsoRouter.ts', import.meta.url), 'utf8');
const dispatcher = readFileSync(new URL('../worker/starryIdRandomMottoRouter.ts', import.meta.url), 'utf8');

test('繁星視界 uses exact-origin short-lived tickets', () => {
  assert.match(router, /https:\/\/eye\.starry\.phd/);
  assert.match(router, /APP_ID = 'starry-eye'/);
  assert.match(router, /\/api\/apps\/starry-eye\/ticket/);
  assert.match(router, /TICKET_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(router, /Access-Control-Allow-Credentials/);
  assert.match(router, /starry_app_auth_codes/);
  assert.doesNotMatch(router, /Domain=\.starry\.phd/);
});

test('繁星視界 SSO is wired into the established Starry ID dispatcher', () => {
  assert.match(dispatcher, /handleStarryEyeSso/);
  assert.match(dispatcher, /const eye = await handleStarryEyeSso\(request, env\)/);
});
