import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sync = fs.readFileSync('worker/starryIdSync.ts', 'utf8');
const privacy = fs.readFileSync('worker/privacyCrawlerRouter.ts', 'utf8');

test('v305 treats Starry ID central profile as the sole authority after provisioning', () => {
  assert.match(sync, /Starry ID central profiles are the ONLY authoritative personal-profile source/);
  assert.match(sync, /if \(!oldProfile\) \{/);
  assert.match(sync, /INSERT INTO profiles \(\$\{profileColumns\.join\(','\)\}\)[\s\S]*VALUES/);
  assert.doesNotMatch(sync, /ON CONFLICT\(userId\) DO UPDATE SET \$\{profileUpdates\}/);
  assert.doesNotMatch(sync, /profileUpdates/);
});

test('v305 existing central profiles can only receive app membership compatibility updates', () => {
  assert.match(sync, /INSERT INTO app_memberships/);
  assert.match(sync, /ON CONFLICT\(userId,appId\) DO UPDATE SET/);
  assert.match(sync, /if \(!oldProfile\)[\s\S]*INSERT OR IGNORE INTO member_relationships/);
  assert.doesNotMatch(sync, /ON CONFLICT\(userId,relationType\) DO UPDATE SET/);
});

test('v305 legacy approval approves the CENTRAL pending rank rather than stale Echo rank', () => {
  assert.match(sync, /const pendingRank = text\(oldProfile\.rank\)/);
  assert.match(sync, /centralPending && legacyApproved && pendingRank/);
  assert.match(sync, /rank=\?,approvedRank=\?,rankApproved=1,rankAuditStatus='approved'/);
  assert.match(sync, /\.bind\(pendingRank, pendingRank,/);
  assert.match(sync, /UPDATE users SET[\s\S]*rank=\?,approvedRank=\?,rankApproved=1/);
  assert.doesNotMatch(sync, /\.bind\(text\(source\.rank\), text\(source\.approvedRank\)/);
});

test('v305 writes audit history for central rank approval but never audits destructive legacy profile replacement', () => {
  assert.match(sync, /profile_audit_logs/);
  assert.match(sync, /for \(const \[field, next\] of Object\.entries\(nextValues\)\)/);
  assert.doesNotMatch(sync, /for \(const field of SHARED_PROFILE_FIELDS\)[\s\S]*oldProfile\[field\][\s\S]*profileValues\[field\]/);
});

test('Echo runtime still routes membership actions through the now-safe compatibility bridge', () => {
  assert.match(privacy, /syncEchoMemberToStarryBestEffort/);
  assert.match(privacy, /contributor\|admin-role\|block\|audit-rank/);
  assert.match(privacy, /member-membership-update/);
});
