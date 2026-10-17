import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const authEntry = fs.readFileSync('worker/starryEcosystemAuthEntryRouter.ts', 'utf8');
const ssoRouter = fs.readFileSync('worker/starryEcosystemSsoRouter.ts', 'utf8');
const mainEntry = fs.readFileSync('worker/starryMainInlineLoginRouter.ts', 'utf8');

test('central ecosystem login entry remains mounted in the main worker chain', () => {
  assert.match(mainEntry, /handleStarryEcosystemAuthEntry/);
  assert.match(mainEntry, /ecosystemAuthResponse/);
});

test('central login aliases include the current Starry ecosystem apps', () => {
  for (const alias of ['echostars', 'gostarry', 'downloadstarry', 'boxstarry', 'starry-eye', 'starry-sync', 'starry-ai']) {
    assert.ok(authEntry.includes(alias), `missing auth alias ${alias}`);
  }
});

test('central SSO ticket destinations use current production domains', () => {
  for (const origin of ['https://echo.starry.phd', 'https://go.starry.phd', 'https://download.starry.phd', 'https://eye.starry.phd', 'https://sync.starry.phd', 'https://ai.starry.phd']) {
    assert.ok(ssoRouter.includes(origin), `missing ecosystem origin ${origin}`);
  }
});
