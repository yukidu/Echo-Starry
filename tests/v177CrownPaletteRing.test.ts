import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/v177CrownPaletteRing.css', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/v177CrownPaletteRing.ts', import.meta.url), 'utf8');
const crownEntry = readFileSync(new URL('../src/v174CrownTruePage.ts', import.meta.url), 'utf8');

test('v177 crown ring follows the active primary palette with same-family shades', () => {
  assert.match(css, /var\(--color-primary, #c06c84\)/);
  assert.match(css, /color-mix\(in srgb, var\(--color-primary/);
  assert.doesNotMatch(css, /#7c3aed|#facc15|#38bdf8|#ff3d81|#5eead4|#fff7d6/i);
});

test('v177 keeps shine animation while making the glow primary-color based', () => {
  assert.match(css, /@keyframes\s+taiwanCrownRingGlow/);
  assert.match(css, /transparent/);
  assert.doesNotMatch(css, /rgb\(56 189 248|rgb\(250 204 21/i);
});

test('v177 palette layer loads after the v176 shine layer', () => {
  assert.match(crownEntry, /import '\.\/v176CrownAvatarShine';[\s\S]*import '\.\/v177CrownPaletteRing';/);
});

test('v177 changelog records removal of rainbow fixed colors', () => {
  assert.match(release, /version:\s*'v177'/);
  assert.match(release, /同色系/);
  assert.match(release, /移除七彩外圈/);
});
