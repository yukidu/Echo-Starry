import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const upload=read('src/components/UploadModal.tsx');
const list=read('src/components/AudioTrackList.tsx');
const workspace=read('src/components/AudioWorkspacePage.tsx');
const css=read('src/audioWorkspace.css');
const index=read('index.html');
test('one upload form owns a single save button and keeps date server-generated',()=>{
 assert.match(upload,/todayUploadDate/);
 assert.doesNotMatch(upload,/今天上傳日期 \(系統自動產生，不可修改\)/);
 assert.match(upload,/form="track-upload-form" type="submit"/);
 assert.doesNotMatch(upload,/儲存音檔<\/button>/);
});
test('guest visibility and permissions remain controlled by React, not click-injected overlay',()=>{
 assert.match(upload,/setGuestVisible\(true\)/);
 assert.match(upload,/setGuestVisible\(Boolean\(trackToEdit\.guestVisible\)/);
 assert.match(upload,/setAuthorizedOnlyVisible\(checked\)/);
 assert.match(upload,/setGuestVisible\(false\)/);
 assert.match(upload,/setRequiredRank\(next\)/);
 assert.match(upload,/value=\{requiredRank\}/);
 assert.match(upload,/value=\{stickerUnlockCost\}/);
});
test('cover and permission presentation stays in CSS; no duplicate management injection',()=>{
 assert.match(css,/data-upload-cover-label/);
 assert.match(css,/margin-bottom: -0\.5rem/);
 assert.match(css,/data-upload-cover-selected/);
 assert.match(css,/mobile-menu-shell/);
 assert.match(workspace,/AudioTrackList/);
 assert.doesNotMatch(workspace,/createPortal|createRoot|MutationObserver/);
 assert.doesNotMatch(index,/v138UploadAdminRework\.tsx/);
 assert.doesNotMatch(index,/v161AudioManagementNavigation\.tsx/);
 assert.match(list,/await fetch|fetch\('\/api\/tracks'/);
});
