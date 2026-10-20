import { test } from 'node:test';
import assert from 'node:assert/strict';
import { N1A_SECURITY_PROOF_RUNTIME_ENABLED, assessFakeSecurityProof, isCanonicalVersion } from '../security-contract-v1/securityProof.ts';
import type { SecurityProofV1, FakeTrustedReaders, FakeExpectation, SimulatedAnchor, SimulatedMembership, SimulatedResource } from '../security-contract-v1/securityProof.ts';

const NOW = 1792490000000;
const base: SecurityProofV1 = {
  schemaVersion:'N1A-S1-FAKE-v1', issuer:'fake-star-id-plus-witness', audience:'n1a-offline-only',
  subjectId:'member-one', appId:'echo', action:'transcript.publish', resourceId:'track-one',
  requestId:'req-one', nonce:'nonce-one', membershipRevision:'4',permissionRevision:'8',
  correctionRevision:'3',sourceRevision:'ETag.abc',securitySeq:'18446744073709551615',
  restoreEpoch:'11',revocationWatermark:'5',deletionWatermark:'9',
  issuedAtMs:NOW-1000,expiresAtMs:NOW+5000,approvalGrantId:'',fakeAttestation:'fake-signed-proof',
};
const expected:FakeExpectation={subjectId:base.subjectId,appId:base.appId,action:base.action,resourceId:base.resourceId,requestId:base.requestId};
function scenario(){
  let trusted=true;
  let member:SimulatedMembership|null={sourceId:'fake-starry-id',subjectId:base.subjectId,active:true,appAllowed:true,membershipRevision:'4'};
  let anchor:SimulatedAnchor|null={sourceId:'fake-independent-witness',securitySeq:base.securitySeq,
    restoreEpoch:'11',revocationWatermark:'5',deletionWatermark:'9',
    revokedResources:[],deletedResources:[],blockedSubjects:[]};
  let resource:SimulatedResource|null={resourceId:base.resourceId,appId:base.appId,
    sourceRevision:base.sourceRevision,permissionRevision:'8',correctionRevision:'3',active:true};
  const counts={verify:0,member:0,anchor:0,resource:0};
  const readers:FakeTrustedReaders={
    verifyFakeAttestation:async()=>{counts.verify++;return trusted;},
    getCurrentMembership:async()=>{counts.member++;return member;},
    getCurrentAnchor:async()=>{counts.anchor++;return anchor;},
    getCurrentResource:async()=>{counts.resource++;return resource;},
  };
  return {readers,counts,setTrusted:(v:boolean)=>trusted=v,
    setMember:(v:SimulatedMembership|null)=>member=v,
    setAnchor:(v:SimulatedAnchor|null)=>anchor=v,
    setResource:(v:SimulatedResource|null)=>resource=v,
    member:()=>member!,anchor:()=>anchor!,resource:()=>resource!};
}
const run=(f:ReturnType<typeof scenario>,proof=base,need=expected,stage:'precheck'|'before_commit'='precheck')=>
  assessFakeSecurityProof(proof,need,f.readers,NOW,stage);
const denied=async (expectedReason:string,f:ReturnType<typeof scenario>,proof=base,need=expected,stage:'precheck'|'before_commit'='precheck')=>{
  const x=await run(f,proof,need,stage);
  assert.equal(x.simulatedAllowed,false);assert.equal(x.productionAuthorized,false);
  assert.equal(x.sideEffects,0);assert.equal(x.reason,expectedReason);
};

test('S1-01 mock-only flag always OFF, with separate production result false', async()=>{
  assert.equal(N1A_SECURITY_PROOF_RUNTIME_ENABLED,false);
  const result=await run(scenario());assert.equal(result.simulatedAllowed,true);
  assert.equal(result.productionAuthorized,false);assert.equal(result.sideEffects,0);
});
test('S1-02 original stage and before-commit stage each reread live fake evidence',async()=>{
  const f=scenario();assert.equal((await run(f)).simulatedAllowed,true);
  assert.equal((await run(f,base,expected,'before_commit')).simulatedAllowed,true);
  assert.deepEqual(f.counts,{verify:2,member:2,anchor:2,resource:2});
});
test('S1-03 stage two detects revoked member after stage one',async()=>{
  const f=scenario();assert.equal((await run(f)).simulatedAllowed,true);
  f.setMember({...f.member(),active:false});await denied('membership_revoked_or_unavailable',f,base,expected,'before_commit');
});
test('S1-04 no app role escalation and no cross-app replay',async()=>{
  const f=scenario();f.setMember({...f.member(),appAllowed:false});await denied('membership_revoked_or_unavailable',f);
  await denied('proof_rebound_to_other_action',scenario(),base,{...expected,appId:'go'});
});
test('S1-05 source changed between checks denies old transcript publish',async()=>{
  const f=scenario();assert.equal((await run(f)).simulatedAllowed,true);
  f.setResource({...f.resource(),sourceRevision:'ETag.changed'});
  await denied('resource_changed_since_approval',f,base,expected,'before_commit');
});
test('S1-06 corrected or permission-revised resource cannot reuse old grant',async()=>{
  const f=scenario();f.setResource({...f.resource(),correctionRevision:'4'});
  await denied('resource_changed_since_approval',f);
  const g=scenario();g.setResource({...g.resource(),permissionRevision:'9'});
  await denied('resource_changed_since_approval',g);
});
test('S1-07 rollback of Starry ID to earlier membership version denies',async()=>{
  const f=scenario();f.setMember({...f.member(),membershipRevision:'3'});
  await denied('membership_revision_changed',f);
});
test('S1-08 independent witness restoreEpoch rollback, future, deletion watermark mismatch all deny',async()=>{
  for(const change of [{restoreEpoch:'10'},{restoreEpoch:'12'},{deletionWatermark:'10'},{securitySeq:'0'}]){
    const f=scenario();f.setAnchor({...f.anchor(),...change});
    await denied('external_witness_changed_or_rolled_back',f);
  }
});
test('S1-09 resource or member tombstones deny even when restored DB says active',async()=>{
  for(const change of [{deletedResources:['track-one']},{revokedResources:['track-one']},{blockedSubjects:['member-one']}]){
    const f=scenario();f.setAnchor({...f.anchor(),...change});
    await denied('witness_records_revocation_or_deletion',f);
  }
});
test('S1-10 witness missing, identity missing, resource missing fail closed',async()=>{
  const f=scenario();f.setAnchor(null);await denied('external_witness_missing',f);
  const g=scenario();g.setMember(null);await denied('membership_revoked_or_unavailable',g);
  const h=scenario();h.setResource(null);await denied('resource_unavailable',h);
});
test('S1-11 provenance port failing or fake attestation false fails closed',async()=>{
  const f=scenario();f.setTrusted(false);await denied('unverified_fake_attestation',f);
  const g=scenario();const readers:FakeTrustedReaders={...g.readers,getCurrentAnchor:async()=>{throw Error('mock unreachable')}};
  const result=await assessFakeSecurityProof(base,expected,readers,NOW,'precheck');
  assert.equal(result.reason,'trusted_source_unavailable');assert.equal(result.productionAuthorized,false);
});
test('S1-12 no cross-action, resource or request reuse even with a valid fake signature',async()=>{
  await denied('proof_rebound_to_other_action',scenario(),base,{...expected,action:'ai.attempt'});
  await denied('proof_rebound_to_other_action',scenario(),base,{...expected,resourceId:'track-two'});
  await denied('proof_rebound_to_other_action',scenario(),base,{...expected,requestId:'req-two'});
});
test('S1-13 fail on missing AI approval grant even when all other versions match',async()=>{
  const ai={...base,action:'ai.attempt' as const};
  await denied('ai_grant_missing',scenario(),ai,{...expected,action:'ai.attempt'});
});
test('S1-14 reject expiry, future or suspicious long-lived proof',async()=>{
  await denied('expired_or_future_proof',scenario(),{...base,expiresAtMs:NOW});
  await denied('expired_or_future_proof',scenario(),{...base,issuedAtMs:NOW+1});
  await denied('expired_or_future_proof',scenario(),{...base,expiresAtMs:NOW+60000});
});
test('S1-15 untrusted version syntax, leading zeros, unsafe max and number all reject',async()=>{
  for(const rev of ['01','-1','1.0','18446744073709551616',1 as unknown as string]){
    assert.equal(isCanonicalVersion(rev),false);
    await denied('invalid_or_noncanonical_version',scenario(),{...base,restoreEpoch:rev});
  }
  assert.equal(isCanonicalVersion('18446744073709551615'),true);
});
test('S1-16 cannot pass off fake as real issuer or audience',async()=>{
  await denied('wrong_schema_or_audience',scenario(),{...base,audience:'prod' as typeof base.audience});
});
test('S1-17 2000 fake users all fail when central authority is unavailable',async()=>{
  const f=scenario();f.setAnchor(null);
  const decisions=await Promise.all(Array.from({length:2000},()=>run(f)));
  assert.equal(decisions.filter(x=>x.simulatedAllowed).length,0);
  assert.ok(decisions.every(x=>x.productionAuthorized===false&&x.sideEffects===0));
});
