import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const admin = readFileSync(new URL('../src/components/AdminModal.tsx', import.meta.url), 'utf8');
const router = readFileSync(new URL('../worker/adminUserDeleteRouter.ts', import.meta.url), 'utf8');
const favoriteRouter = readFileSync(new URL('../worker/favoriteRouter.ts', import.meta.url), 'utf8');
const privacyRouter = readFileSync(new URL('../worker/privacyCrawlerRouter.ts', import.meta.url), 'utf8');

test('member list renders permanent delete only for the exact super-admin email and protects the super-admin row', () => {
  assert.match(admin, /const isSuperAdminAccount = cleanEmail === 'yukidu@gmail\.com'/);
  assert.match(admin, /isSuperAdminAccount && u\.email\?\.toLowerCase\(\)\.trim\(\) !== 'yukidu@gmail\.com'/);
  assert.match(admin, /確定刪除會員？/);
  assert.match(admin, /setDeletingUserId\(u\.id\)/);
  assert.match(admin, /handleDeleteUser\(u\)/);
  assert.match(admin, /\/api\/admin\/users\/\$\{encodeURIComponent\(user\.id\)\}/);
});

test('member deletion API independently verifies a live session and exact super-admin email', () => {
  assert.match(router, /const SUPER_ADMIN_EMAIL = 'yukidu@gmail\.com'/);
  assert.match(router, /JOIN users u ON u\.id = s\.userId/);
  assert.match(router, /Number\(row\.expiresAt \|\| 0\) <= Date\.now\(\)/);
  assert.match(router, /normalizeEmail\(actor\.email\) !== SUPER_ADMIN_EMAIL/);
  assert.match(router, /只有超級管理員可刪除會員/);
  assert.match(router, /超級管理員帳號不可刪除/);
});

test('deleting an account removes member-bound sessions and learning identity data before the user row', () => {
  assert.match(router, /DELETE FROM auth_sessions WHERE userId = \?/);
  assert.match(router, /DELETE FROM playback_identity_aliases WHERE memberId = \?/);
  assert.match(router, /DELETE FROM playback_memories/);
  assert.match(router, /DELETE FROM share_events/);
  assert.match(router, /DELETE FROM user_activity_logs/);
  assert.match(router, /DELETE FROM users WHERE id = \?/);
  assert.doesNotMatch(router, /DELETE FROM tracks/);
});

test('privacy entrypoint keeps the member deletion guard in its wrapper chain', () => {
  assert.match(privacyRouter, /import appWorker from '\.\/favoriteRouter'/);
  assert.match(favoriteRouter, /import appWorker from '\.\/adminUserDeleteRouter'/);
});
