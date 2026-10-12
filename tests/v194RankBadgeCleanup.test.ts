import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../src/v194RankBadgeCleanup.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/v194RankBadgeCleanup.css', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/v194ReleaseNote.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v194 removes all visible rank-badge star effects', () => {
  assert.match(css, /\.v190-rank-badge-sparkle\s*\{[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /\.v190-rank-badge-motion::before,[\s\S]*\.v190-rank-badge-motion::after[\s\S]*content:\s*none\s*!important/);
  assert.doesNotMatch(css, /radial-gradient|orbit|rotate\(/i);
});

test('v194 removes legacy homepage badge nodes instead of creating new ones', () => {
  assert.match(script, /data-v193-home-rank-badge/);
  assert.match(script, /node\.remove\(\)/);
  assert.doesNotMatch(script, /createElement\(['"]img['"]\)|appendChild\(image\)/);
});

test('v194 keeps the detail badge position and exact-filter feature outside cleanup scope', () => {
  const v193css = readFileSync(new URL('../src/v193RankBadgeVisual.css', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(v193css, /top:\s*\.35rem\s*!important/);
  assert.match(v193css, /left:\s*calc\(100% \+ \.25rem\)\s*!important/);
  assert.match(app, /setSelectedBadgeSpeakerRank\(rank\)/);
});

test('v194 changelog records homepage badge and sparkle removal without a replacement orbit effect', () => {
  assert.match(release, /移除首頁播放清單封面右上角的小型獎章/);
  assert.match(release, /移除詳細頁獎章周圍的全部星星閃耀效果/);
  assert.match(release, /不新增其他環繞動畫/);
  assert.match(index, /v194ReleaseNote\.ts/);
  assert.match(index, /v194RankBadgeCleanup\.ts/);
});
