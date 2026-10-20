/**
 * N1A-S3A common OFFLINE envelope. This is a deliberately powerless mock.
 * Not a cryptographic verifier, signing service, real membership reader,
 * non-rollback ledger, billing gate, published content reader, or restore API.
 * NEVER import this module into Workers, production routers, or migrations.
 */
export const N1A_S3A_PRODUCTION_GATE = false as const;
export type S3aAction = 'transcript.publish'|'transcript.searchEvidence'|'ai.attempt'|'backup.preflight'|'backup.commit';
export type S3aPhase = 'T0'|'T1'|'T2'|'SEND'|'before_commit';
export type S3aResourceProof = Readonly<{
  resourceId:string;
  sourceRevision:string; // opaque resource content/ETag. NOT F22 eventRevision
  contentDigest:string; // SHA-256 over exact content which will be released
  activeTranscriptVersion:string;
  permissionRevision:string;
  correctionRevision:string;
}>;
export type S3aEnvelope = Readonly<{
  schemaVersion:'N1A-S3A-FAKE-v1';
  issuer:'fake-starry-id-and-independent-witness';
  audience:'n1a-s3a-offline-only';
  appId:string;
  subjectId:string;
  requestId:string;
  nonce:string;
  action:S3aAction;
  sessionRevision:string;
  membershipRevision:string; // per-person ID revision, NOT ledger headSeq
  securitySeq:string;
  checkpointSeq:string;
  restoreEpoch:string;
  revocationWatermark:string;
  deletionWatermark:string;
  issuedAtMs:number;
  expiresAtMs:number;
  approvalGrantId:string; // required only for ai.attempt
  resources:readonly S3aResourceProof[];
  fakeAttestation:string; // test-only registry evidence; NOT a signature
}>;
export type S3aCurrentMembership = Readonly<{
  subjectId:string;
  active:boolean;
  appAllowed:boolean;
  centralSuperAdmin:boolean;
  sessionRevision:string;
  membershipRevision:string;
}>;
export type S3aCurrentWitness = Readonly<{
  sourceId:'fake-witness';
  securitySeq:string;
  restoreEpoch:string;
  revocationWatermark:string;
  deletionWatermark:string;
}>;
export type S3aIndependentCheckpoint = Readonly<{
  sourceId:'fake-independent-checkpoint';
  checkpointSeq:string;
  headSeq:string;
  restoreEpoch:string;
}>;
export type S3aCurrentResource = S3aResourceProof & Readonly<{
  entitled:boolean;
  revoked:boolean;
  deleted:boolean;
  revocationPending:boolean;
}>;
export type S3aFakeReaders = Readonly<{
  verifyFakeAttestation(envelope:S3aEnvelope):Promise<boolean>;
  readMembership(subjectId:string,appId:string):Promise<S3aCurrentMembership|null>;
  readWitness():Promise<S3aCurrentWitness|null>;
  readIndependentCheckpoint():Promise<S3aIndependentCheckpoint|null>;
  readResource(appId:string,resourceId:string,subjectId:string):Promise<S3aCurrentResource|null>;
}>;
export type S3aExpected = Readonly<{
  appId:string;subjectId:string;requestId:string;action:S3aAction;
  resourceIds:readonly string[];
}>;
export type S3aDecision = Readonly<{
  simulatedAllowed:boolean;
  productionAuthorized:false;
  irreversibleActionsAllowed:false;
  providerCalls:0;
  restoreWrites:0;
  phase:S3aPhase;
  reason:string;
}>;
const UINT64=(1n<<64n)-1n;
const ID=/^[A-Za-z0-9_.:-]{1,160}$/;
const SHA=/^[0-9a-f]{64}$/;
const id=(v:unknown):v is string=>typeof v==='string'&&ID.test(v);
export function s3aUint64(v:unknown):v is string {
  if(typeof v!=='string'||! /^(0|[1-9][0-9]{0,19})$/.test(v))return false;
  try{return BigInt(v)<=UINT64;}catch{return false;}
}
const versionInResource=(v:S3aResourceProof)=>id(v.resourceId)&&
  typeof v.sourceRevision==='string'&&v.sourceRevision.length>0&&v.sourceRevision.length<=256&&
  !/[\u0000-\u001f]/.test(v.sourceRevision)&&SHA.test(v.contentDigest)&&
  id(v.activeTranscriptVersion)&&s3aUint64(v.permissionRevision)&&
  s3aUint64(v.correctionRevision);
const result=(phase:S3aPhase,reason:string):S3aDecision=>({
  simulatedAllowed:reason==='FAKE_EVIDENCE_CONSISTENT',
  productionAuthorized:false,irreversibleActionsAllowed:false,
  providerCalls:0,restoreWrites:0,phase,reason,
});
/** Re-read all three test trust domains for EVERY phase, including SEND.
 * Consistency is only a property of fake fixtures, not proof of true isolation.
 */
export async function evaluateS3aFakeEnvelope(
  envelope:S3aEnvelope, expected:S3aExpected, readers:S3aFakeReaders,
  phase:S3aPhase,nowMs:number
):Promise<S3aDecision>{
  const deny=(reason:string)=>result(phase,reason);
  if(!envelope||envelope.schemaVersion!=='N1A-S3A-FAKE-v1'||
    envelope.issuer!=='fake-starry-id-and-independent-witness'||
    envelope.audience!=='n1a-s3a-offline-only')return deny('WRONG_FAKE_SCHEMA');
  if(!id(envelope.subjectId)||!id(envelope.appId)||!id(envelope.requestId)||
    !id(envelope.nonce)||!id(expected.subjectId)||!id(expected.appId)||!id(expected.requestId)||
    envelope.subjectId!==expected.subjectId||envelope.appId!==expected.appId||
    envelope.requestId!==expected.requestId||envelope.action!==expected.action)return deny('ACTION_SCOPE_MISMATCH');
  if(!(['T0','T1','T2','SEND','before_commit'] as readonly string[]).includes(phase))
    return deny('UNKNOWN_PHASE');
  if((envelope.action==='transcript.searchEvidence'&&phase==='before_commit')||
    (envelope.action!=='transcript.searchEvidence'&&phase!=='before_commit'))
    return deny('ACTION_PHASE_MISMATCH');
  const size=envelope.resources?.length;
  if(!Array.isArray(envelope.resources)||!size||size>5||
    !Array.isArray(expected.resourceIds)||expected.resourceIds.length!==size||
    !envelope.resources.every(versionInResource)||
    new Set(envelope.resources.map(x=>x.resourceId)).size!==size||
    envelope.resources.some((x,i)=>x.resourceId!==expected.resourceIds[i]))
    return deny('RESOURCE_SCOPE_MISMATCH');
  if(envelope.action==='ai.attempt'&&!id(envelope.approvalGrantId))
    return deny('APPROVAL_GRANT_REQUIRED');
  if(!s3aUint64(envelope.membershipRevision)||!s3aUint64(envelope.sessionRevision)||
    !s3aUint64(envelope.securitySeq)||!s3aUint64(envelope.checkpointSeq)||
    !s3aUint64(envelope.restoreEpoch)||!s3aUint64(envelope.revocationWatermark)||
    !s3aUint64(envelope.deletionWatermark))return deny('INVALID_VERSION');
  if(BigInt(envelope.securitySeq)<BigInt(envelope.checkpointSeq))
    return deny('KNOWN_CHECKPOINT_AHEAD');
  if(!Number.isSafeInteger(nowMs)||!Number.isSafeInteger(envelope.issuedAtMs)||
    !Number.isSafeInteger(envelope.expiresAtMs)||
    envelope.issuedAtMs>nowMs||envelope.expiresAtMs<=nowMs||
    envelope.expiresAtMs<=envelope.issuedAtMs||
    envelope.expiresAtMs-envelope.issuedAtMs>30_000)
    return deny('PROOF_EXPIRED_OR_FUTURE');
  if(typeof envelope.fakeAttestation!=='string'||envelope.fakeAttestation.length===0)
    return deny('FAKE_ATTESTATION_MISSING');
  try {
    if(await readers.verifyFakeAttestation(envelope)!==true)
      return deny('FAKE_ATTESTATION_NOT_IN_REGISTRY');
    const m=await readers.readMembership(envelope.subjectId,envelope.appId);
    if(!m||m.subjectId!==envelope.subjectId||!m.active||!m.appAllowed)
      return deny('STARRY_ID_MEMBER_UNAVAILABLE');
    if(m.sessionRevision!==envelope.sessionRevision||
      m.membershipRevision!==envelope.membershipRevision||
      !s3aUint64(m.sessionRevision)||!s3aUint64(m.membershipRevision))
      return deny('MEMBERSHIP_REVISION_MISMATCH');
    if((envelope.action==='backup.preflight'||envelope.action==='backup.commit')&&
      !m.centralSuperAdmin)return deny('CENTRAL_ADMIN_REQUIRED');
    const witness=await readers.readWitness();
    const checkpoint=await readers.readIndependentCheckpoint();
    if(!witness||witness.sourceId!=='fake-witness'||!checkpoint||
      checkpoint.sourceId!=='fake-independent-checkpoint')
      return deny('WITNESS_UNKNOWN');
    if(![witness.securitySeq,witness.restoreEpoch,witness.revocationWatermark,
      witness.deletionWatermark,checkpoint.checkpointSeq,checkpoint.headSeq,
      checkpoint.restoreEpoch].every(s3aUint64))
      return deny('WITNESS_INVALID_VERSION');
    if(witness.securitySeq!==envelope.securitySeq||
      checkpoint.headSeq!==envelope.securitySeq||
      checkpoint.checkpointSeq!==envelope.checkpointSeq||
      witness.restoreEpoch!==envelope.restoreEpoch||
      checkpoint.restoreEpoch!==envelope.restoreEpoch||
      witness.revocationWatermark!==envelope.revocationWatermark||
      witness.deletionWatermark!==envelope.deletionWatermark||
      BigInt(checkpoint.headSeq)<BigInt(checkpoint.checkpointSeq))
      return deny('INDEPENDENT_WITNESS_CONFLICT');
    for(const source of envelope.resources){
      const current=await readers.readResource(envelope.appId,source.resourceId,envelope.subjectId);
      if(!current||!current.entitled||current.deleted||current.revoked||
        current.revocationPending)return deny('RESOURCE_NOT_CURRENTLY_ENTITLED');
      if(!versionInResource(current))return deny('INVALID_CURRENT_RESOURCE');
      if(current.sourceRevision!==source.sourceRevision||
        current.contentDigest!==source.contentDigest||
        current.activeTranscriptVersion!==source.activeTranscriptVersion||
        current.permissionRevision!==source.permissionRevision||
        current.correctionRevision!==source.correctionRevision)
        return deny('RESOURCE_SOURCE_OR_PERMISSION_CHANGED');
    }
    return result(phase,'FAKE_EVIDENCE_CONSISTENT');
  } catch {
    return deny('AUTHORITY_UNREACHABLE');
  }
}
