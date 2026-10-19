import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const polish=read('src/v139HomeUploadPolish.ts'),workspace=read('src/components/AudioWorkspacePage.tsx');
const css=read('src/audioWorkspace.css'),density=read('src/homeDensityPolicy.ts');
const leaderboard=read('src/components/StickerLeaderboardTab.tsx'),privacyRouter=read('worker/privacyCrawlerRouter.ts'),html=read('index.html');
test('homepage zero-progress and lucky answer behavior remain unchanged',()=>{
 assert.match(polish,/\[已聽0%\]/);
 assert.match(polish,/echostars-v139-guest \.lucky-answer-notice/);
 assert.match(polish,/招喚繁星/);
});
test('selected category remains visibly highlighted on home page',()=>{
 assert.match(polish,/selectedCategoryLabel/);
 assert.match(polish,/data-v139-category-active/);
 assert.match(polish,/#f59e0b/);
});
test('all six audio workspace tabs are owned by React with no injected DOM tab carousel',()=>{
 for(const name of ['上傳音檔','管理音檔','網友音檔','逐字稿','AI問問題','AI演講者'])assert.ok(workspace.includes(name));
 assert.match(workspace,/role="tablist"/);
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.doesNotMatch(polish,/syncUploadTabs|data-v139-upload-tab|createElement\('button'\)/);
 assert.doesNotMatch(html,/v138UploadAdminRework/);
});
test('retired display settings and leaderboard behavior are preserved',()=>{
 assert.doesNotMatch(density,/display-settings|顯示設定|echostars-display-settings/);
 assert.match(privacyRouter,/ORDER BY spentUnits DESC, earnedUnits DESC, u\.name ASC/);
 assert.match(privacyRouter,/url\.pathname === '\/api\/stickers\/leaderboard'/);
 assert.match(leaderboard,/rankedEntries/);
 assert.match(leaderboard,/Number\(b\.spent \|\| 0\) - Number\(a\.spent \|\| 0\)/);
 assert.match(leaderboard,/累積已消費貼紙數由高至低排序/);
});
test('home-only script remains after UI and no hidden management scripts load',()=>{
 assert.ok(html.includes('/src/v139HomeUploadPolish.ts'));
 assert.doesNotMatch(html,/v161AudioManagementKick/);
});
