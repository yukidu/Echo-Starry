import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// v271 regression guard: profile save succeeds only after the central Starry ID write completes.
const profile = readFileSync(new URL('../src/components/ProfileModal.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/utils/api.ts', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../src/memberProfileSchemaBridge.ts', import.meta.url), 'utf8');
const router = readFileSync(new URL('../worker/privacyCrawlerRouter.ts', import.meta.url), 'utf8');
const fastSync = readFileSync(new URL('../worker/starryIdFastProfileSync.ts', import.meta.url), 'utf8');
const mottoRouter = readFileSync(new URL('../worker/starryIdRandomMottoRouter.ts', import.meta.url), 'utf8');

test('profile has exactly one native editable motto with Quotes Starry dice', () => {
  assert.match(profile, /data-profile-motto-primary="1"/);
  assert.match(profile, /motto: motto\.trim\(\)/);
  assert.match(profile, /\/api\/random-motto/);
  assert.equal((profile.match(/🎲 隨機一句/g) || []).length, 1);
  assert.match(profile, /currentUser\.motto \|\| '未填寫'/);
  assert.match(mottoRouter, /https:\/\/quotes\.starry\.phd\//);
});

test('legacy dynamic motto layers are completely removed', () => {
  assert.equal(existsSync(new URL('../src/v264ProfileMotto.ts', import.meta.url)), false);
  assert.equal(existsSync(new URL('../src/profileMottoSaveBridge.ts', import.meta.url)), false);
  assert.doesNotMatch(main, /v264ProfileMotto/);
  assert.doesNotMatch(api, /enhanceProfileSaveRequest|commitProfileMottoSave|profileMottoSaveBridge/);
  assert.match(bridge, /ECHO_MANAGED_EXTENSION_FIELDS = new Set\(\['motto'\]\)/);
});

test('dice exists only in edit branch and non-edit motto is read-only', () => {
  assert.match(profile, /data-profile-motto-readonly="1"/);
  assert.equal((profile.match(/handleRandomMotto/g) || []).length >= 2, true);
  const readonlyIndex = profile.indexOf('data-profile-motto-readonly="1"');
  const diceIndex = profile.indexOf('🎲 隨機一句');
  assert.ok(readonlyIndex >= 0 && diceIndex > readonlyIndex);
});

test('native profile actions remain huge and save waits for real backend result', () => {
  assert.match(profile, /data-profile-native-floating-actions="1"/);
  assert.match(profile, /min-h-\[68px\]/);
  assert.match(profile, /💾 \{isSaving \? '儲存中…' : '儲存'\}/);
  assert.match(profile, /await onUpdateProfile\(payload\)/);
  assert.doesNotMatch(profile, /await refreshOrganizationDisplay\(\)/);
});

test('new member fields remain empty instead of invented defaults', () => {
  assert.doesNotMatch(profile, /currentUser\?\.residence \|\| '臺北'/);
  assert.doesNotMatch(profile, /currentUser\?\.center \|\| '無'/);
  assert.doesNotMatch(profile, /currentUser\?\.joinReason \|\| '事業'/);
  assert.doesNotMatch(profile, /currentUser\?\.stayReason \|\| '打造自己的事業與團隊'/);
  assert.match(bridge, /const desired = \['',\.\.\.values\.filter/);
});

test('unchanged distributor id does not cause an extra spouse lookup', () => {
  assert.match(app, /const currentDealerId=String\(currentUser\.amwayId \|\| ''\)\.trim\(\)/);
  assert.match(app, /requestedDealerId && requestedDealerId !== currentDealerId/);
});

test('explicit save strictly writes Starry ID before success and never queues profile retry', () => {
  assert.match(router, /syncSavedEchoProfileToStarryId/);
  assert.match(router, /await syncSavedEchoProfileToStarryId/);
  assert.match(router, /status: 503/);
  assert.doesNotMatch(router, /member-profile-update-retry/);
  assert.match(fastSync, /central\.batch\(ownershipQueries\)/);
  assert.match(fastSync, /await central\.batch\(statements\)/);
  assert.match(fastSync, /'motto'/);
  assert.match(fastSync, /receives the already-saved Echo member/);
});
