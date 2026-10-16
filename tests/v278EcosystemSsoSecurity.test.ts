import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const router = readFileSync(new URL('../worker/starryEcosystemSsoRouter.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/ecosystemSsoClient.ts', import.meta.url), 'utf8');
const central = readFileSync(new URL('../worker/starryIdCentralRouter.ts', import.meta.url), 'utf8');

test('Starry ID authoritative session remains host-only', () => {
  assert.match(central, /starry_id_session/);
  assert.doesNotMatch(router, /Domain=\.starry\.phd/);
  assert.doesNotMatch(central, /Domain=\.starry\.phd/);
});

test('Echo uses exact-origin credentialed SSO instead of reading a shared subdomain cookie', () => {
  assert.match(router, /https:\/\/echo\.starry\.phd/);
  assert.match(router, /Access-Control-Allow-Credentials', 'true'/);
  assert.match(router, /\/api\/apps\\\/(echostars\|gostarry)\\\/ticket/);
  assert.match(router, /DELETE FROM starry_app_auth_codes/);
  assert.match(client, /credentials: 'include'/);
  assert.match(client, /api\/auth\/ecosystem-exchange/);
});

test('open Echo tabs re-check central identity on focus and visibility changes', () => {
  assert.match(client, /window\.addEventListener\('focus'/);
  assert.match(client, /visibilitychange/);
  assert.match(client, /_starryUserId/);
});
