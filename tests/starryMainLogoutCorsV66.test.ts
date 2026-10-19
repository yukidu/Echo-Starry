import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wrapper = readFileSync('worker/starryMainInlineLoginRouter.ts', 'utf8');
const central = readFileSync('worker/starryIdCentralRouter.ts', 'utf8');

test('Starry main logout gets the same credentialed CORS handling as Google login', () => {
  assert.match(wrapper, /const MAIN_ORIGIN = 'https:\/\/starry\.phd'/);
  assert.match(wrapper, /const GOOGLE_SYNC_PATH = '\/api\/google-sync'/);
  assert.match(wrapper, /const LOGOUT_PATH = '\/api\/logout'/);
  assert.match(wrapper, /\(url\.pathname === GOOGLE_SYNC_PATH \|\| url\.pathname === LOGOUT_PATH\)/);
  assert.match(wrapper, /\(request\.headers\.get\('Origin'\) \|\| ''\) === MAIN_ORIGIN/);
  assert.match(wrapper, /headers\.set\('Access-Control-Allow-Credentials', 'true'\)/);
  assert.match(wrapper, /headers\.set\('Access-Control-Allow-Origin', MAIN_ORIGIN\)/);
  assert.match(wrapper, /return withMainOriginCredentials\(response\)/);
  assert.doesNotMatch(wrapper, /Access-Control-Allow-Origin', '\*'/);
});

test('server revokes only its current session, clears cookie, and confirms logout', () => {
  assert.match(central, /path === '\/api\/logout' && method === 'POST'/);
  assert.match(central, /DELETE FROM auth_sessions WHERE tokenHash=\?/);
  assert.match(central, /return json\(request, \{ success: true \}, 200, \{ 'Set-Cookie': clearSessionCookie\(\) \}\)/);
  assert.match(central, /const SESSION_COOKIE = 'starry_id_session'/);
});
