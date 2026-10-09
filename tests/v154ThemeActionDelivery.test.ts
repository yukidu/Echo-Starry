import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const browserCheck = readFileSync(new URL('../scripts/verifyThemeMenuUi.mjs', import.meta.url), 'utf8');
const guestMenuCss = readFileSync(new URL('../src/v136GuestMenu.css', import.meta.url), 'utf8');

test('upgrading an existing app shell refreshes stale window clients once', () => {
  assert.match(sw, /const oldShellKeys = keys\.filter/);
  assert.match(sw, /const upgradingExistingClient = oldShellKeys\.length > 0/);
  assert.match(sw, /FORCE_STALE_CLIENT_REFRESH && upgradingExistingClient/);
  assert.match(sw, /self\.clients\.matchAll\(\{ type: 'window', includeUncontrolled: true \}\)/);
  assert.match(sw, /client\.navigate\(client\.url\)/);
});

test('v136 no longer hides React text behind a fixed combined pseudo-label', () => {
  assert.doesNotMatch(guestMenuCss, /content:\s*["']開燈\/關燈["']/);
  assert.doesNotMatch(guestMenuCss, /content:\s*["']開燈／關燈["']/);
  assert.match(guestMenuCss, /visibility:\s*visible\s*!important/);
  assert.match(guestMenuCss, /content:\s*none\s*!important/);
});

test('real browser gate checks the visible theme action before and after toggle', () => {
  assert.match(browserCheck, /svg\.lucide-moon, svg\.lucide-sun/);
  assert.match(browserCheck, /state\.kind === 'moon' \? '關燈'/);
  assert.match(browserCheck, /state\.kind === 'sun' \? '開燈'/);
  assert.match(browserCheck, /state\.text\.includes\('\/'\)/);
  assert.match(browserCheck, /Theme action row overflows/);
  assert.match(browserCheck, /Page\.captureScreenshot/);
});
