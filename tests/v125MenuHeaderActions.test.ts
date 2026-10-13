import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/Navbar.v124.css', import.meta.url), 'utf8');

test('identity opens login/profile while the header only contains mood and home actions', () => {
  const head = navbar.slice(navbar.indexOf('<div className="navbar-menu-profile-head'), navbar.indexOf('<InstallAppButton'));
  assert.match(head, /navbar-menu-identity[\s\S]*登入 Echo-Starry/);
  assert.match(head, /onClick=\{\(\) => handleMobileNav\('profile'\)\}/);
  assert.match(head, /navbar-menu-header-actions[\s\S]*navbar-menu-palette-shortcut[\s\S]*navbar-menu-home-shortcut/);
  assert.doesNotMatch(head, /InstallAppButton|navbar-menu-login-shortcut/);
  assert.match(css, /\.navbar-menu-home-shortcut,[\s\S]*flex-direction:\s*column/);
  assert.doesNotMatch(css, /navbar-menu-home-shortcut span[\s\S]*display:\s*none/);
});

test('installation remains available as a list entry outside the header without a pin', () => {
  assert.match(navbar, /install:\s*false/);
  assert.match(navbar, /<InstallAppButton onOpenIOSGuide=\{handleInstallGuide\} className=\{menuActionClass\}/);
  assert.doesNotMatch(navbar, /renderPinControl\('install'/);
});

test('hamburger font label is 字體 and theme row omits current light-dark status text', () => {
  assert.match(navbar, /renderPinControl\('font', '字體'\)/);
  assert.match(navbar, /<span className="navbar-menu-font-label">字體<\/span>/);
  assert.doesNotMatch(navbar, /目前\{isDark \? '暗色' : '淺色'\}/);
});

test('nothing related to font sizing renders after logout', () => {
  const logout = navbar.indexOf('title="登出目前帳號"');
  assert.ok(logout >= 0);
  const afterLogout = navbar.slice(logout);
  assert.doesNotMatch(afterLogout, /A−|A＋|縮小字體|放大字體|文字大小|>字體</);
});
