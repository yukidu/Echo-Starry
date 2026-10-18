import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderStarryIdMemberCenterPage } from '../worker/starryIdMemberCenterPage';
import { canManageStarryAppAccess, resolveCentralStarryAdmin } from '../worker/starryIdCentralRouter';
import { handleStarryAppAccessAdminRequest } from '../worker/starryAppAccess';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const access = read('worker/starryAppAccess.ts');
const router = read('worker/starryIdCentralRouter.ts');
const page = read('worker/starryIdMemberCenterPage.ts');

test('Only the verified Starry ID super-admin can reach app access management', () => {
  assert.match(router, /path\.startsWith\('\/api\/admin\/app-access\/'\)/);
  assert.match(router, /if \(!canManageStarryAppAccess\(session\)\)/);
  assert.match(access, /request\.headers\.get\('Origin'\)!=='https:\/\/id\.starry\.phd'/);
});

test('Central ID stays accessible and cannot be part of permission replacement', () => {
  assert.match(access, /const PROTECTED_APP = 'starry-id'/);
  assert.match(access, /v !== PROTECTED_APP/);
  assert.match(access, /item\.appId === PROTECTED_APP/);
  assert.match(router, /appId === 'starry-id' \? null : await readAppAccessDecision/);
  assert.match(access, /if \(appId===PROTECTED_APP\) return \{allowed:true/);
});

test('Existing members retain prior app membership until the coordinated rollout', () => {
  assert.match(access, /NEW_MEMBER_GRANT_CUTOFF_MS/);
  assert.match(access, /row\.explicitDecision==='deny'/);
  assert.match(access, /row\.explicitDecision==='allow'/);
  assert.match(access, /new_member_requires_grant/);
  assert.match(router, /const access = await checkStarryAppAccess\(db,userId,appId\)/);
  assert.match(router, /session\.appId !== 'starry-id' && !\(await checkStarryAppAccess/);
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

test('Single-member switch appears collapsed below avatar before name', () => {
  const avatar=page.indexOf('<div id="avatarWrap"></div>');
  const access=page.indexOf('<details class="access-section hidden"');
  const name=page.indexOf('<div class="identity-main">');
  assert.ok(avatar>=0 && access>avatar && name>access);
  assert.match(page,/id="appAccessSingleApps"/);
  assert.match(page,/choice\.textContent=mode==='grant'\?'允許':'禁止'/);
  assert.match(page,/if\(bulk\)panel\.open=true/);
  assert.match(page,/只允許勾選的 App（未勾選全部禁止）/);
});

test('Mirror checks central member policy when granting and validating app tokens', () => {
  const mirror=read('worker/starryMirrorBridgeRouter.ts');
  assert.match(mirror,/checkStarryAppAccess\(\(env as any\)\.STARRY_ID_DB,session\.userId,APP_ID\)/);
  assert.match(mirror,/checkStarryAppAccess\(db,text\(row\.userId\),APP_ID\)/);
  assert.match(mirror,/您沒有使用權限/);
});

test('Central super-admin status works with either App-issued session', () => {
  assert.equal(canManageStarryAppAccess({appId:'starry-id',isSuperAdmin:true}),true);
  assert.equal(canManageStarryAppAccess({appId:'echostars',isSuperAdmin:true}),true);
  assert.equal(canManageStarryAppAccess({appId:'gostarry',isSuperAdmin:true}),true);
  assert.equal(canManageStarryAppAccess({appId:'starry-id',isSuperAdmin:false}),false);
  assert.equal(canManageStarryAppAccess({appId:'echostars',isSuperAdmin:false}),false);
  assert.equal(canManageStarryAppAccess(null),false);
  assert.match(router,/const isSuperAdmin = await resolveCentralStarryAdmin\(/);
  assert.match(router,/if \(!session\.isSuperAdmin\) return json\(request, \{ error: '只有超級管理員可以管理全部會員。' \}, 403\)/);
});

test('Only central Starry ID membership or its central allowlist grants administrator rights', async () => {
  const neverQuery = { prepare: () => {throw new Error('Starry ID session should reuse its membership');} };
  assert.equal(await resolveCentralStarryAdmin(neverQuery,'central-admin','starry-id',
    {status:'active',role:'super-admin'},false),true);
  assert.equal(await resolveCentralStarryAdmin(neverQuery,'ordinary-member','starry-id',
    {status:'active',role:'member'},false),false);
  assert.equal(await resolveCentralStarryAdmin(neverQuery,'revoked-admin','starry-id',
    {status:'inactive',role:'super-admin'},true),false);

  const dbWith = (central: {status:string;role:string}|null) => ({
    prepare(query: string) {
      assert.match(query,/WHERE userId=\? AND appId='starry-id'/);
      return {bind(userId: string) {
        assert.equal(userId,'cross-app-user');
        return {first: async () => central};
      }};
    }
  });
  const appRole = {status:'active',role:'super-admin'};
  assert.equal(await resolveCentralStarryAdmin(dbWith({status:'active',role:'super-admin'}),
    'cross-app-user','echostars',{status:'active',role:'member'},false),true);
  assert.equal(await resolveCentralStarryAdmin(dbWith({status:'active',role:'member'}),
    'cross-app-user','echostars',appRole,false),false);
  assert.equal(await resolveCentralStarryAdmin(dbWith({status:'inactive',role:'super-admin'}),
    'cross-app-user','downloadstarry',appRole,false),false);
  assert.equal(await resolveCentralStarryAdmin(dbWith(null),
    'cross-app-user','gostarry',appRole,false),false);
  assert.equal(await resolveCentralStarryAdmin(neverQuery,
    'cross-app-user','gostarry',{status:'active',role:'member'},true),true);
  assert.equal(await resolveCentralStarryAdmin(neverQuery,
    'cross-app-user','gostarry',{status:'suspended',role:'super-admin'},true),false);
});

test('Authorized catalog is readable without any D1 writes', async () => {
  const db={prepare:()=>{throw new Error('Catalog must not access D1')},batch:()=>{throw new Error('Catalog must not modify D1')}};
  const response=await handleStarryAppAccessAdminRequest(
    new Request('https://id.starry.phd/api/admin/app-access/catalog'),
    {STARRY_ID_DB:db,STARRY_ID_ALLOWED_APPS:'starry-id,echostars,gostarry,starry-mirror'},
    'admin-user'
  );
  assert.equal(response.status,200);
  const data=await response.json();
  assert.deepEqual(data.apps.map((app: any)=>app.id),['echostars','gostarry','starry-mirror']);
  assert.equal(data.protectedApp,'starry-id');
});

test('Member and bulk catalog load failures show reason and retry safely',async () => {
  const html=await renderStarryIdMemberCenterPage('123.apps.googleusercontent.com').text();
  assert.match(html,/id="appAccessError"[^>]*role="alert"/);
  assert.match(html,/id="appAccessErrorText"/);
  assert.match(html,/id="appAccessRetryBtn"/);
  assert.match(html,/重新讀取 App 清單/);
  assert.match(page,/error\.status/);
  assert.match(page,/state\.accessLastRequest=\{ids:keys,label,bulk\}/);
  assert.match(page,/requestToken!==state\.accessLoadToken/);
  assert.match(page,/appAccessErrorText'\)\.textContent='讀取 App 清單失敗'/);
  assert.match(page,/appAccessPreviewBtn'\)\.disabled=true/);
  assert.match(page,/if\(!state\.accessApps\.length\)throw new Error/);
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(()=>new Function(script));
});
