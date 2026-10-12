import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../src/v195RankBadgeContourLights.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/v195RankBadgeContourLights.css', import.meta.url), 'utf8');
const release195 = readFileSync(new URL('../src/v195ReleaseNote.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v197 compares multiple alpha thresholds instead of accepting the first high-alpha fragment', () => {
  assert.match(script, /ALPHA_THRESHOLDS = \[208, 176, 144, 112, 88\]/);
  assert.match(script, /chooseBestSilhouette/);
  assert.match(script, /candidate\.score > best\.score/);
  assert.match(script, /MIN_BADGE_HEIGHT_RATIO = 0\.40/);
  assert.match(script, /spanY < MIN_BADGE_HEIGHT_RATIO/);
  assert.doesNotMatch(script, /choosePrimaryComponent/);
  assert.doesNotMatch(script, /largestConnectedComponent/);
});

test('v197 samples in source aspect ratio and maps lights to the actual object-fit painted box', () => {
  assert.match(script, /createSampleCanvasSize/);
  assert.match(script, /context\.drawImage\(image, 0, 0, sampleSize\.width, sampleSize\.height\)/);
  assert.match(script, /getPaintedContentBox/);
  assert.match(script, /elementWidth \/ image\.naturalWidth/);
  assert.match(script, /elementHeight \/ image\.naturalHeight/);
  assert.match(script, /image\.offsetLeft \+ \(elementWidth - width\) \/ 2/);
  assert.match(script, /positionContourNode/);
  assert.match(css, /inset:\s*auto/);
});

test('v197 merges nearby badge pieces before tracing the outer silhouette', () => {
  assert.match(script, /collectComponents/);
  assert.match(script, /isLikelyBorderFringe/);
  assert.match(script, /boundsNear/);
  assert.match(script, /attachGap/);
  assert.match(script, /traceRadialContour/);
  assert.match(script, /resampleClosedContour/);
  assert.match(script, /CONTOUR_POINT_COUNT = 46/);
});

test('v197 preserves crown-ambassador independent pulse rhythm without star glyphs or circular frame', () => {
  assert.match(script, /CROWN_PULSES/);
  assert.match(script, /duration:\s*5\.7/);
  assert.match(script, /duration:\s*10\.4/);
  assert.match(css, /@keyframes v195RankContourPulse/);
  assert.match(css, /brightness\(1\.32\)/);
  assert.match(css, /border-radius:\s*999px/);
  assert.doesNotMatch(script, /✦|★|☆/);
  assert.doesNotMatch(css, /content:\s*['"]✦['"]/);
  assert.doesNotMatch(css, /border:\s*[^;]+solid/);
  assert.match(release195, /不增加圓形邊框/);
});

test('v197 keeps the cross-origin fallback aligned and remains MutationObserver free', () => {
  assert.match(script, /sampleAlphaContourViaBlob/);
  assert.match(script, /URL\.createObjectURL/);
  assert.match(script, /tableValues', '0 0 1 1'/);
  assert.match(script, /painted-box-svg-fallback/);
  assert.match(script, /window\.addEventListener\('resize', syncV195ContourLights\)/);
  assert.doesNotMatch(script, /MutationObserver/);
});

test('v195 visual module still loads after v194 cleanup', () => {
  const cleanupIndex = index.indexOf('/src/v194RankBadgeCleanup.ts');
  const contourIndex = index.indexOf('/src/v195RankBadgeContourLights.ts');
  assert.ok(cleanupIndex >= 0);
  assert.ok(contourIndex > cleanupIndex);
});
