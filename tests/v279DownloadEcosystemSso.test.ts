import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const router = readFileSync(new URL('../worker/starryEcosystemSsoRouter.ts', import.meta.url), 'utf8');

test('繁星捕手 is a first-class safe Starry ecosystem ticket app', () => {
  assert.match(router, /downloadstarry: \{ origin: 'https:\/\/download\.starry\.phd', label: '繁星捕手' \}/);
  assert.match(router, /echostars\|gostarry\|downloadstarry/);
  assert.match(router, /starry_app_auth_codes/);
  assert.match(router, /TICKET_TTL_MS = 5 \* 60 \* 1000/);
});

test('central credential remains host-only instead of being shared to all Starry subdomains', () => {
  assert.match(router, /const CENTRAL_COOKIE = 'starry_id_session'/);
  assert.doesNotMatch(router, /Domain=\.starry\.phd/);
  assert.match(router, /https:\/\/download\.starry\.phd/);
  assert.match(router, /Access-Control-Allow-Credentials/);
});
