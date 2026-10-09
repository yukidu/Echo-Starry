import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const visual = readFileSync(new URL('../src/v145BlackFilterArchitecture.ts', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v145 replaces the old filter presentation with the requested four-part architecture', () => {
  assert.match(visual, /makeCell\('全部分類'\)/);
  assert.match(visual, /makeCell\('最新上架'\)/);
  assert.match(visual, /makeCell\('熱門推薦'\)/);
  assert.match(visual, /makeCell\('進階篩選'\)/);
  assert.match(visual, /\.v141-keywords,[\s\S]*\.sort-toolbar[\s\S]*display: none !important/);
});

test('v145 keeps the original React filters as the source of truth instead of creating new API traffic', () => {
  assert.match(visual, /originalSortButton/);
  assert.match(visual, /button\.click\(\)/);
  assert.match(visual, /categoryOptionButtons/);
  assert.match(visual, /keywordSourceButtons/);
  assert.doesNotMatch(visual, /fetch\(|\/api\//);
});

test('v145 guest CTA is shorter and opens the existing login registration flow', () => {
  assert.match(visual, /註冊會員了解更多 →/);
  assert.match(visual, /width: auto !important/);
  assert.match(visual, /openGuestRegistrationReliable/);
  assert.match(visual, /navbar-menu-identity/);
  assert.match(visual, /data-main-menu="hamburger"/);
});

test('v145 has an explicit one-line rollback switch and loads last', () => {
  assert.match(visual, /const ENABLE_V145_BLACK_FILTER_ARCHITECTURE = true/);
  assert.match(visual, /if \(!ENABLE_V145_BLACK_FILTER_ARCHITECTURE\)/);
  const v144 = indexHtml.indexOf('/src/v144GuestCtaFilterPreview.ts');
  const v145 = indexHtml.indexOf('/src/v145BlackFilterArchitecture.ts');
  assert.ok(v144 >= 0);
  assert.ok(v145 > v144);
});
