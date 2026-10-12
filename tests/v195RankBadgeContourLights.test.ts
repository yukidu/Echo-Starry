import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../src/v195RankBadgeContourLights.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/v195RankBadgeContourLights.css', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/v195ReleaseNote.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v195 samples the transparent PNG alpha and places dense round lights on its outer contour', () => {
  assert.match(script, /CONTOUR_POINT_COUNT = 84/);
  assert.match(script, /getImageData\(0, 0, SAMPLE_SIZE, SAMPLE_SIZE\)/);
  assert.match(script, /pixels\[\(y \* SAMPLE_SIZE \+ x\) \* 4 \+ 3\]/);
  assert.match(script, /lastOpaque/);
  assert.match(script, /CONTOUR_OUTSET_PX/);
  assert.match(script, /v195-rank-badge-contour-light/);
  assert.match(css, /border-radius:\s*999px/);
});

test('v195 reuses the crown-ambassador independent pulse rhythm rather than star glyphs', () => {
  assert.match(script, /CROWN_PULSES/);
  assert.match(script, /duration:\s*5\.7/);
  assert.match(script, /duration:\s*10\.4/);
  assert.match(css, /@keyframes v195RankContourPulse/);
  assert.match(css, /brightness\(1\.32\)/);
  assert.doesNotMatch(script, /✦|★|☆/);
  assert.doesNotMatch(css, /content:\s*['"]✦['"]/);
});

test('v195 does not restore the homepage cover badge or create a circular frame', () => {
  assert.doesNotMatch(script, /data-v193-home-rank-badge|v193-home-rank-badge/);
  assert.doesNotMatch(css, /border:\s*[^;]+solid/);
  assert.match(release, /不增加圓形邊框/);
});

test('v195 has an alpha-outline SVG fallback and remains MutationObserver free', () => {
  assert.match(script, /feMorphology/);
  assert.match(script, /operator', 'dilate'/);
  assert.match(script, /feComposite/);
  assert.match(script, /operator', 'out'/);
  assert.doesNotMatch(script, /MutationObserver/);
});

test('v195 loads after v194 cleanup and records the changelog entry', () => {
  const cleanupIndex = index.indexOf('/src/v194RankBadgeCleanup.ts');
  const contourIndex = index.indexOf('/src/v195RankBadgeContourLights.ts');
  assert.ok(cleanupIndex >= 0);
  assert.ok(contourIndex > cleanupIndex);
  assert.match(index, /v195ReleaseNote\.ts/);
  assert.match(release, /沿透明獎章本身的外輪廓/);
});
