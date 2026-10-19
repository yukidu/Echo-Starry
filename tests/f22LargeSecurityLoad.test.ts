import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
 F22_MAX_CLAIMS,F22_MAX_D1_ROWS_READ,F22CapacityError,f22CentralSuperAdmin,
 f22Preflight,f22Statistics,f22CountSql,f22LoadTestQueries
} from '../worker/f22SpeakerUsageStatistics';

const source=readFileSync(new URL('../worker/f22SpeakerUsageStatistics.ts',import.meta.url),'utf8');
const token='f'.repeat(40);
const request=new Request('https://echo.starry.phd/api/admin/ai-speaker-usage',{
 headers:{Cookie:'echostars_session='+token}
});
const echoUser={id:'echo-user-11',email:'a@example.com',role:'超級管理員',isBlocked:0,
 expiresAt:Date.now()+60000};
const centralAdmin={
 id:'central-user-22',status:'active',centralStatus:'active',centralRole:'super-admin'
};
function mockedIdentity(row:Record<string,unknown>|null=centralAdmin,settings:{
 echoUser?:Record<string,unknown>;link?:string|null;errors?:boolean
}={}){
 const reads:string[]=[];
 const DB={prepare:(sql:string)=>{
   reads.push(sql);
   assert.match(sql,/auth_sessions/);
   return{bind:()=>({first:async()=>settings.echoUser||echoUser})};
 }};
 const STARRY_ID_DB={prepare:(sql:string)=>{
   reads.push(sql);
   if(settings.errors)throw Error('central DB unavailable');
   if(sql.includes('FROM legacy_links')){
     return{bind:()=>({first:async()=>settings.link===null?null:{userId:settings.link||centralAdmin.id}})};
   }
   assert.match(sql,/central\.appId='starry-id'/);
   assert.match(sql,/u\.id=\?/);
   assert.match(sql,/lower\(trim\(u\.primaryEmail\)\)=lower\(trim\(\?\)\)/);
   return{bind:(...values:unknown[])=>{
     assert.equal(values[0],settings.link===null?echoUser.id:settings.link||centralAdmin.id);
     assert.equal(values[1],echoUser.email);
     return{first:async()=>row};
   }};
 }};
 return {DB,STARRY_ID_DB,reads};
}
test('central-admin ACL: live central super-admin membership is mandatory',async()=>{
 assert.equal(await f22CentralSuperAdmin(request,mockedIdentity()),true);
 assert.equal(await f22CentralSuperAdmin(request,mockedIdentity(
   {...centralAdmin,centralRole:'member'})),false,
   'Echo local super-admin must not override ordinary central membership');
 assert.equal(await f22CentralSuperAdmin(request,{
   ...mockedIdentity({...centralAdmin,centralRole:'member'}),
   STARRY_ID_SUPER_ADMIN_EMAILS:echoUser.email
 }),false,'Configured email allowlist is never an admin grant');
 assert.equal(await f22CentralSuperAdmin(request,mockedIdentity(
   {...centralAdmin,centralStatus:'blocked'})),false);
 assert.equal(await f22CentralSuperAdmin(request,mockedIdentity(
   {...centralAdmin,status:'blocked'})),false);
 assert.equal(await f22CentralSuperAdmin(request,mockedIdentity(
   {...centralAdmin,centralRole:null})),false);
 assert.equal(await f22CentralSuperAdmin(request,mockedIdentity(null)),false);
 assert.equal(await f22CentralSuperAdmin(request,mockedIdentity(centralAdmin,{link:null})),true,
   'Verified identical central user ID remains valid if role is truly central admin');
 assert.equal(await f22CentralSuperAdmin(request,mockedIdentity(centralAdmin,{
   echoUser:{...echoUser,isBlocked:1}
 })),false,'Blocked Echo session must be refused before checking central');
 assert.equal(await f22CentralSuperAdmin(request,{}),false);
 assert.doesNotMatch(source,/yukidu@gmail.com|allow\.has\(|STARRY_ID_SUPER_ADMIN_EMAILS/);
 assert.match(source,/centralRole==='super-admin'/);
});
test('central database failure is fail-closed, never uses Echo role fallback',async()=>{
 await assert.rejects(f22CentralSuperAdmin(request,mockedIdentity(centralAdmin,{errors:true})));
});
test('bounded preflight stops unbounded history BEFORE expensive summaries',async()=>{
 const w={start:0,end:99,startDay:'1970-01-01',endDay:'2026-10-20'};
 const queries:string[]=[];
 const DB={prepare:(sql:string)=>{
   queries.push(sql);
   return{bind:(...params:unknown[])=>{
     assert.equal(params[4],F22_MAX_CLAIMS+1);
     return{all:async()=>({results:[{n:F22_MAX_CLAIMS+1}],meta:{rows_read:F22_MAX_CLAIMS+1}})};
   }};
 }};
 await assert.rejects(f22Preflight(DB,w),e=>e instanceof F22CapacityError&&e.code==='statistics_requires_rollup');
 assert.equal(queries.length,1);
 assert.match(queries[0],/INDEXED BY qa_claims_day/);
 assert.match(queries[0],/LIMIT \?/);
 const dbTooMuch={prepare:()=>({bind:()=>({all:async()=>({
   results:[{n:123}],meta:{rows_read:F22_MAX_D1_ROWS_READ+1}
 })})})};
 await assert.rejects(f22Preflight(dbTooMuch,w),e=>e instanceof F22CapacityError&&e.code==='statistics_read_budget_exceeded');
});
test('event cap denies all-period expensive scan rather than silently truncating rankings',async()=>{
 const requested:string[]=[];
 const DB={prepare:(sql:string)=>{
  requested.push(sql);
  if(!sql.includes('SELECT COUNT(*) AS n FROM ('))throw Error('Unbounded aggregation executed!');
  return{bind:()=>({all:async()=>({results:[{n:F22_MAX_CLAIMS+1}],meta:{rows_read:F22_MAX_CLAIMS+1}})})};
 }};
 await assert.rejects(f22Statistics({DB},'all','speaker','calls'),
    e=>e instanceof F22CapacityError&&e.code==='statistics_requires_rollup');
 assert.equal(requested.length,1);
});
test('2,000 synthetic members and 60,000 events: SQLite indexed load/latency test',()=>{
 const input={
   limit:F22_MAX_CLAIMS,
   queries:{
     ...f22LoadTestQueries('track','calls'),
     tracks:f22LoadTestQueries('track','calls').ranking,
     speakers:f22LoadTestQueries('speaker','calls').ranking
   }
 };
 const proc=spawnSync('python3',[fileURLToPath(new URL('./f22-sqlite-load.py',import.meta.url))],{
   input:JSON.stringify(input),encoding:'utf8',timeout:45000,maxBuffer:2*1024*1024
 });
 assert.equal(proc.status,0,(proc.stderr||'')+'\n'+(proc.stdout||''));
 const out=JSON.parse(proc.stdout);
 assert.equal(out.ok,true);
 assert.equal(out.runs[0].isolatedRows,60000);
 assert.equal(out.runs[0].guardCount,F22_MAX_CLAIMS+1);
 assert.equal(out.runs[0].aggregateQueriesExecuted,0,'large DB must never execute LAG');
 assert.ok(out.runs[0].sqliteVMInstructionsApprox<2_000_000);
 assert.equal(out.runs[1].isolatedRows,4200);
 assert.equal(out.runs[1].aggregateQueriesExecuted,4);
 assert.ok(out.runs.every((r:any)=>r.indexUsed&&r.guardElapsedMs<10000));
 console.log('F22 synthetic SQLite perf evidence:',JSON.stringify(out));
});
