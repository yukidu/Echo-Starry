import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

// A02: deterministic, isolated in-memory SYNTHETIC reference model; NOT real API/DB/SW/Cloudflare load.
const MEMBER_COUNT=2000, DAYS=30, K=5;
type Event={id:number; member:number; day:number; app:'echo'|'download'; kind:'accepted'|'completed'};
function fixture():Event[]{
 const result:Event[]=[];
 for(let day=0;day<DAYS;day++)for(let member=0;member<MEMBER_COUNT;member++){
  const id=day*MEMBER_COUNT+member;
  result.push({id,member,day,app:member%2===0?'echo':'download',kind:'accepted'});
  if(member%2===0)result.push({id:id+MEMBER_COUNT*DAYS,member,day,app:'echo',kind:'completed'});
 }
 return result;
}
const data=fixture();
function stats(app:'echo'|'download',from=0,to=DAYS){
 const unique=new Set<number>(), people=new Set<number>();
 let accepted=0,completed=0;
 for(const e of data){
  if(e.app!==app||e.day<from||e.day>=to||unique.has(e.id))continue;
  unique.add(e.id);
  if(e.kind==='accepted'){accepted++;people.add(e.member)}else completed++;
 }
 return {accepted,completed,distinct:people.size};
}
type Gate={actor:'central'|'member'|'app-admin';action:'read'|'export';app:'echo'|'download';grants:string[];revoked?:boolean;staleCache?:boolean;unknown?:boolean;scopeValid?:boolean};
function authorize(g:Gate){
 return g.actor==='central'&&g.app==='echo'&&g.grants.includes(g.action==='read'?'stats.private.read':'stats.report.export')&&!g.revoked&&!g.staleCache&&!g.unknown&&g.scopeValid!==false;
}
function quota(used:number,limit:number|null){return limit===null?'UNKNOWN':used>=limit?'STOP_100':used>=.8*limit?'WARN_80':'OK'}
const grant:Gate={actor:'central',action:'read',app:'echo',grants:['stats.private.read']};
test('A02 fixture: exactly 2,000 synthetic identities, 30 days, 90,000 events',()=>{
 assert.equal(new Set(data.map(e=>e.member)).size,2000);
 assert.equal(data.length,90000);
 assert.equal(new Set(data.map(e=>e.day)).size,30);
});
test('A02 per-app isolation and 30-day distinct members',()=>{
 assert.deepEqual(stats('echo'),{accepted:30000,completed:30000,distinct:1000});
 assert.deepEqual(stats('download'),{accepted:30000,completed:0,distinct:1000});
});
test('A02 cross-day distinct does not sum daily distinct',()=>{
 assert.equal(stats('echo',0,1).distinct,1000);
 assert.equal(stats('echo',1,2).distinct,1000);
 assert.equal(stats('echo',0,2).distinct,1000);
});
test('A02 read and export grants are independent',()=>{
 assert.equal(authorize(grant),true);
 assert.equal(authorize({...grant,action:'export'}),false);
 assert.equal(authorize({...grant,action:'export',grants:['stats.report.export']}),true);
 assert.equal(authorize({...grant,grants:['stats.report.export']}),false);
});
test('A02 cross-app and local admin denied before simulated private read',()=>{
 for(const mutation of [{app:'download' as const},{actor:'app-admin' as const},{actor:'member' as const}]){
  let reads=0;const allowed=authorize({...grant,...mutation});
  if(allowed)reads++;
  assert.equal(allowed,false);assert.equal(reads,0);
 }
});
test('A02 revocation at first byte and each synthetic chunk fails closed',()=>{
 for(let chunk=0;chunk<8;chunk++){
  const allowed=authorize({...grant,action:'export',grants:['stats.report.export'],revoked:chunk>=3});
  assert.equal(allowed,chunk<3);
 }
 // Already transmitted chunks cannot be recalled. No new chunks after revocation.
});
test('A02 stale cache and authority UNKNOWN fail closed',()=>{
 assert.equal(authorize({...grant,staleCache:true}),false);
 assert.equal(authorize({...grant,unknown:true}),false);
 assert.equal(authorize({...grant,scopeValid:false}),false);
});
test('A02 small-cell suppression and CSV formula defense candidate',()=>{
 const suppress=(n:number)=>n<K?null:n;
 assert.equal(suppress(1),null);assert.equal(suppress(4),null);assert.equal(suppress(5),5);
 const escapeCsv=(s:string)=>'"'+(/^[=+@\-\t\r]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';
 for(const v of ['=1+1','+cmd','@sum','-2+3','\t=evil'])assert.ok(escapeCsv(v).startsWith('"\''));
});
test('A02 quota 79/80/100 and UNKNOWN boundaries',()=>{
 assert.equal(quota(79,100),'OK');assert.equal(quota(80,100),'WARN_80');
 assert.equal(quota(100,100),'STOP_100');assert.equal(quota(101,100),'STOP_100');
 assert.equal(quota(0,null),'UNKNOWN');
});
test('A02 deterministic sequential burst workload 20/100/500 queries; NOT concurrency',()=>{
 for(const burst of [20,100,500]){
  const start=performance.now();let total=0;
  for(let i=0;i<burst;i++)total+=stats(i%2===0?'echo':'download').accepted;
  const elapsedMs=performance.now()-start;
  assert.equal(total,burst*30000);assert.ok(Number.isFinite(elapsedMs));
  // Intentionally no absolute latency assertion: CI host speed is not production evidence.
 }
});
