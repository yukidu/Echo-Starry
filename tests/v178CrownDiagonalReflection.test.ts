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

test('v178 uses slow multi-point breathing reflections instead of a sweeping shine', () => {
  assert.match(css, /radial-gradient\(circle at 17% 14%/);
  assert.match(css, /radial-gradient\(circle at 95% 48%/);
  assert.match(css, /radial-gradient\(circle at 12% 74%/);
  assert.match(css, /animation:\s*taiwanCrownMultiPointBreath\s+7\.8s\s+ease-in-out\s+infinite/);
  assert.match(css, /@keyframes\s+taiwanCrownMultiPointBreath/);
  assert.doesNotMatch(css, /background-position:\s*-160%\s+50%/);
  assert.doesNotMatch(css, /linear-gradient\(45deg/);
});

test('v178 enlarges crown card text and forces inspirational quotes to normal weight', () => {
  assert.match(css, /\.taiwan-crown-card-name\s*\{[\s\S]*font-size:\s*1\.3em/);
  assert.match(css, /\.taiwan-crown-card-quote\s*\{[\s\S]*font-size:\s*1\.02em[\s\S]*font-weight:\s*400\s*!important/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*font-size:\s*1\.18em[\s\S]*font-size:\s*0\.96em/);
});

test('v178 makes the link affordance more prominent and normalizes own-card border', () => {
  assert.match(css, /\.taiwan-crown-card-arrow::before\s*\{[\s\S]*content:\s*'→'/);
  assert.match(css, /\.taiwan-crown-member-card\s*\{[\s\S]*border-width:\s*1px[\s\S]*border-color:\s*var\(--theme-border-subtle/);
});

test('v178 layer loads after v177 and changelog records the final reflection behavior', () => {
  assert.match(crownEntry, /import '\.\/v177CrownPaletteRing';[\s\S]*import '\.\/v178CrownDiagonalReflection';/);
  assert.match(release, /version:\s*'v178'/);
  assert.match(release, /呼吸燈/);
  assert.match(release, /多點反光/);
  assert.match(release, /緩慢旋轉/);
});
