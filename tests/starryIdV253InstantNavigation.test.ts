import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const source = readFileSync(join(root, 'worker/starryIdV253NavigationEnhancer.ts'), 'utf8');
const bridge = readFileSync(join(root, 'worker/starryIdV212PublicCardBridge.ts'), 'utf8');
const v216 = readFileSync(join(root, 'worker/starryIdV216Enhancer.ts'), 'utf8');

test('v253 remains layered into Starry ID member center', () => {
  assert.match(v216, /enhanceStarryIdV253Navigation/);
  assert.match(v216, /return enhanceStarryIdV253Navigation\(enhanced\)/);
});

test('retired My Card management route returns to the member center', () => {
  assert.match(source, /location\.pathname!=='\/my-card'/);
  assert.match(source, /history\.replaceState\(null,'','\/'\)/);
  assert.match(source, /q\('#myCardPage'\)\?\.remove\(\)/);
});

test('My Card button and hamburger main menu are removed', () => {
  assert.match(source, /#myCardBtn,#v216Menu/);
  assert.match(source, /q\('#myCardBtn'\)\?\.remove\(\)/);
  assert.match(source, /q\('#v216Menu'\)\?\.remove\(\)/);
  assert.match(source, /q\('\.v216-menu'\)\?\.remove\(\)/);
  assert.match(source, /label==='我的名片'/);
  assert.match(source, /label==='☰'/);
});

test('valid-session navigation still cannot flash the login page', () => {
  assert.match(source, /html:not\(\[data-v253-auth-ready="1"\]\) #loginView\{visibility:hidden!important\}/);
  assert.match(source, /document\.documentElement\.dataset\.v253AuthReady='1'/);
  assert.match(source, /q\('#loginView'\)\?\.classList\.add\('hidden'\)/);
});

test('card layout and drag editing code has been removed', () => {
  const combined = source + '\n' + bridge;
  assert.doesNotMatch(combined, /v252-drag-handle/);
  assert.doesNotMatch(combined, /pointerdown/);
  assert.doesNotMatch(combined, /setAsGlobalDefault/);
  assert.doesNotMatch(combined, /設定為全體預設值/);
  assert.doesNotMatch(combined, /public_card_layouts/);
  assert.doesNotMatch(combined, /public_card_layout_defaults/);
  assert.doesNotMatch(combined, /v252-public-layout/);
});

test('public Amway-ID cards remain supported', () => {
  assert.match(bridge, /AMWAY_ID_RE/);
  assert.match(bridge, /findUniqueActiveMember/);
  assert.match(bridge, /materializeCard/);
  assert.match(bridge, /handleStarryIdV211/);
});
