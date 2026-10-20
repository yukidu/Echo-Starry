import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {applyFakeBatch,guardUsage,statsFake,readPrivateFake,windowDays,MAX_BATCH,PREDICTED_READS,PREDICTED_WRITES} from '../f22-s2/rollup.ts';
// Isolated S2367A acceptance: synthetic data only. Four negative proofs are
// intentionally PASS when a remaining integration blocker is reproduced.
const NOW=Date.parse('2026-10-21T12:00:00Z'),DAY=86400000;
const id=(s:string)=>createHash('sha256').update('S2367A INDEPENDENT '+s).digest('hex');
const usage=(r=0,w=0,t=NOW)=>({rowsRead:r,rowsWritten:w,observedAtMs:t});
const event=(i:number,patch:Record<string,unknown>={})=>({
 eventKey:id('e'+i),sourceVersion:1,payloadHash:id('p'+i),memberKey:id('m'+(i%2000)),
 trackKey:'track-'+(i%101),occurredAtMs:NOW-(i%50)*DAY-(i%9)*30000,
 state:i%11===0?'failed':i%7===0?'pending':'done',active:true,...patch
});
const dbCreate=()=>{const d=new DatabaseSync(':memory:');d.exec(readFileSync(new URL('../f22-s2/schema.sql',import.meta.url),'utf8'));return d;};
const apply=(d:DatabaseSync,a:any[],u=usage())=>applyFakeBatch(d,a as any,u,NOW);
function oracle(d:DatabaseSync,period:'today'|'7d'|'30d'|'all',track:string|null=null){
 const w=windowDays(period,NOW),g=track??'*',a=track===null?[w.first,w.last]:[w.first,w.last,track];
 const query="SELECT COUNT(*) calls,COUNT(DISTINCT member_key) members,SUM(state='done') done,SUM(state='failed') failed,SUM(state='pending') pending FROM f22_s2_events WHERE active=1 AND day BETWEEN ? AND ? "+(track===null?"":"AND track_key=?");
 const expected=d.prepare(query).get(...a) as any,result=statsFake(d,period,track,NOW);
 for(const col of ['calls','members','done','failed','pending'] as const)
  assert.equal(result[col],expected[col]??0,period+'/'+g+'/'+col);
 return result;
}
test('S2367A independent >=60080 events/2000 members/50 days/101 tracks: direct SQL DISTINCT oracle',()=>{
 const db=dbCreate();try{let read=0,write=0,virtualDays=1;
  for(let i=0;i<60080;i+=MAX_BATCH){
   const a=Array.from({length:Math.min(MAX_BATCH,60080-i)},(_,j)=>event(i+j));
   let r=apply(db,a,usage(read,write));
   if(!r.guard.permitted){assert.equal(r.applied,0);read=write=0;virtualDays++;r=apply(db,a);}
   assert.equal(r.applied,a.length);read+=r.applied*PREDICTED_READS;write+=r.applied*PREDICTED_WRITES;
  }
  assert.equal(oracle(db,'all').calls,60080);assert.equal(oracle(db,'all').members,2000);
  for(const period of ['today','7d','30d','all'] as const)
   for(const track of [null,'track-0','track-50','track-100'])oracle(db,period,track);
  assert.ok(virtualDays>1);
  console.log('S2367A_INDEPENDENT_FAKE',JSON.stringify({events:60080,distinctMembers:2000,simulatedQuotaDays:virtualDays}));
 }finally{db.close();}
});
test('S2367A cross-midnight, device replay, revisions, withdrawal and same-version conflict rollback',()=>{
 const db=dbCreate();try{
  const a=event(1,{occurredAtMs:Date.parse('2026-10-19T15:59:59Z')});
  const b=event(2001,{memberKey:(a as any).memberKey,occurredAtMs:Date.parse('2026-10-19T16:00:01Z')});
  assert.equal(apply(db,[a,b]).applied,2);assert.equal(oracle(db,'all').members,1);
  assert.equal(apply(db,[a,b]).duplicates,2);
  const modified={...a,sourceVersion:2,payloadHash:id('modified'),trackKey:'track-x',state:'failed'};
  apply(db,[modified]);assert.equal(apply(db,[a]).stale,1);
  assert.throws(()=>apply(db,[{...modified,sourceVersion:3,payloadHash:id('v3')},{...modified,sourceVersion:3,payloadHash:id('conflict')}]),/conflicting_same_revision/);
  assert.equal((db.prepare('SELECT source_version n FROM f22_s2_events WHERE event_key=?').get((a as any).eventKey) as any).n,2);
  apply(db,[{...modified,sourceVersion:4,payloadHash:id('cancel'),active:false}]);
  assert.equal(oracle(db,'all').calls,1);
 }finally{db.close();}
});
test('S2367A read/write 80%,100%,unknown/old quota blocks new work',()=>{
 for(const [n,s] of [[3999999,'safe'],[4000000,'warning'],[4000001,'warning'],[5000000,'stop'],[5000001,'stop']] as const)
  assert.equal(guardUsage(usage(n,0),0,0,NOW).safety,s);
 for(const [n,s] of [[79900,'safe'],[80000,'warning'],[80100,'warning'],[100000,'stop'],[100001,'stop']] as const)
  assert.equal(guardUsage(usage(0,n),0,0,NOW).safety,s);
 for(const v of [usage(null as any),usage(0,null as any),usage(0,0,NOW-300001),usage(-1,0)])
  assert.equal(guardUsage(v,0,0,NOW).permitted,false);
 const db=dbCreate();try{
  for(const u of [usage(4000000),usage(0,80000),usage(null as any)])
   assert.equal(apply(db,[event(0)],u).applied,0);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM f22_s2_events').get() as any).n,0);
 }finally{db.close();}
});
test('S2367A fake admin only; identity/actual cost never appears in output',()=>{
 const db=dbCreate();try{const e=event(4);apply(db,[e]);
  const good={verified:true,active:true,fresh:true,centralRole:'super-admin'};
  for(const fake of [{...good,verified:false},{...good,active:false},{...good,fresh:false},{...good,centralRole:'member'}])
   assert.throws(()=>readPrivateFake(db,fake,'all',null,NOW),/central_super_admin_required/);
  const x=readPrivateFake(db,good,'all',null,NOW),s=JSON.stringify(x);
  assert.equal(x.actualTwd,null);assert.equal(x.estimatedTwd,null);
  for(const secret of [(e as any).memberKey,(e as any).eventKey,(e as any).payloadHash])assert.ok(!s.includes(secret));
 }finally{db.close();}
});
test('S2367A BLOCKER: S2 counts an opaque visitor unlike S1 member:% semantics',()=>{
 const db=dbCreate();try{
  apply(db,[event(5,{memberKey:id('visitor-not-member')})]);
  assert.equal(oracle(db,'all').members,1);
  console.log('BLOCKER: visitor versus member identity mapping unresolved');
 }finally{db.close();}
});
test('S2367A BLOCKER: day-only query includes later event in earlier same-day historical query',()=>{
 const db=dbCreate();try{
  apply(db,[event(6,{occurredAtMs:NOW-1000})]);
  assert.equal(statsFake(db,'today',null,NOW-3600000).calls,1);
  console.log('BLOCKER: time-window precision differs from S1');
 }finally{db.close();}
});
test('S2367A BLOCKER: shared old account budget snapshot admits over 80% when batches combined',()=>{
 const db=dbCreate();try{const q=usage(0,78000);
  const a=apply(db,Array.from({length:40},(_,i)=>event(i)),q);
  const b=apply(db,Array.from({length:40},(_,i)=>event(i+10000)),q);
  assert.equal(a.applied,40);assert.equal(b.applied,40);
  assert.ok(78000+(a.applied+b.applied)*PREDICTED_WRITES>=80000);
  console.log('BLOCKER: no atomic account-wide quota reservation');
 }finally{db.close();}
});
test('S2367A BLOCKER: changed event key for same device action can double-count',()=>{
 const db=dbCreate();try{const a=event(7),b=event(8,{
  memberKey:(a as any).memberKey,trackKey:(a as any).trackKey,
  occurredAtMs:(a as any).occurredAtMs,state:(a as any).state
 });
  assert.equal(apply(db,[a,b]).applied,2);assert.equal(oracle(db,'all').calls,2);
  console.log('BLOCKER: requires trusted cross-device event key');
 }finally{db.close();}
});
