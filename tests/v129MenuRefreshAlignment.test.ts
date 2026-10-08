import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const menuPolicy = readFileSync(new URL('../src/v127MenuIdentityPalette.ts', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../src/utils/theme.ts', import.meta.url), 'utf8');

test('v129 replaces previous-palette undo with page refresh controls', () => {
  assert.match(menuPolicy, /重新整理頁面/);
  assert.match(menuPolicy, /window\.location\.reload\(\)/);
  assert.doesNotMatch(menuPolicy, /上一色|canRestorePreviousLightPalette|restorePreviousLightPalette|v128-palette-back/);
});

test('v129 aligns the pinned toolbar after the actual brand title and before hamburger', () => {
  assert.match(menuPolicy, /\.brand-logo-glow \.echo-wave-text/);
  assert.match(menuPolicy, /button\[data-main-menu="hamburger"\]/);
  assert.match(menuPolicy, /toolbar\.style\.left/);
  assert.match(menuPolicy, /toolbar\.style\.right/);
  assert.match(menuPolicy, /addEventListener\('resize', scheduleMenuSync\)/);
});

test('theme no longer keeps previous-palette history state', () => {
  assert.doesNotMatch(theme, /previousDisplayedLightPalette|restorePreviousLightPalette|overrideRequestedPaletteId|canRestorePreviousLightPalette/);
  assert.match(theme, /export function getRandomLightPalette\(excludeId\?: string\)/);
  assert.match(theme, /export function applyThemeToDom\(palette: ThemePalette, isDark: boolean\)/);
});
