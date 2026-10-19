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

test('React owns the new upload speech-date and series defaults without altering edit records', () => {
  const form = readFileSync(new URL('../src/components/UploadModal.tsx',import.meta.url),'utf8');
  assert.match(form,/setSpeechDate\(''\)/);
  assert.match(form,/setSeriesOrder\(''\)/);
  assert.match(form,/setSpeechDate\(trackToEdit\.speechDate/);
  assert.match(form,/setSeriesOrder\(trackToEdit\.seriesOrder/);
  assert.doesNotMatch(policy,/setReactInputValue|clearNewUploadDefaults/);
});

test('non VIP explanatory notes are hidden while VIP copy is exempt', () => {
  assert.match(policy, /if \(element\.closest\('\[data-upload-vip="1"\]'\)\) return/);
  assert.match(policy, /data-upload-note-hidden/);
  assert.match(policy, /支援 MP3、M4A/);
  assert.match(policy, /點擊標籤選取；/);
  assert.match(policy, /每首音檔最多 20 組關鍵字/);
});

test('presentation policy is owned by the React form rather than a document-wide watcher',()=>{
  const form=readFileSync(new URL('../src/components/UploadModal.tsx',import.meta.url),'utf8');
  assert.match(form,/prepareAudioFormPresentation\(formElementRef\.current\)/);
  assert.match(policy,/export function prepareAudioFormPresentation/);
  assert.doesNotMatch(indexHtml,/script type="module" src="\/src\/uploadModalPresentationPolicy\.ts"/);
  assert.doesNotMatch(policy,/new MutationObserver/);
});
