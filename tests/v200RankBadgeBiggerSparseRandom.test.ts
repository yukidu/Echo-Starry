import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = readFileSync(new URL('../src/v198RankBadgeIndependentPulses.ts', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/v200ReleaseNote.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v200 keeps about half of v199 lights and enlarges dots by 50 percent', () => {
  assert.match(policy, /TARGET_CONTOUR_LIGHTS = 12/);
  assert.match(policy, /DOT_SIZE_MULTIPLIER = 1\.5/);
  assert.match(policy, /randomBetween\(1\.9, 3\.15\) \* DOT_SIZE_MULTIPLIER/);
  assert.match(policy, /chooseEvenlySpacedIndices/);
});

test('v200 uses stronger runtime randomness and guarantees distinct durations', () => {
  assert.match(policy, /crypto\?\.getRandomValues/);
  assert.match(policy, /Math\.random\(\)/);
  assert.match(policy, /createUniqueDuration/);
  assert.match(policy, /Math\.abs\(existing - candidate\) < 0\.18/);
  assert.match(policy, /randomBetween\(3\.8, 12\.8\)/);
  assert.match(policy, /randomBetween\(0\.04, 0\.27\)/);
  assert.match(policy, /randomBetween\(0\.08, 0\.24\)/);
  assert.match(policy, /randomBetween\(0\.04, 0\.20\)/);
  assert.match(policy, /randomBetween\(0\.10, 0\.30\)/);
  assert.match(policy, /v200StrongRandomPulse/);
  assert.match(policy, /crypto-random-per-dot-waapi/);
});

test('v200 keeps the patch safe and mutation observer free', () => {
  assert.doesNotMatch(policy, /MutationObserver/);
  assert.doesNotMatch(policy, /R2_BUCKET|\/api\/r2\/upload|method:\s*['\"](?:PUT|POST|DELETE)['\"]/);
  assert.match(policy, /light\.animate\(\[/);
  assert.match(policy, /TARGET_CONTOUR_LIGHTS = 12/);
});

test('v200 release note is loaded after v199', () => {
  const v199Index = index.indexOf('/src/v199ReleaseNote.ts');
  const v200Index = index.indexOf('/src/v200ReleaseNote.ts');
  assert.ok(v199Index >= 0);
  assert.ok(v200Index > v199Index);
  assert.match(release, /version: 'v200'/);
  assert.match(release, /放大 50%/);
  assert.match(release, /12 顆/);
  assert.match(release, /加密亂數/);
});
