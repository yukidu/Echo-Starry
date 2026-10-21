/**
 * AI4 P0 / OFFLINE PREPARATION GATE, NOT A PRODUCTION QA SEND PERMIT.
 * This extends the existing #505 excerpt selector; it is NOT another search engine.
 * A positive lexical score alone never establishes that an answer is supported.
 *
 * Real Starry ID/Echo authority + independent support verifier + durable SEND
 * fencing are missing. No route imports this module; canSend is ALWAYS false.
 */
import { selectRelevantQaEvidence, type QaCandidateEvidence } from './qaEvidenceSelection.ts';

export type QaEvidenceVersion = Readonly<{
  trackId: string;
  segmentId: string;
  sourceRevision: number;
  resourceRevision: number;
  transcriptVersion: string;
  permissionRevision: number;
  revocationWatermark: number;
  restoreEpoch: number;
  startMs: number;
  endMs: number;
  sourceDigest: string;
  evidenceTextDigest: string;
}>;

export type QaEvidenceCandidate = QaCandidateEvidence & Readonly<{
  excerptText: string;
  citation: QaEvidenceVersion;
}>;

export type QaProofRequest = Readonly<{
  subjectId: string;
  sessionId: string;
  appId: 'echostars';
  action: 'echo.qa.answer';
  question: string;
  terms: readonly string[];
}>;

export type QaFreshSnapshot = Readonly<{
  issuer: 'starry-id';
  audience: 'echo.qa.answer';
  subjectId: string;
  sessionId: string;
  appId: 'echostars';
  authorized: boolean;
  revoked: boolean;
  deleted: boolean;
  expiresAtMs: number;
  citation: QaEvidenceVersion;
  // MUST be fetched independently from current authorized source/manifest,
  // not copied from a client, ranker result or AI model claim.
  excerptText: string;
  sourceText: string;
}>;

export type QaSupportVerdict = Readonly<{
  status: 'SUPPORTED' | 'INSUFFICIENT';
  questionDigest: string;
  evidenceTextDigest: string;
  quote: string;
}>;

export type QaProofPorts = Readonly<{
  // MUST read live primary authorization + source revisions. Not a cached JWT.
  readCurrent: (request: QaProofRequest, trackId: string, segmentId: string) => Promise<QaFreshSnapshot | null>;
  // MUST be independently trusted by the server; NOT lexical score or model self-report.
  assessSupport: (question: string, verifiedExcerpt: string) => Promise<QaSupportVerdict | null>;
  now: () => number;
}>;

export type QaProofResult =
  | Readonly<{ status: 'DENY'; reason: 'GATE_OFF' | 'INSUFFICIENT' | 'AUTHORITY_UNKNOWN' | 'STALE_EVIDENCE' | 'SUPPORT_UNKNOWN'; prompt: ''; citations: readonly []; canSend: false }>
  | Readonly<{ status: 'PREPARED_OFFLINE'; reason: 'UNFENCED_SEND'; prompt: string; citations: readonly [QaEvidenceVersion]; quote: string; canSend: false }>;

const REF_FIELDS: readonly (keyof QaEvidenceVersion)[] = [
  'trackId','segmentId','sourceRevision','resourceRevision','transcriptVersion',
  'permissionRevision','revocationWatermark','restoreEpoch','startMs','endMs',
  'sourceDigest','evidenceTextDigest',
];
const VERSIONS: readonly (keyof QaEvidenceVersion)[] = [
  'sourceRevision','resourceRevision','permissionRevision','revocationWatermark','restoreEpoch',
];
const deny = (reason: Extract<QaProofResult, {status: 'DENY'}>['reason']): QaProofResult =>
  ({ status: 'DENY', reason, prompt: '', citations: [], canSend: false });
const validRevision = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const digestFormat = (s: unknown): s is string => typeof s === 'string' && /^sha256:[0-9a-f]{64}$/.test(s);

async function digest(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return 'sha256:' + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2,'0')).join('');
}

function validCitation(e: QaEvidenceVersion | undefined): e is QaEvidenceVersion {
  if (!e || !nonempty(e.trackId) || !nonempty(e.segmentId) ||
      !nonempty(e.transcriptVersion) || !digestFormat(e.sourceDigest) ||
      !digestFormat(e.evidenceTextDigest)) return false;
  if (!VERSIONS.every(key => validRevision(e[key]))) return false;
  return validRevision(e.startMs) && validRevision(e.endMs) && e.endMs > e.startMs;
}

function exactCitation(a: QaEvidenceVersion, b: QaEvidenceVersion) {
  return REF_FIELDS.every(field => a[field] === b[field]);
}

async function validSnapshot(
  snapshot: QaFreshSnapshot | null, request: QaProofRequest,
  candidate: QaEvidenceCandidate, now: number,
): Promise<boolean> {
  if (!snapshot || !snapshot.citation || !validCitation(snapshot.citation) ||
      snapshot.issuer !== 'starry-id' || snapshot.audience !== request.action ||
      snapshot.appId !== request.appId || snapshot.subjectId !== request.subjectId ||
      snapshot.sessionId !== request.sessionId || snapshot.authorized !== true ||
      snapshot.revoked !== false || snapshot.deleted !== false ||
      !Number.isSafeInteger(snapshot.expiresAtMs) || snapshot.expiresAtMs <= now ||
      !exactCitation(snapshot.citation,candidate.citation) ||
      !nonempty(snapshot.excerptText) || !nonempty(snapshot.sourceText) ||
      candidate.excerptText !== snapshot.excerptText ||
      !snapshot.sourceText.includes(snapshot.excerptText) ||
      !candidate.part.includes(snapshot.excerptText)) return false;
  const [excerptHash, sourceHash] = await Promise.all([
    digest(snapshot.excerptText),digest(snapshot.sourceText)
  ]);
  return snapshot.citation.evidenceTextDigest === excerptHash &&
    snapshot.citation.sourceDigest === sourceHash;
}

/**
 * Only a structured, auditable, FAIL-CLOSED offline preflight. Never invoke
 * a provider or emit bytes from this helper. A real, durable AI3/AI6 claim and
 * authorization at the actual SEND boundary remain mandatory and unimplemented.
 */
export async function prepareQaEvidenceOffline(
  request: QaProofRequest,
  candidate: QaEvidenceCandidate | null,
  ports: Partial<QaProofPorts> | undefined,
  enabled = false,
): Promise<QaProofResult> {
  if (enabled !== true) return deny('GATE_OFF');
  if (!request || !nonempty(request.subjectId) || !nonempty(request.sessionId) ||
      request.appId !== 'echostars' || request.action !== 'echo.qa.answer' ||
      !nonempty(request.question) || request.question.length > 1200 ||
      !Array.isArray(request.terms) || !candidate ||
      !validCitation(candidate.citation) || !nonempty(candidate.excerptText) ||
      !Number.isFinite(candidate.score) || candidate.score <= 0 ||
      !ports || typeof ports.readCurrent !== 'function' ||
      typeof ports.assessSupport !== 'function' || typeof ports.now !== 'function')
    return deny('INSUFFICIENT');

  // Reuse the #505 selector. Its overlap score is only a first filter.
  const lexical = selectRelevantQaEvidence([candidate], request.terms, 1);
  if (!lexical.prompt || lexical.sources.length === 0) return deny('INSUFFICIENT');

  try {
    let now = ports.now();
    if (!Number.isSafeInteger(now) || now <= 0) return deny('AUTHORITY_UNKNOWN');
    const first = await ports.readCurrent(request,candidate.citation.trackId,candidate.citation.segmentId);
    if (!await validSnapshot(first,request,candidate,now)) return deny('AUTHORITY_UNKNOWN');

    // A server-trusted external reviewer has to attest answer sufficiency.
    // We do NOT accept a mere lexical hit, a model assertion, or user input.
    const questionDigest = await digest(request.question);
    const verdict = await ports.assessSupport(request.question,first!.excerptText);
    if (!verdict || verdict.status !== 'SUPPORTED' ||
        verdict.questionDigest !== questionDigest ||
        verdict.evidenceTextDigest !== first!.citation.evidenceTextDigest ||
        !nonempty(verdict.quote) || Array.from(verdict.quote.trim()).length < 4 ||
        !first!.excerptText.includes(verdict.quote)) return deny('SUPPORT_UNKNOWN');

    // Verify again AFTER support review; even this is not a substitute for an
    // atomic authority+claim fence at the real Provider/HTTP SEND boundary.
    now = ports.now();
    if (!Number.isSafeInteger(now) || now <= 0) return deny('AUTHORITY_UNKNOWN');
    const second = await ports.readCurrent(request,candidate.citation.trackId,candidate.citation.segmentId);
    if (!await validSnapshot(second,request,candidate,now) ||
        !exactCitation(first!.citation,second!.citation) ||
        first!.excerptText !== second!.excerptText || first!.sourceText !== second!.sourceText)
      return deny('STALE_EVIDENCE');

    return {
      status: 'PREPARED_OFFLINE', reason: 'UNFENCED_SEND',
      prompt: lexical.prompt, citations: [second!.citation], quote: verdict.quote,
      canSend: false,
    };
  } catch {
    return deny('AUTHORITY_UNKNOWN');
  }
}
