import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const router = readFileSync(join(root, 'worker/starryIdCentralRouter.ts'), 'utf8');
const page = readFileSync(join(root, 'worker/starryIdMemberCenterPage.ts'), 'utf8');

const STARRY_CLIENT = '661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com';

test('Starry ID root is a real Google member login and electronic card page', () => {
  assert.match(router, /renderStarryIdMemberCenterPage/);
  assert.match(page, /accounts\.google\.com\/gsi\/client/);
  assert.match(page, /\/api\/google-sync/);
  assert.match(page, /電子名片/);
  assert.match(page, /原地修改/);
  assert.match(router, new RegExp(STARRY_CLIENT.replaceAll('.', '\\.')));
});

test('Starry ID browser session uses an HttpOnly secure cookie instead of JS token storage', () => {
  assert.match(router, /starry_id_session/);
  assert.match(router, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(router, /Set-Cookie/);
  assert.doesNotMatch(page, /localStorage/);
  assert.doesNotMatch(page, /sessionStorage/);
  assert.doesNotMatch(page, /authToken/);
});

test('ordinary members edit themselves while all-member administration is Super Admin only', () => {
  assert.match(router, /if \(!session\.isSuperAdmin\) return json\(request, \{ error: '只有超級管理員可以管理全部會員。' \}, 403\)/);
  assert.match(router, /\/api\/admin\/members/);
  assert.match(page, /會員管理/);
  assert.match(page, /\/api\/profile/);
  assert.match(page, /\/api\/admin\/members\//);
});

test('inline card supports individual shared profile and relationship fields', () => {
  for (const field of ['name', 'amwayId', 'phone', 'residence', 'center', 'rank', 'birthday', 'motto', 'zodiac', 'talentNumber', 'lifeNumber', 'sponsor', 'platinumUpline', 'diamondUpline']) {
    assert.ok(page.includes(`'${field}'`), `missing inline field ${field}`);
  }
  assert.match(router, /RELATIONSHIP_FIELDS/);
  assert.match(router, /member_relationships/);
  assert.match(router, /profile_audit_logs/);
});

test('rank editing is reserved for Super Admin and records central approval state', () => {
  assert.match(router, /ADMIN_EDITABLE_PROFILE_FIELDS/);
  assert.match(router, /rankAuditType='super-admin'/);
  assert.match(page, /if\(field==='rank'\) return state\.isSuperAdmin/);
});

test('private member center is not automatically a public personal-data page', () => {
  assert.match(page, /noindex,nofollow,noarchive,nosnippet,noimageindex/);
  assert.match(page, /個人資料目前只在登入後顯示，不會自動公開/);
  assert.match(page, /Content-Security-Policy/);
});
