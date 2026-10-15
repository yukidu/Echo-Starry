import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const enhancer = readFileSync(join(root, 'worker/starryIdV216Enhancer.ts'), 'utf8');
const router = readFileSync(join(root, 'worker/starryIdV211Router.ts'), 'utf8');
const navigation = readFileSync(join(root, 'worker/starryIdV253NavigationEnhancer.ts'), 'utf8');
const unifiedMenu = readFileSync(join(root, 'worker/starryIdV256UnifiedMenu.ts'), 'utf8');

test('member header mirrors Download Starry identity hierarchy with photo, name and rank', () => {
  assert.match(enhancer, /v216-header-avatar/);
  assert.match(enhancer, /v216-header-name/);
  assert.match(enhancer, /v216-header-rank/);
  assert.match(enhancer, /user\.approvedRank\|\|user\.rank\|\|'無'/);
});

test('retired My Card management page stays removed while the hamburger and My Card shortcut are restored', () => {
  assert.doesNotMatch(router, /pub\.textContent='公開設定'/);
  assert.doesNotMatch(enhancer, /renderMyCard/);
  assert.doesNotMatch(enhancer, /v216-card-page/);
  assert.match(enhancer, /retireLegacyToolbar/);
  assert.doesNotMatch(navigation, /#myCardBtn,#v216Menu\{display:none!important\}/);
  assert.match(navigation, /enhanceStarryIdV256UnifiedMenu/);
  assert.match(unifiedMenu, /menu\.id='v216Menu'/);
  assert.match(unifiedMenu, /card\.id='v256MyCardBtn'/);
  assert.match(unifiedMenu, /card\.textContent='我的名片'/);
});

test('pencil editing requires an explicit checkmark and never saves on blur or Enter', () => {
  assert.match(enhancer, /button\.textContent='✓'/);
  assert.match(enhancer, /button\.dataset\.v216Save='1'/);
  assert.match(enhancer, /if\(button\.dataset\.v216Save==='1'\)commitManual\(button\)/);
  assert.match(enhancer, /else if\(e\.key==='Enter'&&!wide\)\{e\.preventDefault\(\)\}/);
  assert.doesNotMatch(enhancer, /addEventListener\('blur'.*commitManual/);
});

test('avatar selection previews first and only the same-position checkmark saves it', () => {
  assert.match(enhancer, /previewAvatar\(data,button\)/);
  assert.match(enhancer, /button\.dataset\.v216AvatarSave='1'/);
  assert.match(enhancer, /button\.title='手動儲存照片'/);
  assert.match(enhancer, /saveAvatarManual\(button\)/);
  assert.match(enhancer, /JSON\.stringify\(\{avatar:pendingAvatar\}\)/);
});

test('visibility uses true eye and eye-slash icons instead of prohibition glyph', () => {
  assert.match(enhancer, /function eyeSvg\(visible\)/);
  assert.match(enhancer, /M3 3l18 18/);
  assert.doesNotMatch(enhancer, /⊘/);
});

test('mobile toolbar keeps My Card plus hamburger while member management moves into the menu', () => {
  assert.match(enhancer, /@media\(max-width:760px\)/);
  assert.match(unifiedMenu, /#adminBtn\{display:none!important\}/);
  assert.match(unifiedMenu, /#v216Menu/);
  assert.match(unifiedMenu, /會員管理/);
  assert.match(unifiedMenu, /q\('#adminBtn'\)\?\.click\(\)/);
  assert.match(enhancer, /html\[data-starry-theme="light"\] \.topbar/);
  assert.match(enhancer, /#14213d/);
});

test('owner public card no longer bypasses field, avatar or numerology privacy', () => {
  assert.match(router, /rows\.filter\(\(\[key\]\)=>visibility\[key\]!==false\)/);
  assert.match(router, /const avatar=visibility\.avatar!==false&&data\.avatar/);
  assert.match(router, /const grid=visibility\.numerology!==false&&data\.birthday/);
  assert.doesNotMatch(router, /owner\|\|visibility\[key\]!==false/);
});
