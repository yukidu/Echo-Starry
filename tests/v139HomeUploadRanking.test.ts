import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const polish = readFileSync(new URL('../src/v139HomeUploadPolish.ts', import.meta.url), 'utf8');
const density = readFileSync(new URL('../src/homeDensityPolicy.ts', import.meta.url), 'utf8');
const adminCleanup = readFileSync(new URL('../src/v138AdminTabCleanup.ts', import.meta.url), 'utf8');
const leaderboard = readFileSync(new URL('../src/components/StickerLeaderboardTab.tsx', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('guest zero progress and lucky response are hidden while summon label is shortened', () => {
  assert.match(polish, /\[已聽0%\]/);
  assert.match(polish, /echostars-v139-guest \.lucky-answer-notice/);
  assert.match(polish, /招喚繁星/);
});

test('selected category is shown on the category button with a distinct active style', () => {
  assert.match(polish, /selectedCategoryLabel/);
  assert.match(polish, /data-v139-category-active/);
  assert.match(polish, /#f59e0b/);
});

test('upload page has separate upload and management tabs', () => {
  assert.match(polish, /上傳音檔/);
  assert.match(polish, /管理音檔/);
  assert.match(polish, /data-v139-upload-tab/);
  assert.match(polish, /v138-track-management/);
});

test('retired display settings feature no longer injects a tab or calls its API', () => {
  assert.doesNotMatch(density, /display-settings|顯示設定|echostars-display-settings|data-echostars-display-tab/);
  assert.doesNotMatch(adminCleanup, /顯示/);
});

test('sticker leaderboard ranks by spent stickers descending before rendering ranks', () => {
  assert.match(leaderboard, /rankedEntries/);
  assert.match(leaderboard, /Number\(b\.spent \|\| 0\) - Number\(a\.spent \|\| 0\)/);
  assert.match(leaderboard, /累積已消費貼紙數由高至低排序/);
  assert.match(leaderboard, /rankedEntries\.map/);
});

test('v139 policy is loaded after v138 upload integration', () => {
  const v138 = indexHtml.indexOf('/src/v138UploadAdminRework.tsx');
  const v139 = indexHtml.indexOf('/src/v139HomeUploadPolish.ts');
  assert.ok(v138 >= 0);
  assert.ok(v139 > v138);
});
