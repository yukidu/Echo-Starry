import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const router = readFileSync(new URL('../worker/playbackOwnerRouter.ts', import.meta.url), 'utf8');
const sessionRouter = readFileSync(new URL('../worker/sessionCookieRouter.ts', import.meta.url), 'utf8');
const categoryRouter = readFileSync(new URL('../worker/categoryIntegrityRouter.ts', import.meta.url), 'utf8');
const organizationRouter = readFileSync(new URL('../worker/organizationRouter.ts', import.meta.url), 'utf8');
const adminUserDeleteRouter = readFileSync(new URL('../worker/adminUserDeleteRouter.ts', import.meta.url), 'utf8');
const privacyRouter = readFileSync(new URL('../worker/privacyCrawlerRouter.ts', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../src/googleIdentityBridge.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

test('playback memories use stable memberId ownership with legacy aliases kept only for recovery', () => {
  assert.match(schema, /memberId TEXT/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS playback_identity_aliases/);
  assert.match(router, /WHERE memberId = \? OR \$\{legacy\.where\}/);
  assert.match(router, /INSERT INTO playback_memories[\s\S]*memberId/);
});

test('public history resolves the selected member and is independent from the viewer session', () => {
  const section = router.match(/async function publicHistory[\s\S]*?\n}\n\nasync function resolveMemberForWrite/)?.[0] || '';
  assert.match(section, /resolveMember\(env\.DB, requestedId\)/);
  assert.match(section, /canonicalRecordsForMember\(env, member\)/);
  assert.doesNotMatch(section, /authenticatedUser\(/);
});

test('legacy device ownership is recovered only when one device maps to one member', () => {
  assert.match(router, /HAVING COUNT\(DISTINCT u\.id\) = 1/);
  assert.match(router, /NOT EXISTS \([\s\S]*other\.authorEmail[\s\S]*<> LOWER\(TRIM\(c\.authorEmail\)\)/);
});

test('backfill is non-destructive and only fills missing memberId', () => {
  assert.match(router, /UPDATE playback_memories[\s\S]*SET memberId =/);
  assert.match(router, /WHERE \(memberId IS NULL OR TRIM\(memberId\) = ''\)/);
  assert.doesNotMatch(router, /DELETE FROM playback_memories/);
});

test('future playback writes canonicalize registered email or id to users.id', () => {
  assert.match(router, /const direct = await resolveMember\(env\.DB, identifier\)/);
  assert.match(router, /const memberId = member\?\.id \? String\(member\.id\) : ''/);
  assert.match(router, /playbackStatement\([\s\S]*identifier,[\s\S]*memberId/);
  assert.match(router, /`\$\{ownerIdentifier\}_\$\{track\.id\}`/);
});

test('local playback claim requires the verified bearer session and cannot trust body email', () => {
  const section = router.match(/async function claimLocalPlayback[\s\S]*?\n}\n\nasync function memberStats/)?.[0] || '';
  assert.match(section, /authenticatedUser\(request, env\)/);
  assert.match(section, /請先以 Google 帳號登入/);
  assert.doesNotMatch(section, /body\.email/);
  assert.match(section, /\/\^dev-\[a-z0-9-\]\+\$\/i/);
});

test('a device already owned by another member is never transferred', () => {
  const section = router.match(/async function claimLocalPlayback[\s\S]*?\n}\n\nasync function memberStats/)?.[0] || '';
  assert.match(section, /existing && String\(existing\.memberId\) !== memberId/);
  assert.match(section, /conflict: true/);
  assert.match(section, /409/);
});

test('verified device claim imports localStorage progress into canonical member keys', () => {
  assert.match(router, /path === '\/api\/playback\/claim-local'/);
  assert.match(router, /localPlayback/);
  assert.match(router, /playbackStatement\(env\.DB, memberId, memberId/);
  assert.match(bridge, /sq_audio_progress_v1_/);
  assert.match(bridge, /\/api\/playback\/claim-local/);
  assert.match(bridge, /Authorization: `Bearer \$\{token\}`/);
});

test('the browser imports local history after secure login and for an existing verified session', () => {
  assert.match(bridge, /await claimLocalPlayback\(user\);[\s\S]*window\.location\.reload\(\)/);
  assert.match(bridge, /Date\.now\(\) - lastChecked < SESSION_CHECK_TTL[\s\S]*await claimLocalPlayback\(user\)/);
  assert.match(bridge, /playbackFingerprint\(localPlayback\)/);
  assert.match(bridge, /localStorage\.setItem\(markerKey, fingerprint\)/);
});

test('changed local progress is eligible for another safe import instead of a permanent one-time skip', () => {
  assert.match(bridge, /localStorage\.getItem\(markerKey\) === fingerprint/);
  assert.doesNotMatch(bridge, /localStorage\.getItem\(markerKey\) === '1'/);
});

test('playback owner stays in the active privacy/member-delete/category/organization/session wrapper chain', () => {
  assert.match(wrangler, /main = "worker\/privacyCrawlerRouter\.ts"/);
  assert.match(privacyRouter, /import appWorker from '\.\/adminUserDeleteRouter'/);
  assert.match(adminUserDeleteRouter, /import appWorker from '\.\/categoryIntegrityRouter'/);
  assert.match(categoryRouter, /import appWorker from '\.\/organizationRouter'/);
  assert.match(organizationRouter, /import appWorker from '\.\/stickerRouter'/);
  const stickerRouter = readFileSync(new URL('../worker/stickerRouter.ts', import.meta.url), 'utf8');
  assert.match(stickerRouter, /import appWorker from '\.\/sessionCookieRouter'/);
  assert.match(sessionRouter, /import appWorker from '\.\/playbackOwnerRouter'/);
});