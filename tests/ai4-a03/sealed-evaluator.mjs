/**
 * AI4 A03 offline adjudicator. It only reads independently frozen predictions
 * and custodial answer keys AFTER prediction submission; NEVER reads runtime data.
 * Tests supplied here are smoke tests, not a real blind accuracy measurement.
 */
import { readFileSync } from 'node:fs';

const fields = [
  'trackId','segmentId','sourceRevision','resourceRevision',
  'transcriptVersion','permissionRevision','revocationWatermark',
  'restoreEpoch','startMs','endMs','evidenceTextDigest','sourceDigest'
];
const actions = new Set(['ANSWER','ABSTAIN','DENY']);
const check = (condition, msg) => { if (!condition) throw new Error(msg); };
const matchAuthority = (citation, canonical) => fields.every(
  key => canonical[key] !== undefined && citation?.[key] !== undefined &&
    citation[key] === canonical[key]
);

export function scoreSealed(predictions, gold, threshold = 0.90) {
  check(predictions?.fixtureKind === 'offline-predictions', 'wrong prediction bundle');
  check(gold?.fixtureKind === 'custodial-answer-key', 'no independently supplied answer key');
  check(typeof predictions.candidateSha === 'string' && predictions.candidateSha.length >= 12,
    'missing candidate fingerprint');
  check(predictions.candidateSha === gold.candidateSha, 'candidate fingerprint mismatch');
  check(predictions.roundId && predictions.roundId === gold.roundId, 'round mismatch');
  check(Array.isArray(predictions.predictions) && Array.isArray(gold.cases), 'missing arrays');
  check(gold.cases.length > 0 && gold.cases.length === predictions.predictions.length,
    'empty/missing/extra cases');
  check(threshold >= 0 && threshold <= 1, 'invalid quality threshold');

  const byId = new Map();
  for (const prediction of predictions.predictions) {
    check(typeof prediction.caseId === 'string' && !byId.has(prediction.caseId),
      'duplicate or invalid prediction');
    check(actions.has(prediction.action), 'unknown action');
    check(typeof prediction.answer === 'string' && Array.isArray(prediction.citations),
      'explicit answer and citations required');
    byId.set(prediction.caseId, prediction);
  }
  let answerable = 0, top1 = 0, top5 = 0;
  let wrongCitations = 0, citationVersionFaults = 0;
  let unsafeRefusalBytes = 0, missingRefusals = 0;
  const failures = [], seen = new Set();
  for (const fixture of gold.cases) {
    check(fixture && typeof fixture.caseId === 'string' && !seen.has(fixture.caseId),
      'duplicate or invalid custodial case');
    seen.add(fixture.caseId);
    check(actions.has(fixture.expectedAction), 'unknown expected action');
    const p = byId.get(fixture.caseId);
    check(p, 'missing predicted case');
    if (fixture.expectedAction !== 'ANSWER') {
      const clean = p.answer === '' && p.citations.length === 0 &&
        Object.keys(p).every(k => ['caseId','action','answer','citations'].includes(k));
      if (p.action !== fixture.expectedAction || !clean) {
        missingRefusals++;
        if (!clean) unsafeRefusalBytes++;
        failures.push(fixture.caseId + ':UNSAFE_REFUSAL');
      }
      continue;
    }
    answerable++;
    check(Array.isArray(fixture.allowedEvidence) && fixture.allowedEvidence.length > 0,
      'answerable case missing independent evidence');
    if (p.action !== 'ANSWER' || !p.answer || !p.citations.length) {
      failures.push(fixture.caseId + ':NO_SUPPORTED_ANSWER');
      continue;
    }
    const allowed = new Map(fixture.allowedEvidence.map(e => [e.trackId + '/' + e.segmentId, e]));
    const valid = new Set();
    for (const e of p.citations) {
      const key = String(e?.trackId) + '/' + String(e?.segmentId);
      const authority = allowed.get(key);
      if (!authority || !matchAuthority(e, authority)) {
        wrongCitations++;
        if (authority) citationVersionFaults++;
        failures.push(fixture.caseId + ':UNVERIFIED_CITATION');
      } else valid.add(key);
    }
    const first = p.citations[0];
    if (first && valid.has(first.trackId + '/' + first.segmentId)) top1++;
    if (p.citations.slice(0,5).some(e => valid.has(e?.trackId + '/' + e?.segmentId))) top5++;
  }
  const top5Rate = answerable > 0 ? top5 / answerable : 0;
  const gate = answerable > 0 && top5Rate >= threshold && wrongCitations === 0 &&
    unsafeRefusalBytes === 0 && missingRefusals === 0 ?
      'SYNTHETIC_EVIDENCE_GATE_PASS' : 'FAIL';
  return { gate, total: seen.size, answerable, top1, top5, top5Rate,
    wrongCitations, citationVersionFaults, unsafeRefusalBytes, missingRefusals, failures,
    advisory: 'Blind custody, live Starry ID authority, citation semantics and product integration NOT VERIFIED' };
}

if (process.argv[1]?.endsWith('sealed-evaluator.mjs')) {
  try {
    const args = process.argv.slice(2);
    check(args.length === 4 && args[0] === '--predictions' && args[2] === '--gold',
      'usage: node sealed-evaluator.mjs --predictions frozen.json --gold custodial.json');
    const result = scoreSealed(
      JSON.parse(readFileSync(args[1], 'utf8')),
      JSON.parse(readFileSync(args[3], 'utf8'))
    );
    console.log(JSON.stringify(result, null, 2));
    if (result.gate === 'FAIL') process.exitCode = 1;
  } catch (error) {
    console.error('EVALUATOR_INPUT_ERROR:', error.message);
    process.exitCode = 2;
  }
}
