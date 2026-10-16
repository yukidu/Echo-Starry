import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const mottoUi = readFileSync(new URL('../src/v264ProfileMotto.ts', import.meta.url), 'utf8');
const mottoSaveBridge = readFileSync(new URL('../src/profileMottoSaveBridge.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/utils/api.ts', import.meta.url), 'utf8');
const profileBridge = readFileSync(new URL('../src/memberProfileSchemaBridge.ts', import.meta.url), 'utf8');
const mottoRouter = readFileSync(new URL('../worker/starryIdRandomMottoRouter.ts', import.meta.url), 'utf8');
const mainRouter = readFileSync(new URL('../worker/starryMainInlineLoginRouter.ts', import.meta.url), 'utf8');
const starrySync = readFileSync(new URL('../worker/starryIdSync.ts', import.meta.url), 'utf8');

test('Echo member profile keeps one editable motto field with Quotes Starry dice', () => {
  assert.match(main, /import '\.\/v264ProfileMotto'/);
  assert.match(mottoUi, /dataset\.profileMottoPrimary = '1'/);
  assert.match(mottoUi, /🎲 隨機一句/);
  assert.match(mottoUi, /\/api\/random-motto/);
  assert.match(mottoUi, /removeLegacyMottoUi/);
  assert.match(mottoUi, /data-starry-extension-field=\"motto\"/);
  assert.doesNotMatch(mottoUi, /persistMotto/);
  assert.doesNotMatch(mottoUi, /method:\s*'PUT'/);
});

test('Starry ID bridge does not render a second motto editor or display card', () => {
  assert.match(profileBridge, /ECHO_MANAGED_EXTENSION_FIELDS = new Set\(\['motto'\]\)/);
  assert.match(profileBridge, /!ECHO_MANAGED_EXTENSION_FIELDS\.has\(field\.fieldKey\)/);
});

test('profile edit mode exposes prominent native save and huge floating save cancel actions', () => {
  assert.match(mottoUi, /profileNativeSave/);
  assert.match(mottoUi, /profileFloatingSave/);
  assert.match(mottoUi, /min-h-\[68px\]/);
  assert.match(mottoUi, /💾 儲存/);
  assert.match(mottoUi, /取消/);
});

test('profile edit observer is throttled and does not observe disabled state changes', () => {
  assert.match(mottoUi, /observer\?\.disconnect\(\)/);
  assert.match(mottoUi, /requestAnimationFrame/);
  assert.match(mottoUi, /childList: true, subtree: true/);
  assert.doesNotMatch(mottoUi, /attributeFilter:\s*\['disabled'\]/);
});

test('motto is merged into the normal profile PUT instead of sending a second save', () => {
  assert.match(mottoUi, /setPendingProfileMotto/);
  assert.match(mottoSaveBridge, /JSON\.stringify\(\{ \.\.\.body, motto \}\)/);
  assert.match(mottoSaveBridge, /PROFILE_PATH/);
  assert.match(api, /enhanceProfileSaveRequest/);
  assert.match(api, /commitProfileMottoSave/);
  assert.doesNotMatch(mottoUi, /\/api\/users\//);
});

test('random motto endpoint is shared by Echo and Starry ID from Quotes Starry source', () => {
  assert.match(mottoRouter, /const ID_HOST = 'id\.starry\.phd'/);
  assert.match(mottoRouter, /const ECHO_HOST = 'echo\.starry\.phd'/);
  assert.match(mottoRouter, /https:\/\/quotes\.starry\.phd\//);
  assert.match(mottoRouter, /docs\.google\.com\/spreadsheets/);
  assert.match(mottoRouter, /source: 'https:\/\/quotes\.starry\.phd\/'/);
  assert.match(mainRouter, /handleStarryIdRandomMotto/);
});

test('motto remains a Starry ID central synchronized member field', () => {
  assert.match(starrySync, /['"]motto['"]/);
  assert.match(starrySync, /SHARED_PROFILE_FIELDS/);
  assert.match(starrySync, /syncEchoMemberToStarry/);
});
