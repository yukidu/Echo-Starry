import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const source = readFileSync(join(root, 'worker/starryIdV253NavigationEnhancer.ts'), 'utf8');
const v216 = readFileSync(join(root, 'worker/starryIdV216Enhancer.ts'), 'utf8');

test('v253 is layered into every Starry ID member-center page', () => {
  assert.match(v216, /enhanceStarryIdV253Navigation/);
  assert.match(v216, /return enhanceStarryIdV253Navigation\(enhanced\)/);
});

test('My Card click changes route synchronously instead of awaiting card settings first', () => {
  assert.match(source, /history\[replace\?'replaceState':'pushState'\]/);
  assert.match(source, /closest\?\.\('#myCardBtn'\)/);
  assert.match(source, /navigate\('\/my-card'\)/);
  assert.match(source, /ensureCardShell\(\)/);
  assert.match(source, /loadSettings\(\)/);
});

test('valid-session navigation cannot flash the Starry ID login page', () => {
  assert.match(source, /html:not\(\[data-v253-auth-ready="1"\]\) #loginView\{visibility:hidden!important\}/);
  assert.match(source, /document\.documentElement\.dataset\.v253AuthReady='1'/);
  assert.match(source, /q\('#loginView'\)\?\.classList\.add\('hidden'\)/);
});

test('member center and My Card use browser history without full-page reload', () => {
  assert.match(source, /window\.__starryV253Navigate=navigate/);
  assert.match(source, /window\.addEventListener\('popstate',route\)/);
  assert.match(source, /back\.onclick=\(\)=>navigate\('\/'\)/);
  assert.doesNotMatch(source, /location\.href='\/my-card'/);
});

test('SPA My Card keeps v252 layout controls, drag save and global default support', () => {
  assert.match(source, /v252-drag-handle/);
  assert.match(source, /手機每列/);
  assert.match(source, /setAsGlobalDefault/);
  assert.match(source, /設定為全體預設值/);
  assert.match(source, /pointerdown/);
  assert.match(source, /pointermove/);
  assert.match(source, /pointerup/);
});
