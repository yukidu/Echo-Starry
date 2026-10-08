import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const navbarCss = readFileSync(new URL('../src/components/Navbar.css', import.meta.url), 'utf8');
const homeDensity = readFileSync(new URL('../src/homeDensityPolicy.ts', import.meta.url), 'utf8');
const adminRouter = readFileSync(new URL('../worker/adminUserDeleteRouter.ts', import.meta.url), 'utf8');

test('hamburger drawer remains the React menu controlled by the navbar on every viewport size', () => {
  assert.match(navbar, /isMobileMenuOpen &&/);
  assert.match(navbar, /<div className="mobile-menu-shell">/);
  assert.doesNotMatch(navbar, /mobile-menu-shell md:hidden/);
  assert.match(navbar, /mobile-menu-panel animate-in slide-in-from-top-2/);
});

test('hamburger drawer hugs the longest label and stays on the right', () => {
  assert.match(navbarCss, /\.mobile-menu-shell\s*\{[\s\S]*justify-content:\s*flex-end;/);
  assert.match(navbarCss, /\.mobile-menu-panel\s*\{[\s\S]*width:\s*max-content;/);
  assert.match(navbarCss, /max-width:\s*min\(22\.5rem, calc\(\(100vw - 24px\) \* var\(--navbar-font-zoom, 1\)\)\);/);
});

test('v119 defaults tablet landscape and desktop home playlists to three columns', () => {
  assert.match(homeDensity, /tablet:\s*\{\s*portraitColumns:\s*1,\s*landscapeColumns:\s*3/);
  assert.match(homeDensity, /desktop:\s*\{\s*columns:\s*3/);
  assert.match(homeDensity, /grid-template-columns:\s*repeat\(var\(--echostars-home-columns/);
});

test('v119 hamburger menu adds local font zoom without cloud writes', () => {
  assert.match(homeDensity, /echostars_user_font_zoom_v1/);
  assert.match(homeDensity, /data-echostars-font-control/);
  assert.match(homeDensity, /A−/);
  assert.match(homeDensity, /A＋/);
  assert.match(homeDensity, /localStorage\.setItem\(USER_FONT_ZOOM_KEY/);
});

test('v119 super admin display page visualizes three device classes and persists global settings', () => {
  assert.match(homeDensity, /data-echostars-display-tab/);
  assert.match(homeDensity, /手機／平板／桌機視覺化配置/);
  assert.match(homeDensity, /tablet-landscape-columns/);
  assert.match(homeDensity, /fetch\('\/api\/display-settings'/);
  assert.match(adminRouter, /url\.pathname === '\/api\/display-settings'/);
  assert.match(adminRouter, /site_display_settings/);
  assert.match(adminRouter, /只有超級管理員可修改全站顯示設定/);
});
