import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const workspace=read('src/components/AudioWorkspacePage.tsx'),app=read('src/App.tsx'),html=read('index.html');
test('audio editor is a standalone sibling document, without overlay and conflicting global page CSS',()=>{
 assert.match(workspace,/data-audio-workspace-page="editor"/);
 assert.match(workspace,/setEditing\(track\)/);
 assert.match(workspace,/editBack/);
 assert.match(workspace,/onDirtyChange=\{setDirty\}/);
 assert.doesNotMatch(workspace,/createPortal|position:fixed|v161-track-editor-overlay/);
 assert.doesNotMatch(html,/v167PageNavigation\.ts|v168AudioEditSaveFix\.ts/);
});
test('home navigation remains React-based with one audio workspace entry',()=>{
 assert.match(app,/data-echo-page="audio-management"/);
 assert.match(app,/<AudioWorkspacePage/);
 assert.match(app,/window\.history\.back\(\)/);
 assert.doesNotMatch(app,/<UploadModal/);
});
test('back and accidental close protect unsaved edits; returns to management',()=>{
 assert.match(workspace,/popstate/);
 assert.match(workspace,/beforeunload/);
 assert.match(workspace,/尚未儲存/);
 assert.match(workspace,/setActive\('manage'\)/);
 assert.match(workspace,/history\.pushState/);
});
