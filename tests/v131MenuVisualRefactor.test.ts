import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const navbarCss = readFileSync(new URL('../src/components/Navbar.css', import.meta.url), 'utf8');
const menuPolish = readFileSync(new URL('../src/v126MenuPolish.ts', import.meta.url), 'utf8');
const identityPolicy = readFileSync(new URL('../src/v127MenuIdentityPalette.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

test('v131 keeps pin controls and quick-action limits in the React menu', () => {
  assert.match(navbar, /renderPinControl\('font', '字體'\)/);
  assert.match(navbar, /renderPinControl\('theme', '淺色／暗色切換'\)/);
  assert.match(navbar, /renderPinControl\('stats', '排行榜'\)/);
  assert.match(navbar, /renderPinControl\('notifications', '通知'\)/);
  assert.match(navbar, /renderPinControl\('stickers', '我的貼紙'\)/);
  assert.match(navbar, /renderPinControl\('profile', '個人中心'\)/);
  assert.match(navbar, /quickActionLimitForDevice\(deviceKind\)/);
});

test('home shortcut says 回首頁 and performs a real refresh/navigation', () => {
  assert.match(navbar, /handleMenuHomeRefresh/);
  assert.match(navbar, /window\.location\.reload\(\)/);
  assert.match(navbar, /window\.location\.assign\('\/'\)/);
  assert.match(navbar, /aria-label="回首頁"/);
  assert.match(navbar, /<span>回首頁<\/span>/);
});

test('font zoom starts at 100 percent and does not scale the hamburger menu', () => {
  assert.match(navbar, /Math\.max\(1, value\)/);
  assert.match(navbar, /Math\.max\(1, fontZoom \+ delta\)/);
  assert.match(navbar, /disabled=\{fontZoom <= 1\}/);
  assert.match(navbar, /style=\{\{ '--navbar-font-zoom': fontZoom, zoom: 1 \/ fontZoom \} as React\.CSSProperties\}/);
  assert.match(navbar, /navbar-menu-font-controls/);
  assert.match(navbarCss, /\.navbar-menu-font-controls \{[\s\S]*justify-content: flex-start/);
});

test('installed palette shortcut is called 好心情 and no refresh shortcut is injected', () => {
  assert.match(menuPolish, /shortcut\.title = '好心情'/);
  assert.match(menuPolish, /text\.textContent = '好心情'/);
  assert.doesNotMatch(identityPolicy, /v129-refresh/);
  assert.doesNotMatch(identityPolicy, /重新整理頁面/);
});

test('logout and reset menu are rendered on the same persistent footer row', () => {
  assert.match(navbar, /className="navbar-menu-footer-actions"/);
  assert.match(navbar, /<span>登出<\/span>/);
  assert.match(navbar, /<span>重設選單<\/span>/);
  assert.match(navbar, /\[deviceKind\]: \['font', 'theme'\]/);
  assert.match(navbarCss, /\.navbar-menu-footer-actions \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
});

test('menu width is compact while preserving right-aligned trailing controls', () => {
  assert.match(navbarCss, /max-width: min\(22\.5rem, calc\(\(100vw - 24px\) \* var\(--navbar-font-zoom, 1\)\)\)/);
  assert.match(navbarCss, /\.mobile-menu-row \.navbar-menu-trailing \{[\s\S]*margin-left: auto/);
});

test('retired v130 DOM patch is no longer loaded', () => {
  assert.doesNotMatch(main, /v130MenuControls/);
});
