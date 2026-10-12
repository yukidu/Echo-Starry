import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../src/v195RankBadgeContourLights.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/v195RankBadgeContourLights.css', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/v197ReleaseNote.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v197 changelog records the top-cap false-positive and coordinate-mapping fix', () => {
  assert.match(release, /version: 'v197'/);
  assert.match(release, /上蓋/);
  assert.match(release, /painted content box/);
  assert.match(release, /object-fit: contain/);
});

test('v197 release note loads after v196', () => {
  const v196Index = index.indexOf('/src/v196ReleaseNote.ts');
  const v197Index = index.indexOf('/src/v197ReleaseNote.ts');
  assert.ok(v196Index >= 0);
  assert.ok(v197Index > v196Index);
});

test('v197 contour fix keeps the required visual and safety constraints', () => {
  assert.match(script, /data-echostars-v197-rank-badge-silhouette-fix/);
  assert.match(script, /adaptive-full-silhouette/);
  assert.match(css, /overflow:\s*visible/);
  assert.doesNotMatch(script, /data-v193-home-rank-badge|v193-home-rank-badge/);
  assert.doesNotMatch(script, /MutationObserver/);
  assert.doesNotMatch(script, /R2_BUCKET|\/api\/r2\/upload|method:\s*['"](?:PUT|POST|DELETE)['"]/);
});
