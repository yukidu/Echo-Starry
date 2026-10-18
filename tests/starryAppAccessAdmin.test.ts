import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderStarryIdMemberCenterPage } from '../worker/starryIdMemberCenterPage';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const access = read('worker/starryAppAccess.ts');
const router = read('worker/starryIdCentralRouter.ts');
const page = read('worker/starryIdMemberCenterPage.ts');

test('Only the verified Starry ID super-admin can reach app access management', () => {
  assert.match(router, /path\.startsWith\('\/api\/admin\/app-access\/'\)/);
  assert.match(router, /session\.appId !== 'starry-id' \|\| !configuredSuperAdmin\(env,session\.member\.email\)/);
  assert.match(access, /request\.headers\.get\('Origin'\)!=='https:\/\/id\.starry\.phd'/);
});

test('Central ID stays accessible and cannot be part of permission replacement', () => {
  assert.match(access, /const PROTECTED_APP = 'starry-id'/);
  assert.match(access, /v !== PROTECTED_APP/);
  assert.match(access, /item\.appId === PROTECTED_APP/);
  assert.match(router, /appId === 'starry-id' \? null : await readAppAccessDecision/);
});

test('Existing members retain prior app membership until the coordinated rollout', () => {
  assert.match(router, /explicitAppDecision === 'deny'/);
  assert.match(router, /env\.STARRY_APP_ACCESS_REQUIRE_GRANT === 'true'/);
  assert.match(router, /explicitAppDecision !== 'allow'/);
  assert.match(router, /session\.appId !== 'starry-id' && await readAppAccessDecision/);
  assert.doesNotMatch(read('wrangler.toml'), /STARRY_APP_ACCESS_REQUIRE_GRANT\s*=\s*'true'/);
});

test('Preview and a second confirmation are required to change member App permissions', () => {
  assert.match(access, /const MEMBER_LIMIT = 50/);
  assert.match(access, /const PREVIEW_TTL = 5 \* 60 \* 1000/);
  assert.match(access, /confirmationText !== '確認變更'/);
  assert.match(access, /consumedAt IS NULL AND expiresAt>/);
  assert.match(access, /權限已變更，請重新預覽/);
  assert.match(access, /await db\.batch\(writes\)/);
  assert.match(access, /starry_app_access_operations/);
  assert.match(access, /sourceOperationId/);
  assert.match(access, /revertedBy/);
});

test('Bulk selection is limited, supports paging and displays revert history', () => {
  assert.match(router, /LIMIT 100 OFFSET \?/);
  assert.match(page, /access-member-row/);
  assert.match(page, /selectedIds:new Set\(\)/);
  assert.match(page, /state\.selectedIds\.size>=50/);
  assert.match(page, /option value="grant"/);
  assert.match(page, /option value="revoke"/);
  assert.match(page, /option value="replace"/);
  assert.match(page, /預覽還原/);
  assert.match(page, /確認套用/);
  assert.match(page, /批次設定 App 權限/);
});

test('Public and anonymous app browsing remain outside this member-only rollout', () => {
  assert.match(access, /Phase 1 is non-disruptive/);
  assert.doesNotMatch(access, /DELETE FROM users|UPDATE users SET status/i);
  assert.doesNotMatch(access, /DROP TABLE|DELETE FROM auth_sessions/i);
});

test('Embedded member-center JavaScript remains valid after adding bulk interface', async () => {
  const html=await renderStarryIdMemberCenterPage('123-abc.apps.googleusercontent.com').text();
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(()=>new Function(script));
});
