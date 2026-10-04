import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = readFileSync(new URL('../src/uploadModalPresentationPolicy.ts', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('upload modal top controls use cover, audio, permission, VIP order', () => {
  assert.match(policy, /grid-template-columns: repeat\(8/);
  assert.match(policy, /data-upload-cover-label/);
  assert.match(policy, /grid-column: 1 \/ 3/);
  assert.match(policy, /data-upload-audio/);
  assert.match(policy, /grid-column: 3 \/ 5/);
  assert.match(policy, /data-upload-permission/);
  assert.match(policy, /grid-column: 5 \/ 7/);
  assert.match(policy, /data-upload-vip/);
  assert.match(policy, /grid-column: 7 \/ 9/);
});

test('mobile upload controls preserve cover, audio, permission, VIP sequence', () => {
  assert.match(policy, /data-upload-cover-label[^}]*[\s\S]*grid-row: 2/);
  assert.match(policy, /data-upload-cover-selected[^}]*[\s\S]*grid-row: 3/);
  assert.match(policy, /data-upload-audio[^}]*[\s\S]*grid-row: 4/);
  assert.match(policy, /data-upload-permission[^}]*[\s\S]*grid-row: 5/);
  assert.match(policy, /data-upload-vip[^}]*[\s\S]*grid-row: 6/);
});

test('R2 cover library stays React-owned and presentation policy never rewrites its text', () => {
  assert.doesNotMatch(policy, /fitCoverLibraryNames/);
  assert.match(policy, /Do not mutate its React-owned child text\/content/);
  assert.doesNotMatch(policy, /點照片可快速套用[\s\S]{0,180}textContent/);
  assert.equal(policy.includes('正在讀取 R2 cover/ 圖庫…'), false);
  assert.doesNotMatch(policy, /button\[title\^="使用 "\] span:last-child[^}]*text-overflow:\s*ellipsis/);
});

test('keyword input filters related database candidates and add button is compact', () => {
  assert.match(policy, /updateKeywordCandidates/);
  assert.match(policy, /text\.includes\(query\)/);
  assert.match(policy, /text\.startsWith\(query\)/);
  assert.match(policy, /input\.placeholder = '輸入或搜尋關鍵字'/);
  assert.match(policy, /button\.textContent = '加入'/);
  assert.match(policy, /white-space: nowrap !important/);
});

test('keyword presentation keeps plain words without check, hash and plus prefixes', () => {
  assert.match(policy, /replace\(\/\^#\\s\*\//);
  assert.match(policy, /replace\(\/\^\[✓\+\]\\s\*#/);
});

test('new uploads clear speech date and series order defaults without affecting edits', () => {
  assert.match(policy, /heading !== '上傳音檔'/);
  assert.match(policy, /label\.startsWith\('演講日期'\) \|\| label\.startsWith\('系列順序'\)/);
  assert.match(policy, /setReactInputValue\(input, ''\)/);
  assert.match(policy, /uploadDefaultsCleared/);
});

test('non VIP explanatory notes are hidden while VIP copy is exempt', () => {
  assert.match(policy, /if \(element\.closest\('\[data-upload-vip="1"\]'\)\) return/);
  assert.match(policy, /data-upload-note-hidden/);
  assert.match(policy, /支援 MP3、M4A/);
  assert.match(policy, /點擊標籤選取；/);
  assert.match(policy, /每首音檔最多 20 組關鍵字/);
});

test('presentation policy is loaded before the React bootstrap', () => {
  const policyIndex = indexHtml.indexOf('/src/uploadModalPresentationPolicy.ts');
  const bootstrapIndex = indexHtml.indexOf('/src/categoryIntegrityBootstrap.ts');
  assert.ok(policyIndex >= 0);
  assert.ok(bootstrapIndex >= 0);
  assert.ok(policyIndex < bootstrapIndex);
});
