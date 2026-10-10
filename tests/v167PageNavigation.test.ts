import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = readFileSync('src/v167PageNavigation.ts', 'utf8');
const html = readFileSync('index.html', 'utf8');

test('v167 audio-editor page policy remains loaded after the four-filter toolbar', () => {
  const toolbarIndex = html.indexOf('/src/v145FourFilterToolbar.ts');
  const policyIndex = html.indexOf('/src/v167PageNavigation.ts');
  assert.ok(toolbarIndex >= 0, 'v145 toolbar script must remain loaded');
  assert.ok(policyIndex > toolbarIndex, 'v167 audio-editor page policy must remain loaded after v145');
});

test('v169 leaves home filters to their direct toolbar dropdown/cycle behavior', () => {
  assert.doesNotMatch(policy, /type FilterKey = 'category' \| 'time' \| 'popular' \| 'advanced'/);
  assert.doesNotMatch(policy, /\.v145-filter-button\[data-v145-button\]/);
  assert.doesNotMatch(policy, /event\.preventDefault\(\)/);
  assert.doesNotMatch(policy, /event\.stopPropagation\(\)/);
  assert.doesNotMatch(policy, /openFilterPage\(/);
  assert.doesNotMatch(policy, /\.v167-filter-page\s*\{/);
  assert.doesNotMatch(policy, /min-height: 70dvh/);
  assert.match(policy, /home filters return to[\s\S]*direct toolbar behavior/);
});

test('v167 full-page audio editor remains intact while its background upload UI is disabled', () => {
  assert.match(policy, /echostars-v167-audio-editor-page/);
  assert.match(policy, /\.v161-track-editor-overlay\[data-v167-page="audio-editor"\][\s\S]*position: static !important/);
  assert.match(policy, /#root main \{ display: none !important; \}/);
  assert.match(policy, /#root \.upload-modal-overlay\.upload-page \{ display: none !important; \}/);
  assert.match(policy, /editor\.dataset\.v167Page = 'audio-editor'/);
  assert.match(policy, /aria-label', '編輯音檔頁面'/);
});
