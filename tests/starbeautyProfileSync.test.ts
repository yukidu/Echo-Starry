import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const router = readFileSync(new URL('../worker/starbeautySsoRouter.ts', import.meta.url), 'utf8');
const adapter = readFileSync(new URL('../worker/externalMemberSnapshot.ts', import.meta.url), 'utf8');
const repository = readFileSync(new URL('../worker/memberRepository.ts', import.meta.url), 'utf8');

test('StarBeauty exports the complete basic-profile contract through a dedicated adapter', () => {
  for (const field of [
    'amwayId','phone','residence','center','rank','approvedRank','rankApproved','rankAuditStatus',
    'joinReason','stayReason','sponsor','platinumUpline','diamondUpline','birthday','zodiac',
    'talentNumber','lifeNumber','avatar','email','name','isBlocked','registerDate','lastActive'
  ]) {
    assert.ok(adapter.includes(field), `missing StarBeauty profile field: ${field}`);
  }
  assert.match(adapter, /echostars-member-profile-v2/);
  assert.match(adapter, /sourceMemberSchemaVersion/);
});

test('external SSO no longer reads the users table layout directly', () => {
  assert.match(router, /readStarBeautyMemberSnapshot/);
  assert.doesNotMatch(router, /SELECT \* FROM users/i);
  assert.match(repository, /getMemberById/);
});

test('organization and upline data prefer canonical normalized tables', () => {
  assert.match(adapter, /organizationForUser/);
  assert.match(adapter, /upline_bindings/);
  assert.match(adapter, /organizationSummary/);
  assert.match(adapter, /uplines/);
});

test('high-frequency activity fields do not force StarBeauty profile rewrites', () => {
  assert.match(adapter, /lastActive: _lastActive/);
  assert.match(adapter, /playCount: _playCount/);
  assert.match(router, /stableStarBeautyProfile/);
  assert.match(router, /JSON\.stringify\(stableStarBeautyProfile\(snapshot\.profile\)\)/);
});

test('one-time external auth codes are isolated from member schema refactors', () => {
  assert.match(router, /external_app_auth_codes/);
  assert.match(router, /app = 'starbeauty'/);
  assert.match(router, /starbeauty-health/);
});
