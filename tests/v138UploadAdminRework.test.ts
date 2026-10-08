import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = readFileSync(new URL('../src/v138UploadAdminRework.tsx', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const adminModal = readFileSync(new URL('../src/components/AdminModal.tsx', import.meta.url), 'utf8');
const homeDensity = readFileSync(new URL('../src/homeDensityPolicy.ts', import.meta.url), 'utf8');

test('v138 upload page hides duplicate bottom actions and auto upload date without deleting the data source', () => {
  assert.match(policy, /data-v138-hidden-upload-date/);
  assert.match(policy, /data-v138-hidden-bottom-actions/);
  assert.match(policy, /今天上傳日期/);
  assert.match(policy, /儲存音檔/);
});

test('guest visibility is grouped with permission and follows actual guest-home eligibility', () => {
  assert.match(policy, /data-upload-guest-visibility/);
  assert.match(policy, /data-upload-permission/);
  assert.match(policy, /publicRecording && freeForGuest && notPrivateVip/);
  assert.match(policy, /guestInput\.click\(\)/);
});

test('upload page fixes cover continuity and raises hamburger above upload layer', () => {
  assert.match(policy, /data-upload-cover-label/);
  assert.match(policy, /margin-bottom: -0\.5rem/);
  assert.match(policy, /data-upload-cover-selected/);
  assert.match(policy, /margin-top: -0\.5rem/);
  assert.match(policy, /body\[data-main-tab="upload"\][\s\S]*z-index: 240/);
  assert.match(policy, /mobile-menu-shell[\s\S]*z-index: 260/);
});

test('audio management is available on upload page', () => {
  assert.match(policy, /TrackManagementPanel/);
  assert.match(policy, /原「後台管理 ＞ 音檔」已整合到此頁/);
});

test('hamburger upload label becomes upload and management', () => {
  assert.match(policy, /上傳音檔與管理/);
  assert.match(policy, /renameUploadMenu/);
});

test('retired display settings feature is absent from React admin and home density policy', () => {
  assert.doesNotMatch(adminModal, /setActiveTab\(['"]display['"]\)/);
  assert.doesNotMatch(adminModal, /activeTab\s*===\s*['"]display['"]/);
  assert.doesNotMatch(homeDensity, /display-settings|顯示設定|echostars-display-settings|data-echostars-display-tab/);
});

test('v138 policy loads after existing menu and upload presentation policies', () => {
  const uploadPolicy = indexHtml.indexOf('/src/uploadModalPresentationPolicy.ts');
  const menuPolicy = indexHtml.indexOf('/src/v127MenuIdentityPalette.ts');
  const v138 = indexHtml.indexOf('/src/v138UploadAdminRework.tsx');
  assert.ok(uploadPolicy >= 0 && menuPolicy >= 0 && v138 >= 0);
  assert.ok(v138 > uploadPolicy);
  assert.ok(v138 > menuPolicy);
});
