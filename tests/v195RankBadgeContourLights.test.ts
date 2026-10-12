import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../src/v195RankBadgeContourLights.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/v195RankBadgeContourLights.css', import.meta.url), 'utf8');
const release195 = readFileSync(new URL('../src/v195ReleaseNote.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v196 filters rectangular alpha fringe and follows the strong primary badge silhouette', () => {
  assert.match(script, /ALPHA_THRESHOLDS = \[220, 180, 140\]/);
  assert.match(script, /CONTOUR_POINT_COUNT = 52/);
  assert.match(script, /largestConnectedComponent/);
  assert.match(script, /edgeRatio/);
  assert.match(script, /choosePrimaryComponent/);
  assert.match(script, /resampleClosedContour/);
  assert.match(script, /getImageData\(0, 0, SAMPLE_SIZE, SAMPLE_SIZE\)/);
  assert.match(script, /context\.drawImage\(image, offsetX, offsetY, drawWidth, drawHeight\)/);
  assert.match(script, /CONTOUR_OUTSET_PX/);
  assert.match(script, /v195-rank-badge-contour-light/);
  assert.match(css, /border-radius:\s*999px/);
});

test('v196 reuses the crown-ambassador independent pulse rhythm without recreating an LED strip', () => {
  assert.match(script, /CROWN_PULSES/);
  assert.match(script, /duration:\s*5\.7/);
  assert.match(script, /duration:\s*10\.4/);
  assert.match(css, /@keyframes v195RankContourPulse/);
  assert.match(css, /brightness\(1\.32\)/);
  assert.doesNotMatch(script, /✦|★|☆/);
  assert.doesNotMatch(css, /content:\s*['"]✦['"]/);
});

test('v196 retries tainted Canvas through Blob and hardens the SVG alpha fallback', () => {
  assert.match(script, /sampleAlphaContourViaBlob/);
  assert.match(script, /URL\.createObjectURL/);
  assert.match(script, /feComponentTransfer/);
  assert.match(script, /operator', 'erode'/);
  assert.match(script, /operator', 'dilate'/);
  assert.match(script, /operator', 'out'/);
  assert.doesNotMatch(script, /MutationObserver/);
});

test('v196 does not restore the homepage cover badge, star glyphs, or a circular frame', () => {
  assert.doesNotMatch(script, /data-v193-home-rank-badge|v193-home-rank-badge/);
  assert.doesNotMatch(css, /border:\s*[^;]+solid/);
  assert.match(release195, /不增加圓形邊框/);
});

test('v195 visual module still loads after v194 cleanup', () => {
  const cleanupIndex = index.indexOf('/src/v194RankBadgeCleanup.ts');
  const contourIndex = index.indexOf('/src/v195RankBadgeContourLights.ts');
  assert.ok(cleanupIndex >= 0);
  assert.ok(contourIndex > cleanupIndex);
});
