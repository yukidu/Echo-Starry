import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('src/App.tsx'),workspace=read('src/components/AudioWorkspacePage.tsx'),upload=read('src/components/UploadModal.tsx'),css=read('src/index.css');
test('six sibling tabs are visible on mobile; AI問問題 is top-level super-admin tab',()=>{
 assert.match(workspace,/\{id:'ai-question',name:'AI問問題'/);
 assert.match(workspace,/\{id:'transcript',name:'逐字稿'/);
 assert.match(workspace,/\{id:'speaker',name:'AI演講者'/);
 assert.match(workspace,/superOnly:true/);
 assert.match(workspace,/active==='ai-question'&&<AiQuestionSettingsAdmin\/>/);
 assert.match(workspace,/aria-selected=\{active===t\.id\}/);
});
test('upload page is in document flow, editor is independent page and only one form mounts',()=>{
 assert.match(app,/<main data-echo-page="audio-management"/);
 assert.match(app,/<AudioWorkspacePage/);
 assert.match(workspace,/editing\?\(/);
 assert.match(workspace,/key=\{'edit-'\+editing\.id\}/);
 assert.match(workspace,/key="audio-upload-create"/);
 assert.match(upload,/presentation\?: 'page' \| 'overlay'/);
 assert.match(upload,/audio-form-document upload-page/);
 assert.match(css,/\.audio-form-document\s*\{/);
 assert.doesNotMatch(css,/upload-modal-overlay\.upload-standalone-page/);
});
test('native mobile Back remains inside the PWA, returning from upload to home',()=>{
 assert.match(app,/tab\?: 'stats' \| 'notifications' \| 'profile' \| 'stickers' \| 'install' \| 'upload'/);
 assert.match(app,/if \(state\.tab === 'upload'\) setIsUploadOpen\(true\)/);
 assert.match(app,/if \(isUploadOpen\) \{\s*nextState=\{echostars:true,view:'tab',tab:'upload'\}/);
 assert.match(app,/window\.history\.back\(\)/);
});
