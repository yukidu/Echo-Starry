import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const toolbar = readFileSync(new URL('../src/v145FourFilterToolbar.ts', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v146 keeps four top-level controls while time and popular are direct cycle buttons', () => {
  assert.match(toolbar, /createMenuGroup\('category', categoryLabel, categoryMenu\)/);
  assert.match(toolbar, /createCycleGroup\('time', TIME_MODES\[timeModeIndex\]\.label, activateTimeCycle\)/);
  assert.match(toolbar, /createCycleGroup\('popular', '熱門推薦', activatePopularCycle\)/);
  assert.match(toolbar, /createMenuGroup\('advanced', '進階篩選', advancedMenu, true\)/);
  assert.match(toolbar, /grid-template-columns: 1\.08fr 1fr 1fr 1\.12fr/);
  assert.doesNotMatch(toolbar, /const timeMenu = createMenu/);
  assert.doesNotMatch(toolbar, /const popularMenu = createMenu/);
});

test('v146 cycles upload time between newest and oldest and updates the visible label', () => {
  assert.match(toolbar, /label: '最新上架', originalLabel: '時間', direction: 'desc'/);
  assert.match(toolbar, /label: '最早上架', originalLabel: '時間', direction: 'asc'/);
  assert.match(toolbar, /timeModeIndex = \(timeModeIndex \+ 1\) % TIME_MODES\.length/);
  assert.match(toolbar, /time: TIME_MODES\[timeModeIndex\]\.label/);
});

test('v146 popular recommendation cycles four modes including favorite count', () => {
  assert.match(toolbar, /label: '評價最高', originalLabel: '評價', direction: 'desc'/);
  assert.match(toolbar, /label: '按讚最多', originalLabel: '按讚', direction: 'desc'/);
  assert.match(toolbar, /label: '心得最多', originalLabel: '心得', direction: 'desc'/);
  assert.match(toolbar, /label: '收藏人數', favorite: true/);
  assert.match(toolbar, /popularModeIndex = \(popularModeIndex \+ 1\) % POPULAR_MODES\.length/);
  assert.match(toolbar, /favoriteCount/);
  assert.match(toolbar, /data-track-card-id/);
  assert.doesNotMatch(toolbar, /fetch\(|\/api\//);
});

test('v146 category button follows the selected category name and marks active controls', () => {
  assert.match(toolbar, /categoryLabel = category === '全部' \? '全部分類' : category/);
  assert.match(toolbar, /categoryWasChosen = true/);
  assert.match(toolbar, /button\.dataset\.active = active \? 'true' : 'false'/);
  assert.match(toolbar, /\.v145-filter-button\[data-active="true"\]/);
});

test('v146 derives button and dropdown colors from the current palette primary color', () => {
  assert.match(toolbar, /background: var\(--color-primary,#c06c84\)/);
  assert.match(toolbar, /color-mix\(in srgb,var\(--color-primary,#c06c84\)/);
  assert.doesNotMatch(toolbar, /linear-gradient\(180deg,#1d293b/);
});

test('v146 removes the temporary restore code while keeping the registration CTA width', () => {
  assert.doesNotMatch(toolbar, /FILTER-RESTORE-145|RESTORE_CODE|快速復原代碼/);
  assert.match(toolbar, /flex: 0 0 76% !important/);
  assert.match(toolbar, /max-width: 360px !important/);
});

test('v145 toolbar file still loads after v144', () => {
  const v144 = indexHtml.indexOf('/src/v144GuestCtaFilterPreview.ts');
  const v145 = indexHtml.indexOf('/src/v145FourFilterToolbar.ts');
  assert.ok(v144 >= 0);
  assert.ok(v145 > v144);
});
