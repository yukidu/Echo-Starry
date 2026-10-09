import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const platformUx = readFileSync(new URL('../src/googleIdentityPlatformUx.ts', import.meta.url), 'utf8');
const redirectRouter = readFileSync(new URL('../worker/iosGoogleRedirectRouter.ts', import.meta.url), 'utf8');
const favoriteRouter = readFileSync(new URL('../worker/favoriteRouter.ts', import.meta.url), 'utf8');
const privacyRouter = readFileSync(new URL('../worker/privacyCrawlerRouter.ts', import.meta.url), 'utf8');

test('platform UX layer loads before the legacy Google bridge', () => {
  const platformIndex = indexHtml.indexOf('/src/googleIdentityPlatformUx.ts');
  const bridgeIndex = indexHtml.indexOf('/src/googleIdentityBridge.ts');
  assert.ok(platformIndex >= 0);
  assert.ok(bridgeIndex >= 0);
  assert.ok(platformIndex < bridgeIndex);
});

test('iOS uses redirect mode on production and enables ITP support', () => {
  assert.equal(platformUx.includes("next.ux_mode = 'redirect'"), true);
  assert.equal(platformUx.includes("next.login_uri = `${window.location.origin}/`"), true);
  assert.equal(platformUx.includes('itp_support: true'), true);
  assert.equal(platformUx.includes("text: 'continue_with'"), true);
  assert.equal(platformUx.includes("shape: 'pill'"), true);
  assert.equal(platformUx.includes('iPhone / iPad 將前往 Google 驗證'), true);
});

test('desktop and Android keep popup with One Tap fallback', () => {
  assert.equal(platformUx.includes("next.ux_mode = 'popup'"), true);
  assert.equal(platformUx.includes('originalPrompt();'), true);
});

test('redirect endpoint verifies Google double-submit CSRF before exchanging credential', () => {
  assert.equal(privacyRouter.includes("import appWorker from './favoriteRouter';"), true);
  assert.equal(favoriteRouter.includes("import appWorker from './adminUserDeleteRouter';"), true);
  assert.equal(privacyRouter.includes("import iosGoogleRedirectWorker from './iosGoogleRedirectRouter';"), true);
  assert.equal(privacyRouter.includes("request.method === 'POST' && url.pathname === '/'"), true);
  assert.equal(privacyRouter.includes('iosGoogleRedirectWorker.fetch(request, env)'), true);
  assert.equal(redirectRouter.includes("form.get('g_csrf_token')"), true);
  assert.equal(redirectRouter.includes("cookieValue(request, 'g_csrf_token')"), true);
  assert.equal(redirectRouter.includes('csrfBody !== csrfCookie'), true);
  assert.equal(redirectRouter.includes("new URL('/api/users/google-sync', request.url)"), true);
});

test('iOS redirect restores app location and does not force profile completion immediately', () => {
  assert.equal(platformUx.includes('echostars_auth_return_v1'), true);
  assert.equal(platformUx.includes('echostars_auth_restore_v1'), true);
  assert.equal(platformUx.includes('echostars_skip_forced_profile_once'), true);
  assert.equal(redirectRouter.includes('sessionStorage.setItem('), true);
  assert.equal(redirectRouter.includes('window.location.replace(target)'), true);
});