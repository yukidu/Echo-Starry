import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const visual = readFileSync(new URL('../src/v145FourButtonFilterBar.ts', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v145 replaces the old homepage toolbar with exactly four primary controls', () => {
  assert.match(visual, /makeSlot\('category', '全部分類'\)/);
  assert.match(visual, /makeSlot\('latest', '最新上架'\)/);
  assert.match(visual, /makeSlot\('popular', '熱門推薦'\)/);
  assert.match(visual, /makeSlot\('advanced', '進階篩選', true\)/);
  assert.match(visual, /sort-toolbar\.v145-legacy-toolbar/);
  assert.match(visual, /clip-path: inset\(50%\)/);
});

test('v145 preserves category, newest, popular and advanced legacy logic behind the new controls', () => {
  assert.match(visual, /driveCategory\(category\)/);
  assert.match(visual, /driveSort\('時間', 'desc'\)/);
  assert.match(visual, /driveSort\('按讚', 'desc'\)/);
  assert.match(visual, /driveSort\('評價', 'desc'\)/);
  assert.match(visual, /driveSort\('心得', 'desc'\)/);
  assert.match(visual, /driveSort\('權限', 'asc'\)/);
  assert.match(visual, /driveSort\('貼紙', 'desc'\)/);
});

test('v145 shortens the guest registration CTA without changing its click implementation', () => {
  assert.match(visual, /max-width: min\(100%, 18rem\)/);
  assert.match(visual, /width: auto !important/);
  assert.doesNotMatch(visual, /openGuestRegistration|openRegistrationReliable/);
});

test('v145 filter design has a one-command restore code and loads after v144', () => {
  assert.match(visual, /FILTER_RESTORE_CODE = 'FILTER-RESTORE-01'/);
  const v144 = indexHtml.indexOf('/src/v144GuestCtaFilterPreview.ts');
  const v145 = indexHtml.indexOf('/src/v145FourButtonFilterBar.ts');
  assert.ok(v144 >= 0);
  assert.ok(v145 > v144);
});

test('v145 avoids self-triggering microtask loops', () => {
  assert.match(visual, /requestAnimationFrame/);
  assert.doesNotMatch(visual, /queueMicrotask|setInterval|while\s*\(/);
});
