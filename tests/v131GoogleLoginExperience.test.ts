import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const platformUx = readFileSync(new URL('../src/googleIdentityPlatformUx.ts', import.meta.url), 'utf8');

test('Google login panel explains the benefit and keeps profile completion optional', () => {
  assert.match(platformUx, /登入 Echo-Starry/);
  assert.match(platformUx, /登入後可跨裝置保存學習進度與個人紀錄/);
  assert.match(platformUx, /個人資料可稍後補齊，不會中斷目前瀏覽/);
  assert.match(platformUx, /data-echostars-login-intro/);
});

test('credential completion disables the legacy forced profile auto-open without blocking a real user click', () => {
  assert.match(platformUx, /PROFILE_AUTO_OPEN_DISABLED_KEY/);
  assert.match(platformUx, /localStorage\.setItem\(PROFILE_AUTO_OPEN_DISABLED_KEY, '1'\)/);
  assert.match(platformUx, /sessionStorage\.setItem\(SKIP_FORCED_PROFILE_KEY, '1'\)/);
  assert.match(platformUx, /const callback = typeof config\.callback === 'function'/);
  assert.match(platformUx, /enableProgressiveProfileCompletion\(\);\s*return callback\(response\);/s);
  assert.match(platformUx, /if \(event\.isTrusted\) return;/);
  assert.match(platformUx, /event\.stopImmediatePropagation\(\)/);
});

test('existing signed-in members receive progressive profile completion on the next page load', () => {
  assert.match(platformUx, /if \(readCachedUser\(\)\) enableProgressiveProfileCompletion\(\);/);
});

test('One Tap, the official fallback button and iOS redirect behavior remain intact', () => {
  assert.match(platformUx, /text: 'continue_with'/);
  assert.match(platformUx, /shape: 'pill'/);
  assert.match(platformUx, /originalPrompt\(\)/);
  assert.match(platformUx, /next\.ux_mode = 'redirect'/);
  assert.match(platformUx, /next\.login_uri = `\$\{window\.location\.origin\}\/`/);
  assert.match(platformUx, /itp_support: true/);
});

test('legacy success wording is normalized so login no longer promises to force-open the profile form', () => {
  assert.match(platformUx, /登入成功！正在同步學習紀錄，個人資料可稍後補齊。/);
  assert.match(platformUx, /normalizeProgressiveLoginStatus/);
  assert.match(platformUx, /MutationObserver\(normalizeProgressiveLoginStatus\)/);
});
