import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreSealed } from './ai4-a03/sealed-evaluator.mjs';

const evidence = {
  trackId: 'SYNTHETIC-01', segmentId: 'S1', sourceRevision: 7,
  resourceRevision: 4, transcriptVersion: 'v7', permissionRevision: 12,
  revocationWatermark: 55, restoreEpoch: 3, startMs: 1000, endMs: 6000,
  evidenceTextDigest: 'sha256:fake-text', sourceDigest: 'sha256:fake-source'
};
const candidateSha = '0123456789abcdef';
const gold = () => ({
  fixtureKind: 'custodial-answer-key', candidateSha, roundId: 'SMOKE-NOT-BLIND',
  cases: [
    { caseId: 'Q1', expectedAction: 'ANSWER', allowedEvidence: [evidence] },
    { caseId: 'Q2', expectedAction: 'ABSTAIN' },
    { caseId: 'Q3', expectedAction: 'DENY' }
  ]
});
const predict = () => ({
  fixtureKind: 'offline-predictions', candidateSha, roundId: 'SMOKE-NOT-BLIND',
  predictions: [
    { caseId: 'Q1', action: 'ANSWER', answer: '純虛構答案', citations: [{...evidence}] },
    { caseId: 'Q2', action: 'ABSTAIN', answer: '', citations: [] },
    { caseId: 'Q3', action: 'DENY', answer: '', citations: [] }
  ]
});
test('smoke fixture passes synthetic-only evidence evaluator (NOT independent blind)', () => {
  const result = scoreSealed(predict(), gold());
  assert.equal(result.gate,'SYNTHETIC_EVIDENCE_GATE_PASS');
  assert.equal(result.top5,1);
  assert.equal(result.unsafeRefusalBytes,0);
});
test('no-source with answer bytes must FAIL', () => {
  const p = predict(); p.predictions[1].answer = '猜測費用';
  assert.equal(scoreSealed(p,gold()).gate,'FAIL');
  assert.equal(scoreSealed(p,gold()).unsafeRefusalBytes,1);
});
test('revoked/deleted with citation bytes must FAIL', () => {
  const p = predict(); p.predictions[2].citations = [{...evidence}];
  assert.equal(scoreSealed(p,gold()).unsafeRefusalBytes,1);
  assert.equal(scoreSealed(p,gold()).gate,'FAIL');
});
test('refusal object with hidden private title must FAIL', () => {
  const p = predict() as any; p.predictions[2].hiddenTitle='fake secret';
  assert.equal(scoreSealed(p,gold()).gate,'FAIL');
});
test('stale sourceRevision invalidates citation', () => {
  const p = predict(); (p.predictions[0].citations[0] as any).sourceRevision=6;
  const result=scoreSealed(p,gold());
  assert.equal(result.gate,'FAIL'); assert.equal(result.citationVersionFaults,1);
  assert.equal(result.top5,0);
});
test('restoreEpoch rollback invalidates citation', () => {
  const p=predict(); (p.predictions[0].citations[0] as any).restoreEpoch=2;
  assert.equal(scoreSealed(p,gold()).gate,'FAIL');
});
test('wrong evidence digest invalidates citation', () => {
  const p=predict(); (p.predictions[0].citations[0] as any).evidenceTextDigest='sha256:old';
  assert.equal(scoreSealed(p,gold()).wrongCitations,1);
});
test('no independent answer key must reject rather than fake a pass', () => {
  assert.throws(()=>scoreSealed(predict(),{} as any));
});
test('no answerable questions cannot be claimed 90 percent', () => {
  const g=gold(), p=predict(); g.cases=g.cases.slice(1); p.predictions=p.predictions.slice(1);
  assert.equal(scoreSealed(p,g).gate,'FAIL');
});
test('candidate version mismatch and duplicate case IDs are rejected', () => {
  const g=gold(); g.candidateSha='another-candidate';
  assert.throws(()=>scoreSealed(predict(),g),/fingerprint mismatch/);
  const p=predict(); p.predictions[2].caseId='Q1';
  assert.throws(()=>scoreSealed(p,gold()),/duplicate/);
});
