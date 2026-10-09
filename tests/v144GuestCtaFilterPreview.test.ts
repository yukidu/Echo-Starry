import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const visual = readFileSync(new URL('../src/v144GuestCtaFilterPreview.ts', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v144 guest statistics copy exactly follows the requested wording', () => {
  assert.match(visual, /guestLabel\.append\('訪客可聽 ', guestCount, ' 部音檔'\)/);
  assert.match(visual, /separator\.textContent = ' \| '/);
  assert.match(visual, /totalLabel\.append\('全站音檔共 ', totalCount, ' 部'\)/);
  assert.doesNotMatch(visual, /全站共 /);
  assert.match(visual, /font-size: 1\.05rem !important/);
  assert.match(visual, /font-size: \.92rem !important/);
});

test('v144 registration CTA uses an earlier bounded capture path instead of an unbounded retry loop', () => {
  assert.match(visual, /window\.addEventListener\('click',[\s\S]*true\);/);
  assert.match(visual, /event\.stopPropagation\(\)/);
  assert.match(visual, /button\[data-main-menu="hamburger"\]/);
  assert.match(visual, /new MutationObserver/);
  assert.match(visual, /}, 2000\)/);
  assert.doesNotMatch(visual, /setInterval|while\s*\(/);
});

test('v144 dark filter look is an isolated preview that can be removed without touching the original toolbar', () => {
  assert.match(visual, /v144-filter-dark-preview/);
  assert.match(visual, /background: linear-gradient\(180deg,#1c2738 0%,#111827 100%\)/);
  assert.match(visual, /button\.ring-2/);
  assert.match(visual, /toolbar\.classList\.add\('v144-filter-dark-preview'\)/);
  assert.match(visual, /toolbar\.dataset\.v144FilterPreview = 'dark'/);
});

test('v144 loads after v143 so it can safely override only the requested preview behavior', () => {
  const v143 = indexHtml.indexOf('/src/v143FavoriteCountCtaPolish.ts');
  const v144 = indexHtml.indexOf('/src/v144GuestCtaFilterPreview.ts');
  assert.ok(v143 >= 0);
  assert.ok(v144 > v143);
});
