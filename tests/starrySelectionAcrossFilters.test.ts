import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderStarryIdMemberCenterPage } from '../worker/starryIdMemberCenterPage';
import { memberDirectoryFilter } from '../worker/starryMemberDirectoryFilter';
import { listFilteredMemberIds } from '../worker/starryIdCentralRouter';
import { parseBulkSelection } from '../worker/starryAppAccessBulk';

const file=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const page=file('worker/starryIdMemberCenterPage.ts');
const router=file('worker/starryIdCentralRouter.ts');
const bulk=file('worker/starryAppAccessBulk.ts');

/** Execute the actual embedded client-side selection merger, not a test copy. */
async function selectionMerger() {
  const html=await renderStarryIdMemberCenterPage('123.apps.googleusercontent.com').text();
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(()=>new Function(script));
  const from=script.indexOf('    function mergeMemberSelection(');
  const to=script.indexOf('    async function toggleCurrentFilterSelection(',from);
  assert.ok(from>=0 && to>from);
  const make=new Function('state','MAX_SELECTED_MEMBERS',script.slice(from,to)+'; return mergeMemberSelection;');
  const state={selectedIds:new Set<string>()};
  const merge=make(state,5000) as (ids:string[],select:boolean)=>void;
  return {state,merge};
}

test('Previously checked members persist across search and rank changes, with no duplicates',async()=>{
  const {state,merge}=await selectionMerger();
  merge(['platinum-1','platinum-2','platinum-3'],true);
  merge(['diamond-1','diamond-2','platinum-2'],true);
  assert.deepEqual([...state.selectedIds].sort(),['diamond-1','diamond-2','platinum-1','platinum-2','platinum-3']);
  merge(['diamond-2'],false);
  assert.deepEqual([...state.selectedIds].sort(),['diamond-1','platinum-1','platinum-2','platinum-3']);
  // A new filter search never invokes the global clear routine.
  assert.doesNotMatch(page,/memberFilterPending=true;resetMemberSelection\(\)/);
  const listStart=page.indexOf('async function resetMemberList()');
  const listEnd=page.indexOf("    $('memberLoadMore')",listStart);
  assert.doesNotMatch(page.slice(listStart,listEnd),/resetMemberSelection\(\)/);
  assert.match(page,/累積已選/);
  assert.match(page,/scope:'manual',userIds:\[\.\.\.state\.selectedIds\]/);
});

test('Select-all merges even members outside visible pages, and rejects more than 5000',async()=>{
  const {state,merge}=await selectionMerger();
  merge(['first-filter-person'],true);
  const all=Array.from({length:2000},(_,i)=>'member-'+String(i));
  merge(all,true);
  assert.equal(state.selectedIds.size,2001);
  merge(['first-filter-person','member-12'],true);
  assert.equal(state.selectedIds.size,2001);
  assert.throws(()=>merge(Array.from({length:5000},(_,i)=>'another-'+i),true),/5,000/);
  assert.equal(state.selectedIds.size,2001,'over-limit additions are atomic, preserving the old selection');
  assert.match(page,/api\('\/api\/admin\/member-selection|api\(query\)/);
  assert.match(page,/selectionGeneration/);
  assert.match(page,/if\(generation!==state\.selectionGeneration\)return/);
});

test('Central search/rank query is reused by paginated listing, exact selection and bulk preview',()=>{
  assert.deepEqual(memberDirectoryFilter(' 王 ',''),{
    conditions:["(LOWER(COALESCE(p.name,'')) LIKE LOWER(?) OR LOWER(u.primaryEmail) LIKE LOWER(?) OR LOWER(COALESCE(p.amwayId,'')) LIKE LOWER(?))"],
    params:['%王%','%王%','%王%'],
    where:"WHERE (LOWER(COALESCE(p.name,'')) LIKE LOWER(?) OR LOWER(u.primaryEmail) LIKE LOWER(?) OR LOWER(COALESCE(p.amwayId,'')) LIKE LOWER(?))"
  });
  assert.deepEqual(memberDirectoryFilter('','__unapproved__').params,['']);
  assert.deepEqual(memberDirectoryFilter('','白金').params,['白金']);
  assert.match(router,/memberDirectoryFilter\(search, rank\)/);
  assert.match(bulk,/memberDirectoryFilter\(selection\.search\|\|'',selection\.rank\|\|''\)/);
});

test('Exact filtered-ID endpoint includes rows not yet loaded in the browser',async()=>{
  const ids=Array.from({length:2050},(_,i)=>({id:'member-'+i}));
  let queryText='';
  const db={prepare(sql:string){
    queryText=sql;
    return {bind(...params:any[]){
      assert.equal(params.at(-1),5001);
      assert.deepEqual(params.slice(0,-1),['%白%','%白%','%白%','鑽石']);
      return {all:async()=>({results:ids})};
    }};
  }};
  const result=await listFilteredMemberIds(db,'白','鑽石');
  assert.equal(result.count,2050);
  assert.equal(result.ids.length,2050);
  assert.match(queryText,/ORDER BY u\.id LIMIT \?/);
  assert.match(queryText,/JOIN profiles p/);
});

test('Excessively broad snapshots fail safely and admin-only endpoint does not mutate member rights',async()=>{
  const db={prepare(){
    return {bind(){return {all:async()=>({results:Array.from({length:5001},(_,i)=>({id:'u'+i}))})};}};
  }};
  const result=await listFilteredMemberIds(db,'','');
  assert.equal(result.status,413);
  assert.deepEqual(result.ids,[]);
  assert.match(router,/path === '\/api\/admin\/member-selection'/);
  assert.match(router,/if \(!session\.isSuperAdmin\) return json\(request, \{ error: '只有超級管理員可以管理全部會員。' \}, 403\)/);
  assert.doesNotMatch(page,/selectionMode:'filtered'/);
  assert.doesNotMatch(router.slice(router.indexOf('export async function listFilteredMemberIds'),router.indexOf('async function listMemberApprovedRanks')),/UPDATE |INSERT |DELETE /);
  assert.deepEqual(parseBulkSelection({scope:'manual',userIds:['u1','u2','u3']}),
    {scope:'manual',userIds:['u1','u2','u3']});
});

test('Select-all always excludes the virtual guest principal and preserves existing checked members',async()=>{
  const {state,merge}=await selectionMerger();
  merge(['real-member-1','real-member-2'],true);
  assert.throws(()=>merge(['real-member-3','starry:guest'],true),/非會員身分/);
  assert.deepEqual([...state.selectedIds].sort(),['real-member-1','real-member-2']);
  assert.throws(()=>parseBulkSelection({scope:'manual',userIds:['u1','starry:guest']}),/會員選取資料不正確/);
  assert.throws(()=>parseBulkSelection({scope:'filtered',search:'',rank:'',excludedIds:['starry:guest']}),/全選排除清單不正確/);
  assert.match(page,/全選目前篩選的真正會員（不含訪客）/);
  assert.ok(page.indexOf('id="guestAccessEntry"')<page.indexOf('id="members"'));
  assert.match(page,/GUEST_PRINCIPAL_ID='starry:guest'/);
  assert.match(bulk,/GUEST_PRINCIPAL_ID/);
  assert.match(bulk,/FROM users u/);
});

test('Logout and explicit clear discard previously selected members',()=>{
  assert.match(page,/function showLoggedOut\(\)\{ resetMemberSelection\(\)/);
  assert.match(page,/memberClearSelection'\)\.addEventListener\('click',resetMemberSelection\)/);
  assert.match(page,/\+\+state\.selectionGeneration/);
});
