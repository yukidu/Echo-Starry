import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const v139=read('src/v139HomeUploadPolish.ts');
const v161=read('src/v161AudioManagementNavigation.tsx');
const app=read('src/App.tsx');
const upload=read('src/components/UploadModal.tsx');
const css=read('src/index.css');

test('mobile audio workspace exposes QA as a top-level super-admin tab',()=>{
  assert.match(v139,/type UploadWorkspaceTab = 'upload' \| 'manage' \| 'community' \| 'qa'/);
  assert.match(v139,/addTab\('qa', '🤖 逐字稿'\)/);
  assert.match(v139,/tab === 'qa' \? '逐字稿'/);
  assert.match(v139,/allowedTab === 'qa' \? '逐字稿管理'/);
  assert.match(v139,/requested === 'qa'/);
  assert.match(v139,/data-v139-upload-tab="qa"\] #track-upload-form/);
  assert.match(v161,/mode === 'qa' && <TranscriptQaAdmin \/>/);
});
test('management workspace is in main document flow, not a fixed modal',()=>{
  assert.match(app,/<main data-echo-page="audio-management"/);
  assert.match(app,/<UploadModal[\s\S]*?presentation="page"/);
  assert.match(upload,/presentation\?: 'page' \| 'overlay'/);
  assert.match(upload,/presentation === 'page' \? 'upload-standalone-page'/);
  assert.match(css,/main\[data-echo-page="audio-management"\] \.upload-modal-overlay\.upload-standalone-page/);
  assert.match(css,/position: static !important/);
  assert.match(css,/backdrop-filter: none !important/);
  assert.match(css,/\.v161-track-list \{[\s\S]*?max-height: none/);
  assert.match(v161,/v161-track-editor-overlay \{ position:fixed/);
});
test('mobile back key navigates home from upload without closing the app',()=>{
  assert.match(app,/tab\?: 'stats' \| 'notifications' \| 'profile' \| 'stickers' \| 'install' \| 'upload'/);
  assert.match(app,/if \(state\.tab === 'upload'\) setIsUploadOpen\(true\)/);
  assert.match(app,/if \(isUploadOpen\) \{\s*nextState=\{echostars:true,view:'tab',tab:'upload'\}/);
  assert.match(app,/window\.history\.back\(\)/);
});
