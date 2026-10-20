import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SERVICES } from '../ops-s1/healthModel.ts';
import type { Observation } from '../ops-s1/healthModel.ts';
import { buildN1aMockDashboard } from '../ops-s1/n1aS1Console.ts';
import { showFakeProofHandoff } from '../ops-s1/n1aS1ProofHandoff.ts';
import type { FakeProofDecisionLike } from '../ops-s1/n1aS1ProofHandoff.ts';

const NOW=Date.parse('2026-10-20T11:30:00Z'), FRESH=new Date(NOW-1000).toISOString();
const platform:Observation[]=SERVICES.map(service=>({
  service,source:'fixture',verified:true,access:'granted',observedAt:FRESH,
  windowMinutes:15,requests:300,serverErrors:0,
}));
const positive=([
 'app_security','ai_billing','backup_restore'
] as const).map(domain=>({domain,observedAt:FRESH,fixtureComplete:true,fixtureConfirmsNoIncidents:true}));
const base=()=>buildN1aMockDashboard(platform,[],NOW,positive);
const decision=(reason:string,simulatedAllowed=false,stage:'precheck'|'before_commit'='before_commit'):FakeProofDecisionLike=>
 ({reason,stage,simulatedAllowed,productionAuthorized:false,sideEffects:0});
function unchangedPlatform(result:ReturnType<typeof showFakeProofHandoff>){
 assert.deepEqual(result.cloud,base().cloud);
 assert.ok(result.cloud.services.every(s=>s.status==='normal'));
}
function locked(result:ReturnType<typeof showFakeProofHandoff>){
 assert.equal(result.productionAuthorized,false);assert.equal(result.actionsAllowed,false);
 assert.equal(result.retriesAllowed,false);assert.equal(result.newAiSpendingAllowed,false);
 assert.equal(result.restoreAllowed,false);assert.equal(result.proofHandoff.actionLocked,true);
 assert.equal(result.proofHandoff.exposesIdentity,false);
}

test('N1A6-P2-01 no proof => App unknown despite six green demo Cloudflare services',()=>{
 const result=showFakeProofHandoff(base(),null);
 unchangedPlatform(result);locked(result);
 assert.equal(result.domains.app_security.status,'unknown');
 assert.equal(result.proofHandoff.proofState,'unknown');
 assert.equal(result.domains.ai_billing.status,'normal');
 assert.equal(result.domains.backup_restore.status,'normal');
});
test('N1A6-P2-02 revoked OR unavailable is ambiguous: do not claim confirmed revocation',()=>{
 const result=showFakeProofHandoff(base(),decision('membership_revoked_or_unavailable'));
 unchangedPlatform(result);locked(result);
 assert.equal(result.domains.app_security.status,'unknown');
 assert.equal(result.proofHandoff.proofState,'revocation_or_unavailable');
 assert.match(result.proofHandoff.displayText,/不能直接認定已撤權/);
});
test('N1A6-P2-03 a changed membership revision must deny without exposing identity',()=>{
 const result=showFakeProofHandoff(base(),decision('membership_revision_changed'));
 assert.equal(result.domains.app_security.status,'unknown');
 assert.equal(result.proofHandoff.exposesIdentity,false);
});
test('N1A6-P2-04 verified fake witness revocation OR deletion record gives local warning, not platform fault',()=>{
 const result=showFakeProofHandoff(base(),decision('witness_records_revocation_or_deletion'));
 unchangedPlatform(result);locked(result);
 assert.equal(result.domains.app_security.status,'warning');
 assert.equal(result.proofHandoff.proofState,'revocation_or_deletion_record');
 assert.equal(result.domains.ai_billing.status,'normal');
 assert.equal(result.domains.backup_restore.status,'normal');
});
test('N1A6-P2-05 external witness changed OR rolled back must not be labelled certain rollback',()=>{
 const result=showFakeProofHandoff(base(),decision('external_witness_changed_or_rolled_back'));
 unchangedPlatform(result);locked(result);
 assert.equal(result.domains.app_security.status,'unknown');
 assert.equal(result.domains.backup_restore.status,'unknown');
 assert.equal(result.domains.ai_billing.status,'normal');
 assert.equal(result.proofHandoff.witnessState,'mismatch_or_possible_rollback');
 assert.match(result.proofHandoff.displayText,/可能回捲/);
 assert.match(result.proofHandoff.displayText,/尚未確證回捲/);
});
test('N1A6-P2-06 invalid external witness versions fail closed across App and backups',()=>{
 const result=showFakeProofHandoff(base(),decision('external_witness_invalid_version'));
 assert.equal(result.domains.app_security.status,'unknown');
 assert.equal(result.domains.backup_restore.status,'unknown');
 assert.equal(result.proofHandoff.reasonCode,'WITNESS_VERSION_MISMATCH_UNVERIFIED');
});
test('N1A6-P2-07 absent external witness leaves App and backup unknown',()=>{
 const result=showFakeProofHandoff(base(),decision('external_witness_missing'));
 assert.equal(result.domains.app_security.status,'unknown');
 assert.equal(result.domains.backup_restore.status,'unknown');
 locked(result);
});
test('N1A6-P2-08 trusted source unavailable never reuses green security view',()=>{
 const result=showFakeProofHandoff(base(),decision('trusted_source_unavailable'));
 assert.equal(result.domains.app_security.status,'unknown');
 assert.equal(result.domains.backup_restore.status,'unknown');
 assert.equal(result.cloud.overall,'normal');
});
test('N1A6-P2-09 existing confirmed App fault remains RED when proof is unavailable',()=>{
 const source=buildN1aMockDashboard(platform,[{
  origin:'ai2',kind:'workflow_failed',verified:true,observedAt:FRESH,
 }],NOW,positive);
 const result=showFakeProofHandoff(source,decision('external_witness_missing'));
 assert.equal(result.domains.app_security.status,'fault');
 assert.equal(result.domains.app_security.conflict,true);
 assert.equal(result.anyConfirmedFault,true);
});
test('N1A6-P2-10 existing backup fault remains RED despite witness mismatch',()=>{
 const source=buildN1aMockDashboard(platform,[{
  origin:'ai7',kind:'backup_integrity_fault',verified:true,observedAt:FRESH,
 }],NOW,positive);
 const result=showFakeProofHandoff(source,decision('external_witness_changed_or_rolled_back'));
 assert.equal(result.domains.backup_restore.status,'fault');
 assert.equal(result.domains.backup_restore.conflict,true);
 assert.equal(result.cloud.services.find(s=>s.service==='r2')?.status,'normal');
});
test('N1A6-P2-11 fake consistent proof never unlocks payment, backup or real access',()=>{
 const result=showFakeProofHandoff(base(),decision('fake_evidence_consistent',true));
 unchangedPlatform(result);locked(result);
 assert.equal(result.proofHandoff.proofState,'mock_consistent');
 assert.equal(result.domains.app_security.status,'normal'); // Only complete fake observations.
 assert.equal(result.proofHandoff.productionAuthorized,false);
});
test('N1A6-P2-12 even before_commit success is only a fake assessment, never authorization',()=>{
 const result=showFakeProofHandoff(base(),decision('fake_evidence_consistent',true,'before_commit'));
 assert.equal(result.proofHandoff.stage,'before_commit');
 locked(result);
});
test('N1A6-P2-13 internally inconsistent simulatedAllowed/reason is never accepted',()=>{
 for(const d of [
  decision('fake_evidence_consistent',false),
  decision('external_witness_missing',true),
 ]) {
  const result=showFakeProofHandoff(base(),d);
  assert.equal(result.domains.app_security.status,'unknown');
  assert.equal(result.proofHandoff.proofState,'unknown');
  locked(result);
 }
});
test('N1A6-P2-14 noncanonical or forged envelope is unknown without comparing numeric revisions',()=>{
 const bad=[
  {stage:'before_commit',reason:'fake_evidence_consistent',simulatedAllowed:true,productionAuthorized:true,sideEffects:0},
  {stage:'before_commit',reason:'fake_evidence_consistent',simulatedAllowed:true,productionAuthorized:false,sideEffects:1},
  {stage:'approval',reason:'fake_evidence_consistent',simulatedAllowed:true,productionAuthorized:false,sideEffects:0},
  {stage:'precheck',reason:'forged_success',simulatedAllowed:true,productionAuthorized:false,sideEffects:0},
  {schemaVersion:'N1A-S1-FAKE-v1',sourceRevision:42,securitySeq:'01',restoreEpoch:0},
 ];
 for(const d of bad){
  const result=showFakeProofHandoff(base(),d);
  assert.equal(result.domains.app_security.status,'unknown');
  assert.equal(result.proofHandoff.stage,'unknown');
  locked(result);
 }
});
test('N1A6-P2-15 unknown reason code cannot turn green',()=>{
 const result=showFakeProofHandoff(base(),decision('COMPROMISED_SOURCE_APPROVED'));
 assert.equal(result.domains.app_security.status,'unknown');
 assert.equal(result.proofHandoff.proofState,'unknown');
});
test('N1A6-P2-16 proper common contract denial reasons are recognized, but never grant access',()=>{
 const reasons=[
  'wrong_schema_or_audience','invalid_identity','proof_rebound_to_other_action',
  'ai_grant_missing','missing_fake_attestation','invalid_or_noncanonical_version',
  'expired_or_future_proof','unverified_fake_attestation','membership_revoked_or_unavailable',
  'membership_revision_changed','external_witness_missing','external_witness_invalid_version',
  'external_witness_changed_or_rolled_back','witness_invalid_records',
  'witness_records_revocation_or_deletion','resource_unavailable',
  'resource_changed_since_approval','trusted_source_unavailable','unknown_stage',
 ];
 for(const reason of reasons){
  const d=showFakeProofHandoff(base(),decision(reason));
  assert.notEqual(d.domains.app_security.status,'normal',reason);
  locked(d);
 }
});
test('N1A6-P2-17 extra PII, track IDs, nonce, secrets, raw proof are never serialized',()=>{
 const input={
  ...decision('witness_records_revocation_or_deletion'),
  subjectId:'PRIVATE_MEMBER_ID',resourceId:'PRIVATE_AUDIO_TRACK',
  nonce:'PRIVATE_NONCE',fakeAttestation:'PRIVATE_SECRET',
  reviewerEmail:'private@example.com',rawTranscript:'PRIVATE_TRANSCRIPT',
  sourceRevision:123,securitySeq:'18446744073709551615',
 };
 const result=showFakeProofHandoff(base(),input);
 const raw=JSON.stringify(result);
 for(const s of ['PRIVATE_MEMBER_ID','PRIVATE_AUDIO_TRACK','PRIVATE_NONCE',
  'PRIVATE_SECRET','private@example.com','PRIVATE_TRANSCRIPT','18446744073709551615'])
  assert.equal(raw.includes(s),false,s);
});
test('N1A6-P2-18 source revision numeric/string ambiguity is never silently coerced',()=>{
 const malformed={...decision('fake_evidence_consistent',true),
  sourceRevision:123,membershipRevision:'001',restoreEpoch:1};
 const out=showFakeProofHandoff(base(),malformed);
 assert.equal(out.proofHandoff.productionAuthorized,false);
 assert.equal(JSON.stringify(out).includes('sourceRevision'),false);
 // AI6 intentionally consumes ONLY AI2 fake decision, not the raw proof.
});
test('N1A6-P2-19 business fee Hold stays separate from AI2 proof missing / six green platforms',()=>{
 const source=buildN1aMockDashboard(platform,[{
  origin:'ai3',kind:'b07_uncertain_hold',verified:true,observedAt:FRESH,
 }],NOW);
 const result=showFakeProofHandoff(source,null);
 assert.equal(result.domains.ai_billing.status,'warning');
 assert.equal(result.domains.app_security.status,'unknown');
 assert.equal(result.cloud.services.find(s=>s.service==='workers_ai')?.status,'normal');
 assert.equal(result.newAiSpendingAllowed,false);
});
test('N1A6-P2-20 no cloud API, no polling, no paid provider in handoff source',()=>{
 const source=readFileSync(new URL('../ops-s1/n1aS1ProofHandoff.ts',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|\bsetInterval\s*\(|\bAI\.run\s*\(|\.retry\s*\(|\.terminate\s*\(|\bR2_BUCKET\.|\bD1\.prepare\s*\(/);
});
test('N1A6-P2-21 offline UI contains all three proof scenarios but no PII or network',()=>{
 const source=readFileSync(new URL('../ops-s1/n1aS1OfflinePreview.html',import.meta.url),'utf8');
 for(const name of ['proofUnknown','proofRevoked','proofRollback','proof-description','witness-state',
  '不顯示身份資料','不能直接認定已撤權','平台正常／App 備份異常'])
  assert.ok(source.includes(name),name);
 assert.doesNotMatch(source,/<script\s+src=|<iframe|\bfetch\s*\(|\bsetInterval\s*\(|new\s+WebSocket/);
});
test('N1A6-P2-22 pure composition leaves input unchanged, no side effects',()=>{
 const source=base(),snapshot=JSON.stringify(source),proof=decision('external_witness_missing');
 const result=showFakeProofHandoff(source,proof);
 assert.equal(JSON.stringify(source),snapshot);
 assert.notEqual(result.domains,source.domains);
 locked(result);
});
test('N1A6-P2-23 2000 fake rejected handoffs are bounded, never authorize paid work',()=>{
 const view=base();
 for(let i=0;i<2000;i++){
  const reason=i%3===0?'membership_revoked_or_unavailable':i%3===1?'external_witness_missing':'external_witness_changed_or_rolled_back';
  const out=showFakeProofHandoff(view,decision(reason));
  assert.equal(out.cloud.overall,'normal');
  assert.equal(out.domains.app_security.status,'unknown');
  locked(out);
 }
});

test('N1A6-R3-01 self-claimed consistent fake proof must NEVER preserve a green App card',()=>{
 const result=showFakeProofHandoff(base(),decision('fake_evidence_consistent',true));
 assert.equal(result.domains.app_security.status,'unknown');
 assert.equal(result.proofHandoff.proofState,'not_verified');
 assert.equal(result.proofHandoff.witnessState,'unknown');
 assert.match(result.proofHandoff.displayText,/未經可信後端驗證/);
 assert.equal(result.domains.backup_restore.status,'unknown');
 unchangedPlatform(result);locked(result);
});
test('N1A6-R3-02 self-claimed fake witness denial is not an authenticated security warning',()=>{
 const result=showFakeProofHandoff(base(),decision('witness_records_revocation_or_deletion'));
 assert.equal(result.domains.app_security.status,'unknown');
 assert.equal(result.proofHandoff.status,'unknown');
 assert.equal(result.domains.backup_restore.status,'unknown');
 locked(result);
});
