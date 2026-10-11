import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/v178CrownDiagonalReflection.css', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/v178CrownDiagonalReflection.ts', import.meta.url), 'utf8');
const crownEntry = readFileSync(new URL('../src/v174CrownTruePage.ts', import.meta.url), 'utf8');

test('v178 keeps the palette gradient rotating slowly while reflection itself does not spin', () => {
  assert.match(css, /\.taiwan-crown-avatar-ring::before\s*\{[\s\S]*animation:\s*taiwanCrownRingRotate\s+14s\s+linear\s+infinite/);
  assert.doesNotMatch(css, /taiwanCrownRingShine/);
});

test('v178 uses multiple obvious diagonal reflections around 45 degrees', () => {
  assert.match(css, /linear-gradient\(45deg/);
  assert.match(css, /rgb\(255 255 255 \/ 0\.95\)/);
  assert.match(css, /rgb\(255 255 255 \/ 0\.88\)/);
  assert.match(css, /rgb\(255 255 255 \/ 0\.78\)/);
  assert.match(css, /taiwanCrownDiagonalShimmer/);
});

test('v178 enlarges crown card name and quote text including mobile', () => {
  assert.match(css, /\.taiwan-crown-card-name\s*\{[\s\S]*font-size:\s*1\.18em/);
  assert.match(css, /\.taiwan-crown-card-quote\s*\{[\s\S]*font-size:\s*0\.9em/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*font-size:\s*1\.08em[\s\S]*font-size:\s*0\.84em/);
});

test('v178 layer loads after v177 and changelog records both effects', () => {
  assert.match(crownEntry, /import '\.\/v177CrownPaletteRing';[\s\S]*import '\.\/v178CrownDiagonalReflection';/);
  assert.match(release, /version:\s*'v178'/);
  assert.match(release, /45 度/);
  assert.match(release, /緩慢旋轉/);
});
