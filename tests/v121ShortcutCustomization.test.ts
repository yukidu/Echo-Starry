import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const navbarCss = readFileSync(new URL('../src/components/Navbar.css', import.meta.url), 'utf8');
const prefs = readFileSync(new URL('../src/quickShortcutPreferences.ts', import.meta.url), 'utf8');
const uiRouter = readFileSync(new URL('../worker/uiPreferencesRouter.ts', import.meta.url), 'utf8');
const sessionRouter = readFileSync(new URL('../worker/sessionCookieRouter.ts', import.meta.url), 'utf8');

test('v121 tells users exactly how to drag and supports pointer drag on touch devices', () => {
  assert.match(navbar, /已選功能可按住左側/);
  assert.match(navbar, /拖曳排序，手機、平板、電腦都可以/);
  assert.match(navbar, /GripVertical/);
  assert.match(navbar, /onPointerDown=\{event => beginPointerDrag/);
  assert.match(navbar, /onPointerMove=\{movePointerDrag\}/);
  assert.match(navbar, /data-quick-sort-id/);
  assert.match(navbarCss, /touch-action:\s*none/);
});

test('v121 lets the user choose icon-only or icon-plus-label toolbar shortcuts', () => {
  assert.match(navbar, /置頂顯示方式/);
  assert.match(navbar, /只有圖示/);
  assert.match(navbar, /圖示＋文字/);
  assert.match(navbar, /navbar-top-action-with-label/);
  assert.match(navbarCss, /\.navbar-top-action-label/);
});

test('v121 keeps at most three quick actions and stores guest preferences locally', () => {
  assert.match(prefs, /MAX_QUICK_ACTIONS = 3/);
  assert.match(prefs, /echostars_quick_header_actions_v1/);
  assert.match(prefs, /echostars_quick_header_label_mode_v1/);
  assert.match(prefs, /localStorage\.setItem\(QUICK_ACTIONS_STORAGE_KEY/);
  assert.match(prefs, /localStorage\.setItem\(QUICK_LABEL_MODE_STORAGE_KEY/);
});

test('v121 syncs signed-in member shortcut order and label mode through the existing authenticated session chain', () => {
  assert.match(prefs, /\/api\/user-ui-preferences/);
  assert.match(prefs, /credentials:\s*'same-origin'/);
  assert.match(uiRouter, /JOIN users u ON u\.id = s\.userId/);
  assert.match(uiRouter, /WHERE s\.tokenHash = \?/);
  assert.match(uiRouter, /user_ui_preferences/);
  assert.match(uiRouter, /ON CONFLICT\(userId\) DO UPDATE/);
  assert.match(uiRouter, /MAX_QUICK_ACTIONS = 3/);
  assert.match(sessionRouter, /import appWorker from '\.\/uiPreferencesRouter'/);
});

test('v121 cloud sync is debounced so dragging does not write D1 on every pointer movement', () => {
  assert.match(navbar, /window\.setTimeout\(\(\) => \{/);
  assert.match(navbar, /900\)/);
  assert.match(navbar, /saveCloudQuickPreferences\(ids, mode\)/);
});
