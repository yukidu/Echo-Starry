import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/v178CrownDiagonalReflection.css', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/v178CrownDiagonalReflection.ts', import.meta.url), 'utf8');
const crownEntry = readFileSync(new URL('../src/v174CrownTruePage.ts', import.meta.url), 'utf8');

test('v178 keeps the palette gradient rotating slowly while reflection itself does not spin', () => {
  assert.match(css, /\.taiwan-crown-avatar-ring::before\s*\{[\s\S]*animation:\s*taiwanCrownRingRotate\s+14s\s+linear\s+infinite/);
  assert.match(css, /animation-play-state:\s*running\s*!important/);
  assert.doesNotMatch(css, /taiwanCrownRingShine/);
});

test('v178 keeps slow multi-point breathing reflections visibly moving on every motion setting', () => {
  assert.match(css, /radial-gradient\(circle at 14% 18%/);
  assert.match(css, /radial-gradient\(circle at 97% 53%/);
  assert.match(css, /radial-gradient\(circle at 12% 78%/);
  assert.match(css, /animation:\s*taiwanCrownMultiPointBreath\s+7\.2s\s+ease-in-out\s+infinite\s*!important/);
  assert.match(css, /@keyframes\s+taiwanCrownMultiPointBreath/);
  assert.match(css, /translate3d\(-2\.8%,\s*1\.4%,\s*0\)\s*rotate\(-8deg\)/);
  assert.match(css, /translate3d\(3\.2%,\s*1\.8%,\s*0\)\s*rotate\(11deg\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*taiwanCrownRingRotate\s+28s[\s\S]*taiwanCrownMultiPointBreath\s+12s/);
  assert.doesNotMatch(css, /animation:\s*none\s*!important/);
  assert.match(css, /animation-delay:\s*-1\.3s\s*!important/);
  assert.match(css, /animation-delay:\s*-3\.4s\s*!important/);
});

test('v178 enlarges crown card text and forces inspirational quotes to normal weight', () => {
  assert.match(css, /\.taiwan-crown-card-name\s*\{[\s\S]*font-size:\s*1\.56em/);
  assert.match(css, /\.taiwan-crown-card-quote\s*\{[\s\S]*font-size:\s*1\.22em[\s\S]*font-weight:\s*400\s*!important/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*font-size:\s*1\.44em[\s\S]*font-size:\s*1\.16em/);
});

test('v178 keeps only the audio-detail style external-link icon and normalizes own-card border', () => {
  assert.match(css, /\.taiwan-crown-card-arrow\s*\{[\s\S]*font-size:\s*0\s*!important[\s\S]*text-indent:\s*-9999px/);
  assert.match(css, /M15 3h6v6/);
  assert.match(css, /M10 14 21 3/);
  assert.match(css, /\.taiwan-crown-card-arrow::after\s*\{[\s\S]*content:\s*none\s*!important[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /\.taiwan-crown-member-card \.taiwan-crown-card-arrow::before\s*\{[\s\S]*content:\s*'✎'/);
  assert.match(css, /\.taiwan-crown-member-card\s*\{[\s\S]*border-width:\s*1px[\s\S]*border-color:\s*var\(--theme-border-subtle/);
});

test('v178 layer loads after v177 and changelog records the final reflection behavior', () => {
  assert.match(crownEntry, /import '\.\/v177CrownPaletteRing';[\s\S]*import '\.\/v178CrownDiagonalReflection';/);
  assert.match(release, /version:\s*'v178'/);
  assert.match(release, /緩慢漂移/);
  assert.match(release, /外部連結圖示/);
  assert.match(release, /多餘箭頭/);
  assert.match(release, /緩慢旋轉/);
});
