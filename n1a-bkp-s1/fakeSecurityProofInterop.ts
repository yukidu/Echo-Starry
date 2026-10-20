/**
 * N1A-S1 AI7 SECOND ROUND. OFFLINE ONLY.
 * Wire-shaped compatibility adapter for AI2 Draft #469's FAKE SecurityProofV1.
 * The upstream Draft is not merged into main. This intentionally does NOT import
 * or copy its implementation, sign real evidence, execute RESTORE/DELETE, or
 * substitute independently authenticated runtime authority.
 */
import {
  isCanonicalBkpVersion, type MockWitness, type MockIndependentHead,
  type MockStarryId, type SimulatedRestoreDecision
} from './fakeRestoreGate.ts';
export const N1A_BKP_INTEROP_RUNTIME_ENABLED = false as const;

export type Ai2FakeProofWire = Readonly<{
  schemaVersion: 'N1A-S1-FAKE-v1';
  issuer: 'fake-star-id-plus-witness';
  audience: 'n1a-offline-only';
  subjectId: string; appId: string;
  action: 'backup.preflight' | 'backup.commit';
  resourceId: string; requestId: string; nonce: string;
  membershipRevision: string; permissionRevision: string;
  correctionRevision: string; sourceRevision: string;
  securitySeq: string; restoreEpoch: string;
  revocationWatermark: string; deletionWatermark: string;
  issuedAtMs: number; expiresAtMs: number;
  approvalGrantId: string; fakeAttestation: string;
}>;
export type FakeWitnessWatermarks = Readonly<{
  sourceId: string; headSeq: string; headHash: string;
  revocationWatermark: string; deletionWatermark: string;
}>;
export type FakeInteropEvidence = Readonly<{
  proof: Ai2FakeProofWire;
  witness: MockWitness | null;
  independentHead: MockIndependentHead | null;
  starryId: MockStarryId | null;
  /** Member-specific revision, not overall Starry ID database revision! */
  subjectMembershipRevision: string | null;
  /** Fake, currently active central role, not a real identity proof. */
  subjectIsCurrentCentralAdmin: boolean;
  /** Separately injected fake event watermarks, each tied to current head. */
  ledgerWatermarks: FakeWitnessWatermarks | null;
  independentWatermarks: FakeWitnessWatermarks | null;
}>;
export type FakeInteropRequest = Readonly<{
  requestId: string; backupId: string; appId: string;
  reviewerSubjectId: string; nowMs: number;
  precheck: FakeInteropEvidence; beforeCommit: FakeInteropEvidence;
  bkpDecision: SimulatedRestoreDecision;
}>;
export type FakeInteropDecision = Readonly<{
  simulatedConsistent: boolean;
  productionAuthorized: false;
  executableRestore: false;
  executableDelete: false;
  sideEffects: 0;
  reasons: readonly string[];
  /** Review-only labels. NEVER usable as delete instructions. */
  cleanupReviewOnly: readonly string[];
  executableCleanupCandidates: readonly string[];
}>;
const ID=/^[A-Za-z0-9_.:-]{1,160}$/;
const SHA=/^[0-9a-f]{64}$/;
function check(snapshot:FakeInteropEvidence,x:FakeInteropRequest,why:Set<string>,stage:'precheck'|'before_commit') {
  const p=snapshot.proof;
  if(!p||p.schemaVersion!=='N1A-S1-FAKE-v1'||p.issuer!=='fake-star-id-plus-witness'||
     p.audience!=='n1a-offline-only'||p.appId!==x.appId||
     p.action!=='backup.preflight'&&p.action!=='backup.commit'||
     p.requestId!==x.requestId||p.resourceId!==x.backupId||
     p.subjectId!==x.reviewerSubjectId||!ID.test(p.nonce)||
     !ID.test(p.subjectId)||!ID.test(p.resourceId)||!ID.test(p.requestId)||
     !ID.test(p.appId)||!p.fakeAttestation)
    why.add('PROOF_SCOPE_OR_SCHEMA_INVALID');
  for(const v of [p.membershipRevision,p.permissionRevision,p.correctionRevision,
     p.securitySeq,p.restoreEpoch,p.revocationWatermark,p.deletionWatermark,
     snapshot.subjectMembershipRevision])
    if(!isCanonicalBkpVersion(v))why.add('PROOF_VERSION_INVALID');
  // Source revision is an OPAQUE string (content ETag/digest); it is not
  // AI5's numeric statistics event version or a witness sequence.
  if(!ID.test(p.sourceRevision))why.add('SOURCE_REVISION_OPAQUE_INVALID');
  if(!Number.isSafeInteger(x.nowMs)||!Number.isSafeInteger(p.issuedAtMs)||
     !Number.isSafeInteger(p.expiresAtMs)||p.issuedAtMs>x.nowMs||
     p.expiresAtMs<=x.nowMs||p.expiresAtMs<=p.issuedAtMs||
     p.expiresAtMs-p.issuedAtMs>30000)why.add('PROOF_STALE_OR_FUTURE');
  if(!snapshot.subjectIsCurrentCentralAdmin||!snapshot.starryId||
     !snapshot.starryId.members.some(m=>m.id===p.subjectId&&m.active&&m.centralSuperAdmin))
    why.add('CURRENT_ADMIN_UNVERIFIED');
  if(snapshot.subjectMembershipRevision!==p.membershipRevision)
    why.add('MEMBER_SPECIFIC_REVISION_CONFLICT');
  const w=snapshot.witness,h=snapshot.independentHead,id=snapshot.starryId;
  if(!w||!h||!id){why.add('AUTHORITY_UNAVAILABLE');return}
  // Overall DB revision and per-member revision are DIFFERENT counters.
  if(!isCanonicalBkpVersion(id.revision)||
     !isCanonicalBkpVersion(w.minStarryIdRevision)||
     BigInt(id.revision)<BigInt(w.minStarryIdRevision))
    why.add('GLOBAL_STARRY_ID_ROLLBACK');
  if(w.headSeq!==h.headSeq||w.headHash!==h.headHash||
     w.restoreEpoch!==h.restoreEpoch||w.sourceId===h.sourceId||
     !SHA.test(w.headHash))why.add('INDEPENDENT_HEAD_CONFLICT');
  if(p.securitySeq!==w.headSeq||p.restoreEpoch!==w.restoreEpoch)
    why.add('SECURITY_SEQ_OR_EPOCH_MISMATCH');
  const lw=snapshot.ledgerWatermarks,iw=snapshot.independentWatermarks;
  if(!lw||!iw){why.add('WATERMARK_EVIDENCE_MISSING');return}
  if(!lw.sourceId||!iw.sourceId||lw.sourceId===iw.sourceId||
     lw.sourceId===id.revision||lw.headSeq!==w.headSeq||iw.headSeq!==h.headSeq||
     lw.headHash!==w.headHash||iw.headHash!==h.headHash)
    why.add('WATERMARK_WITNESS_UNTRUSTED');
  for(const v of [lw.revocationWatermark,lw.deletionWatermark,
     iw.revocationWatermark,iw.deletionWatermark])
    if(!isCanonicalBkpVersion(v))why.add('WATERMARK_INVALID');
  if(lw.revocationWatermark!==iw.revocationWatermark||
     lw.deletionWatermark!==iw.deletionWatermark||
     p.revocationWatermark!==lw.revocationWatermark||
     p.deletionWatermark!==lw.deletionWatermark)
    why.add('REVOCATION_OR_DELETION_WATERMARK_MISMATCH');
  // stage intentionally included in audit reason only; never grants authority.
  void stage;
}
/** Recheck evidence at two explicit phases and require same request+head+watermarks.
 * Never returns an executable RESTORE/DELETE instruction, even when all Fake gates pass.
 */
export function simulateAi7Ai2ProofInterop(x:FakeInteropRequest):FakeInteropDecision {
  const why=new Set<string>();
  check(x.precheck,x,why,'precheck');
  check(x.beforeCommit,x,why,'before_commit');
  if(x.precheck.proof?.nonce!==x.beforeCommit.proof?.nonce||
     x.precheck.proof?.requestId!==x.beforeCommit.proof?.requestId||
     x.precheck.proof?.subjectId!==x.beforeCommit.proof?.subjectId)
    why.add('PROOF_CHANGED_DURING_DUAL_REVIEW');
  // New grant proof/subject/correction or ANY witness watermark movement
  // invalidates approvals instead of silently upgrading to a newer proof.
  if(JSON.stringify(x.precheck)!==JSON.stringify(x.beforeCommit))
    why.add('AUTHORITY_OR_PROOF_CHANGED_DURING_REVIEW');
  if(!x.bkpDecision.simulatedEligible||x.bkpDecision.reasons.length)
    why.add('BACKUP_RESTORE_GATE_BLOCKED');
  if(x.bkpDecision.productionAuthorized!==false||x.bkpDecision.sideEffects!==0||
     x.bkpDecision.restoreLocked!==true)
    why.add('NON_FAKE_RESTORE_RESULT_REJECTED');
  const allowed=why.size===0;
  return {
    simulatedConsistent:allowed,
    productionAuthorized:false,executableRestore:false,
    executableDelete:false,sideEffects:0,
    reasons:[...why].sort(),
    cleanupReviewOnly:allowed?[...x.bkpDecision.retentionCandidates]:[],
    executableCleanupCandidates:[]
  };
}
