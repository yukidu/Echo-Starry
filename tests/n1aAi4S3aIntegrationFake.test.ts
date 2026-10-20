import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateS3aFakeEnvelope,N1A_S3A_PRODUCTION_GATE}
  from '../security-contract-v1/s3aEnvelope.ts';
import {MutableFakeAuthority,simulateProtectedQA,
  N1A_AI4_PRODUCTION_ENABLED,type FakeSource,type FakeSourceRef}
  from '../n1a-ai4/searchCitationFake.ts';
import {runAi4S3aFakeCitation,AI4_S3A_PRODUCTION_ENABLED}
  from '../n1a-ai4/s3aCitationBridgeFake.ts';

const first:FakeSource={
  trackId:'track-member',sourceRevision:'etag.public-v1',version:'v1',
  correctionRevision:'1',permissionRevision:'2',
  text:'只有假資料：一般會員可讀的虛構來源'
};
const vip:FakeSource={
  trackId:'track-vip',sourceRevision:'etag.vip-v1',version:'v1',
  correctionRevision:'1',permissionRevision:'2',
  text:'只有假資料：VIP 私密內容，未授權絕不可外洩'
};
const ref=({text:_secret,...metadata}:FakeSource):FakeSourceRef=>metadata;
function setup(sources:FakeSource[]=[first],grants:string[]=sources.map(s=>s.trackId)){
  const auth=new MutableFakeAuthority(sources,grants);
  let witnessOnline=true,checkpointOnline=true,registryOnline=true;
  const base=()=>({auth,subjectId:auth.subjectId,requestId:'s3a-ai4-req-1',
    resources:sources.map(ref),witnessOnline:()=>witnessOnline,
    checkpointOnline:()=>checkpointOnline,registryOnline:()=>registryOnline});
  const run=(patch:Record<string,unknown>={})=>
    runAi4S3aFakeCitation({...base(),...patch});
  return {auth,run,
    downWitness:()=>{witnessOnline=false},
    downCheckpoint:()=>{checkpointOnline=false},
    downRegistry:()=>{registryOnline=false}};
}
type Outcome=Awaited<ReturnType<typeof runAi4S3aFakeCitation>>;
const blocked=(x:Outcome)=>{
  assert.equal(x.status,'DENIED');
  assert.deepEqual(x.fakeReleasedTexts,[]);
  assert.equal(x.productionAuthorized,false);
  assert.equal(x.providerCalls,0);
  assert.equal(x.restoreWrites,0);
  assert.equal(x.irreversibleActionsAllowed,false);
  assert.ok(!JSON.stringify(x).includes(vip.text));
};
test('AI4-S3A-01 import exact common evaluator and original AI4 S1 function, both OFF',async()=>{
  assert.equal(typeof evaluateS3aFakeEnvelope,'function');
  assert.equal(typeof simulateProtectedQA,'function');
  assert.equal(N1A_S3A_PRODUCTION_GATE,false);
  assert.equal(N1A_AI4_PRODUCTION_ENABLED,false);
  assert.equal(AI4_S3A_PRODUCTION_ENABLED,false);
});
test('AI4-S3A-02 real shared T0/T1/T2/SEND + original AI4 guard release only FAKE text',async()=>{
  const t=setup();const x=await t.run();
  assert.equal(x.status,'FAKE_ONLY_ALLOWED');
  assert.equal(x.phase,'SEND');
  assert.deepEqual(x.fakeReleasedTexts,[first.text]);
  assert.deepEqual(x.sharedPhases,['T0','T1','T2','SEND']);
  assert.equal(t.auth.sentCount,1);
  assert.equal(t.auth.bodyReadCount,1);
  assert.equal(x.productionAuthorized,false);
  assert.equal(x.providerCalls,0);
  assert.equal(x.restoreWrites,0);
});
test('AI4-S3A-03 per-track access: ordinary member cannot read VIP or leak other source',async()=>{
  const t=setup([first,vip],[first.trackId]);
  const x=await t.run();
  blocked(x);assert.equal(x.phase,'T0');
  assert.equal(t.auth.bodyReadCount,0);
  assert.equal(t.auth.sentCount,0);
});
test('AI4-S3A-04 explicit 2-track grant must authorize BOTH',async()=>{
  const t=setup([first,vip],[first.trackId,vip.trackId]);
  const x=await t.run();
  assert.equal(x.status,'FAKE_ONLY_ALLOWED');
  assert.deepEqual(x.fakeReleasedTexts,[first.text,vip.text]);
  assert.equal(x.productionAuthorized,false);
});
test('AI4-S3A-05 revoke member during SQL, shared T1 blocks; no private body read',async()=>{
  const t=setup();
  const x=await t.run({hooks:{afterSQL:()=>t.auth.suspendMember()}});
  blocked(x);assert.equal(x.phase,'T1');
  assert.equal(t.auth.bodyReadCount,0);
});
test('AI4-S3A-06 track grant revoked after T0; shared T1 blocks',async()=>{
  const t=setup();
  const x=await t.run({hooks:{afterT0:()=>t.auth.setEntitlement(first.trackId,false)}});
  blocked(x);assert.equal(x.phase,'T1');
  assert.equal(t.auth.sentCount,0);
});
test('AI4-S3A-07 deleted source at T1->T2; no old quote sent',async()=>{
  const t=setup();
  const x=await t.run({hooks:{afterT1:()=>t.auth.remove(first.trackId)}});
  blocked(x);assert.equal(x.phase,'T2');
});
test('AI4-S3A-08 manual correction after T1 rejected by original/shared version check',async()=>{
  const t=setup();
  const x=await t.run({hooks:{afterT1:()=>t.auth.correct(first.trackId)}});
  blocked(x);assert.equal(x.phase,'T2');
});
test('AI4-S3A-09 content changed with NO version bump after T1: hash mismatch',async()=>{
  const t=setup();
  const x=await t.run({hooks:{afterT1:()=>{
    t.auth.resources.set(first.trackId,{...first,text:'假資料內文遭偷換但所有版號不變'});
  }}});
  blocked(x);assert.equal(x.phase,'T2');
});
test('AI4-S3A-10 content changed after shared T2, before shared SEND: hash mismatch',async()=>{
  const t=setup();
  const x=await t.run({hooks:{beforeSend:()=>{
    t.auth.resources.set(first.trackId,{...first,text:'送出前的假內容偷換'});
  }}});
  blocked(x);assert.equal(x.phase,'SEND');
  assert.equal(t.auth.sentCount,0);
});
test('AI4-S3A-11 source transcript version changes during retrieval: reject',async()=>{
  const t=setup();
  const x=await t.run({hooks:{afterSQL:()=>t.auth.replace(first.trackId)}});
  blocked(x);assert.equal(x.phase,'T1');
});
test('AI4-S3A-12 revoke pending at SEND even if fake membership remains active',async()=>{
  const t=setup();
  const x=await t.run({hooks:{beforeSend:()=>t.auth.block(first.trackId)}});
  blocked(x);assert.equal(x.phase,'SEND');
  assert.equal(t.auth.sentCount,0);
});
test('AI4-S3A-13 independent witness transport failure blocks without fallback',async()=>{
  const t=setup();t.downWitness();const x=await t.run();
  blocked(x);assert.equal(x.phase,'T0');
  assert.equal(t.auth.bodyReadCount,0);
});
test('AI4-S3A-14 checkpoint transport failure at T2 blocks buffered private text',async()=>{
  const t=setup();
  let online=true;
  const x=await t.run({checkpointOnline:()=>online,
    hooks:{afterT1:()=>{online=false;}}});
  blocked(x);assert.equal(x.phase,'T2');
  assert.equal(t.auth.sentCount,0);
});
test('AI4-S3A-15 fake attestation registry missing: deny before body read',async()=>{
  const t=setup();t.downRegistry();const x=await t.run();
  blocked(x);assert.equal(x.phase,'T0');
  assert.equal(t.auth.bodyReadCount,0);
});
test('AI4-S3A-16 old witness head after restoration, checkpoint higher: deny',async()=>{
  const t=setup();const x=await t.run({hooks:{afterT0:()=>{
    t.auth.checkpointSeq='21'; // original witness stays 20
  }}});
  blocked(x);assert.equal(x.phase,'T1');
});
test('AI4-S3A-17 session actor/request mismatch must never return protected bytes',async()=>{
  const t=setup();const x=await t.run({subjectId:'member-attacker'});
  blocked(x);assert.equal(x.phase,'T0');
});
test('AI4-S3A-18 user-supplied private plaintext at T0 rejected',async()=>{
  const t=setup();
  const x=await t.run({resources:[first]});
  blocked(x);assert.equal(x.phase,'T0');assert.equal(t.auth.bodyReadCount,0);
});
test('AI4-S3A-19 metadata altered while fake authority source unchanged: shared gate passes but original S1 fails',async()=>{
  const t=setup();
  const altered={...ref(first),sourceRevision:'client-wrong-etag'};
  const x=await t.run({resources:[altered]});
  blocked(x);assert.equal(x.phase,'T0');
  assert.equal(x.reason.startsWith('S1_CITATION_GUARD_DENIED:'),true);
  assert.equal(t.auth.bodyReadCount,0);
});
test('AI4-S3A-20 2000 synthetic offline witness failures => all deny (NOT production load)',async()=>{
  const t=setup();t.downWitness();
  const result=await Promise.all(Array.from({length:2000},()=>t.run()));
  assert.equal(result.length,2000);
  assert.ok(result.every(x=>x.status==='DENIED' &&
    x.fakeReleasedTexts.length===0 &&
    x.productionAuthorized===false &&
    x.providerCalls===0 && x.restoreWrites===0));
  assert.equal(t.auth.bodyReadCount,0);
  assert.equal(t.auth.sentCount,0);
});
