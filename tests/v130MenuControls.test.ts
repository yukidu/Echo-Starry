import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const navbarCss = readFileSync(new URL('../src/components/Navbar.css', import.meta.url), 'utf8');
const menuPolish = readFileSync(new URL('../src/v126MenuPolish.ts', import.meta.url), 'utf8');

test('legacy v130 DOM patch is retired in favor of the React menu', () => {
  assert.doesNotMatch(main, /v130MenuControls/);
  assert.match(navbar, /navbar-menu-footer-actions/);
});

test('home shortcut displays 回首頁 and refreshes or navigates home', () => {
  assert.match(navbar, /handleMenuHomeRefresh/);
  assert.match(navbar, /aria-label="回首頁"/);
  assert.match(navbar, /<span>回首頁<\/span>/);
  assert.match(navbar, /window\.location\.reload\(\)/);
  assert.match(navbar, /window\.location\.assign\('\/'\)/);
});

test('hamburger menu stays independent from content font zoom and keeps controls left aligned', () => {
  assert.match(navbar, /style=\{\{ '--navbar-font-zoom': fontZoom, zoom: 1 \/ fontZoom \} as React\.CSSProperties\}/);
  assert.match(navbar, /navbar-menu-font-controls/);
  assert.match(navbarCss, /\.navbar-menu-font-controls \{[\s\S]*justify-content: flex-start/);
});

test('installed palette shortcut is named 好心情', () => {
  assert.match(menuPolish, /shortcut\.title = '好心情'/);
  assert.match(menuPolish, /text\.textContent = '好心情'/);
});

test('reset menu and logout remain separate controls on the same footer row', () => {
  assert.match(navbar, /className="navbar-menu-footer-actions"/);
  assert.match(navbar, /<span>登出<\/span>/);
  assert.match(navbar, /<span>重設選單<\/span>/);
  assert.match(navbar, /resetCurrentDeviceMenu/);
  assert.match(navbar, /\[deviceKind\]: \['font', 'theme'\]/);
  assert.match(navbarCss, /\.navbar-menu-footer-actions \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
});

test('hamburger dismissal does not unmount React actions in click capture phase', () => {
  assert.match(navbar, /document\.addEventListener\('click', dismiss\)/);
  assert.doesNotMatch(navbar, /document\.addEventListener\('click',\s*dismiss,\s*true\)/);
});

test('the last verified sticker balance is display-only and refreshes from backend', () => {
  assert.match(navbar, /readLastVerifiedBalance\(currentUser\?\.id\)/);
  assert.match(navbar, /balanceUpdating/);
  assert.match(navbar, /上次餘額，更新中/);
  assert.match(navbar, /server always verifies spending/);
});
