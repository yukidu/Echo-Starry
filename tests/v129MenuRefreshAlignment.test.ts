import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const identityPolicy = readFileSync(new URL('../src/v127MenuIdentityPalette.ts', import.meta.url), 'utf8');
const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../src/utils/theme.ts', import.meta.url), 'utf8');

test('page refresh is integrated into 回首頁 instead of a separate menu shortcut', () => {
  assert.doesNotMatch(identityPolicy, /v129-refresh|重新整理頁面/);
  assert.match(navbar, /handleMenuHomeRefresh/);
  assert.match(navbar, /window\.location\.reload\(\)/);
  assert.match(navbar, /window\.location\.assign\('\/'\)/);
  assert.match(navbar, /<span>回首頁<\/span>/);
});

test('pinned toolbar still aligns after the actual brand title and before hamburger', () => {
  assert.match(identityPolicy, /\.brand-logo-glow \.echo-wave-text/);
  assert.match(identityPolicy, /button\[data-main-menu="hamburger"\]/);
  assert.match(identityPolicy, /toolbar\.style\.left/);
  assert.match(identityPolicy, /toolbar\.style\.right/);
  assert.match(identityPolicy, /addEventListener\('resize', scheduleMenuSync\)/);
});

test('theme no longer keeps previous-palette history state', () => {
  assert.doesNotMatch(theme, /previousDisplayedLightPalette|restorePreviousLightPalette|overrideRequestedPaletteId|canRestorePreviousLightPalette/);
  assert.match(theme, /export function getRandomLightPalette\(excludeId\?: string\)/);
  assert.match(theme, /export function applyThemeToDom\(palette: ThemePalette, isDark: boolean\)/);
});