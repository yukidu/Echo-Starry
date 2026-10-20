/** N1A-S1 AI4 ROUND 2 — isolated fake interoperability acceptance.
 * Contract snapshot: AI2 Draft PR #469, securityProof.ts HEAD 629ba524.
 * This test DOES NOT import/re-implement AI2's trust verifier. It checks the
 * published FIELD SHAPE and refuses to equate two different proofs with
 * actual authority. Never import this fixture into live Worker/router.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MutableFakeAuthority, simulateProtectedQA, validateFakeProof } from '../n1a-ai4/searchCitationFake.ts';
import type { FakeProof, FakeSource, FakeHooks } from '../n1a-ai4/searchCitationFake.ts';

type Ai2FakeProofShape = Readonly<{
  schemaVersion:'N1A-S1-FAKE-v1'; issuer:'fake-star-id-plus-witness';
  audience:'n1a-offline-only'; subjectId:string; appId:string;
  action:'transcript.searchEvidence'; resourceId:string; requestId:string;
  nonce:string; membershipRevision:string; permissionRevision:string;
  correctionRevision:string; sourceRevision:string; securitySeq:string;
  restoreEpoch:string; revocationWatermark:string; deletionWatermark:string;
  issuedAtMs:number; expiresAtMs:number; approvalGrantId:string;
  fakeAttestation:string;
}>;
const privateContent='完全虛構／撤權後必須禁止引用的舊段落';
const one:FakeSource = {trackId:'fake-track-22',version:'v1',
  sourceRevision:'etag.abc',permissionRevision:'7',correctionRevision:'4',
  text:privateContent};
const other:FakeSource = {trackId:'fake-track-23',version:'v1',
  sourceRevision:'etag.def',permissionRevision:'7',correctionRevision:'4',
  text:'第二筆虛構私人逐字稿'};
function setup(){
  const auth=new MutableFakeAuthority([one,other]);
  const run=(hooks?:FakeHooks,sources:readonly FakeSource[]=[one])=>
    simulateProtectedQA({subjectId:auth.subjectId,requestId:'request-22',
      authority:auth,candidates:sources.map(({text:_neverT0,...ref})=>ref),nowMs:()=>auth.clock,hooks});
  return {auth,run};
}
function ai2Snapshot(ai4:FakeProof):Ai2FakeProofShape {
  // Literal fake case reproduces the names and data types in AI2 #469.
  // This is a test FIXTURE, not a converter safe to use at runtime.
  return {
    schemaVersion:'N1A-S1-FAKE-v1',issuer:'fake-star-id-plus-witness',
    audience:'n1a-offline-only',subjectId:ai4.subjectId,appId:ai4.appId,
    action:'transcript.searchEvidence',resourceId:ai4.source[0].trackId,
    requestId:ai4.requestId,nonce:'fiction-only',approvalGrantId:'',
    membershipRevision:ai4.memberRevision,
    permissionRevision:ai4.source[0].permissionRevision,
    correctionRevision:ai4.source[0].correctionRevision,
    sourceRevision:ai4.source[0].sourceRevision,securitySeq:ai4.witnessSeq,
    restoreEpoch:ai4.restoreEpoch,revocationWatermark:ai4.revocationWatermark,
    deletionWatermark:ai4.deletionWatermark,
    issuedAtMs:ai4.issuedAtMs,expiresAtMs:ai4.expiresAtMs,
    fakeAttestation:'never-a-real-signature'
  };
}
const canonical=(s:unknown)=>typeof s==='string' && /^(0|[1-9][0-9]{0,19})$/.test(s) &&
  BigInt(s)<=18446744073709551615n;
/** Diagnostic only. Even all matched FIELDS cannot satisfy real authority. */
function diagnose(ai2:Ai2FakeProofShape,ai4:FakeProof,expected:FakeSource){
  const reasons:string[]=[];
  if(ai2.schemaVersion!=='N1A-S1-FAKE-v1' ||
     ai2.issuer!=='fake-star-id-plus-witness' ||
     ai2.audience!=='n1a-offline-only') reasons.push('foreign_fake_envelope');
  if(ai2.action!=='transcript.searchEvidence' || ai2.subjectId!==ai4.subjectId ||
     ai2.appId!==ai4.appId || ai2.resourceId!==expected.trackId ||
     ai2.requestId!==ai4.requestId) reasons.push('actor_action_or_resource_rebound');
  const pairs:[string,unknown,unknown][]=[
    ['membershipRevision/memberRevision',ai2.membershipRevision,ai4.memberRevision],
    ['securitySeq/witnessSeq',ai2.securitySeq,ai4.witnessSeq],
    ['restoreEpoch',ai2.restoreEpoch,ai4.restoreEpoch],
    ['revocationWatermark',ai2.revocationWatermark,ai4.revocationWatermark],
    ['deletionWatermark',ai2.deletionWatermark,ai4.deletionWatermark],
    ['sourceRevision (opaque ETag, NOT transcript version)',ai2.sourceRevision,expected.sourceRevision],
    ['permissionRevision',ai2.permissionRevision,expected.permissionRevision],
    ['correctionRevision',ai2.correctionRevision,expected.correctionRevision],
  ];
  for(const [field,left,right] of pairs) if(left!==right)
    reasons.push('mismatch:'+field);
  for(const v of [ai2.membershipRevision,ai2.securitySeq,ai2.restoreEpoch,
      ai2.revocationWatermark,ai2.deletionWatermark,ai2.permissionRevision,
      ai2.correctionRevision,ai4.checkpointSeq]){
    if(!canonical(v)) reasons.push('invalid_version_encoding');
  }
  if(!canonical(ai4.witnessSeq) || BigInt(ai4.witnessSeq)<BigInt(ai4.checkpointSeq))
    reasons.push('unverifiable_checkpoint');
  if(ai4.source.length!==1 || ai4.source[0]?.trackId!==expected.trackId ||
     ai4.source[0].version!==expected.version)
    reasons.push('single_resource_scope_or_transcript_version_mismatch');
  if(ai4.source[0]?.deleted || ai4.source[0]?.revoked ||
     ai4.source[0]?.revocationPending)
    reasons.push('source_not_current');
  // Known schema gaps in #469 are NOT silently invented: no sourceVersion,
  // checkpointSeq, revocationPending, or general resourceRevision field.
  const unproven=['ai2_missing_transcriptVersion',
    'ai2_missing_independent_checkpointSeq',
    'ai2_missing_revocationPending',
    'ai2_resourceRevision_not_defined',
    'two_different_fake_issuers_not_a_shared_signer'];
  return {fieldsAligned:reasons.length===0,reasons,
    unresolved:unproven,productionAuthorized:false as const,
    safeToPublish:false as const};
}
const denied=(x:Awaited<ReturnType<typeof simulateProtectedQA>>)=>{
  assert.deepEqual(x.released,[]);
  assert.equal(x.productionAuthorized,false);
  assert.equal(x.sideEffects,0);
  assert.equal(JSON.stringify(x).includes(privateContent),false);
};
test('R2-01 exact membershipRevision <-> memberRevision mapping but no authorization',async()=>{
  const {auth}=setup();const p=(await auth.read(auth.subjectId,'request-22',[one.trackId]))!;
  const d=diagnose(ai2Snapshot(p),p,one);
  assert.equal(d.fieldsAligned,true);
  assert.equal(d.safeToPublish,false);
  assert.equal(d.productionAuthorized,false);
  assert.equal(d.unresolved.length,5);
});
test('R2-02 securitySeq vs witnessSeq does not erase independent checkpointSeq',async()=>{
  const {auth}=setup();const p=(await auth.read(auth.subjectId,'request-22',[one.trackId]))!;
  assert.equal(diagnose(ai2Snapshot(p),p,one).fieldsAligned,true);
  const rollback={...p,checkpointSeq:'21'};
  const d=diagnose(ai2Snapshot(rollback),rollback,one);
  assert.ok(d.reasons.includes('unverifiable_checkpoint'));
  assert.equal(d.safeToPublish,false);
});
test('R2-03 restoreEpoch canonical decimal string; never Number or rounded uint64',async()=>{
  const {auth}=setup();const p=(await auth.read(auth.subjectId,'request-22',[one.trackId]))!;
  for(const bad of ['06','-1','1.0',6 as unknown as string,'18446744073709551616']){
    const a2={...ai2Snapshot(p),restoreEpoch:bad};
    assert.ok(diagnose(a2,p,one).reasons.length>0);
  }
  assert.equal(canonical('18446744073709551615'),true);
});
test('R2-04 sourceRevision is opaque source ETag, not transcript v1',async()=>{
  const {auth}=setup();const p=(await auth.read(auth.subjectId,'request-22',[one.trackId]))!;
  assert.ok(diagnose({...ai2Snapshot(p),sourceRevision:one.version},p,one)
    .reasons.some(s=>s.includes('sourceRevision')));
  assert.ok(diagnose(ai2Snapshot(p),{...p,source:[{...p.source[0],version:'v2'}]},one)
    .reasons.includes('single_resource_scope_or_transcript_version_mismatch'));
});
test('R2-05 undefined AI2 resourceRevision never auto-mapped from sourceRevision',async()=>{
  const {auth}=setup();const p=(await auth.read(auth.subjectId,'request-22',[one.trackId]))!;
  const a2=ai2Snapshot(p);
  assert.equal(Object.hasOwn(a2,'resourceRevision'),false);
  assert.equal(diagnose(a2,p,one).safeToPublish,false);
  assert.ok(diagnose(a2,p,one).unresolved.includes('ai2_resourceRevision_not_defined'));
});
test('R2-06 member version mismatch / account identity or action drift => blocked',async()=>{
  const {auth}=setup();const p=(await auth.read(auth.subjectId,'request-22',[one.trackId]))!;
  const a2=ai2Snapshot(p);
  assert.ok(diagnose({...a2,membershipRevision:'8'},p,one).reasons.length>0);
  assert.ok(diagnose({...a2,subjectId:'another-member'},p,one).reasons.length>0);
  assert.ok(diagnose({...a2,resourceId:'wrong-track'},p,one).reasons.length>0);
  assert.ok(diagnose({...a2,requestId:'wrong-request'},p,one).reasons.length>0);
});
test('R2-07 securitySeq or deletion/revocation watermarks differ => blocked',async()=>{
  const {auth}=setup();const p=(await auth.read(auth.subjectId,'request-22',[one.trackId]))!;
  for(const [k,v] of [
    ['securitySeq','22'],['deletionWatermark','4'],['revocationWatermark','3']
  ] as const){
    const d=diagnose({...ai2Snapshot(p),[k]:v},p,one);
    assert.ok(d.reasons.length>0);assert.equal(d.safeToPublish,false);
  }
});
test('R2-08 permissionRevision and correctionRevision are separate and per-resource',async()=>{
  const {auth}=setup();const p=(await auth.read(auth.subjectId,'request-22',[one.trackId]))!;
  for(const changes of [{permissionRevision:'8'},{correctionRevision:'5'}]){
    assert.ok(diagnose({...ai2Snapshot(p),...changes},p,one).reasons.length>0);
  }
  const multi=(await auth.read(auth.subjectId,'request-22',[one.trackId,other.trackId]))!;
  assert.equal(diagnose(ai2Snapshot(multi),multi,one).safeToPublish,false);
  assert.ok(diagnose(ai2Snapshot(multi),multi,one)
    .reasons.includes('single_resource_scope_or_transcript_version_mismatch'));
});
test('R2-09 fakeAttestation/verified boolean alone never allows production',async()=>{
  const {auth}=setup();const p=(await auth.read(auth.subjectId,'request-22',[one.trackId]))!;
  const d=diagnose({...ai2Snapshot(p),fakeAttestation:'verified:true'},p,one);
  assert.equal(d.fieldsAligned,true);assert.equal(d.productionAuthorized,false);
  assert.equal(d.safeToPublish,false);
});
for(const stage of ['T0','T1','T2','SEND'] as const){
  test('R2-member-permission at '+stage+' fails closed',async()=>{
    const {auth,run}=setup();
    const mutate=():void=>{auth.resources.set(one.trackId,{...one,permissionRevision:'8'});};
    if(stage==='T0') mutate();
    const hooks:FakeHooks=stage==='T1'?{afterT0:mutate}:stage==='T2'?{afterT1:mutate}:
      stage==='SEND'?{beforeSend:mutate}:{};
    const d=await run(hooks);denied(d);
    assert.equal(d.stage,stage);
    assert.equal(auth.sentCount,0);
  });
  test('R2-witness-epoch/watermark at '+stage+' fails closed',async()=>{
    const {auth,run}=setup();
    const mutate=()=>{auth.epoch=String(BigInt(auth.epoch)+1n);
      auth.revokeSeq=String(BigInt(auth.revokeSeq)+1n);auth.witnessSeq=String(BigInt(auth.witnessSeq)+1n);};
    if(stage==='T0') mutate();
    // Initial T0 must compare against a separately frozen baseline to
    // distinguish preexisting new state from mid-request changes.
    if(stage==='T0'){
      const stale=(await auth.read(auth.subjectId,'request-22',[one.trackId]))!;
      assert.equal(stale.restoreEpoch,'7');
      assert.equal(diagnose({...ai2Snapshot(stale),restoreEpoch:'6'},stale,one).safeToPublish,false);
      auth.checkpointSeq='21'; // simulated higher authoritative checkpoint
      auth.witnessSeq='20'; // stale worker is behind
    }
    const hooks:FakeHooks=stage==='T1'?{afterT0:mutate}:stage==='T2'?{afterT1:mutate}:
      stage==='SEND'?{beforeSend:mutate}:{};
    const result=await run(hooks);denied(result);
    assert.equal(result.stage,stage);assert.equal(auth.sentCount,0);
  });
}
test('R2-18 member suspend after T2, source deletion during SQL, correction after T1',async()=>{
  for(const [kind,makeHook] of [
    ['suspend', (a:MutableFakeAuthority):FakeHooks=>({beforeSend:()=>a.suspendMember()})],
    ['delete', (a:MutableFakeAuthority):FakeHooks=>({afterSQL:()=>a.remove(one.trackId)})],
    ['correct', (a:MutableFakeAuthority):FakeHooks=>({afterT1:()=>a.correct(one.trackId)})],
  ] as const){
    const {auth,run}=setup();const d=await run(makeHook(auth));denied(d);
    assert.equal(auth.sentCount,0,kind);
  }
});
test('R2-19 witness disconnected before T2 and before SEND never leaks',async()=>{
  for(const makeHook of [
    (a:MutableFakeAuthority):FakeHooks=>({afterT1:()=>{a.offline=true;}}),
    (a:MutableFakeAuthority):FakeHooks=>({beforeSend:()=>{a.offline=true;}})
  ]){
    const {auth,run}=setup();denied(await run(makeHook(auth)));
    assert.equal(auth.sentCount,0);
  }
});
test('R2-20 2000 fake requests with unknown witness produce zero citations',async()=>{
  const {auth,run}=setup();auth.offline=true;
  const all=await Promise.all(Array.from({length:2000},()=>run()));
  assert.equal(all.filter(x=>x.released.length!==0).length,0);
  assert.equal(auth.sentCount,0);
  assert.ok(all.every(x=>x.productionAuthorized===false && x.sideEffects===0));
});
