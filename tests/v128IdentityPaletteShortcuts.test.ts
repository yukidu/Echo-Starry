import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const menuPolicy = readFileSync(new URL('../src/v127MenuIdentityPalette.ts', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../src/utils/theme.ts', import.meta.url), 'utf8');

test('v128 identity header opens login for visitors and personal center for members', () => {
  assert.match(menuPolicy, /info\.dataset\.v128IdentityAction = isVisitor \? 'login' : 'profile'/);
  assert.match(menuPolicy, /aria-label', isVisitor \? '登入繁星回聲' : '開啟個人中心'/);
  assert.match(menuPolicy, /panel\.querySelector<HTMLButtonElement>\('\.navbar-menu-login-shortcut'\)\?\.click\(\)/);
  assert.match(menuPolicy, /includes\('個人中心'\)/);
  assert.match(menuPolicy, /event\.key !== 'Enter' && event\.key !== ' '/);
});

test('v128 provides a one-tap previous palette action in both menu layouts', () => {
  assert.match(menuPolicy, /canRestorePreviousLightPalette/);
  assert.match(menuPolicy, /restorePreviousLightPalette\(isDark\)/);
  assert.match(menuPolicy, /v128-palette-back-control/);
  assert.match(menuPolicy, /v128-palette-back-shortcut/);
  assert.match(menuPolicy, /上一色/);
});

test('previous palette is local-only and survives a light dark toggle without cloud state', () => {
  assert.match(theme, /let displayedLightPalette: ThemePalette \| null = null/);
  assert.match(theme, /let previousDisplayedLightPalette: ThemePalette \| null = null/);
  assert.match(theme, /overrideRequestedPaletteId/);
  assert.match(theme, /export function restorePreviousLightPalette\(isDark: boolean\)/);
  assert.match(theme, /palette\.id === overrideRequestedPaletteId/);
  assert.doesNotMatch(theme, /fetch\(|apiJson|localStorage|sessionStorage/);
});

test('random palette excludes the currently displayed palette after stepping back', () => {
  assert.match(theme, /if \(displayedLightPalette\?\.id\) excludedIds\.add\(displayedLightPalette\.id\)/);
  assert.match(theme, /const pool = filtered\.length > 0 \? filtered : LIGHT_PALETTES/);
});
