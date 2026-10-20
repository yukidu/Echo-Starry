import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,copyFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
  evaluateS3aFakeEnvelope,N1A_S3A_PRODUCTION_GATE,
  type S3aEnvelope,type S3aExpected,type S3aFakeReaders,
  type S3aCurrentMembership,type S3aCurrentWitness,
  type S3aIndependentCheckpoint,type S3aCurrentResource,
} from '../security-contract-v1/s3aEnvelope.ts';
import {
  FakeStarryIdSource,FakePrivateStatsWitness,
  newFakeDatabase,applyFakeEvent,
  setupFakeAccount,fakeBudgetTotals,
  TEST_ONLY,productionAuthorized,F22_N1A_S1_GATE_ENABLED,
} from '../f22-n1a-s1/offlineModel.ts';
import {
  readSyntheticPrivateStatsWithS3a,inspectSyntheticVersionBoundary,
  reserveSyntheticStatsBudget,MOCK_STATS_RESOURCE_ID,
  S3A_AI5_PRIVATE_STATS_PRODUCTION_GATE,
} from '../f22-n1a-s3a/syntheticStatsBridge.ts';
const NOW=Date.parse('2026-10-20T13:30:00Z');
const digest=createHash('sha256').update('synthetic stats report').digest('hex');
const resource:S3aCurrentResource={
 resourceId:MOCK_STATS_RESOURCE_ID,sourceRevision:'fake-content-ETag.v8',
 contentDigest:digest,activeTranscriptVersion:'v1',
 permissionRevision:'3',correctionRevision:'7',
 entitled:true,revoked:false,deleted:false,revocationPending:false,
};
const readResourceProof=({entitled:_,revoked:__,deleted:___,revocationPending:____,...proof}:S3aCurrentResource)=>proof;
function fixture(existingDb?:DatabaseSync){
 const db=existingDb??newFakeDatabase(),source=new FakeStarryIdSource('AI5-N1A-S3A-TEST-NO-REAL-KEY');
 source.register('registered-1');source.register('registered-2');
 const e1=source.firstAccept({logicalSourceId:'same-logical-1',app:'echo',subject:'registered-1',
  acceptedAtUtcMs:NOW-3000,track:MOCK_STATS_RESOURCE_ID,state:'done'});
 const e2=source.firstAccept({logicalSourceId:'another-event',app:'echo',subject:'registered-1',
  acceptedAtUtcMs:NOW-2000,track:MOCK_STATS_RESOURCE_ID,state:'pending'});
 const e3=source.firstAccept({logicalSourceId:'guest-event',app:'echo',subject:null,
  acceptedAtUtcMs:NOW-1000,track:MOCK_STATS_RESOURCE_ID,state:'done'});
 for(const e of [e1,e2,e3])assert.equal(applyFakeEvent(db,source,e),'APPLIED');
 const witness=new FakePrivateStatsWitness();
 witness.enrollFakeSuperAdmin('fake-admin');witness.sealInitialFakeSnapshot(db);
 const envelope:S3aEnvelope={
  schemaVersion:'N1A-S3A-FAKE-v1',issuer:'fake-starry-id-and-independent-witness',
  audience:'n1a-s3a-offline-only',appId:'echo',subjectId:'fake-admin',
  requestId:'fake-f22-report-read-one',nonce:'fake-nonce-one',
  action:'transcript.searchEvidence',
  sessionRevision:'4',membershipRevision:'5',securitySeq:'19',
  checkpointSeq:'18',restoreEpoch:'6',revocationWatermark:'3',deletionWatermark:'4',
  issuedAtMs:NOW-300,expiresAtMs:NOW+4000,approvalGrantId:'',
  resources:[readResourceProof(resource)],fakeAttestation:'fake-known-attestation',
 };
 const expected:S3aExpected={appId:'echo',subjectId:'fake-admin',
  requestId:'fake-f22-report-read-one',action:'transcript.searchEvidence',
  resourceIds:[MOCK_STATS_RESOURCE_ID]};
 let member:S3aCurrentMembership|null={
  subjectId:'fake-admin',active:true,appAllowed:true,centralSuperAdmin:true,
  sessionRevision:'4',membershipRevision:'5',
 };
 let latestResource:S3aCurrentResource|null=resource;
 let gateAttestation=true,offline=false, witnessHead:S3aCurrentWitness|null={
  sourceId:'fake-witness',securitySeq:'19',restoreEpoch:'6',
  revocationWatermark:'3',deletionWatermark:'4',
 };
 let independent:S3aIndependentCheckpoint|null={
  sourceId:'fake-independent-checkpoint',checkpointSeq:'18',headSeq:'19',restoreEpoch:'6',
 };
 const counter={membership:0,witness:0,checkpoint:0,resource:0,attest:0};
 const readers:S3aFakeReaders={
  verifyFakeAttestation:async()=>{counter.attest++;if(offline)throw Error('fake-offline');return gateAttestation;},
  readMembership:async()=>{counter.membership++;return member;},
  readWitness:async()=>{counter.witness++;return witnessHead;},
  readIndependentCheckpoint:async()=>{counter.checkpoint++;return independent;},
  readResource:async()=>{counter.resource++;return latestResource;},
 };
 const options={db,witness,admin:'fake-admin',envelope,expected,readers,period:'all' as const,
  asOfMs:NOW,track:null};
 return {db,source,witness,e1,e2,e3,envelope,expected,options,counter,
  setMember:(value:S3aCurrentMembership|null)=>{member=value},
  member:()=>member!,
  setResource:(value:S3aCurrentResource|null)=>{latestResource=value},
  setOffline:(value:boolean)=>{offline=value},
  setAttestation:(value:boolean)=>{gateAttestation=value},
  setWitnessHead:(value:S3aCurrentWitness|null)=>{witnessHead=value},
  setIndependent:(value:S3aIndependentCheckpoint|null)=>{independent=value},
 };
}
test('S3A-AI5-01 REAL import: shared verifier + S1 private fakeStats same-process pre/read/SEND',async()=>{
 const a=fixture();try{
  assert.equal(TEST_ONLY,true);assert.equal(productionAuthorized,false);
  assert.equal(F22_N1A_S1_GATE_ENABLED,false);
  assert.equal(N1A_S3A_PRODUCTION_GATE,false);
  assert.equal(S3A_AI5_PRIVATE_STATS_PRODUCTION_GATE,false);
  const direct=await evaluateS3aFakeEnvelope(a.envelope,a.expected,a.options.readers,'T0',NOW);
  assert.equal(direct.simulatedAllowed,true);assert.equal(direct.productionAuthorized,false);
  const out=await readSyntheticPrivateStatsWithS3a(a.options);
  assert.equal(out.reason,'FAKE_STATS_ONLY_CONSISTENT');
  assert.equal(out.simulatedAllowed,true);
  assert.equal(out.productionAuthorized,false);
  assert.deepEqual(out.checkedPhases,['T0','T1','T2','SEND']);
  assert.equal(out.report?.calls,3);
  assert.equal(out.report?.registeredMembers,1);
  assert.equal(out.report?.guestCalls,1);
  assert.equal(out.report?.unknownCalls,0);
  assert.equal(out.costEstimatedTwd,null);
  assert.equal(out.spendHeldTwd,null);
  assert.equal(out.costSettledActualTwd,null);
  assert.equal(out.d1RowsWritten,null);
  assert.equal(a.counter.membership,5,'one direct T0 plus four gated phases');
  assert.ok(!JSON.stringify(out).includes(a.e1.registeredMemberHandle!));
 }finally{a.db.close();}
});
test('S3A-AI5-02 fake admin role absent: shared resource proof ALONE passes, F22 private gate blocks',async()=>{
 const a=fixture();try{
  a.setMember({...a.member(),centralSuperAdmin:false});
  const proof=await evaluateS3aFakeEnvelope(a.envelope,a.expected,a.options.readers,'T0',NOW);
  assert.equal(proof.simulatedAllowed,true,'shared searchEvidence is not admin-only');
  const out=await readSyntheticPrivateStatsWithS3a(a.options);
  assert.equal(out.simulatedAllowed,false);assert.equal(out.report,null);
  assert.equal(out.reason,'FAKE_SHARED_T0_STARRY_ID_MEMBER_UNAVAILABLE');
 }finally{a.db.close();}
});
test('S3A-AI5-03 admin revocation AFTER reading but BEFORE SEND blocks already-read counts',async()=>{
 const a=fixture();try{
  const result=await readSyntheticPrivateStatsWithS3a({
   ...a.options,betweenReadAndSend:()=>{a.setMember({...a.member(),active:false})}
  });
  assert.equal(result.simulatedAllowed,false);
  assert.equal(result.report,null);
  assert.equal(result.reason,'FAKE_SHARED_SEND_STARRY_ID_MEMBER_UNAVAILABLE');
  assert.deepEqual(result.checkedPhases,['T0','T1','T2','SEND']);
 }finally{a.db.close();}
});
test('S3A-AI5-04 external witness rollback or unavailable at SEND refuses cached report',async()=>{
 for(const change of ['rollback','unavailable','checkpoint','member-tombstone'] as const){
  const a=fixture();try{
   const result=await readSyntheticPrivateStatsWithS3a({
    ...a.options,betweenReadAndSend:()=>{
     if(change==='rollback')a.setWitnessHead({
      sourceId:'fake-witness',securitySeq:'18',restoreEpoch:'6',
      revocationWatermark:'3',deletionWatermark:'4'
     });
     if(change==='unavailable')a.setOffline(true);
     if(change==='checkpoint')a.setIndependent({
      sourceId:'fake-independent-checkpoint',checkpointSeq:'18',headSeq:'18',restoreEpoch:'6'
     });
     if(change==='member-tombstone')a.witness.revokeFakeMember(a.e1.registeredMemberHandle!);
    },
   });
   assert.equal(result.simulatedAllowed,false);assert.equal(result.report,null);
   assert.notEqual(result.reason,'FAKE_STATS_ONLY_CONSISTENT');
  }finally{a.db.close();}
 }
});
test('S3A-AI5-05 stats DB revision after initial sealing: no silent reseal and no release',async()=>{
 const a=fixture();try{
  const changed=a.source.revise('echo','same-logical-1',{state:'failed'});
  assert.equal(applyFakeEvent(a.db,a.source,changed),'APPLIED');
  const result=await readSyntheticPrivateStatsWithS3a(a.options);
  assert.equal(result.simulatedAllowed,false);assert.equal(result.report,null);
  assert.equal(result.reason,'FAKE_STATS_WITNESS_OR_READER_UNAVAILABLE');
  assert.throws(()=>a.witness.sealInitialFakeSnapshot(a.db),/FAKE_WITNESS_CANNOT_SEAL/);
 }finally{a.db.close();}
});
test('S3A-AI5-06 identity replay cannot convert guest to registered using stable cross-device event ID',()=>{
 const a=fixture();try{
  const mobile=a.source.firstAccept({logicalSourceId:'same-logical-1',app:'echo',subject:'registered-1',
   acceptedAtUtcMs:NOW+500,track:MOCK_STATS_RESOURCE_ID,state:'done'});
  assert.equal(mobile.globalEventId,a.e1.globalEventId);
  assert.equal(applyFakeEvent(a.db,a.source,mobile),'DUPLICATE_NOOP');
  a.source.register('guest-later-registers');
  assert.throws(()=>a.source.firstAccept({logicalSourceId:'guest-event',app:'echo',
   subject:'guest-later-registers',acceptedAtUtcMs:NOW,
   track:MOCK_STATS_RESOURCE_ID,state:'done'}),/ACTION_IDENTITY_CONFLICT/);
 }finally{a.db.close();}
});
test('S3A-AI5-07 eventRevision numeric != sourceRevision opaque ETag; no coercion of namespaces',()=>{
 const a=fixture();try{
  const r=inspectSyntheticVersionBoundary(a.e1,a.envelope);
  assert.equal(r.eventRevision,1);
  assert.equal(r.resourceSourceRevision,'fake-content-ETag.v8');
  assert.equal(r.distinctNamespaces,true);
  assert.equal(typeof r.eventRevision,'number');
  assert.equal(typeof r.resourceSourceRevision,'string');
  assert.notEqual(String(r.eventRevision),r.resourceSourceRevision);
 }finally{a.db.close();}
});
test('S3A-AI5-08 document ETag stays same but content digest changes: reject even before SQL read',async()=>{
 const a=fixture();try{
  a.setResource({...resource,contentDigest:'f'.repeat(64)});
  const out=await readSyntheticPrivateStatsWithS3a(a.options);
  assert.equal(out.simulatedAllowed,false);
  assert.equal(out.report,null);
  assert.equal(out.reason,'FAKE_SHARED_T0_RESOURCE_SOURCE_OR_PERMISSION_CHANGED');
 }finally{a.db.close();}
});
test('S3A-AI5-09 no genuine stats action in shared schema: wrong action or claimed scope denied',async()=>{
 const a=fixture();try{
  for(const variant of [
   {...a.options,expected:{...a.expected,action:'ai.attempt' as const}},
   {...a.options,expected:{...a.expected,resourceIds:['some-track']}},
   {...a.options,expected:{...a.expected,subjectId:'other-admin'}},
  ]){
   const out=await readSyntheticPrivateStatsWithS3a(variant);
   assert.equal(out.reason,'STATS_SHARED_ACTION_NOT_FORMALLY_AUTHORIZED');
   assert.equal(out.report,null);
  }
 }finally{a.db.close();}
});
test('S3A-AI5-10 independent SQLite budgets fail closed; same handle uses 80%/unknown limits',()=>{
 const a=fixture(),b=newFakeDatabase();try{
  setupFakeAccount(a.db,{accountId:'starry-account',plan:'workers-free',
   periodKey:'fake-utc-day',capReads:5_000_000,capWrites:100_000,
   observedReads:0,observedWrites:78_000,now:NOW,evidence:'fake-verified'});
  const request=(batchId:string,now=NOW)=>({accountId:'starry-account',batchId,periodKey:'fake-utc-day',now,reads:2560,writes:1280});
  const blocked=reserveSyntheticStatsBudget(a.db,b,request('different-database'));
  assert.equal(blocked.state,'UNKNOWN_LOCKED');
  assert.equal(blocked.detail,'UNSUPPORTED_CROSS_DATABASE');
  assert.equal(fakeBudgetTotals(a.db,'starry-account').pendingWrite,0);
  const accepted=reserveSyntheticStatsBudget(a.db,a.db,request('first-same-database'));
  assert.equal(accepted.permitted,true);
  const next=reserveSyntheticStatsBudget(a.db,a.db,request('second-same-database'));
  assert.equal(next.permitted,false);
  assert.equal(next.state,'WARNING_PAUSED');
  assert.equal(fakeBudgetTotals(a.db,'starry-account').write,79280);
  const stale=reserveSyntheticStatsBudget(a.db,a.db,request('stale',NOW+300_001));
  assert.equal(stale.permitted,false);
  assert.equal(stale.state,'UNKNOWN_LOCKED');
 }finally{a.db.close();b.close();}
});
test('S3A-AI5-11 Cloudflare rows and AI hold are distinct, no paid provider execution',async()=>{
 const a=fixture();try{
  const answer=await readSyntheticPrivateStatsWithS3a(a.options);
  assert.equal(answer.report?.actualTwd,null);
  assert.equal(answer.costEstimatedTwd,null);
  assert.equal(answer.spendHeldTwd,null);
  assert.equal(answer.costSettledActualTwd,null);
  assert.equal(answer.d1RowsRead,null);
  assert.equal(answer.d1RowsWritten,null);
  assert.equal(answer.productionAuthorized,false);
 }finally{a.db.close();}
});


test('S3A-AI5-12 restored older SQLite cannot release stats through actual shared verifier path',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'ai5-s3a-restore-'));
 const current=join(dir,'fake-events.sqlite'),old=join(dir,'before-events.sqlite');
 let initial:DatabaseSync|null=null,restored:DatabaseSync|null=null;
 try{
  initial=newFakeDatabase(current);
  initial.close();initial=null;
  // Persist an older, empty-but-valid DB snapshot outside the verifier.
  copyFileSync(current,old);
  const after=new DatabaseSync(current);
  const a=fixture(after); // seals independently after three fake events
  assert.equal((await readSyntheticPrivateStatsWithS3a(a.options)).simulatedAllowed,true);
  after.close();
  copyFileSync(old,current);
  restored=new DatabaseSync(current);
  const denied=await readSyntheticPrivateStatsWithS3a({...a.options,db:restored});
  assert.equal(denied.simulatedAllowed,false);
  assert.equal(denied.report,null);
  assert.equal(denied.reason,'FAKE_STATS_WITNESS_OR_READER_UNAVAILABLE');
 }finally{
  initial?.close();restored?.close();rmSync(dir,{recursive:true,force:true});
 }
});
