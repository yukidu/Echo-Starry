import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {applyFakeBatch,guardUsage,readPrivateFake,statsFake,windowDays,
  MAX_BATCH,PREDICTED_READS,PREDICTED_WRITES,type Mutation} from '../f22-s2/rollup.ts';

const sha=(s:string)=>createHash('sha256').update('fake:'+s).digest('hex');
const now=Date.parse('2026-10-21T13:00:00Z');
const start=Date.parse('2026-09-01T00:00:00Z');
const DAY=86400000;
const quota=(read=0,write=0)=>({rowsRead:read,rowsWritten:write,observedAtMs:now});
const event=(id:number,patch:Partial<Mutation>={}):Mutation=>({
 eventKey:sha('event:'+id),sourceVersion:1,payloadHash:sha('payload:'+id),
 memberKey:sha('member:'+(id%2000)),trackKey:'track-'+(id%40),
 occurredAtMs:start+(id%45)*DAY+Math.floor(id/45)%20*60000,
 state:'done',active:true,...patch
});
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../f22-s2/schema.sql',import.meta.url),'utf8'));
 return db;
}
test('S45A account-wide reads/writes 80%/100% and unknown are fail-closed',()=>{
 for(const [value,expected] of [[3999999,'safe'],[4000000,'warning'],
 [4000001,'warning'],[5000000,'stop'],[5000001,'stop']] as const)
  assert.equal(guardUsage(quota(value,0),0,0,now).safety,expected);
 for(const [value,expected] of [[79900,'safe'],[80000,'warning'],
 [80100,'warning'],[100000,'stop'],[100001,'stop']] as const)
  assert.equal(guardUsage(quota(0,value),0,0,now).safety,expected);
 assert.equal(guardUsage(quota(3999999,0),1,0,now).safety,'warning');
 assert.equal(guardUsage(quota(0,79999),0,1,now).safety,'warning');
 assert.equal(guardUsage({...quota(),rowsRead:null},0,0,now).safety,'unknown');
 assert.equal(guardUsage({...quota(),observedAtMs:now-300001},0,0,now).safety,'unknown');
});
test('S45A exact distinct, replay, cancellation, correction and central admin isolation',()=>{
 const db=fixture();
 try{
  const a=event(0), b=event(2000,{occurredAtMs:a.occurredAtMs+DAY}),
    other=event(1,{trackKey:'track-0'});
  assert.equal(applyFakeBatch(db,[a,b,other],quota(),now).applied,3);
  assert.equal(statsFake(db,'all',null,now).members,2);
  assert.equal(statsFake(db,'all','track-0',now).members,2);
  assert.equal(applyFakeBatch(db,[a,b],quota(),now).duplicates,2);
  const changed={...a,sourceVersion:2,payloadHash:sha('changed'),state:'failed' as const};
  assert.equal(applyFakeBatch(db,[changed],quota(),now).applied,1);
  assert.equal(statsFake(db,'all',null,now).failed,1);
  assert.equal(applyFakeBatch(db,[a],quota(),now).stale,1);
  const revoked={...changed,sourceVersion:3,payloadHash:sha('revoked'),active:false};
  applyFakeBatch(db,[revoked],quota(),now);
  assert.equal(statsFake(db,'all',null,now).calls,2);
  assert.equal(statsFake(db,'all',null,now).members,2);
  assert.throws(()=>applyFakeBatch(db,[{...revoked,state:'done'}],quota(),now),/conflicting_same_revision/);
  assert.throws(()=>applyFakeBatch(db,[{...event(5),memberKey:'real-email'}],quota(),now),/invalid_opaque_event/);
  assert.equal(statsFake(db,'all',null,now).calls,2);
  const good={verified:true,active:true,centralRole:'super-admin',fresh:true};
  assert.equal(readPrivateFake(db,good,'all',null,now).calls,2);
  for(const denied of [{...good,verified:false},{...good,active:false},
    {...good,fresh:false},{...good,centralRole:'member'}])
   assert.throws(()=>readPrivateFake(db,denied,'all',null,now),/central_super_admin_required/);
 }finally{db.close();}
});
test('S45A 60,080 unique events, 2,000 members, 30d DISTINCT and multi-day quota rollover',()=>{
 const db=fixture();
 try{
  const total=60080;
  let accepted=0,read=0,write=0,fakeQuotaDays=1;
  for(let off=0;off<total;off+=MAX_BATCH){
   const block=Array.from({length:Math.min(MAX_BATCH,total-off)},(_,i)=>event(off+i));
   let r=applyFakeBatch(db,block,quota(read,write),now);
   if(!r.guard.permitted){
    assert.equal(r.applied,0); read=0;write=0;fakeQuotaDays++;
    r=applyFakeBatch(db,block,quota(),now);
   }
   assert.equal(r.applied,block.length);
   accepted+=r.applied;read+=r.applied*PREDICTED_READS;write+=r.applied*PREDICTED_WRITES;
  }
  assert.equal(accepted,total);
  assert.ok(fakeQuotaDays>1);
  const all=statsFake(db,'all',null,now);
  assert.equal(all.calls,total);assert.equal(all.members,2000);
  const range=windowDays('30d',now);
  const direct=db.prepare('SELECT COUNT(DISTINCT member_key) n,COUNT(*) calls FROM f22_s2_events WHERE active=1 AND day BETWEEN ? AND ?').get(range.first,range.last) as {n:number;calls:number};
  const thirty=statsFake(db,'30d',null,now);
  assert.equal(thirty.members,direct.n);assert.equal(thirty.calls,direct.calls);
  assert.equal(applyFakeBatch(db,[event(0)],quota(),now).duplicates,1);
  assert.equal(statsFake(db,'all',null,now).calls,total);
  console.log('F22_S2_LOCAL_FAKE',JSON.stringify({events:total,members:2000,fakeQuotaDays}));
 }finally{db.close();}
});
