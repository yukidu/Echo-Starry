import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const toolbar = readFileSync(new URL('../src/v145FourFilterToolbar.ts', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v145 replaces the visible old sort row with exactly four requested top-level controls', () => {
  assert.match(toolbar, /createFilterGroup\('category', categoryLabel, categoryMenu\)/);
  assert.match(toolbar, /createFilterGroup\('time', '最新上架', timeMenu\)/);
  assert.match(toolbar, /createFilterGroup\('popular', '熱門推薦', popularMenu\)/);
  assert.match(toolbar, /createFilterGroup\('advanced', '進階篩選', advancedMenu, true\)/);
  assert.match(toolbar, /grid-template-columns: 1\.08fr 1fr 1fr 1\.12fr/);
  assert.match(toolbar, /v145-original-sort-engine/);
});

test('v145 four controls delegate to the existing category and sorting logic instead of duplicating backend work', () => {
  assert.match(toolbar, /setOriginalCategory\(category\)/);
  assert.match(toolbar, /setOriginalSort\('時間', 'desc'\)/);
  assert.match(toolbar, /setOriginalSort\('時間', 'asc'\)/);
  assert.match(toolbar, /setOriginalSort\('評價', 'desc'\)/);
  assert.match(toolbar, /setOriginalSort\('按讚', 'desc'\)/);
  assert.match(toolbar, /setOriginalSort\('心得', 'desc'\)/);
  assert.match(toolbar, /setOriginalSort\('權限', 'asc'\)/);
  assert.match(toolbar, /setOriginalSort\('權限', 'desc'\)/);
  assert.match(toolbar, /setOriginalSort\('貼紙', 'asc'\)/);
  assert.doesNotMatch(toolbar, /fetch\(|\/api\//);
});

test('v145 shortens the registration CTA but keeps the existing registration behavior untouched', () => {
  assert.match(toolbar, /flex: 0 0 76% !important/);
  assert.match(toolbar, /max-width: 360px !important/);
  assert.doesNotMatch(toolbar, /openGuestRegistration|navbar-menu-identity/);
});

test('v145 filter row has a dedicated one-command restore code', () => {
  assert.match(toolbar, /const RESTORE_CODE = 'FILTER-RESTORE-145'/);
  assert.match(toolbar, /快速復原代碼：\$\{RESTORE_CODE\}/);
});

test('v145 loads after v144 so the new four-button design supersedes the temporary preview row', () => {
  const v144 = indexHtml.indexOf('/src/v144GuestCtaFilterPreview.ts');
  const v145 = indexHtml.indexOf('/src/v145FourFilterToolbar.ts');
  assert.ok(v144 >= 0);
  assert.ok(v145 > v144);
});
