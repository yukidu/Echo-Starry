import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const router = readFileSync(join(root, 'worker/starryIdCentralRouter.ts'), 'utf8');
const privacyRouter = readFileSync(join(root, 'worker/privacyCrawlerRouter.ts'), 'utf8');
const batteryRouter = readFileSync(join(root, 'worker/starryMainBatteryGameRouter.ts'), 'utf8');
const inlineLoginRouter = readFileSync(join(root, 'worker/starryMainInlineLoginRouter.ts'), 'utf8');
const wrangler = readFileSync(join(root, 'wrangler.toml'), 'utf8');
const schema = readFileSync(join(root, 'starry-id/schema.sql'), 'utf8');
const verifySchema = readFileSync(join(root, 'starry-id/verify-schema.mjs'), 'utf8');

const STARRY_CLIENT = '661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com';
const LEGACY_ECHO_CLIENT = '400699489182-lb412nhvj4s6t1qr5ovkg40hc646dq79.apps.googleusercontent.com';

test('Starry ID keeps the existing EchoStars worker chain and adds id.starry.phd', () => {
  assert.match(wrangler, /main = "worker\/starryMainInlineLoginRouter\.ts"/);
  assert.match(inlineLoginRouter, /import appWorker from '\.\/starryMainBatteryGameRouter'/);
  assert.match(batteryRouter, /import appWorker from '\.\/privacyCrawlerRouter'/);
  assert.match(wrangler, /pattern = "echo\.starry\.phd"/);
  assert.match(wrangler, /pattern = "id\.starry\.phd"/);
  assert.match(privacyRouter, /handleStarryIdCentral/);
});

test('Starry ID central backend uses the dedicated Google OAuth client', () => {
  assert.match(router, new RegExp(STARRY_CLIENT.replaceAll('.', '\\.')));
  assert.match(wrangler, new RegExp(STARRY_CLIENT.replaceAll('.', '\\.')));
  assert.doesNotMatch(router, new RegExp(LEGACY_ECHO_CLIENT.replaceAll('.', '\\.')));
});

test('Starry ID only accepts registered app ids for self enrollment', () => {
  assert.match(router, /STARRY_ID_ALLOWED_APPS/);
  assert.match(router, /STARRY_ID_SELF_ENROLL_APPS/);
  assert.match(router, /if \(!allowedApp\(env, appId\)\) throw new Error\('unsupported_app'\)/);
  assert.match(router, /if \(!membership && !selfEnrollApp\(env, appId\) && explicitAppDecision !== 'allow'\) throw new Error\('app_membership_required'\)/);
  assert.match(router, /if \(!existing\) throw new Error\('app_access_denied'\)/);
  assert.match(router, /checkStarryAppAccess\(db,userId,appId\)/);
  assert.match(wrangler, /STARRY_ID_ALLOWED_APPS = "starry-id,starryphd,echostars,downloadstarry,gostarry,quotes,boxstarry,[^"]*starry-mirror[^"]*"/);
  assert.match(wrangler, /STARRY_ID_SELF_ENROLL_APPS = "starry-id,starryphd,echostars,downloadstarry,gostarry,quotes,boxstarry,[^"]*starry-mirror[^"]*"/);
});

test('Starry ID central sessions are persisted as hashed server sessions', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS auth_sessions/);
  assert.match(verifySchema, /'auth_sessions'/);
  assert.match(router, /SHA-256/);
  assert.match(router, /tokenHash/);
  assert.doesNotMatch(schema, /rawToken/i);
});
