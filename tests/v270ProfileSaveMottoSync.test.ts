import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const privacyRouter = readFileSync(new URL('../worker/privacyCrawlerRouter.ts', import.meta.url), 'utf8');
const starrySync = readFileSync(new URL('../worker/starryIdSync.ts', import.meta.url), 'utf8');
const mottoUi = readFileSync(new URL('../src/v264ProfileMotto.ts', import.meta.url), 'utf8');
const mottoSaveBridge = readFileSync(new URL('../src/profileMottoSaveBridge.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/utils/api.ts', import.meta.url), 'utf8');

test('successful Echo profile save is never converted into a Starry ID 503', () => {
  assert.doesNotMatch(privacyRouter, /繁星回聲已暫存本次修改，但 Starry ID 中央同步暫時失敗/);
  assert.match(privacyRouter, /member-profile-update-retry/);
  assert.match(privacyRouter, /return withPrivacyHeaders\(response\)/);
});

test('Starry sync resolves a previously linked or verified central member without email-only merging', () => {
  assert.match(starrySync, /legacy_links WHERE sourceApp = 'echostars'/);
  assert.match(starrySync, /provider = 'google' AND providerSubject = \?/);
  assert.match(starrySync, /const trustedIds = \[\.\.\.new Set\(\[legacyId, identityId\]\.filter\(Boolean\)\)\]/);
  assert.match(starrySync, /const centralId = trustedIds\[0\] \|\| sourceId/);
  assert.match(starrySync, /Starry ID email belongs to another user/);
  assert.doesNotMatch(starrySync, /const centralId = text\(emailOwner/);
});

test('motto rides on the existing profile request and has no second member PUT', () => {
  assert.match(mottoSaveBridge, /JSON\.stringify\(\{ \.\.\.body, motto \}\)/);
  assert.match(api, /enhanceProfileSaveRequest/);
  assert.match(api, /commitProfileMottoSave/);
  assert.doesNotMatch(mottoUi, /method:\s*'PUT'/);
  assert.doesNotMatch(mottoUi, /\/api\/users\//);
});

test('dice exists only in edit section and non-edit section removes every button', () => {
  assert.match(mottoUi, /dice\.dataset\.profileMottoDice = 'edit-only'/);
  assert.match(mottoUi, /Non-edit mode deliberately has no dice button/);
  assert.match(mottoUi, /section\.querySelectorAll\('\[data-profile-motto-dice\], button'\)\.forEach\(node => node\.remove\(\)\)/);
});
