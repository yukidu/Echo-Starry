import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateS3aFakeEnvelope,N1A_S3A_PRODUCTION_GATE,s3aUint64,
  type S3aEnvelope,type S3aFakeReaders,type S3aExpected,
  type S3aCurrentMembership,type S3aCurrentWitness,
  type S3aIndependentCheckpoint,type S3aCurrentResource,
} from '../security-contract-v1/s3aEnvelope.ts';

const now=1_792_500_000_000, digest='a'.repeat(64);
const f1:S3aCurrentResource={
  resourceId:'track-one',sourceRevision:'etag-one',contentDigest:digest,
  activeTranscriptVersion:'v1',permissionRevision:'2',correctionRevision:'7',
  entitled:true,revoked:false,deleted:false,revocationPending:false,
};
const f2:S3aCurrentResource={...f1,resourceId:'track-two',sourceRevision:'etag-two',contentDigest:'b'.repeat(64)};
const proof:S3aEnvelope={
  schemaVersion:'N1A-S3A-FAKE-v1',issuer:'fake-starry-id-and-independent-witness',
  audience:'n1a-s3a-offline-only',appId:'echo',subjectId:'member-one',
  requestId:'req-one',nonce:'nonce-one',action:'transcript.searchEvidence',
  sessionRevision:'4',membershipRevision:'5',securitySeq:'19',
  checkpointSeq:'19',restoreEpoch:'6',revocationWatermark:'3',
  deletionWatermark:'4',issuedAtMs:now-1000,expiresAtMs:now+4000,
  approvalGrantId:'',fakeAttestation:'fake-known-registry-ticket',
  resources:[f1,f2].map(({entitled,revoked,deleted,revocationPending,...r})=>r),
};
const expected:S3aExpected={appId:'echo',subjectId:'member-one',
  requestId:'req-one',action:'transcript.searchEvidence',
  resourceIds:['track-one','track-two']};
function make(){
  let allowAttestation=true,member:S3aCurrentMembership|null={
    subjectId:'member-one',active:true,appAllowed:true,centralSuperAdmin:false,
    sessionRevision:'4',membershipRevision:'5',
  },witness:S3aCurrentWitness|null={
    sourceId:'fake-witness',securitySeq:'19',restoreEpoch:'6',
    revocationWatermark:'3',deletionWatermark:'4',
  },checkpoint:S3aIndependentCheckpoint|null={
    sourceId:'fake-independent-checkpoint',checkpointSeq:'19',
    headSeq:'19',restoreEpoch:'6',
  };
  const resources=new Map<string,S3aCurrentResource>([[f1.resourceId,f1],[f2.resourceId,f2]]);
  const reads={attest:0,membership:0,witness:0,checkpoint:0,resource:0};
  const readers:S3aFakeReaders={
    verifyFakeAttestation:async()=>{reads.attest++;return allowAttestation},
    readMembership:async()=>{reads.membership++;return member},
    readWitness:async()=>{reads.witness++;return witness},
    readIndependentCheckpoint:async()=>{reads.checkpoint++;return checkpoint},
    readResource:async(_app,id)=>{reads.resource++;return resources.get(id)??null},
  };
  return{readers,reads,resources,setMember:(v:S3aCurrentMembership|null)=>{member=v},
    member:()=>member!,witness:()=>witness!,checkpoint:()=>checkpoint!,
    setWitness:(v:S3aCurrentWitness|null)=>{witness=v},
    setCheckpoint:(v:S3aIndependentCheckpoint|null)=>{checkpoint=v},
    setAttestation:(v:boolean)=>{allowAttestation=v},
  };
}
const run=(x:ReturnType<typeof make>,p=proof,e=expected,phase:'T0'|'T1'|'T2'|'SEND'|'before_commit'='T0')=>
  evaluateS3aFakeEnvelope(p,e,x.readers,phase,now);
async function deny(code:string,x:ReturnType<typeof make>,p=proof,e=expected,phase:'T0'|'T1'|'T2'|'SEND'|'before_commit'='T0'){
  const v=await run(x,p,e,phase);
  assert.equal(v.simulatedAllowed,false);assert.equal(v.productionAuthorized,false);
  assert.equal(v.irreversibleActionsAllowed,false);
  assert.equal(v.providerCalls,0);assert.equal(v.restoreWrites,0);
  assert.equal(v.reason,code);
}
test('S3A-01 offline gate permanently OFF; even mock success no real permission',async()=>{
  assert.equal(N1A_S3A_PRODUCTION_GATE,false);
  const d=await run(make());
  assert.equal(d.reason,'FAKE_EVIDENCE_CONSISTENT');
  assert.equal(d.simulatedAllowed,true);
  assert.equal(d.productionAuthorized,false);
  assert.equal(d.irreversibleActionsAllowed,false);
  assert.equal(d.providerCalls,0);
  assert.equal(d.restoreWrites,0);
});
test('S3A-02 both track-specific entitlements required',async()=>{
  const s=make();s.resources.set('track-two',{...f2,entitled:false});
  await deny('RESOURCE_NOT_CURRENTLY_ENTITLED',s);
});
test('S3A-03 revoked, pending, deleted resource are denied',async()=>{
  for(const key of ['revoked','revocationPending','deleted'] as const){
    const s=make();s.resources.set('track-two',{...f2,[key]:true});
    await deny('RESOURCE_NOT_CURRENTLY_ENTITLED',s);
  }
});
test('S3A-04 T0/T1/T2/SEND each rereads live fake evidence',async()=>{
  const s=make();
  for(const phase of ['T0','T1','T2','SEND'] as const){
    assert.equal((await run(s,proof,expected,phase)).simulatedAllowed,true);
  }
  assert.deepEqual(s.reads,{attest:4,membership:4,witness:4,checkpoint:4,resource:8});
  s.resources.set('track-one',{...f1,revocationPending:true});
  await deny('RESOURCE_NOT_CURRENTLY_ENTITLED',s,proof,expected,'SEND');
});
test('S3A-05 changed content hash is rejected even if ETag stays same',async()=>{
  const s=make();s.resources.set('track-one',{...f1,contentDigest:'c'.repeat(64)});
  await deny('RESOURCE_SOURCE_OR_PERMISSION_CHANGED',s);
});
test('S3A-06 corrected version, transcript version and permission each rejected',async()=>{
  for(const diff of [{correctionRevision:'8'},{activeTranscriptVersion:'v2'},{permissionRevision:'3'}]){
    const s=make();s.resources.set('track-two',{...f2,...diff});
    await deny('RESOURCE_SOURCE_OR_PERMISSION_CHANGED',s);
  }
});
test('S3A-07 ID active false, role false, session stale are fail-closed',async()=>{
  const s=make();s.setMember({...s.member(),active:false});
  await deny('STARRY_ID_MEMBER_UNAVAILABLE',s);
  const t=make();t.setMember({...t.member(),appAllowed:false});
  await deny('STARRY_ID_MEMBER_UNAVAILABLE',t);
  const u=make();u.setMember({...u.member(),sessionRevision:'6'});
  await deny('MEMBERSHIP_REVISION_MISMATCH',u);
});
test('S3A-08 witness rollback, checkpoint conflict, deletion watermark and epoch mismatches',async()=>{
  const s=make();s.setWitness({...s.witness(),securitySeq:'18'});
  await deny('INDEPENDENT_WITNESS_CONFLICT',s);
  const t=make();t.setCheckpoint({...t.checkpoint(),checkpointSeq:'20'});
  await deny('KNOWN_CHECKPOINT_AHEAD',t,{...proof,checkpointSeq:'20'});
  const u=make();u.setWitness({...u.witness(),deletionWatermark:'5'});
  await deny('INDEPENDENT_WITNESS_CONFLICT',u);
  const v=make();v.setCheckpoint({...v.checkpoint(),restoreEpoch:'5'});
  await deny('INDEPENDENT_WITNESS_CONFLICT',v);
});
test('S3A-09 witness missing, attestation missing, permission reader throws: deny',async()=>{
  const s=make();s.setWitness(null);await deny('WITNESS_UNKNOWN',s);
  const t=make();t.setAttestation(false);
  await deny('FAKE_ATTESTATION_NOT_IN_REGISTRY',t);
  const u=make();const readers={...u.readers,readResource:async()=>{throw Error('offline')}};
  const d=await evaluateS3aFakeEnvelope(proof,expected,readers,'SEND',now);
  assert.equal(d.reason,'AUTHORITY_UNREACHABLE');assert.equal(d.productionAuthorized,false);
});
test('S3A-10 action/resource list scope, duplicate tracks, mismatch all fail',async()=>{
  await deny('ACTION_SCOPE_MISMATCH',make(),proof,{...expected,appId:'go'});
  await deny('RESOURCE_SCOPE_MISMATCH',make(),proof,{...expected,resourceIds:['track-one']});
  await deny('RESOURCE_SCOPE_MISMATCH',make(),{...proof,resources:[proof.resources[0],proof.resources[0]]});
});
test('S3A-11 stage bound to action and AI grant required',async()=>{
  await deny('ACTION_PHASE_MISMATCH',make(),proof,expected,'before_commit');
  const p={...proof,action:'ai.attempt' as const,resources:[proof.resources[0]]};
  const e={...expected,action:'ai.attempt' as const,resourceIds:['track-one']};
  await deny('APPROVAL_GRANT_REQUIRED',make(),p,e,'before_commit');
  const t=make();
  assert.equal((await run(t,{...p,approvalGrantId:'grant-one'},e,'before_commit')).simulatedAllowed,true);
});
test('S3A-12 backup approval requires central superadmin and never restores',async()=>{
  const p={...proof,action:'backup.preflight' as const,resources:[proof.resources[0]]};
  const e={...expected,action:'backup.preflight' as const,resourceIds:['track-one']};
  await deny('CENTRAL_ADMIN_REQUIRED',make(),p,e,'before_commit');
  const x=make();x.setMember({...x.member(),centralSuperAdmin:true});
  const d=await run(x,p,e,'before_commit');
  assert.equal(d.simulatedAllowed,true);assert.equal(d.restoreWrites,0);
});
test('S3A-13 canonical uint64 without float coercion, long/expired proofs denied',async()=>{
  for(const value of ['01','-1','18446744073709551616',3]){
    assert.equal(s3aUint64(value),false);
    await deny('INVALID_VERSION',make(),{...proof,securitySeq:value as string});
  }
  assert.equal(s3aUint64('18446744073709551615'),true);
  await deny('PROOF_EXPIRED_OR_FUTURE',make(),{...proof,issuedAtMs:now+1});
  await deny('PROOF_EXPIRED_OR_FUTURE',make(),{...proof,expiresAtMs:now});
});
test('S3A-14 2,000 fake calls when ID unavailable never approve or call provider',async()=>{
  const s=make();s.setMember(null);
  const out=await Promise.all(Array.from({length:2000},()=>run(s)));
  assert.equal(out.filter(x=>x.simulatedAllowed).length,0);
  assert.ok(out.every(x=>x.productionAuthorized===false&&x.providerCalls===0&&x.restoreWrites===0));
});
