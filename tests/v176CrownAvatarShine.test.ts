import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/v176CrownAvatarShine.css', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/v176CrownAvatarShine.ts', import.meta.url), 'utf8');
const crownEntry = readFileSync(new URL('../src/v174CrownTruePage.ts', import.meta.url), 'utf8');

test('v176 crown avatar ring has stronger gradient contrast and animated shine', () => {
  assert.match(css, /\.taiwan-crown-avatar-ring::before/);
  assert.match(css, /conic-gradient/);
  assert.match(css, /#facc15/);
  assert.match(css, /#38bdf8/);
  assert.match(css, /#7c3aed/);
  assert.match(css, /taiwanCrownRingRotate/);
  assert.match(css, /taiwanCrownRingShine/);
  assert.match(css, /taiwanCrownRingGlow/);
});

test('v176 keeps avatar content above the animated ring and respects reduced motion', () => {
  assert.match(css, /\.taiwan-crown-avatar\s*\{[\s\S]*?z-index:\s*2/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none\s*!important/);
});

test('v176 crown visual layer is loaded through the existing stable crown page entry', () => {
  assert.match(crownEntry, /import '\.\/v176CrownAvatarShine'/);
});

test('v176 changelog records the crown avatar visual upgrade', () => {
  assert.match(release, /version:\s*'v176'/);
  assert.match(release, /流動反光/);
  assert.match(release, /色彩對比/);
});
