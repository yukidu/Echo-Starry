import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const authEntry = readFileSync(new URL('../worker/starryEcosystemAuthEntryRouter.ts', import.meta.url), 'utf8');
const inlineEntry = readFileSync(new URL('../worker/starryMainInlineLoginRouter.ts', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

test('ecosystem apps have a real central Starry Pass login entry', () => {
  assert.match(authEntry, /\/auth\//);
  assert.match(authEntry, /starry-ai/);
  assert.match(authEntry, /starry-sync/);
  assert.match(authEntry, /boxstarry/);
  assert.match(authEntry, /api\/google-sync/);
  assert.match(authEntry, /api\/apps\//);
  assert.match(authEntry, /\/ticket/);
});

test('central login keeps Google credential verification server-side', () => {
  assert.match(authEntry, /accounts\.google\.com\/gsi\/client/);
  assert.match(authEntry, /credential,appId:APP_ID/);
  assert.doesNotMatch(authEntry, /client_secret/i);
});

test('central login is inserted inside the established production wrapper chain', () => {
  assert.match(wrangler, /main = "worker\/starryMainInlineLoginRouter\.ts"/);
  assert.match(inlineEntry, /handleStarryEcosystemAuthEntry/);
  assert.match(inlineEntry, /return appWorker\.fetch\(request, env, ctx\)/);
});
