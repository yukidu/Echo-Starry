/**
 * S2367A BKP-I1: offline-only evidence gate for simulated restore approval.
 * NEVER a production authority, backup writer, delete function or restore runner.
 * No Cloudflare bindings, real identities, global state, network calls or timers.
 */
import {
  bkpS1Preflight, bkpS1PlanRetention, bkpS1Sha256,
  type RestoreRequest, type RestoreAuthority, type RetentionPlan
} from './starryBackupBkpS1.ts';

export const BKP_I1_RUNTIME_ENABLED = false as const;
export type MockAuthorityEvidence = Readonly<{
  sourceId: string;
  restoreEpoch: number;
  deletionWatermark: number;
  revocationWatermark: number;
  revision: number;
  observedAtMs: number;
  deletedTrackIds: readonly string[];
  revokedTrackIds: readonly string[];
  blockedMemberIds: readonly string[];
  activeAdminIds: readonly string[];
}>;
/** A second FAKE system must independently attest the exact authority state. */
export type MockEpochAnchor = Readonly<{
  sourceId: string;
  restoreEpoch: number;
  revision: number;
  authorityHash: string;
  observedAtMs: number;
}>;
export type MockReader<T> = Readonly<{read(): Promise<T | null>}>;
export type FakeRestoreApproval = Readonly<{
  reviewerId: string;
  requestId: string;
  backupId: string;
  manifestHash: string;
  authorityEpoch: number;
  decision: 'approve' | 'deny';
  approvedAtMs: number;
}>;
export type BkpI1Input = Readonly<{
  requestId: string;
  existingRestore: RestoreRequest;
  authorityReader: MockReader<MockAuthorityEvidence>;
  anchorReader: MockReader<MockEpochAnchor>;
  approvals: readonly FakeRestoreApproval[];
  /** Explicit per-track mapping. A missing key is an unsafe unknown, not public content. */
  memberIdsByTrack: Readonly<Record<string, readonly string[]>>;
  nowMs: number;
  evidenceMaxAgeMs: number;
  approvalMaxAgeMs: number;
  retentionDays: 7 | 30 | 90;
}>;
export type BkpI1Decision = Readonly<{
  simulatedEligible: boolean;
  productionRestoreAuthorized: false;
  reasons: readonly string[];
  preflightReasons: readonly string[];
  lastGoodChain: readonly string[];
  retention: RetentionPlan;
  simulatedApprovals: number;
  sideEffects: 0;
}>;
const unique=(xs: readonly string[])=>new Set(xs).size===xs.length;
const int=(n:number)=>Number.isSafeInteger(n)&&n>=0;
function stableState(e:MockAuthorityEvidence){
  return {
    sourceId:e.sourceId,restoreEpoch:e.restoreEpoch,revision:e.revision,
    deletionWatermark:e.deletionWatermark,revocationWatermark:e.revocationWatermark,
    deletedTrackIds:[...e.deletedTrackIds].sort(),
    revokedTrackIds:[...e.revokedTrackIds].sort(),
    blockedMemberIds:[...e.blockedMemberIds].sort(),
    activeAdminIds:[...e.activeAdminIds].sort()
  };
}
export async function bkpI1AuthorityHash(e:MockAuthorityEvidence):Promise<string>{
  return bkpS1Sha256(JSON.stringify(stableState(e)));
}
const fresh=(ms:number,now:number,maxAge:number)=>int(ms)&&ms<=now&&now-ms<=maxAge;
const emptyRetention:RetentionPlan={blocked:true,keepIds:[],candidates:[]};

/** Read twice, cross-check a separate simulated high-water anchor, never trust a sole boolean. */
export async function bkpI1SimulateRestore(input:BkpI1Input):Promise<BkpI1Decision>{
  const reasons=new Set<string>();
  const fail=(name:string)=>reasons.add(name);
  const s1=input.existingRestore;
  const leaf=s1.manifests.find(m=>m.id===s1.backupId);
  if(!input.requestId||!int(input.nowMs)||!int(input.evidenceMaxAgeMs)||
     input.evidenceMaxAgeMs===0||!int(input.approvalMaxAgeMs)||input.approvalMaxAgeMs===0)
    fail('invalid_review_request');
  // Only propose expiry, never call delete or mutate a database.
  const retention=bkpS1PlanRetention({manifests:s1.manifests,
    lastGoodId:s1.lastGoodId,retentionDays:input.retentionDays,now:input.nowMs});
  if(retention.blocked)fail('retention_topology_untrusted');
  let initial:MockAuthorityEvidence|null=null;
  let initialAnchor:MockEpochAnchor|null=null;
  try{
    [initial,initialAnchor]=await Promise.all([input.authorityReader.read(),input.anchorReader.read()]);
  }catch{fail('authority_unreadable')}
  const evidenceValid=(ev:MockAuthorityEvidence|null,anchor:MockEpochAnchor|null)=>{
    if(!ev||!anchor){fail('authority_unavailable');return false}
    if(!ev.sourceId||!anchor.sourceId||ev.sourceId===anchor.sourceId)
      fail('authority_not_independent');
    if(!int(ev.restoreEpoch)||!int(ev.revision)||!int(anchor.restoreEpoch)||!int(anchor.revision)||
       !int(ev.deletionWatermark)||!int(ev.revocationWatermark))
      fail('authority_revision_invalid');
    if(!fresh(ev.observedAtMs,input.nowMs,input.evidenceMaxAgeMs)||
       !fresh(anchor.observedAtMs,input.nowMs,input.evidenceMaxAgeMs))
      fail('authority_stale_or_future');
    if(ev.restoreEpoch!==anchor.restoreEpoch||ev.revision!==anchor.revision)
      fail('epoch_anchor_mismatch');
    if(!unique(ev.deletedTrackIds)||!unique(ev.revokedTrackIds)||
       !unique(ev.blockedMemberIds)||!unique(ev.activeAdminIds))
      fail('authority_conflicting_records');
    return true;
  };
  const initialShapeOkay=evidenceValid(initial,initialAnchor);
  if(initialShapeOkay&&initial&&initialAnchor&&
     await bkpI1AuthorityHash(initial)!==initialAnchor.authorityHash)
    fail('epoch_anchor_hash_mismatch');
  if(!leaf)fail('backup_missing');

  const affectedTracks=new Set<string>();
  for(const m of s1.manifests)for(const v of m.versions)
    if(v.status==='published'||v.status==='approved-history')affectedTracks.add(v.trackId);
  const deniedTracks=new Set([...(initial?.deletedTrackIds??[]),...(initial?.revokedTrackIds??[])]);
  const deniedMembers=new Set(initial?.blockedMemberIds??[]);
  for(const trackId of affectedTracks){
    if(!Object.hasOwn(input.memberIdsByTrack,trackId))fail('member_mapping_missing');
    else{
      const mapped=input.memberIdsByTrack[trackId];
      if(!Array.isArray(mapped)||!unique(mapped)||mapped.some(id=>!id))
        fail('member_mapping_invalid');
      else if(mapped.some(id=>deniedMembers.has(id)))fail('member_rights_revoked');
    }
    if(deniedTracks.has(trackId))fail('restored_track_deleted_or_revoked');
  }
  const requestedHash=s1.trustedManifestHashes[s1.backupId];
  if(!requestedHash||!leaf||await bkpS1Sha256(JSON.stringify(leaf))!==requestedHash)
    fail('review_manifest_hash_mismatch');
  const approvedIds=new Set<string>();
  const authorizedReviewers=new Set(initial?.activeAdminIds??[]);
  if(input.approvals.length!==2)fail('two_approvers_required');
  for(const review of input.approvals){
    if(!review.reviewerId||approvedIds.has(review.reviewerId))fail('reviewer_not_distinct');
    approvedIds.add(review.reviewerId);
    if(!authorizedReviewers.has(review.reviewerId))fail('reviewer_not_current_superadmin');
    if(review.decision!=='approve')fail('approval_denied');
    if(review.requestId!==input.requestId||review.backupId!==s1.backupId||
       review.manifestHash!==requestedHash||review.authorityEpoch!==initial?.restoreEpoch)
      fail('approval_binding_mismatch');
    if(!fresh(review.approvedAtMs,input.nowMs,input.approvalMaxAgeMs)||
       initial!==null&&review.approvedAtMs<initial.observedAtMs)
      fail('approval_stale_or_future');
  }
  // The second read is required even if an earlier gate failed. Any mutation
  // during human review is a rejection, not permission to reuse old approvals.
  let final:MockAuthorityEvidence|null=null,finalAnchor:MockEpochAnchor|null=null;
  try{
    [final,finalAnchor]=await Promise.all([input.authorityReader.read(),input.anchorReader.read()]);
  }catch{fail('authority_recheck_failed')}
  const finalShapeOkay=evidenceValid(final,finalAnchor);
  if(finalShapeOkay&&final&&finalAnchor&&
     await bkpI1AuthorityHash(final)!==finalAnchor.authorityHash)
    fail('epoch_anchor_hash_mismatch');
  if(initial&&final&&JSON.stringify(stableState(initial))!==JSON.stringify(stableState(final)))
    fail('authority_changed_during_review');
  if(initialAnchor&&finalAnchor&&(
    finalAnchor.restoreEpoch<initialAnchor.restoreEpoch||
    finalAnchor.revision<initialAnchor.revision))
    fail('epoch_rolled_back');
  if(initialAnchor&&finalAnchor&&(
    finalAnchor.authorityHash!==initialAnchor.authorityHash||
    finalAnchor.restoreEpoch!==initialAnchor.restoreEpoch||
    finalAnchor.revision!==initialAnchor.revision))
    fail('anchor_changed_during_review');
  // Construct authority solely from latest simulated reading, not the caller's
  // potentially stale existingRestore.authority flags. This still cannot certify
  // a production source: no real identity, signature, R2 or D1 has been read.
  const mockAuthority:RestoreAuthority|null=final?{
    available:true,active:true,independentlyStored:!!finalAnchor &&
      final.sourceId!==finalAnchor.sourceId &&
      finalShapeOkay && !reasons.has('epoch_anchor_hash_mismatch'),
    epoch:final.restoreEpoch,
    deletionWatermark:final.deletionWatermark,
    revocationWatermark:final.revocationWatermark,
    currentDeletedTrackIds:final.deletedTrackIds,
    currentRevokedTrackIds:final.revokedTrackIds
  }:null;
  const p=await bkpS1Preflight({...s1,authority:mockAuthority});
  for(const reason of p.reasons)fail('bkp_s1:'+reason);
  return {
    simulatedEligible:reasons.size===0,
    productionRestoreAuthorized:false,
    reasons:[...reasons].sort(),
    preflightReasons:p.reasons,
    lastGoodChain:p.chain,
    retention:retention,
    simulatedApprovals:approvedIds.size,
    sideEffects:0
  };
}
