import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const admin=read('src/components/AdminModal.tsx'),index=read('index.html');
const nav=read('src/components/Navbar.tsx'),workspace=read('src/components/AudioWorkspacePage.tsx');
test('audio management has a single dedicated React page, with no hidden admin duplicate',()=>{
 assert.doesNotMatch(admin,/setActiveTab\('tracks'\)/);
 assert.doesNotMatch(admin,/activeTab === 'tracks'/);
 assert.match(workspace,/音檔管理/);
 assert.match(nav,/音檔管理/);
});
test('obsolete admin-audio DOM injection cleanup is no longer loaded',()=>{
 assert.doesNotMatch(index,/v138AdminTabCleanup\.ts/);
 assert.doesNotMatch(index,/v138UploadAdminRework\.tsx/);
 assert.doesNotMatch(index,/v161AudioManagementNavigation\.tsx/);
});
