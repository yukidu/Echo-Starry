import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = readFileSync(new URL('../src/v198RankBadgeIndependentPulses.ts', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/v198ReleaseNote.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v198 keeps the contour light reduction architecture after later tuning', () => {
  const match = policy.match(/TARGET_CONTOUR_LIGHTS = (\d+)/);
  assert.ok(match);
  assert.ok(Number(match[1]) <= 23);
  assert.match(policy, /chooseEvenlySpacedIndices/);
  assert.match(policy, /light\.remove\(\)/);
  assert.match(policy, /v198ContourLightCount/);
});

test('v198 independent pulse variables remain available after later timing upgrades', () => {
  assert.match(policy, /--contour-duration/);
  assert.match(policy, /--contour-delay/);
  assert.match(policy, /--contour-min/);
  assert.match(policy, /--contour-max/);
  assert.match(policy, /--contour-scale/);
  assert.match(policy, /v198IndependentPulse/);
  assert.match(policy, /delay: pulse\.delay \* 1000/);
});

test('v198 keeps the patch lightweight and MutationObserver free', () => {
  assert.doesNotMatch(policy, /MutationObserver/);
  assert.doesNotMatch(policy, /R2_BUCKET|\/api\/r2\/upload|method:\s*['\"](?:PUT|POST|DELETE)['\"]/);
  assert.match(policy, /setInterval\(syncIndependentPulses, SYNC_INTERVAL_MS\)/);
});

test('v198 release note and pulse policy load in the expected order', () => {
  const v197ReleaseIndex = index.indexOf('/src/v197ReleaseNote.ts');
  const v198ReleaseIndex = index.indexOf('/src/v198ReleaseNote.ts');
  const contourIndex = index.indexOf('/src/v195RankBadgeContourLights.ts');
  const pulseIndex = index.indexOf('/src/v198RankBadgeIndependentPulses.ts');
  assert.ok(v197ReleaseIndex >= 0);
  assert.ok(v198ReleaseIndex > v197ReleaseIndex);
  assert.ok(contourIndex >= 0);
  assert.ok(pulseIndex > contourIndex);
  assert.match(release, /version: 'v198'/);
  assert.match(release, /23 顆/);
  assert.match(release, /不再整圈一起亮、一起暗/);
});
