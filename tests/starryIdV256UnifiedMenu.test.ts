import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const menu = readFileSync('worker/starryIdV256UnifiedMenu.ts','utf8');
const navigation = readFileSync('worker/starryIdV253NavigationEnhancer.ts','utf8');

test('v256 restores a Go-Starry-style hamburger menu shell with profile, dividers and footer', () => {
  assert.match(menu, /v256-menu-overlay/);
  assert.match(menu, /v256-menu-shell/);
  assert.match(menu, /v256-menu-panel/);
  assert.match(menu, /min-width:250px/);
  assert.match(menu, /border-radius:16px/);
  assert.match(menu, /v256-menu-profile/);
  assert.match(menu, /v256-menu-divider/);
  assert.match(menu, /v256-menu-footer/);
  assert.match(menu, /menu\.id='v216Menu'/);
  assert.match(menu, /aria-label','開啟主選單'/);
});

test('v256 top shortcut is My Card while member management remains available to super admins inside the hamburger', () => {
  assert.match(menu, /#adminBtn\{display:none!important\}/);
  assert.match(menu, /card\.id='v256MyCardBtn'/);
  assert.match(menu, /card\.textContent='我的名片'/);
  assert.match(menu, /session\?\.isSuperAdmin/);
  assert.match(menu, /會員管理/);
  assert.match(menu, /q\('#adminBtn'\)\?\.click\(\)/);
});

test('v256 My Card shortcut opens the signed-in member public card instead of reviving the retired management page', () => {
  assert.match(menu, /api\('\/api\/card-settings'\)/);
  assert.match(menu, /String\(data\?\.url\|\|''\)\.trim\(\)/);
  assert.match(menu, /window\.open\(cardUrl,'_blank','noopener'\)/);
  assert.match(menu, /tab\.location\.replace\(url\)/);
  assert.doesNotMatch(menu, /renderMyCard/);
  assert.doesNotMatch(menu, /location\.href='\/my-card'/);
  assert.match(navigation, /history\.replaceState\(null,'','\/'\)/);
});

test('v256 ecosystem menu keeps the shared Starry app destinations in one consistent list', () => {
  for (const expected of [
    'https://starry.phd/',
    'https://id.starry.phd/',
    'https://echo.starry.phd/',
    'https://download.starry.phd/',
    'https://go.starry.phd/',
    'https://quotes.starry.phd/',
    'https://box.starry.phd/'
  ]) assert.ok(menu.includes(expected), `missing ${expected}`);
  assert.match(menu, /繁星宇宙/);
  assert.match(menu, /Starry ID/);
  assert.match(menu, /繁星回聲/);
  assert.match(menu, /繁星下載/);
  assert.match(menu, /繁星任意門/);
  assert.doesNotMatch(menu, /美力之星|starbeauty\.yukidu\.workers\.dev/);
});
