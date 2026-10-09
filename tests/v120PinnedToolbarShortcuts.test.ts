import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const navbarCss = readFileSync(new URL('../src/components/Navbar.css', import.meta.url), 'utf8');
const quickPrefs = readFileSync(new URL('../src/quickShortcutPreferences.ts', import.meta.url), 'utf8');

test('v152 keeps font and dynamic theme action available in both toolbar rendering and hamburger menu', () => {
  assert.match(navbar, /data-echostars-top-toolbar="true"/);
  assert.match(navbar, /renderPinControl\('font', '字體'\)/);
  assert.match(navbar, /const themeActionLabel = isDark \? '開燈' : '關燈'/);
  assert.match(navbar, /renderPinControl\('theme', themeActionLabel\)/);
  assert.match(navbar, /aria-label="縮小字體"/);
  assert.match(navbar, /aria-label="放大字體"/);
});

test('v123 removes the old separate shortcut customizer and keeps font zoom local', () => {
  assert.doesNotMatch(navbar, /自訂置頂功能/);
  assert.doesNotMatch(navbar, /GripVertical/);
  assert.match(navbar, /echostars_user_font_zoom_v1/);
  assert.match(navbar, /window\.dispatchEvent\(new Event\('resize'\)\)/);
});

test('v123 uses device-specific limits and local cache', () => {
  assert.match(quickPrefs, /mobile:\s*3/);
  assert.match(quickPrefs, /tablet:\s*5/);
  assert.match(quickPrefs, /desktop:\s*Number\.MAX_SAFE_INTEGER/);
  assert.match(quickPrefs, /echostars_quick_header_actions_v2/);
  assert.match(quickPrefs, /localStorage\.setItem\(QUICK_ACTIONS_STORAGE_KEY/);
  assert.match(navbar, /selectedQuickActionIds\.length < deviceLimit/);
});

test('permission-sensitive shortcuts remain gated by the same navbar permissions', () => {
  assert.match(navbar, /notifications:\s*Boolean\(currentUser\)/);
  assert.match(navbar, /upload:\s*canUpload/);
  assert.match(navbar, /admin:\s*canAccessSettings/);
});

test('toolbar stays compact and horizontally safe while desktop width remains fluid', () => {
  assert.match(navbarCss, /\.navbar-top-toolbar\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(navbarCss, /\.navbar-top-action\s*\{[\s\S]*width:\s*2\.25rem/);
  assert.match(navbarCss, /\.navbar-main-row\s*\{[\s\S]*max-width:\s*none\s*!important/);
  assert.match(navbarCss, /left:\s*9\.5rem/);
  assert.doesNotMatch(navbarCss, /100vw - 56rem/);
});
