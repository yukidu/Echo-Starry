/**
 * AI5 A03. Isolated, OFF-by-default contract for aggregated private analytics.
 * No route/bindings/real data are wired by this module.  The trusted authority
 * adapter MUST query live Starry ID and Echo resource revisions; mock authority
 * evidence is not a proof of live security.  Never use in production as-is.
 */
export type Action = 'stats.private.read' | 'stats.report.export';
export type RequestScope = Readonly<{
  subjectId: string; sessionId: string; appId: 'echo';
  reportId: string; action: Action; nonce: string;
}>;
export type Evidence = Readonly<{
  issuer: 'starry-id'; audience: 'echo.private-statistics';
  subjectId: string; sessionId: string; appId: 'echo'; reportId: string;
  action: Action; active: boolean; approved: boolean;
  sessionRevision: number; roleRevision: number; permissionRevision: number;
  resourceRevision: number; sourceRevision: number; revocationWatermark: number;
  restoreEpoch: number; expiresAt: number;
}>;
export type Row = Readonly<{ day: string; label: string; members: number; calls: number }>;
export type Policy = Readonly<{
  enabled: boolean; quotaKnown: boolean; minimumCohort: number; maxRows: number;
}>;
export type Ports = Readonly<{
  // Must read current authoritative state, not a client-supplied token or cache.
  check: (req: RequestScope) => Promise<Evidence | null>;
  // Must atomically compare current authority revisions and claim nonce before SEND.
  claimOnce: (req: RequestScope, proof: Evidence) => Promise<boolean>;
  load: (req: RequestScope) => Promise<readonly Row[]>;
  now: () => number;
}>;
export type Result = { status: 'DENY'; bytes: '' } | { status: 'ALLOW'; bytes: string };
const DENY: Result = { status: 'DENY', bytes: '' };
const revisions: readonly (keyof Evidence)[] = [
  'sessionRevision','roleRevision','permissionRevision','resourceRevision',
  'sourceRevision','revocationWatermark','restoreEpoch'
];
function validRevision(v:unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}
function sameAuthority(a: Evidence, b: Evidence): boolean {
  return a.issuer === b.issuer && a.audience === b.audience &&
    a.subjectId === b.subjectId && a.sessionId === b.sessionId &&
    a.appId === b.appId && a.reportId === b.reportId &&
    a.action === b.action && a.expiresAt === b.expiresAt &&
    revisions.every(key => a[key] === b[key]);
}
function scopeMatches(req: RequestScope, proof: Evidence | null, now: number): proof is Evidence {
  return !!proof && proof.issuer === 'starry-id' && proof.audience === 'echo.private-statistics' &&
    proof.active === true && proof.approved === true &&
    proof.subjectId === req.subjectId && proof.sessionId === req.sessionId &&
    proof.appId === req.appId && proof.reportId === req.reportId &&
    proof.action === req.action &&
    typeof now === 'number' && Number.isFinite(now) &&
    typeof proof.expiresAt === 'number' && Number.isFinite(proof.expiresAt) &&
    now < proof.expiresAt && revisions.every(key => validRevision(proof[key])) &&
    !!req.subjectId && !!req.sessionId && !!req.reportId && !!req.nonce && req.appId === 'echo';
}
function policyValid(policy: Policy): boolean {
  return policy.enabled === true && policy.quotaKnown === true &&
    Number.isSafeInteger(policy.minimumCohort) && policy.minimumCohort >= 5 &&
    Number.isSafeInteger(policy.maxRows) && policy.maxRows > 0 && policy.maxRows <= 1000;
}
function approvedRows(rows: readonly Row[], policy: Policy): Row[] | null {
  if (!Array.isArray(rows) || rows.length > policy.maxRows) return null;
  const selected: Row[] = [];
  for (const row of rows) {
    if (!row || typeof row.day !== 'string' || typeof row.label !== 'string' ||
        !Number.isSafeInteger(row.members) || !Number.isSafeInteger(row.calls) ||
        row.members < 0 || row.calls < 0 || row.members > row.calls ||
        row.day.length > 16 || row.label.length > 100) return null;
    // Eliminate small cells entirely, including their labels, not only the count.
    if (row.members >= policy.minimumCohort) selected.push({
      day: row.day, label: row.label, members: row.members, calls: row.calls
    });
  }
  return selected;
}
export function encodeCsvCell(value: string | number): string {
  const raw = String(value);
  // Protect spreadsheet formula evaluation even when preceded by Unicode/ASCII whitespace.
  const guarded = /^[\s\uFEFF]*[=+@-]/u.test(raw) || /^[\t\r\n]/u.test(raw) ? "'" + raw : raw;
  return '"' + guarded.replaceAll('"', '""') + '"';
}
export async function guardedStatistics(
  req: RequestScope, policy: Policy, ports: Ports
): Promise<Result> {
  if (!policyValid(policy) || req.action !== 'stats.private.read') return DENY;
  try {
    const original = await ports.check(req);
    if (!scopeMatches(req, original, ports.now())) return DENY;
    const rows = approvedRows(await ports.load(req), policy);
    if (!rows) return DENY;
    const latest = await ports.check(req);
    if (!scopeMatches(req, latest, ports.now()) || !sameAuthority(original, latest)) return DENY;
    return { status: 'ALLOW', bytes: JSON.stringify({ rows }) };
  } catch { return DENY; }
}
export async function guardedExport(
  req: RequestScope, policy: Policy, ports: Ports
): Promise<Result> {
  if (!policyValid(policy) || req.action !== 'stats.report.export') return DENY;
  try {
    const original = await ports.check(req);
    if (!scopeMatches(req, original, ports.now())) return DENY;
    const rows = approvedRows(await ports.load(req), policy);
    if (!rows) return DENY;
    // Construct the entire payload before SEND. No streaming bytes before re-authorization.
    const csv = ['day,label,members,calls', ...rows.map(row =>
      [row.day, row.label, row.members, row.calls].map(encodeCsvCell).join(','))
    ].join('\r\n') + '\r\n';
    const latest = await ports.check(req);
    if (!scopeMatches(req, latest, ports.now()) || !sameAuthority(original, latest)) return DENY;
    // This callback MUST be a durable atomic fence, provided by AI6/AI2 integration.
    if (!await ports.claimOnce(req, latest)) return DENY;
    // Final check catches revocation racing with claim. Production still needs
    // an authoritative SEND fence across this final check and HTTP response.
    const final = await ports.check(req);
    if (!scopeMatches(req, final, ports.now()) || !sameAuthority(latest, final)) return DENY;
    return { status: 'ALLOW', bytes: csv };
  } catch { return DENY; }
}
