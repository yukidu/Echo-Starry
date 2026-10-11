import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const theme = readFileSync(new URL('../src/utils/theme.ts', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/v178ReleaseNote.ts', import.meta.url), 'utf8');

test('v178 persists the light palette and uses a deterministic first palette', () => {
  assert.match(theme, /LIGHT_PALETTE_STORAGE_KEY\s*=\s*'sq_light_palette_id_v1'/);
  assert.match(theme, /readStoredLightPalette\(\)/);
  assert.match(theme, /const initial = LIGHT_PALETTES\[0\]/);
  assert.match(theme, /storeLightPalette\(initial\)/);
  assert.match(theme, /storeLightPalette\(next\)/);
});

test('v178 service worker update bypasses stale HTTP cache and refreshes old shells', () => {
  assert.match(main, /register\('\/sw\.js', \{ updateViaCache: 'none' \}\)/);
  assert.match(main, /registration\.update\(\)/);
  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v\d+'/);
  assert.match(sw, /FORCE_STALE_CLIENT_REFRESH\s*=\s*true/);
});

test('v178 release note is loaded and explains the palette and PWA update fix', () => {
  assert.match(index, /v178ReleaseNote\.ts/);
  assert.match(release, /version:\s*'v178'/);
  assert.match(release, /固定保存淺色調色盤主色/);
  assert.match(release, /Service Worker/);
});
