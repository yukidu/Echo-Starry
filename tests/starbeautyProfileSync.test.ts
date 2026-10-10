import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../worker/starbeautySsoRouter.ts', import.meta.url), 'utf8');

test('StarBeauty exports all required EchoStars basic-profile fields', () => {
  for (const field of [
    'amwayId','phone','residence','center','rank','approvedRank','rankApproved','rankAuditStatus',
    'joinReason','stayReason','sponsor','platinumUpline','diamondUpline','birthday','zodiac',
    'talentNumber','lifeNumber','avatar','email','name','isBlocked','registerDate','lastActive'
  ]) {
    assert.ok(source.includes(field), `missing StarBeauty profile field: ${field}`);
  }
});

test('StarBeauty returns a stable profile hash for change detection', () => {
  assert.ok(source.includes('profileHash'));
  assert.ok(source.includes('JSON.stringify(profile)'));
});
