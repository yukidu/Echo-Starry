import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = readFileSync('src/v167PageNavigation.ts', 'utf8');
const html = readFileSync('index.html', 'utf8');

test('v167 page policy loads after the four-filter toolbar', () => {
  const toolbarIndex = html.indexOf('/src/v145FourFilterToolbar.ts');
  const policyIndex = html.indexOf('/src/v167PageNavigation.ts');
  assert.ok(toolbarIndex >= 0, 'v145 toolbar script must remain loaded');
  assert.ok(policyIndex > toolbarIndex, 'v167 page policy must load after v145 so it owns button navigation');
});

test('all four home filter buttons are redirected to an in-flow page', () => {
  assert.match(policy, /type FilterKey = 'category' \| 'time' \| 'popular' \| 'advanced'/);
  assert.match(policy, /\.v145-filter-button\[data-v145-button\]/);
  assert.match(policy, /event\.preventDefault\(\)/);
  assert.match(policy, /event\.stopPropagation\(\)/);
  assert.match(policy, /openFilterPage\(key\)/);
  assert.match(policy, /\.v167-filter-page\s*\{[\s\S]*position: static/);
  assert.match(policy, /min-height: 70dvh/);
  assert.match(policy, /請選擇一個條件，完成後會回到首頁播放清單。/);
});

test('filter page preserves every existing selection action', () => {
  for (const label of ['最新上架', '最早上架', '評價最高', '按讚最多', '心得最多', '收藏人數']) {
    assert.ok(policy.includes(label), `missing filter page option: ${label}`);
  }
  assert.match(policy, /menuOptions\('category'\)/);
  assert.match(policy, /menuOptions\('advanced'\)/);
  assert.match(policy, /clickToolbarBypass/);
  assert.match(policy, /chooseCycleOption/);
});

test('audio edit portal is converted into a real document-flow page and background upload UI is disabled', () => {
  assert.match(policy, /echostars-v167-audio-editor-page/);
  assert.match(policy, /\.v161-track-editor-overlay\[data-v167-page="audio-editor"\][\s\S]*position: static !important/);
  assert.match(policy, /#root main \{ display: none !important; \}/);
  assert.match(policy, /#root \.upload-modal-overlay\.upload-page \{ display: none !important; \}/);
  assert.match(policy, /editor\.dataset\.v167Page = 'audio-editor'/);
  assert.match(policy, /aria-label', '編輯音檔頁面'/);
});
