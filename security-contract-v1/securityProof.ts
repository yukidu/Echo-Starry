/**
 * N1A-S1: OFFLINE contract and conservative fake authority checks.
 * Not a token signer, API endpoint, admin authenticator, anti-rollback ledger,
 * or production authorization service. Never import this into a live router.
 */
export const N1A_SECURITY_PROOF_RUNTIME_ENABLED = false as const;

export type SecurityAction =
  | 'transcript.publish' | 'transcript.searchEvidence'
  | 'ai.attempt' | 'backup.preflight' | 'backup.commit';
export type SecurityStage = 'precheck' | 'before_commit';
export type SecurityProofV1 = Readonly<{
  schemaVersion: 'N1A-S1-FAKE-v1';
  issuer: 'fake-star-id-plus-witness';
  audience: 'n1a-offline-only';
  subjectId: string;
  appId: string;
  action: SecurityAction;
  resourceId: string;
  requestId: string;
  nonce: string;
  membershipRevision: string;
  permissionRevision: string;
  correctionRevision: string;
  sourceRevision: string;
  securitySeq: string;
  restoreEpoch: string;
  revocationWatermark: string;
  deletionWatermark: string;
  issuedAtMs: number;
  expiresAtMs: number;
  /** Immutable AI grant identity. Empty for non-AI actions. */
  approvalGrantId: string;
  /** Has no security meaning until an independent trusted verifier attests it. */
  fakeAttestation: string;
}>;
export type SimulatedMembership = Readonly<{
  sourceId: 'fake-starry-id';
  subjectId: string;
  active: boolean;
  appAllowed: boolean;
  membershipRevision: string;
}>;
export type SimulatedAnchor = Readonly<{
  sourceId: 'fake-independent-witness';
  securitySeq: string;
  restoreEpoch: string;
  revocationWatermark: string;
  deletionWatermark: string;
  revokedResources: readonly string[];
  deletedResources: readonly string[];
  blockedSubjects: readonly string[];
}>;
export type SimulatedResource = Readonly<{
  resourceId: string;
  appId: string;
  sourceRevision: string;
  permissionRevision: string;
  correctionRevision: string;
  active: boolean;
}>;
export type FakeTrustedReaders = Readonly<{
  /** Fake-only externally injected port: boolean alone MUST NOT be used in production. */
  verifyFakeAttestation(proof: SecurityProofV1): Promise<boolean>;
  getCurrentMembership(subjectId: string, appId: string): Promise<SimulatedMembership | null>;
  getCurrentAnchor(): Promise<SimulatedAnchor | null>;
  getCurrentResource(resourceId: string, appId: string): Promise<SimulatedResource | null>;
}>;
export type FakeExpectation = Readonly<{
  subjectId: string;
  appId: string;
  action: SecurityAction;
  resourceId: string;
  requestId: string;
}>;
export type FakeSecurityDecision = Readonly<{
  simulatedAllowed: boolean;
  productionAuthorized: false;
  sideEffects: 0;
  stage: SecurityStage;
  reason: string;
}>;

const uint64Max = 18446744073709551615n;
/** Canonical JSON decimal string, never JS Number, for cross-team 64-bit versions. */
export function isCanonicalVersion(value: unknown): value is string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(value)) return false;
  try { return BigInt(value) <= uint64Max; } catch { return false; }
}
const safeId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,160}$/.test(value);
const decision = (stage: SecurityStage, reason: string): FakeSecurityDecision => ({
  simulatedAllowed: reason === 'fake_evidence_consistent',
  productionAuthorized: false,
  sideEffects: 0,
  stage,
  reason,
});

/**
 * Reads three independent FAKE inputs at each stage; never uses UI-supplied flags
 * or persisted Echo snapshots for current rights. All unexpected conditions DENY.
 * Every before_commit pass must call this again with fresh reader results.
 */
export async function assessFakeSecurityProof(
  proof: SecurityProofV1,
  expected: FakeExpectation,
  readers: FakeTrustedReaders,
  nowMs: number,
  stage: SecurityStage,
): Promise<FakeSecurityDecision> {
  const deny = (reason: string) => decision(stage, reason);
  if (!['precheck', 'before_commit'].includes(stage)) return deny('unknown_stage');
  if (!proof || proof.schemaVersion !== 'N1A-S1-FAKE-v1' ||
      proof.issuer !== 'fake-star-id-plus-witness' || proof.audience !== 'n1a-offline-only')
    return deny('wrong_schema_or_audience');
  if (![proof.subjectId, proof.appId, proof.resourceId, proof.requestId, proof.nonce,
        expected.subjectId, expected.appId, expected.resourceId, expected.requestId].every(safeId))
    return deny('invalid_identity');
  if (proof.subjectId !== expected.subjectId || proof.appId !== expected.appId ||
      proof.resourceId !== expected.resourceId || proof.requestId !== expected.requestId ||
      proof.action !== expected.action) return deny('proof_rebound_to_other_action');
  if (proof.action === 'ai.attempt' && !safeId(proof.approvalGrantId))
    return deny('ai_grant_missing');
  if (typeof proof.fakeAttestation !== 'string' || proof.fakeAttestation.length === 0)
    return deny('missing_fake_attestation');
  const versions = [proof.membershipRevision, proof.permissionRevision, proof.correctionRevision,
    proof.securitySeq, proof.restoreEpoch, proof.revocationWatermark, proof.deletionWatermark];
  if (!versions.every(isCanonicalVersion) || !safeId(proof.sourceRevision))
    return deny('invalid_or_noncanonical_version');
  if (!Number.isSafeInteger(nowMs) || !Number.isSafeInteger(proof.issuedAtMs) ||
      !Number.isSafeInteger(proof.expiresAtMs) || proof.issuedAtMs > nowMs ||
      proof.expiresAtMs <= nowMs || proof.expiresAtMs <= proof.issuedAtMs ||
      proof.expiresAtMs - proof.issuedAtMs > 30_000)
    return deny('expired_or_future_proof');
  try {
    if (await readers.verifyFakeAttestation(proof) !== true)
      return deny('unverified_fake_attestation');
    const member = await readers.getCurrentMembership(proof.subjectId, proof.appId);
    if (!member || member.sourceId !== 'fake-starry-id' ||
        member.subjectId !== proof.subjectId || !member.active || !member.appAllowed)
      return deny('membership_revoked_or_unavailable');
    if (!isCanonicalVersion(member.membershipRevision) ||
        member.membershipRevision !== proof.membershipRevision)
      return deny('membership_revision_changed');
    const anchor = await readers.getCurrentAnchor();
    if (!anchor || anchor.sourceId !== 'fake-independent-witness')
      return deny('external_witness_missing');
    if (![anchor.securitySeq, anchor.restoreEpoch, anchor.revocationWatermark,
          anchor.deletionWatermark].every(isCanonicalVersion))
      return deny('external_witness_invalid_version');
    if (anchor.securitySeq !== proof.securitySeq || anchor.restoreEpoch !== proof.restoreEpoch ||
        anchor.revocationWatermark !== proof.revocationWatermark ||
        anchor.deletionWatermark !== proof.deletionWatermark)
      return deny('external_witness_changed_or_rolled_back');
    if (!Array.isArray(anchor.deletedResources) || !Array.isArray(anchor.revokedResources) ||
        !Array.isArray(anchor.blockedSubjects)) return deny('witness_invalid_records');
    if (anchor.deletedResources.includes(proof.resourceId) ||
        anchor.revokedResources.includes(proof.resourceId) ||
        anchor.blockedSubjects.includes(proof.subjectId))
      return deny('witness_records_revocation_or_deletion');
    const resource = await readers.getCurrentResource(proof.resourceId, proof.appId);
    if (!resource || !resource.active || resource.resourceId !== proof.resourceId ||
        resource.appId !== proof.appId) return deny('resource_unavailable');
    if (resource.sourceRevision !== proof.sourceRevision ||
        resource.permissionRevision !== proof.permissionRevision ||
        resource.correctionRevision !== proof.correctionRevision)
      return deny('resource_changed_since_approval');
    return decision(stage, 'fake_evidence_consistent');
  } catch {
    return deny('trusted_source_unavailable');
  }
}
