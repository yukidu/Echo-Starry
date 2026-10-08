import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const navbarCss = readFileSync(new URL('../src/components/Navbar.css', import.meta.url), 'utf8');
const prefs = readFileSync(new URL('../src/quickShortcutPreferences.ts', import.meta.url), 'utf8');
const uiRouter = readFileSync(new URL('../worker/uiPreferencesRouter.ts', import.meta.url), 'utf8');
const sessionRouter = readFileSync(new URL('../worker/sessionCookieRouter.ts', import.meta.url), 'utf8');

test('v123 uses inline check controls instead of drag customization', () => {
  assert.match(navbar, /navbar-inline-pin/);
  assert.match(navbar, /aria-pressed=\{checked\}/);
  assert.match(navbar, /取消顯示在置頂主選單/);
  assert.match(navbar, /顯示在置頂主選單/);
  assert.doesNotMatch(navbar, /拖曳排序/);
  assert.doesNotMatch(navbar, /data-quick-sort-id/);
});

test('v123 hides unchecked pin controls automatically after the device limit is reached', () => {
  assert.match(navbar, /selectedQuickActionIds\.includes\(id\) \|\| selectedQuickActionIds\.length < deviceLimit/);
  assert.match(navbar, /navbar-pin-placeholder/);
  assert.match(navbarCss, /\.navbar-pin-placeholder/);
});

test('v123 stores separate mobile tablet and desktop selections', () => {
  assert.match(prefs, /QuickActionPreferences = Record<QuickDeviceKind, QuickActionId\[\]>/);
  assert.match(prefs, /mobile:\s*3/);
  assert.match(prefs, /tablet:\s*5/);
  assert.match(prefs, /desktop:\s*Number\.MAX_SAFE_INTEGER/);
  assert.match(prefs, /getQuickDeviceKind/);
});

test('v123 keeps signed-in member preferences on the existing authenticated session chain', () => {
  assert.match(prefs, /\/api\/user-ui-preferences/);
  assert.match(prefs, /credentials:\s*'same-origin'/);
  assert.match(uiRouter, /JOIN users u ON u\.id = s\.userId/);
  assert.match(uiRouter, /WHERE s\.tokenHash = \?/);
  assert.match(uiRouter, /user_ui_preferences/);
  assert.match(uiRouter, /ON CONFLICT\(userId\) DO UPDATE/);
  assert.match(uiRouter, /DEVICE_LIMITS = \{ mobile: 3, tablet: 5, desktop: 100 \}/);
  assert.match(sessionRouter, /import appWorker from '\.\/uiPreferencesRouter'/);
});

test('v123 still debounces cloud writes', () => {
  assert.match(navbar, /window\.setTimeout\(\(\) => \{/);
  assert.match(navbar, /900\)/);
  assert.match(navbar, /saveCloudQuickPreferences\(next\)/);
});
