import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const polish = readFileSync(new URL('../src/v156FastUiPolish.ts', import.meta.url), 'utf8');
const playlist = readFileSync(new URL('../src/homePlaylistPolicy.ts', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v156 makes all four home filter buttons shorter with the 召喚繁星 font size and removes advanced icon', () => {
  assert.match(polish, /\.v145-filter-button[\s\S]*height: 40px !important/);
  assert.match(polish, /font-size: \.875rem !important/);
  assert.match(polish, /\.v145-filter-sliders \{ display: none !important; \}/);
  assert.match(polish, /removeAdvancedFilterIcon/);
});

test('v156 lucky draw focuses the first card rather than the second', () => {
  assert.match(playlist, /next\.unshift\(targetId\)/);
  assert.match(polish, /\.audio-card-grid\.lucky-spin-active > \.lucky-card:first-child/);
  assert.match(polish, /\.lucky-card:nth-child\(2\)[\s\S]*animation: none/);
});

test('v156 guest new-comment placeholder uses the requested wording', () => {
  assert.match(polish, /textarea\.placeholder = '按此分享你的心得收穫'/);
  assert.match(polish, /if \(currentUserKey\(\)\) return/);
});

test('v156 gives 我的收藏 its own pin and optional top shortcut without a broad MutationObserver', () => {
  assert.match(polish, /data-v156-favorites-pin/);
  assert.match(polish, /data-v156-favorites-top/);
  assert.match(polish, /navbar-inline-pin/);
  assert.match(polish, /顯示在置頂主選單/);
  assert.doesNotMatch(polish, /new MutationObserver/);
});

test('v156 polish loads after the existing navbar/home layers', () => {
  const v147 = indexHtml.indexOf('/src/v147NavbarOverlayFix.ts');
  const v156 = indexHtml.indexOf('/src/v156FastUiPolish.ts');
  assert.ok(v147 >= 0 && v156 > v147);
});
