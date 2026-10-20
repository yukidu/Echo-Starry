/**
 * AI4 N1A-S3A integration: actually invokes BOTH unchanged offline modules.
 * This never authenticates anyone, performs I/O, publishes text or permits
 * runtime use. Its two mock "independent" witnesses are from one fake object.
 */
import {
  evaluateS3aFakeEnvelope,N1A_S3A_PRODUCTION_GATE,
  type S3aEnvelope,type S3aExpected,type S3aFakeReaders,
  type S3aCurrentMembership,type S3aCurrentResource,
  type S3aDecision,type S3aPhase,
} from '../security-contract-v1/s3aEnvelope.ts';
import {
  simulateProtectedQA,MutableFakeAuthority,
  N1A_AI4_PRODUCTION_ENABLED,type FakeSourceRef,
  type FakeHooks,type FakeProof,
} from './searchCitationFake.ts';

export const AI4_S3A_FAKE_INTEGRATION_ONLY=true as const;
export const AI4_S3A_PRODUCTION_ENABLED=false as const;
const OFFLINE_FAKE_REGISTRY_TICKET='AI4-S3A-only-fixture-ticket';
type SearchPhase=Extract<S3aPhase,'T0'|'T1'|'T2'|'SEND'>;
export type Ai4S3aHooks=FakeHooks;
export type Ai4S3aHarness=Readonly<{
  auth:MutableFakeAuthority;
  subjectId:string;requestId:string;
  resources:readonly FakeSourceRef[];
  /** User/test faults between stages. Never a real authority. */
  hooks?:Ai4S3aHooks;
  /** Simulated witness transport can become unavailable. */
  witnessOnline?:()=>boolean;
  checkpointOnline?:()=>boolean;
  registryOnline?:()=>boolean;
}>;
export type Ai4S3aResult=Readonly<{
  status:'FAKE_ONLY_ALLOWED'|'DENIED';
  phase:SearchPhase;
  reason:string;
  fakeReleasedTexts:readonly string[];
  sharedPhases:readonly SearchPhase[];
  productionAuthorized:false;
  providerCalls:0;
  restoreWrites:0;
  irreversibleActionsAllowed:false;
}>;

function verdict(phase:SearchPhase,reason:string,
  sharedPhases:readonly SearchPhase[],fakeReleasedTexts:readonly string[]=[]):Ai4S3aResult {
  return {status:reason==='FAKE_ONLY_ALLOWED'?'FAKE_ONLY_ALLOWED':'DENIED',
    phase,reason,sharedPhases: [...sharedPhases],fakeReleasedTexts,
    productionAuthorized:false,providerCalls:0,restoreWrites:0,
    irreversibleActionsAllowed:false};
}
/**
 * The caller passes only source metadata. A sealed envelope is issued ONCE
 * from S1's private, mock authority, and is kept FROZEN for all four reads.
 * Reissuing it at T1/T2/SEND would hide revocations/version changes.
 */
function sealEnvelope(s1:FakeProof):S3aEnvelope{
  return {
    schemaVersion:'N1A-S3A-FAKE-v1',
    issuer:'fake-starry-id-and-independent-witness',
    audience:'n1a-s3a-offline-only',appId:'echo',subjectId:s1.subjectId,
    requestId:s1.requestId,nonce:'AI4-S3A-fixture-nonce',
    action:'transcript.searchEvidence',
    sessionRevision:'1',membershipRevision:s1.memberRevision,
    securitySeq:s1.witnessSeq,checkpointSeq:s1.checkpointSeq,
    restoreEpoch:s1.restoreEpoch,revocationWatermark:s1.revocationWatermark,
    deletionWatermark:s1.deletionWatermark,
    issuedAtMs:s1.issuedAtMs,expiresAtMs:s1.expiresAtMs,
    approvalGrantId:'',fakeAttestation:OFFLINE_FAKE_REGISTRY_TICKET,
    resources:s1.source.map(s=>({
      resourceId:s.trackId,sourceRevision:s.sourceRevision,
      contentDigest:s.contentDigest,activeTranscriptVersion:s.version,
      permissionRevision:s.permissionRevision,
      correctionRevision:s.correctionRevision,
    })),
  };
}
function fakeReaders(h:Ai4S3aHarness):S3aFakeReaders{
  const a=h.auth;
  return {
    verifyFakeAttestation:async p=>h.registryOnline?.()!==false &&
      p.fakeAttestation===OFFLINE_FAKE_REGISTRY_TICKET,
    readMembership:async (subjectId,appId):Promise<S3aCurrentMembership|null>=>{
      if(a.offline || appId!=='echo'||subjectId!==a.subjectId)return null;
      return {subjectId:a.subjectId,active:a.active,appAllowed:a.active,
        centralSuperAdmin:false,sessionRevision:'1',
        membershipRevision:a.memberRevision};
    },
    readWitness:async ()=>{
      if(a.offline||h.witnessOnline?.()===false)return null;
      return {sourceId:'fake-witness',securitySeq:a.witnessSeq,
        restoreEpoch:a.epoch,revocationWatermark:a.revokeSeq,
        deletionWatermark:a.deleteSeq};
    },
    readIndependentCheckpoint:async ()=>{
      if(a.offline||h.checkpointOnline?.()===false)return null;
      // Mock-only! Both readers share one JS fixture; cannot demonstrate
      // real outside-restore-domain independence or a genuine signed head.
      return {sourceId:'fake-independent-checkpoint',
        checkpointSeq:a.checkpointSeq,headSeq:a.witnessSeq,
        restoreEpoch:a.epoch};
    },
    readResource:async (appId,trackId,subjectId):Promise<S3aCurrentResource|null>=>{
      if(appId!=='echo'||subjectId!==a.subjectId)return null;
      // This is the ORIGINAL S1 authority.read(), not an adapted
      // duplicate entitlement function.
      const proof=await a.read(subjectId,h.requestId,[trackId]);
      const r=proof?.source[0];
      if(!r)return null;
      return {resourceId:r.trackId,sourceRevision:r.sourceRevision,
        contentDigest:r.contentDigest,activeTranscriptVersion:r.version,
        permissionRevision:r.permissionRevision,
        correctionRevision:r.correctionRevision,entitled:r.entitled,
        revoked:r.revoked,deleted:r.deleted,
        revocationPending:r.revocationPending};
    },
  };
}
/** No side effects; dummy text must never reach any real caller. */
export async function runAi4S3aFakeCitation(h:Ai4S3aHarness):Promise<Ai4S3aResult>{
  if(N1A_S3A_PRODUCTION_GATE!==false || N1A_AI4_PRODUCTION_ENABLED!==false ||
    !h.subjectId||!h.requestId||h.resources.length===0||
    h.resources.length>5||h.resources.some(r=>!r||typeof r!=='object'||'text' in r))
    return verdict('T0','FAKE_METADATA_OR_GATE_INVALID',[]);
  // Source list is entirely non-sensitive metadata; do not fetch plain text.
  const s1=await h.auth.read(h.subjectId,h.requestId,h.resources.map(r=>r.trackId))
    .catch(()=>null);
  if(!s1)return verdict('T0','FAKE_PROOF_MISSING',[]);
  const sealed=sealEnvelope(s1);
  const expected:S3aExpected={appId:'echo',subjectId:h.subjectId,
    requestId:h.requestId,action:'transcript.searchEvidence',
    resourceIds:h.resources.map(r=>r.trackId)};
  const readers=fakeReaders(h);
  const phases:SearchPhase[]=[];
  let failure:{phase:SearchPhase;reason:string}|null=null;
  const check=async (phase:SearchPhase):Promise<boolean>=>{
    phases.push(phase);
    const decision:S3aDecision=await evaluateS3aFakeEnvelope(
      sealed,expected,readers,phase,h.auth.clock);
    if(decision.productionAuthorized!==false ||
       decision.providerCalls!==0||decision.restoreWrites!==0||
       decision.irreversibleActionsAllowed!==false||
       !decision.simulatedAllowed){
      failure={phase,reason:decision.reason};
      return false;
    }
    return true;
  };
  if(!await check('T0'))return verdict('T0',failure?.reason??'T0_DENIED',phases);
  const reject=async (phase:SearchPhase)=>{
    if(!await check(phase))throw new Error('FAKE_SHARED_GATE_REJECT');
  };
  // The ORIGINAL AI4 S1 simulateProtectedQA() handles its separate T0/T1/
  // T2 + final synchronous mock SEND gate, including contentDigest and
  // private body loading only after permission gates.
  const outcome=await simulateProtectedQA({
    authority:h.auth,subjectId:h.subjectId,requestId:h.requestId,
    candidates:h.resources,nowMs:()=>h.auth.clock,
    hooks:{
      afterT0:h.hooks?.afterT0,
      afterSQL:async()=>{await h.hooks?.afterSQL?.();await reject('T1');},
      afterT1:async()=>{await h.hooks?.afterT1?.();await reject('T2');},
      beforeSend:async()=>{await h.hooks?.beforeSend?.();await reject('SEND');},
    },
  });
  if(failure!==null) {
    const error=failure as {phase:SearchPhase;reason:string};
    return verdict(error.phase,error.reason,phases);
  }
  if(outcome.reason!=='fake_admitted'||outcome.stage!=='SEND'||
     outcome.productionAuthorized!==false||outcome.sideEffects!==0||
     phases.join(',')!=='T0,T1,T2,SEND')
    return verdict(outcome.stage,'S1_CITATION_GUARD_DENIED:'+outcome.reason,phases);
  return verdict('SEND','FAKE_ONLY_ALLOWED',phases,outcome.released);
}
