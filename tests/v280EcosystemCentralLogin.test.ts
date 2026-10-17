import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entry = readFileSync(new URL('../worker/starryEcosystemAuthEntryRouter.ts', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

test('ecosystem apps have a real central Starry Pass login entry', () => {
  assert.match(entry, /\/auth\//);
  assert.match(entry, /starry-ai/);
  assert.match(entry, /starry-sync/);
  assert.match(entry, /boxstarry/);
  assert.match(entry, /api\/google-sync/);
  assert.match(entry, /api\/apps\//);
  assert.match(entry, /\/ticket/);
});

test('central login keeps Google credential verification server-side', () => {
  assert.match(entry, /accounts\.google\.com\/gsi\/client/);
  assert.match(entry, /credential,appId:APP_ID/);
  assert.doesNotMatch(entry, /client_secret/i);
});

test('production worker enters through central auth wrapper before existing chain', () => {
  assert.match(wrangler, /main = "worker\/starryEcosystemAuthEntryRouter\.ts"/);
  assert.match(entry, /appWorker\.fetch\(request, env, ctx\)/);
});
