import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('繁星同步使用 Starry ID host-only session 與一次性短效票證', async () => {
  const source = await read('worker/starrySyncCentralSsoRouter.ts');
  assert.match(source, /const SYNC_ORIGIN = 'https:\/\/sync\.starry\.phd'/);
  assert.match(source, /const CENTRAL_COOKIE = 'starry_id_session'/);
  assert.match(source, /const APP_ID = 'starry-sync'/);
  assert.match(source, /starry_app_auth_codes/);
  assert.match(source, /DELETE FROM starry_app_auth_codes/);
  assert.match(source, /expiresAt>\?/);
  assert.doesNotMatch(source, /Domain=\.starry\.phd/i);
});

test('繁星同步中央票證只授權管理員，且來源限 sync.starry.phd', async () => {
  const source = await read('worker/starrySyncCentralSsoRouter.ts');
  assert.match(source, /configuredSuperAdmin/);
  assert.match(source, /appId='starry-id'/);
  assert.match(source, /isAdminUser/);
  assert.match(source, /origin === SYNC_ORIGIN/);
  assert.match(source, /\/api\/apps\/starry-sync\/ticket/);
  assert.match(source, /\/api\/apps\/starry-sync\/exchange/);
});

test('Cloudflare 正式入口先經繁星同步 SSO wrapper', async () => {
  const wrangler = await read('wrangler.toml');
  const wrapper = await read('worker/starrySyncCentralWrapper.ts');
  assert.match(wrangler, /main = "worker\/starrySyncCentralWrapper\.ts"/);
  assert.match(wrapper, /handleStarrySyncCentralSso/);
  assert.match(wrapper, /starryMainInlineLoginRouter/);
});
