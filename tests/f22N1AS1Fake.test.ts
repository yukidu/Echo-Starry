import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {FakeStarryIdSource,newFakeDatabase,applyFakeEvent,fakeStats,
  reportWindow,setupFakeAccount,reserveFakeBatch,markFakeUncertain,
  fakeBudgetTotals,TEST_ONLY,productionAuthorized,F22_N1A_S1_GATE_ENABLED} from '../f22-n1a-s1/offlineModel.ts';

const NOW=Date.parse('2026-10-20T10:40:00Z'),DAY=86400000;
const src=()=>new FakeStarryIdSource('LOCAL-FAKE-SECRET-NOT-FOR-PRODUCTION');
function budget(db:DatabaseSync,patch:Record<string,unknown>={}){
 setupFakeAccount(db,{accountId:'acct',plan:'workers-free',periodKey:'fake-day-2026-10-20',
 capReads:5_000_000,capWrites:100_000,observedReads:0,observedWrites:0,
 evidence:'fake-verified',now:NOW,...patch} as any);
}
const reserve=(db:DatabaseSync,batchId:string,reads=1,writes=1,now=NOW,periodKey='fake-day-2026-10-20')=>
 reserveFakeBatch(db,{accountId:'acct',batchId,periodKey,now,reads,writes});

test('N1A-S1: mock is disabled in production, registered distinct vs visitor and unknown events',()=>{
 assert.equal(TEST_ONLY,true);assert.equal(productionAuthorized,false);assert.equal(F22_N1A_S1_GATE_ENABLED,false);
 const db=newFakeDatabase(),s=src();
 try{
  s.register('member-1');s.register('member-2');
  const a=s.firstAccept({logicalSourceId:'same-action',app:'echo',subject:'member-1',acceptedAtUtcMs:NOW-2000,track:'talk-1',state:'pending'});
  const b=s.firstAccept({logicalSourceId:'different-action',app:'echo',subject:'member-1',acceptedAtUtcMs:NOW-1000,track:'talk-2',state:'done'});
  const guest=s.firstAccept({logicalSourceId:'guest-1',app:'echo',subject:null,acceptedAtUtcMs:NOW-1000,track:'talk-1',state:'done'});
  const unknown=s.firstAccept({logicalSourceId:'unknown-1',app:'echo',subject:'unverified-person',acceptedAtUtcMs:NOW-1000,track:'talk-1',state:'failed'});
  for(const e of [a,b,guest,unknown])assert.equal(applyFakeEvent(db,s,e),'APPLIED');
  const stats=fakeStats(db,'all',NOW);
  assert.deepEqual({calls:stats.calls,members:stats.registeredMembers,guests:stats.guestCalls,unknown:stats.unknownCalls},
   {calls:4,members:1,guests:1,unknown:1});
  assert.equal(stats.actualTwd,null);
  const out=JSON.stringify(stats);
  for(const hidden of [a.registeredMemberHandle,a.globalEventId,guest.globalEventId,unknown.payloadDigest])
   if(hidden)assert.ok(!out.includes(hidden));
  s.register('unverified-person');
  assert.equal(applyFakeEvent(db,s,unknown),'DUPLICATE_NOOP');
  assert.equal(fakeStats(db,'all',NOW).registeredMembers,1,'old unknown event must not silently upgrade');
 }finally{db.close();}
});
test('N1A-S1: original eventID stable across devices, state corrections and cancellation without double counting',()=>{
 const db=newFakeDatabase(),s=src();s.register('member-3');
 try{
  const a=s.firstAccept({logicalSourceId:'accepted-on-server',app:'echo',subject:'member-3',acceptedAtUtcMs:NOW-3000,track:'t1',state:'pending'});
  assert.equal(applyFakeEvent(db,s,a),'APPLIED');
  const desktop=s.firstAccept({logicalSourceId:'accepted-on-server',app:'echo',subject:'member-3',acceptedAtUtcMs:NOW-2000,track:'t1',state:'done'});
  assert.equal(a.globalEventId,desktop.globalEventId);assert.equal(a.acceptedAtUtcMs,desktop.acceptedAtUtcMs);
  assert.equal(applyFakeEvent(db,s,desktop),'DUPLICATE_NOOP');
  const v2=s.revise('echo','accepted-on-server',{state:'done',track:'t2'});
  assert.equal(applyFakeEvent(db,s,v2),'APPLIED');
  assert.equal(fakeStats(db,'all',NOW,'t1').calls,0);
  assert.equal(fakeStats(db,'all',NOW,'t2').registeredMembers,1);
  assert.equal(applyFakeEvent(db,s,a),'STALE_IGNORED');
  assert.throws(()=>applyFakeEvent(db,s,{...v2,state:'failed'}),/UNTRUSTED_FAKE_SOURCE/);
  assert.throws(()=>applyFakeEvent(db,s,{...v2,acceptedAtUtcMs:v2.acceptedAtUtcMs+1000}),/UNTRUSTED_FAKE_SOURCE/);
  const v3=s.revise('echo','accepted-on-server',{active:false});
  assert.equal(applyFakeEvent(db,s,v3),'APPLIED');
  assert.equal(fakeStats(db,'all',NOW).calls,0);
  assert.equal(applyFakeEvent(db,s,v2),'STALE_IGNORED');
 }finally{db.close();}
});
test('N1A-S1: Taipei date cutoffs vs precise historic asOf instant; no after-cutoff events',()=>{
 const db=newFakeDatabase(),s=src();s.register('m');
 try{
  const before=Date.parse('2026-10-19T15:59:59.999Z'),
        after=Date.parse('2026-10-19T16:00:00.001Z');
  const a=s.firstAccept({logicalSourceId:'a',app:'echo',subject:'m',acceptedAtUtcMs:before,track:'talk',state:'done'});
  const b=s.firstAccept({logicalSourceId:'b',app:'echo',subject:'m',acceptedAtUtcMs:after,track:'talk',state:'done'});
  applyFakeEvent(db,s,a);applyFakeEvent(db,s,b);
  assert.equal(fakeStats(db,'today',Date.parse('2026-10-20T00:00:00Z')).calls,1);
  assert.equal(fakeStats(db,'7d',Date.parse('2026-10-20T00:00:00Z')).calls,2);
  assert.equal(fakeStats(db,'all',Date.parse('2026-10-19T15:59:59.999Z')).calls,0);
  assert.equal(fakeStats(db,'all',Date.parse('2026-10-19T16:00:00Z')).calls,1);
  assert.equal(fakeStats(db,'all',NOW).registeredMembers,1);
  assert.equal(reportWindow('today',Date.parse('2026-10-20T02:00:00Z')).startMs,Date.parse('2026-10-19T16:00:00Z'));
 }finally{db.close();}
});
test('N1A-S1: fake >60080 events / 2000 verified members, cross-day true DISTINCT',()=>{
 const db=newFakeDatabase(),s=src();
 try{
  for(let k=0;k<2000;k++)s.register('member-'+k);
  for(let i=0;i<60080;i++){
   const e=s.firstAccept({logicalSourceId:'event-'+i,app:'echo',subject:'member-'+(i%2000),
    acceptedAtUtcMs:NOW-(i%47)*DAY-((i%9)+1)*1000,track:'talk-'+(i%67),state:i%11===0?'failed':'done'});
   const outcome=applyFakeEvent(db,s,e);
   assert.equal(outcome,'APPLIED');
  }
  const all=fakeStats(db,'all',NOW),short=fakeStats(db,'7d',NOW);
  assert.equal(all.calls,60080);assert.equal(all.registeredMembers,2000);
  assert.ok(short.calls<all.calls);
  const check=db.prepare("SELECT COUNT(DISTINCT member_handle) n FROM fake_f22_events WHERE active=1 AND accepted_ms>=? AND accepted_ms<? AND identity_kind='registered'")
   .get(reportWindow('7d',NOW).startMs,NOW) as any;
  assert.equal(short.registeredMembers,check.n);
  console.log('N1A_S1_FAKE_LOAD',JSON.stringify({events:all.calls,distinctRegisteredMembers:all.registeredMembers,window7d:short.calls}));
 }finally{db.close();}
});
test('N1A-S1: account-wide fake budget 79.9 safe, 80 stop nonessential, 100 hard stop; paid is internal cap not Free rule',()=>{
 for(const [value,expected] of [[79900,'SAFE_RESERVED'],[80000,'WARNING_PAUSED'],[80100,'WARNING_PAUSED'],
  [100000,'STOP_BLOCKED'],[100100,'STOP_BLOCKED']] as const){
  const db=newFakeDatabase();try{budget(db,{observedWrites:value});
   assert.equal(reserve(db,'b1',0,0).state,expected,'write='+value);
  }finally{db.close();}
 }
 for(const [value,expected] of [[3990000,'SAFE_RESERVED'],[4000000,'WARNING_PAUSED'],
  [5000000,'STOP_BLOCKED']] as const){
  const db=newFakeDatabase();try{budget(db,{observedReads:value});
   assert.equal(reserve(db,'b1',0,0).state,expected,'read='+value);
  }finally{db.close();}
 }
 const paid=newFakeDatabase();try{
  budget(paid,{plan:'workers-paid',periodKey:'fake-month-2026-10',capWrites:1000,capReads:2000});
  assert.equal(reserve(paid,'paid-batch',0,900,NOW,'fake-month-2026-10').state,'WARNING_PAUSED');
 }finally{paid.close();}
});
test('N1A-S1: UNKNOWN forbids every new fake job on stale plan or conflicting period, not zero-usage optimism',()=>{
 const db=newFakeDatabase();try{budget(db,{now:NOW-300001});
  assert.equal(reserve(db,'b',10,10).state,'UNKNOWN_LOCKED');
  assert.equal(reserve(db,'c',10,10,NOW,'fake-wrong-period').state,'UNKNOWN_LOCKED');
  assert.equal(fakeBudgetTotals(db,'acct').pendingWrite,0);
 }finally{db.close();}
 const invalid=newFakeDatabase();try{budget(invalid,{evidence:'unknown'});
  assert.equal(reserve(invalid,'b',0,1).state,'UNKNOWN_LOCKED');
 }finally{invalid.close();}
});
test('N1A-S1: 2 fake worker connections cannot both consume same 78000-write snapshot; replay and uncertain are safe',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ai5-budget-')),file=join(dir,'shared.sqlite'),a=newFakeDatabase(file),b=new DatabaseSync(file);
 try{
  budget(a,{observedWrites:78000});
  const first=reserve(a,'worker-a',40*64,40*32);
  const second=reserve(b,'worker-b',40*64,40*32);
  assert.equal(first.state,'SAFE_RESERVED');
  assert.equal(second.state,'WARNING_PAUSED');
  assert.equal(fakeBudgetTotals(a,'acct').write,79280);
  assert.equal(reserve(a,'worker-a',40*64,40*32).state,'REPLAY_NOOP');
  markFakeUncertain(a,'acct','worker-a');
  assert.equal(reserve(b,'worker-a',40*64,40*32).state,'RESERVED_UNCERTAIN');
  assert.equal(fakeBudgetTotals(b,'acct').pendingWrite,1280);
  a.exec('BEGIN IMMEDIATE');
  const locked=reserve(b,'worker-lock-test');
  assert.equal(locked.state,'UNKNOWN_LOCKED');
  a.exec('COMMIT');
  assert.equal(fakeBudgetTotals(a,'acct').pendingWrite,1280);
 }finally{a.close();b.close();rmSync(dir,{recursive:true,force:true});}
});
test('N1A-S1: 2000 fake client jobs through 16 shared SQLite worker handles never exceed 80% policy',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ai5-2000-')),file=join(dir,'shared.sqlite'),owner=newFakeDatabase(file);
 const peers=Array.from({length:16},()=>new DatabaseSync(file));
 try{
  budget(owner,{capReads:2000,capWrites:1000});
  let granted=0,blocked=0;
  for(let i=0;i<2000;i++){
   const outcome=reserve(peers[i%peers.length],'fake-job-'+i,1,1);
   if(outcome.permitted)granted++;else blocked++;
  }
  assert.equal(granted,799);assert.equal(blocked,1201);
  assert.equal(fakeBudgetTotals(owner,'acct').write,799);
  console.log('N1A_S1_FAKE_JOBS',JSON.stringify({logicalJobs:2000,sharedHandles:16,granted,blocked}));
 }finally{for(const p of peers)p.close();owner.close();rmSync(dir,{recursive:true,force:true});}
});
