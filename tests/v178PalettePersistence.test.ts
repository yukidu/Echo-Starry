import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const themeSource = fs.readFileSync('src/utils/theme.ts', 'utf8');
const swSource = fs.readFileSync('public/sw.js', 'utf8');

test('v178 remembers the selected light palette across reloads', () => {
  assert.match(themeSource, /sq_light_palette_v1/);
  assert.match(themeSource, /localStorage\.getItem\(LIGHT_PALETTE_STORAGE_KEY\)/);
  assert.match(themeSource, /localStorage\.setItem\(LIGHT_PALETTE_STORAGE_KEY, palette\.id\)/);
  assert.match(themeSource, /if \(!excludeId\)[\s\S]*readStoredLightPalette\(\)/);
});

test('v178 keeps explicit palette cycling while persisting the new choice', () => {
  assert.match(themeSource, /LIGHT_PALETTES\.filter\(p => p\.id !== excludeId\)/);
  assert.match(themeSource, /storeLightPalette\(selected\)/);
});

test('v178 service worker invalidates the old app shell and refreshes existing tabs once', () => {
  assert.match(swSource, /echostars-shell-v178/);
  assert.match(swSource, /oldShellKeys/);
  assert.match(swSource, /client\.navigate\(client\.url\)/);
});
