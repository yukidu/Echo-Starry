import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBulkSelection } from '../worker/starryAppAccessBulk';
import { renderStarryIdMemberCenterPage } from '../worker/starryIdMemberCenterPage';

const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const bulk=read('worker/starryAppAccessBulk.ts');
const router=read('worker/starryIdCentralRouter.ts');
const page=read('worker/starryIdMemberCenterPage.ts');
const access=read('worker/starryAppAccess.ts');

test('Select all is scoped to active rank and search filters and supports exclusions',()=>{
  assert.deepEqual(parseBulkSelection({scope:'filtered',search:' Alice ',rank:'白金',excludedIds:['u-1','u-2']}),
    {scope:'filtered',search:'Alice',rank:'白金',excludedIds:['u-1','u-2']});
  assert.deepEqual(parseBulkSelection({scope:'filtered',search:'',rank:'__unapproved__',excludedIds:[]}),
    {scope:'filtered',search:'',rank:'__unapproved__',excludedIds:[]});
  assert.deepEqual(parseBulkSelection({scope:'manual',userIds:['u-1','u-2']}),
    {scope:'manual',userIds:['u-1','u-2']});
  for(const selection of [
    {scope:'manual',userIds:['u-1','u-1']},
    {scope:'filtered',search:'',rank:'',excludedIds:['u-1','u-1']},
    {scope:'filtered',search:'',rank:'',excludedIds:['invalid|id']},
    {scope:'manual',userIds:[]},
    {scope:'entire-database'},
    {scope:'filtered',search:3,rank:'',excludedIds:[]}
  ])assert.throws(()=>parseBulkSelection(selection));
});

test('Approved rank and center are read from central Starry ID, not app copies',()=>{
  assert.match(router,/p\.rankApproved=1/);
  assert.match(router,/TRIM\(COALESCE\(p\.approvedRank,''\)\)/);
  assert.match(router,/p\.center/);
  assert.match(router,/member-ranks/);
  assert.match(router,/rank = url\.searchParams\.get\('rank'\)/);
  assert.match(router,/hasMore: offset \+ members\.length < total/);
  assert.match(router,/MEMBER_BATCH_SIZE = 80/);
  assert.match(bulk,/memberDirectoryFilter\(selection\.search\|\|'',selection\.rank\|\|''\)/);
});

test('One scrollable compact directory with full filtered selection and no visible paging',async()=>{
  const html=await renderStarryIdMemberCenterPage('123.apps.googleusercontent.com').text();
  assert.match(html,/id="memberRankFilter"/);
  assert.match(html,/id="memberSelectAll"/);
  assert.match(html,/全選目前篩選的真正會員（不含訪客）/);
  assert.match(html,/直銷商中心：/);
  assert.match(html,/IntersectionObserver/);
  assert.match(html,/id="memberLoadMore"/);
  assert.doesNotMatch(html,/id="memberPrev"|id="memberNext"|id="memberPage"/);
  assert.match(page,/selectedIds:new Set\(\)/);
  assert.match(page,/currentFilterIds:null/);
  assert.match(page,/toggleCurrentFilterSelection/);
  const js=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(js);
  assert.doesNotThrow(()=>new Function(js));
});

test('Large operations use server-side selection snapshots with a 5000 member cap',()=>{
  assert.match(bulk,/const MAX_MEMBERS=5000/);
  assert.match(bulk,/const STEP_CHANGES=120/);
  assert.match(bulk,/CROSS JOIN json_each\(\?\) a/);
  assert.match(bulk,/AND COALESCE\(d\.decision,''\) <> json_extract/);
  assert.match(bulk,/starry_app_access_bulk_items/);
  assert.match(bulk,/status='running'/);
  assert.match(bulk,/lockUntil/);
  assert.match(bulk,/confirmationText!=='確認變更'/);
  assert.match(bulk,/undoPreviewAt/);
  assert.match(bulk,/revertedChanges/);
  assert.match(bulk,/SELECT COUNT\(\*\) AS count FROM users/);
  assert.match(access,/handleStarryAppAccessBulk\(request,env,actorUserId,apps\)/);
  assert.doesNotMatch(bulk,/UPDATE users SET|DELETE FROM users|DELETE FROM app_memberships/);
});

test('All permissions must be auditable, resumable, revertible and preview exportable',()=>{
  assert.match(bulk,/bulk\/preview/);
  assert.match(bulk,/bulk\/confirm/);
  assert.match(bulk,/bulk\/step/);
  assert.match(bulk,/bulk\/undo-preview/);
  assert.match(bulk,/bulk\/undo-confirm/);
  assert.match(bulk,/bulk\/details/);
  assert.match(bulk,/bulk\/history/);
  assert.match(page,/繼續執行/);
  assert.match(page,/預覽還原/);
  assert.match(page,/下載完整變更清單（CSV）/);
  assert.match(page,/revertedChanges|progress\.reverted/);
});
