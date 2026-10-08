import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/Navbar.v124.css', import.meta.url), 'utf8');

test('visitor login, install and home are grouped at the hamburger upper right', () => {
  assert.match(navbar, /navbar-menu-header-actions[\s\S]*navbar-menu-install-shortcut[\s\S]*!currentUser[\s\S]*navbar-menu-login-shortcut[\s\S]*登入[\s\S]*navbar-menu-home-shortcut/);
  assert.match(navbar, /onClick=\{\(\) => handleMobileNav\('profile'\)\}[\s\S]*className="navbar-menu-login-shortcut"/);
  assert.match(css, /\.navbar-menu-install-shortcut[\s\S]*flex-direction:\s*column/);
});

test('install is a fixed hamburger header action and no longer a pin-able list row', () => {
  assert.match(navbar, /install:\s*false/);
  assert.doesNotMatch(navbar, /renderPinControl\('install'/);
  assert.doesNotMatch(navbar, /echostars-install-menu-action/);
});

test('hamburger font label is 字體 and theme row omits current light-dark status text', () => {
  assert.match(navbar, /renderPinControl\('font', '字體'\)/);
  assert.match(navbar, /<span className="min-w-0 flex-1">字體<\/span>/);
  assert.doesNotMatch(navbar, /目前\{isDark \? '暗色' : '淺色'\}/);
});

test('nothing related to font sizing renders after logout', () => {
  const logout = navbar.indexOf('title="登出目前帳號"');
  assert.ok(logout >= 0);
  const afterLogout = navbar.slice(logout);
  assert.doesNotMatch(afterLogout, /A−|A＋|縮小字體|放大字體|文字大小|>字體</);
});
