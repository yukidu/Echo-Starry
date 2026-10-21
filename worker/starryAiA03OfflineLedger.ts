/**
 * AI3 A03: isolated, provider-free durable ledger prototype.
 *
 * NOT imported by a router or any production Worker entrypoint.
 * No paid Provider client, no SEND, no production migration.
 * A03_enabled defaults FALSE; the only supported demonstration is a
 * disposable SQLite database with the companion tests/ai3-a03/schema.sql.
 *
 * Cross-App authority and revision sources MUST be owned by AI2/AI6 before
 * production integration. All amounts are positive integer micro-TWD.
 */
export interface A03Database {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      run(): Promise<{ meta?: { changes?: number } }>;
      first<T = Record<string, unknown>>(): Promise<T | null>;
    };
  };
}
export type A03OfflineControl = { enabled?: boolean };
export type A03Hold = {
  jobKey: string; fingerprint: string; appId: string;
  subjectId: string; resourceKey: string;
  grantRevision: number; permissionRevision: number;
  resourceRevision: number; sourceRevision: number;
  restoreEpoch: number; budgetEpoch: number;
  maxMicroTwd: number; createdAt: number;
};
export type A03Claim = {
  jobKey: string; fingerprint: string; budgetEpoch: number;
  claimKey: string; createdAt: number;
};
export type A03Decision =
  | { allowed: true; state: 'RESERVED_HELD' | 'UNKNOWN_HELD'; providerCalls: 0 }
  | { allowed: false; reason: string; providerCalls: 0 };
const deny = (reason: string): A03Decision => ({ allowed: false, reason, providerCalls: 0 });
const validId = (x: unknown): x is string =>
  typeof x === 'string' && /^[a-zA-Z0-9:_-]{8,128}$/.test(x);
const validRevision = (x: unknown): x is number =>
  Number.isSafeInteger(x) && Number(x) >= 1;
const validTime = (x: unknown): x is number =>
  Number.isSafeInteger(x) && Number(x) > 0;
const validCost = (x: unknown): x is number =>
  Number.isSafeInteger(x) && Number(x) >= 1 && Number(x) <= 1_000_000_000_000;
const validDigest = (x: unknown): x is string =>
  typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);

function validHold(h: A03Hold): boolean {
  return !!h && [h.jobKey, h.appId, h.subjectId, h.resourceKey].every(validId)
    && validDigest(h.fingerprint)
    && [h.grantRevision, h.permissionRevision, h.resourceRevision,
      h.sourceRevision, h.restoreEpoch, h.budgetEpoch].every(validRevision)
    && validCost(h.maxMicroTwd) && validTime(h.createdAt);
}
function validClaim(c: A03Claim): boolean {
  return !!c && validId(c.jobKey) && validId(c.claimKey) &&
    validDigest(c.fingerprint) && validRevision(c.budgetEpoch) && validTime(c.createdAt);
}

/**
 * One statement, one SQLite writer/transaction: no pre-read budget race.
 * Global cap includes ALL held requests, even UNKNOWN_HELD, across App IDs.
 * Every request is held permanently until a separately reviewed,
 * provider-verified compensation protocol is designed. No auto-refund.
 */
export const AI3_A03_RESERVE_SQL = String.raw`
INSERT OR IGNORE INTO ai3_a03_holds
(job_key,fingerprint,app_id,subject_id,resource_key,grant_revision,
 permission_revision,resource_revision,source_revision,restore_epoch,
 authority_epoch,max_micro_twd,created_at)
SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?
FROM ai3_a03_budget_authority b
JOIN ai3_a03_subject_watermarks s ON s.subject_id=? AND s.app_id=?
JOIN ai3_a03_resource_watermarks r ON r.resource_key=? AND r.app_id=s.app_id
WHERE b.scope_key='global' AND b.enabled=1 AND b.epoch=?
  AND s.active=1 AND s.grant_revision=? AND s.permission_revision=?
  AND r.active=1 AND r.resource_revision=? AND r.source_revision=?
  AND r.restore_epoch=?
  AND b.max_micro_twd>=?
  AND COALESCE((SELECT SUM(max_micro_twd) FROM ai3_a03_holds),0)
      <= b.max_micro_twd-?
`;

/**
 * Persist once BEFORE any future external SEND. An acknowledged insert
 * means the claim may have been sent, so retries must never claim again.
 * This module never calls a Provider itself.
 */
export const AI3_A03_CLAIM_SQL = String.raw`
INSERT OR IGNORE INTO ai3_a03_send_claims(job_key,claim_key,created_at)
SELECT h.job_key,?,?
FROM ai3_a03_holds h
JOIN ai3_a03_budget_authority b ON b.scope_key='global'
JOIN ai3_a03_subject_watermarks s ON s.subject_id=h.subject_id AND s.app_id=h.app_id
JOIN ai3_a03_resource_watermarks r ON r.resource_key=h.resource_key AND r.app_id=h.app_id
WHERE h.job_key=? AND h.fingerprint=? AND h.authority_epoch=?
  AND b.enabled=1 AND b.epoch=h.authority_epoch
  AND s.active=1 AND s.grant_revision=h.grant_revision
  AND s.permission_revision=h.permission_revision
  AND r.active=1 AND r.resource_revision=h.resource_revision
  AND r.source_revision=h.source_revision AND r.restore_epoch=h.restore_epoch
  AND NOT EXISTS (SELECT 1 FROM ai3_a03_send_claims c WHERE c.job_key=h.job_key)
`;

export async function a03Reserve(
  db: A03Database | undefined, control: A03OfflineControl | undefined,
  h: A03Hold
): Promise<A03Decision> {
  if (control?.enabled !== true) return deny('A03_DISABLED');
  if (!db?.prepare) return deny('LEDGER_UNAVAILABLE');
  if (!validHold(h)) return deny('INVALID_OR_UNVERIFIED_INPUT');
  try {
    const r = await db.prepare(AI3_A03_RESERVE_SQL).bind(
      h.jobKey, h.fingerprint, h.appId, h.subjectId, h.resourceKey,
      h.grantRevision, h.permissionRevision, h.resourceRevision,
      h.sourceRevision, h.restoreEpoch, h.budgetEpoch, h.maxMicroTwd, h.createdAt,
      h.subjectId, h.appId, h.resourceKey, h.budgetEpoch,
      h.grantRevision, h.permissionRevision, h.resourceRevision,
      h.sourceRevision, h.restoreEpoch, h.maxMicroTwd, h.maxMicroTwd
    ).run();
    if (r?.meta?.changes === 1)
      return { allowed: true, state: 'RESERVED_HELD', providerCalls: 0 };
    const old = await db.prepare('SELECT fingerprint,app_id,subject_id,resource_key FROM ai3_a03_holds WHERE job_key=?')
      .bind(h.jobKey).first<{fingerprint:string;app_id:string;subject_id:string;resource_key:string}>();
    if (old)
      return deny(old.fingerprint === h.fingerprint && old.app_id === h.appId &&
        old.subject_id === h.subjectId && old.resource_key === h.resourceKey
        ? 'DUPLICATE_HELD' : 'CANONICAL_KEY_CONFLICT');
    return deny('BUDGET_OR_AUTHORITY_DENIED');
  } catch {
    // Lost ACK might follow a committed INSERT. Never retry or auto-release.
    return deny('UNKNOWN_PERSISTENCE_DENIED');
  }
}

export async function a03ClaimWithoutSending(
  db: A03Database | undefined, control: A03OfflineControl | undefined,
  c: A03Claim
): Promise<A03Decision> {
  if (control?.enabled !== true) return deny('A03_DISABLED');
  if (!db?.prepare) return deny('LEDGER_UNAVAILABLE');
  if (!validClaim(c)) return deny('INVALID_OR_UNVERIFIED_INPUT');
  try {
    const r = await db.prepare(AI3_A03_CLAIM_SQL)
      .bind(c.claimKey,c.createdAt,c.jobKey,c.fingerprint,c.budgetEpoch).run();
    if (r?.meta?.changes === 1)
      return {allowed:true,state:'UNKNOWN_HELD',providerCalls:0};
    return deny('CLAIM_USED_OR_REVOKED_OR_AUTHORITY_UNKNOWN');
  } catch {
    return deny('UNKNOWN_CLAIM_COMMIT_DENIED');
  }
}
