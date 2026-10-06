import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const notes = readFileSync(new URL('../src/changelogReleaseNotes.ts', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v3.9 explains the full-site healthcheck in plain language', () => {
  assert.match(notes, /version:\s*'v3\.9'/);
  assert.match(notes, /全站功能健檢/);
  assert.match(notes, /個人學習紀錄圖卡/);
  assert.match(notes, /沒有分類的音檔就保持沒有分類/);
  assert.match(notes, /正式部署前增加完整自動檢查/);
  assert.match(notes, /移除多個已過期、只綁定舊 PWA 快取版本號的回歸測試/);
});

test('v3.8 cumulative changelog remains available for recent user-facing releases', () => {
  assert.match(notes, /version:\s*'v3\.8'/);
  assert.match(notes, /跨平台系統媒體控制/);
  assert.match(notes, /分享頁登入恢復/);
  assert.match(notes, /會員學習進度整合/);
  assert.match(notes, /分類標籤改以後台管理中心為唯一管理入口/);
  assert.match(notes, /搜尋引擎與 AI 爬蟲防護/);
  assert.match(notes, /全站主選單改為固定置頂/);
});

test('changelog release patch merges both maintained releases and only intercepts GET changelog requests', () => {
  assert.match(notes, /RELEASE_NOTES = \[STICKER_GUIDE_RELEASE_NOTES, ORGANIZATION_RELEASE_NOTES, RANK_STICKER_RELEASE_NOTES, STICKER_PAGES_RELEASE_NOTES, HEALTHCHECK_RELEASE_NOTES, CUMULATIVE_RELEASE_NOTES\]/);
  assert.match(notes, /method !== 'GET'/);
  assert.match(notes, /url\.pathname === '\/api\/changelog'/);
  assert.match(notes, /return nativeFetch\(\.\.\.args\)/);
});

test('release notes patch loads before the other runtime policies', () => {
  const notesIndex = indexHtml.indexOf('/src/changelogReleaseNotes.ts');
  const firstExistingPolicy = indexHtml.indexOf('/src/jpegExportPolicy.ts');
  assert.ok(notesIndex >= 0);
  assert.ok(firstExistingPolicy > notesIndex);
});
