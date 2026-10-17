import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('v306 keeps Starry ID as the only authoritative profile source', () => {
  const sync = read('worker/starryIdSync.ts');
  assert.match(sync, /Starry ID central profiles are the ONLY authoritative personal-profile source/);
  assert.match(sync, /if \(!oldProfile\)/);
  assert.doesNotMatch(sync, /avatar=excluded\.avatar/);
  assert.doesNotMatch(sync, /rank=excluded\.rank/);
  assert.doesNotMatch(sync, /approvedRank=excluded\.approvedRank/);
  assert.match(sync, /INSERT OR IGNORE INTO member_relationships/);
});

test('v306 normalizes legacy birthday before a brand-new central seed', () => {
  const sync = read('worker/starryIdSync.ts');
  assert.match(sync, /function normalizeBirthday/);
  assert.match(sync, /function birthdayDerived/);
  assert.match(sync, /profileValues\.zodiac = derived\.zodiac/);
  assert.match(sync, /profileValues\.talentNumber = derived\.talentNumber/);
  assert.match(sync, /profileValues\.lifeNumber = derived\.lifeNumber/);
  assert.match(sync, /profileValues\.approvedRank = importedRank/);
});

test('v306 rank approval audits all workflow fields in the same D1 batch', () => {
  const router = read('worker/starryIdRankUpdateRouter.ts');
  assert.match(router, /RANK_AUDIT_FIELDS = \['rank','approvedRank','rankApproved','rankAuditStatus','rankAuditType','rankUpdatedAt'\]/);
  assert.match(router, /await db\.batch\(\[update, \.\.\.auditStatements\]\)/);
  assert.match(router, /rankAuditStatement/);
  assert.doesNotMatch(router, /\.run\(\)\.catch\(\(\) => undefined\)/);
});

test('v306 health audit covers structural semantic and legacy-overwrite integrity', () => {
  const verify = read('starry-id/verifyCentralHealth.mjs');
  for (const key of [
    'duplicateGoogleSubjects','identityOrphans','appMembershipOrphans','legacyLinkOrphans',
    'relationshipOrphans','relationshipSelfLinks','badSpouseSlots','invalidBirthdays',
    'approvedRankStateInvalid','pendingRankStateInvalid','activeLegacyBlankOverwrites',
    'relationshipAuditMismatches','duplicateAmwayGroupsNeedingReview'
  ]) assert.match(verify, new RegExp(key));
  assert.match(verify, /historicalLegacyBlankOverwrites/);
  assert.match(verify, /approvedRankValueMismatches/);
});

test('v306 database guards reject invalid approved rank birthday and self relationship writes', () => {
  const migration = read('starry-id/migrations/20261017_profile_semantic_guards.sql');
  assert.match(migration, /guard_profiles_rank_approved_insert/);
  assert.match(migration, /guard_profiles_rank_approved_update/);
  assert.match(migration, /approved rank requires approvedRank/);
  assert.match(migration, /guard_profiles_birthday_insert/);
  assert.match(migration, /guard_profiles_birthday_update/);
  assert.match(migration, /birthday must use YYYY-MM-DD/);
  assert.match(migration, /guard_member_relationship_self_insert/);
  assert.match(migration, /guard_member_relationship_self_update/);
});
