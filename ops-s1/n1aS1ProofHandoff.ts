/**
 * N1A-S1 AI6 / second-round OFFLINE handoff from AI2 Draft #469.
 *
 * Matches AI2's FakeSecurityDecision fields, but DOES NOT import its other
 * branch, verify a real SecurityProof, or authenticate Starry ID. A client
 * supplied decision MUST NEVER be accepted as a production credential.
 */
import type { HealthStatus } from './healthModel.ts';
import type { BusinessDomain, DomainCard, N1aMockDashboard } from './n1aS1Console.ts';

export type FakeProofDecisionLike = Readonly<{
  stage: 'precheck'|'before_commit';
  reason: string;
  simulatedAllowed: boolean;
  productionAuthorized: false;
  sideEffects: 0;
}>;
export type ProofHandoffState =
  'unknown'|'mock_consistent'|'revocation_or_unavailable'|
  'revocation_or_deletion_record'|'witness_mismatch'|'not_verified';
export type FakeProofHandoff = Readonly<{
  domain:'app_security';
  proofState:ProofHandoffState;
  status: HealthStatus;
  witnessState:'unknown'|'mock_consistent'|'mismatch_or_possible_rollback';
  reasonCode:string;
  displayText:string;
  stage:'precheck'|'before_commit'|'unknown';
  actionLocked:true;
  productionAuthorized:false;
  exposesIdentity:false;
}>;
export type HandoffDashboard = N1aMockDashboard & Readonly<{proofHandoff:FakeProofHandoff}>;

const KNOWN_DENIALS = new Set([
  'unknown_stage','wrong_schema_or_audience','invalid_identity',
  'proof_rebound_to_other_action','ai_grant_missing','missing_fake_attestation',
  'invalid_or_noncanonical_version','expired_or_future_proof',
  'unverified_fake_attestation','membership_revoked_or_unavailable',
  'membership_revision_changed','external_witness_missing',
  'external_witness_invalid_version','external_witness_changed_or_rolled_back',
  'witness_invalid_records','witness_records_revocation_or_deletion',
  'resource_unavailable','resource_changed_since_approval',
  'trusted_source_unavailable',
]);
function usableDecision(value: unknown): FakeProofDecisionLike|null {
  if (!value||typeof value!=='object')return null;
  const d=value as Record<string,unknown>;
  if ((d.stage!=='precheck'&&d.stage!=='before_commit')||
      typeof d.reason!=='string'||
      typeof d.simulatedAllowed!=='boolean'||
      d.productionAuthorized!==false||d.sideEffects!==0)return null;
  if (d.reason==='fake_evidence_consistent')
    return d.simulatedAllowed===true ? d as FakeProofDecisionLike : null;
  return KNOWN_DENIALS.has(d.reason)&&d.simulatedAllowed===false
    ? d as FakeProofDecisionLike : null;
}
function downgrade(card:DomainCard, status:HealthStatus, code:string):DomainCard {
  // A confirmed business fault remains red, even if the proof handoff fails.
  if(card.status==='fault')return {...card,conflict:true,locked:true,productionAuthorized:false};
  return {...card,status,conflict:card.conflict||card.status!==status,
    reasonCode:code,evidence:'missing',locked:true,productionAuthorized:false};
}
/**
 * All data, status and messages are fixed allowlisted labels. No subject,
 * email, token, resource ID, track ID, proof, nonce or attestation is rendered.
 */
export function showFakeProofHandoff(
  base:N1aMockDashboard,
  input:unknown,
):HandoffDashboard {
  const d=usableDecision(input);
  let proofState:ProofHandoffState='unknown';
  let status:HealthStatus='unknown';
  let witnessState:FakeProofHandoff['witnessState']='unknown';
  let reasonCode='PROOF_NOT_VERIFIED';
  let displayText='安全證明尚未核實：保持鎖定';
  if(d?.reason==='fake_evidence_consistent'){
    proofState='mock_consistent';witnessState='mock_consistent';
    reasonCode='FAKE_PROOF_CONSISTENT_NOT_AUTHORIZED';
    displayText='假證據一致；仍非正式授權';
  } else if(d?.reason==='membership_revoked_or_unavailable'||
            d?.reason==='membership_revision_changed'){
    proofState='revocation_or_unavailable';
    reasonCode='MEMBERSHIP_UNAVAILABLE_OR_CHANGED';
    displayText='會員資格已變更或無法核實（不能直接認定已撤權）';
  } else if(d?.reason==='witness_records_revocation_or_deletion'){
    proofState='revocation_or_deletion_record';status='warning';
    reasonCode='FAKE_WITNESS_DENIAL_RECORD';
    displayText='假見證含撤權或刪除記錄：拒絕操作';
  } else if(d?.reason==='external_witness_changed_or_rolled_back'||
            d?.reason==='external_witness_invalid_version'){
    proofState='witness_mismatch';witnessState='mismatch_or_possible_rollback';
    reasonCode='WITNESS_VERSION_MISMATCH_UNVERIFIED';
    displayText='外部見證版本不符／可能回捲，尚未確證回捲';
  } else if(d?.reason==='fake_evidence_consistent') {
    // Unreachable because usableDecision rejects conflicting flags.
    reasonCode='PROOF_NOT_VERIFIED';
  } else if(d&&d.reason!=='fake_evidence_consistent'){
    proofState='not_verified';reasonCode='PROOF_REJECTED_BY_FAKE_CHECK';
    displayText='假證明未通過核對：不允許敏感操作';
  }
  const affectsWitness = witnessState==='mismatch_or_possible_rollback'||
    d?.reason==='external_witness_missing' || d?.reason==='trusted_source_unavailable';
  const app = d?.reason==='fake_evidence_consistent'
    ? base.domains.app_security
    : downgrade(base.domains.app_security,status,reasonCode);
  const backup = affectsWitness
    ? downgrade(base.domains.backup_restore,'unknown','WITNESS_VERSION_UNVERIFIED')
    : base.domains.backup_restore;
  const domains:{
    app_security:DomainCard;ai_billing:DomainCard;backup_restore:DomainCard
  }={app_security:app,ai_billing:base.domains.ai_billing,backup_restore:backup};
  const handoff:FakeProofHandoff={
    domain:'app_security',proofState,status,witnessState,reasonCode,displayText,
    stage:d?.stage??'unknown',actionLocked:true,productionAuthorized:false,
    exposesIdentity:false,
  };
  return {...base,domains,proofHandoff:handoff,
    anyConfirmedFault:base.cloud.overall==='fault'||
      (Object.keys(domains) as BusinessDomain[]).some(k=>domains[k].status==='fault'),
    anyUnknown:base.cloud.partialUnknown||
      (Object.keys(domains) as BusinessDomain[]).some(k=>domains[k].status==='unknown'),
    actionsAllowed:false,retriesAllowed:false,newAiSpendingAllowed:false,
    restoreAllowed:false,productionAuthorized:false};
}
