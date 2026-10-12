import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = readFileSync(new URL('../src/v198RankBadgeIndependentPulses.ts', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/v199ReleaseNote.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v199 keeps every badge light on its own Web Animations timeline', () => {
  assert.match(policy, /light\.getAnimations\(\)\.forEach\(animation => animation\.cancel\(\)\)/);
  assert.match(policy, /light\.style\.animation = 'none'/);
  assert.match(policy, /light\.animate\(\[/);
  assert.match(policy, /data-echostars-v199-rank-badge-true-independent-pulses/);
});

test('v199 still varies dark, rise, bright-hold and fade timing per dot', () => {
  assert.match(policy, /darkHoldEnd/);
  assert.match(policy, /peakStart/);
  assert.match(policy, /brightHoldEnd/);
  assert.match(policy, /fadeEnd/);
  assert.match(policy, /offset: pulse\.darkHoldEnd/);
  assert.match(policy, /offset: pulse\.peakStart/);
  assert.match(policy, /offset: pulse\.brightHoldEnd/);
  assert.match(policy, /offset: pulse\.fadeEnd/);
  assert.match(policy, /delay: pulse\.delay \* 1000/);
});

test('v199 keeps a sparse light set and does not alter the v197 contour geometry', () => {
  const match = policy.match(/TARGET_CONTOUR_LIGHTS = (\d+)/);
  assert.ok(match);
  assert.ok(Number(match[1]) <= 23);
  assert.match(policy, /chooseEvenlySpacedIndices/);
  assert.doesNotMatch(policy, /ALPHA_THRESHOLDS|traceRadialContour|painted content box/);
  assert.doesNotMatch(policy, /MutationObserver/);
});

test('v199 release note loads after v198 and documents true independent timing', () => {
  const v198Index = index.indexOf('/src/v198ReleaseNote.ts');
  const v199Index = index.indexOf('/src/v199ReleaseNote.ts');
  assert.ok(v198Index >= 0);
  assert.ok(v199Index > v198Index);
  assert.match(release, /version: 'v199'/);
  assert.match(release, /獨立的動畫時間軸/);
  assert.match(release, /暗多久、變亮多久、亮多久與變暗多久/);
});
