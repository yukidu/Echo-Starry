import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const auth = readFileSync('worker/authRouter.ts','utf8');
const gateway = readFileSync('worker/echoCentralProfileGateway.ts','utf8');
const privacy = readFileSync('worker/privacyCrawlerRouter.ts','utf8');

test('v276 Echo profile save is intercepted and written directly to Starry ID central profile', () => {
  assert.match(auth, /writeEchoProfileToCentral\(env, user, target, patch\)/);
  assert.match(auth, /profileSource: 'starry-id-central'/);
  assert.match(gateway, /UPDATE profiles SET/);
  assert.match(gateway, /CENTRAL_PROFILE_UNAVAILABLE/);
  assert.match(gateway, /資料未儲存/);
});

test('v276 central profile is the read source for login, session and member lists', () => {
  assert.match(auth, /ensureCentralEchoMember\(env, \{ \.\.\.data\.user, googleSubject: identity\.subject \}\)/);
  assert.match(auth, /overlayEchoMemberWithCentral\(env, row\)/);
  assert.match(auth, /overlayEchoMembersWithCentral\(env, members\)/);
  assert.match(auth, /overlayEchoJsonResponse\(env, response\)/);
});

test('v276 removes asynchronous profile sync after Echo saves or logs in', () => {
  assert.doesNotMatch(privacy, /member-profile-update/);
  assert.doesNotMatch(privacy, /member-profile-update-retry/);
  assert.doesNotMatch(privacy, /verified-google-login/);
  assert.match(privacy, /member-membership-update/);
});

test('v276 central writes are audited as echostars and local app identity remains stable', () => {
  assert.match(gateway, /const SOURCE_APP = 'echostars'/);
  assert.match(gateway, /profile_audit_logs/);
  assert.match(gateway, /merged\.id = echoUser\.id/);
  assert.doesNotMatch(gateway, /UPDATE users SET name=/);
});

test('v276 distributor changes require central conflict protection and spouse confirmation', () => {
  assert.match(gateway, /DISTRIBUTOR_NUMBER_CONFLICT/);
  assert.match(gateway, /COUPLE_CONFIRM_REQUIRED/);
  assert.match(gateway, /confirmSpouseFromEchoOrganization/);
  assert.match(gateway, /spouse_links/);
});
