import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = readFileSync(new URL('../src/v198RankBadgeIndependentPulses.ts', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/v199ReleaseNote.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v199 gives every badge light its own Web Animations timeline', () => {
  assert.match(policy, /applyTrueIndependentPulse/);
  assert.match(policy, /light\.getAnimations\(\)\.forEach\(animation => animation\.cancel\(\)\)/);
  assert.match(policy, /light\.style\.animation = 'none'/);
  assert.match(policy, /light\.animate\(\[/);
  assert.match(policy, /data-echostars-v199-rank-badge-true-independent-pulses/);
});

test('v199 varies dark, rise, bright-hold and fade durations per dot', () => {
  assert.match(policy, /darkHoldEnd = 0\.08 \+ deterministicUnit\(index, 7\) \* 0\.18/);
  assert.match(policy, /peakStart = Math\.min\(0\.50/);
  assert.match(policy, /brightHoldEnd = Math\.min\(0\.78/);
  assert.match(policy, /fadeEnd = Math\.min\(0\.96/);
  assert.match(policy, /offset: pulse\.darkHoldEnd/);
  assert.match(policy, /offset: pulse\.peakStart/);
  assert.match(policy, /offset: pulse\.brightHoldEnd/);
  assert.match(policy, /offset: pulse\.fadeEnd/);
  assert.match(policy, /delay: pulse\.delay \* 1000/);
});

test('v199 keeps 23 lights and does not alter the v197 contour geometry', () => {
  assert.match(policy, /TARGET_CONTOUR_LIGHTS = 23/);
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
