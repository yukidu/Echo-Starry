import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const cleanup=read('src/v138AdminTabCleanup.ts'),html=read('index.html'),app=read('src/App.tsx');
test('separate central admin keeps moved audio tab hidden and inaccessible',()=>{
 assert.match(cleanup,/while \(candidate\)/);
 assert.match(cleanup,/後台管理中心/);
 assert.match(cleanup,/cleanAdminText\(button\.textContent\) === '音檔'/);
 assert.match(cleanup,/aria-hidden/);
 assert.match(cleanup,/tabIndex = -1/);
});
test('legacy duplicate management is not loaded; central admin stays available',()=>{
 assert.doesNotMatch(html,/v138UploadAdminRework\.tsx/);
 assert.doesNotMatch(html,/v161AudioManagementNavigation\.tsx/);
 assert.match(html,/v138AdminTabCleanup\.ts/);
 assert.match(app,/isAdminOpen/);
});
