import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../src/v195RankBadgeContourLights.ts', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/v196ReleaseNote.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v196 changelog describes the rectangular-border contour fix', () => {
  assert.match(release, /version: 'v196'/);
  assert.match(release, /矩形邊界/);
  assert.match(release, /外圍.*光暈/);
  assert.match(release, /LED 燈帶/);
});

test('v196 release note loads after v195', () => {
  const v195Index = index.indexOf('/src/v195ReleaseNote.ts');
  const v196Index = index.indexOf('/src/v196ReleaseNote.ts');
  assert.ok(v195Index >= 0);
  assert.ok(v196Index > v195Index);
});

test('v196 contour fix keeps the required safety constraints', () => {
  assert.match(script, /data-echostars-v196-rank-badge-contour-fix/);
  assert.doesNotMatch(script, /MutationObserver/);
  assert.doesNotMatch(script, /R2_BUCKET|\/api\/r2\/upload|PUT|POST|DELETE/);
});
