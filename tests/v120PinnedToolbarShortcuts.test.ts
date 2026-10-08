import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const navbarCss = readFileSync(new URL('../src/components/Navbar.css', import.meta.url), 'utf8');

test('font minus, font plus and theme are permanently rendered in the sticky top toolbar', () => {
  assert.match(navbar, /data-echostars-top-toolbar="true"/);
  assert.match(navbar, /aria-label="縮小字體"/);
  assert.match(navbar, /aria-label="放大字體"/);
  assert.match(navbar, /aria-label=\{isDark \? '切換淺色模式' : '切換深色模式'\}/);
  assert.doesNotMatch(navbar, /onClick=\{handleToggleTheme\} className=\{mobileRowClass\(false\)\}/);
});

test('legacy v119 menu font injector is explicitly suppressed after controls move to the toolbar', () => {
  assert.match(navbar, /data-echostars-font-control="moved-to-toolbar"/);
  assert.match(navbar, /echostars_user_font_zoom_v1/);
  assert.match(navbar, /window\.dispatchEvent\(new Event\('resize'\)\)/);
});

test('users can pin at most three eligible hamburger actions using local device storage', () => {
  assert.match(navbar, /MAX_QUICK_ACTIONS = 3/);
  assert.match(navbar, /echostars_quick_header_actions_v1/);
  assert.match(navbar, /自訂置頂功能/);
  assert.match(navbar, /visibleQuickActionIds\.length >= MAX_QUICK_ACTIONS/);
  assert.match(navbar, /localStorage\.setItem\(QUICK_ACTIONS_STORAGE_KEY/);
  assert.doesNotMatch(navbar, /fetch\([^\n]*quick_header_actions/);
});

test('permission-sensitive shortcuts remain gated by the same navbar permissions', () => {
  assert.match(navbar, /id: 'notifications'.*available: Boolean\(currentUser\)/s);
  assert.match(navbar, /id: 'upload'.*available: canUpload/s);
  assert.match(navbar, /id: 'admin'.*available: canAccessSettings/s);
});

test('toolbar stays compact and horizontally safe on narrow phones', () => {
  assert.match(navbarCss, /\.navbar-top-toolbar\s*\{[\s\S]*overflow-x:\s*auto;/);
  assert.match(navbarCss, /\.navbar-top-action\s*\{[\s\S]*width:\s*2\.25rem;/);
  assert.match(navbarCss, /flex:\s*0 0 2\.25rem;/);
  assert.match(navbarCss, /max-height:\s*calc\(100dvh - 7\.25rem\);/);
});