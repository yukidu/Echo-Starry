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

test('tablet landscape and desktop home playlists keep three columns without the retired display settings API', () => {
  assert.match(homeDensity, /@media \(min-width:\s*640px\) and \(orientation:\s*landscape\)[\s\S]*--echostars-home-columns:\s*3/);
  assert.match(homeDensity, /@media \(min-width:\s*1024px\)[\s\S]*--echostars-home-columns:\s*3/);
  assert.match(homeDensity, /grid-template-columns:\s*repeat\(var\(--echostars-home-columns/);
  assert.doesNotMatch(homeDensity, /\/api\/display-settings|site_display_settings/);
});

test('hamburger menu keeps local font zoom after the display settings feature is retired', () => {
  assert.match(navbar, /echostars_user_font_zoom_v1/);
  assert.match(navbar, /A−/);
  assert.match(navbar, /A＋/);
  assert.match(navbar, /localStorage\.setItem\(USER_FONT_ZOOM_KEY/);
  assert.match(homeDensity, /echostars_user_font_zoom_v1/);
  assert.match(homeDensity, /document\.documentElement\.style\.fontSize/);
});

test('retired super-admin display settings UI and backend route stay removed', () => {
  assert.doesNotMatch(homeDensity, /data-echostars-display-tab/);
  assert.doesNotMatch(homeDensity, /手機／平板／桌機視覺化配置/);
  assert.doesNotMatch(homeDensity, /tablet-landscape-columns/);
  assert.doesNotMatch(homeDensity, /fetch\('\/api\/display-settings'/);
  assert.doesNotMatch(adminRouter, /url\.pathname === '\/api\/display-settings'/);
  assert.doesNotMatch(adminRouter, /site_display_settings/);
  assert.doesNotMatch(adminRouter, /只有超級管理員可修改全站顯示設定/);
});
