/**
 * S2367A B07-I1: FAKE-ONLY Gate2 → B07 contract. DO NOT IMPORT FROM A WORKER.
 *
 * Tests mirror SafeRun from PR #461 without changing/importing its runtime.
 * An immutable source/approval identity, not a client-provided requestKey,
 * defines whether the SAME logical audio segment has already been sent.
 * SQLite persistence and cross-process exclusion are separately verified by
 * tests/b07-i1-offline-integration.py; this TypeScript port has no I/O.
 */
import {createHash} from 'node:crypto';

export type I1FakeGate2Run = {
  runId:string; trackId:string; generation:number;
  state:'pending'|'queued'|'processing'|'ready'|'failed';
  intent:'first'|'relisten';
  sourceAudioEtag:string;
  approvalGrantDigest:string;
  leaseUntil:number; sourceMatches:boolean;
  centralPermissionVerified:boolean; restoreEpochVerified:boolean;
  approvalVerified:boolean;
};
export type I1FakeAttempt = {
  run:I1FakeGate2Run;
  segmentIndex:number;
  modelId:string;
  requestKey:string; // Deliberately excluded from source/approval identity.
};
export type I1FakeDecision = {allowed:false;reason:string} |
  {allowed:true;identityDigest:string;fakeOnly:true};

const digestPattern=/^[a-f0-9]{64}$/;
const ID=/^[a-zA-Z0-9_.:-]{1,160}$/;
function canonicalHash(values:(string|number)[]):string{
  const encoded=JSON.stringify(values);
  return createHash('sha256').update(encoded,'utf8').digest('hex');
}
export function deriveI1AudioIdentity(
  input:I1FakeAttempt,now:number
):I1FakeDecision {
  const r=input?.run;
  if(!r||r.state!=='processing'||!Number.isSafeInteger(r.generation)||
     r.generation<1||!Number.isSafeInteger(r.leaseUntil)||r.leaseUntil<=now)
    return {allowed:false,reason:'gate2_state_or_lease_invalid'};
  if(!r.centralPermissionVerified||!r.restoreEpochVerified||
     !r.approvalVerified||!r.sourceMatches)
    return {allowed:false,reason:'gate2_source_or_authority_unknown'};
  if(!ID.test(r.trackId)||!ID.test(r.runId)||!digestPattern.test(r.approvalGrantDigest)||
     !digestPattern.test(r.sourceAudioEtag)||
     !Number.isSafeInteger(input.segmentIndex)||input.segmentIndex<0||
     input.segmentIndex>=10000||typeof input.modelId!=='string'||
     input.modelId.length>200||!input.modelId.startsWith('@cf/'))
    return {allowed:false,reason:'gate2_invalid_identity'};
  // Same source + same approval grant + segment + model is one expense,
  // EVEN when requestKey/runId/generation changes. New real approval grant
  // requires an external non-rollback authority (NOT built by this fixture).
  const identityDigest=canonicalHash([
    'B07-I1:source:approval:segment:v1',
    r.trackId,r.sourceAudioEtag,r.approvalGrantDigest,
    input.segmentIndex,input.modelId
  ]);
  return {allowed:true,identityDigest,fakeOnly:true};
}

export type I1FakeClaim={identityDigest:string;logicalRequestKey:string};
export type I1FakeClaimPort={
  /** Must be an atomic durable insert; duplicate OR unknown acknowledgement = DENY. */
  insertOnce(claim:I1FakeClaim):Promise<'inserted'|'duplicate'|'unavailable'>;
  markUnknown(identityDigest:string):Promise<void>;
};
export type I1FakeProvider={send(identityDigest:string):Promise<'confirmed'|'timeout'>};
export async function attemptI1FakeProvider(
  input:I1FakeAttempt,now:number,claimPort:I1FakeClaimPort,
  provider:I1FakeProvider
):Promise<{state:'denied'|'settled'|'uncertain';reason:string;fakeProviderSends:0|1}>{
  const validated=deriveI1AudioIdentity(input,now);
  if(!validated.allowed)return {state:'denied',reason:validated.reason,fakeProviderSends:0};
  // In production, this CLAIM and the B07 reserve/attempt ticket must be
  // coordinated inside the central B07 D1 transaction before network I/O.
  // This is a standalone fake contract, NOT a live endpoint.
  let acquired:'inserted'|'duplicate'|'unavailable'='unavailable';
  try{
    acquired=await claimPort.insertOnce({
      identityDigest:validated.identityDigest,
      logicalRequestKey:input.requestKey
    });
  }catch{}
  if(acquired!=='inserted')
    return {state:'denied',reason:'b07_duplicate_or_central_unavailable',fakeProviderSends:0};
  try{
    const status=await provider.send(validated.identityDigest);
    if(status==='confirmed')return {state:'settled',reason:'fake_confirmed',fakeProviderSends:1};
  }catch{}
  // Provider may have received the request; never attempt another send.
  try{await claimPort.markUnknown(validated.identityDigest)}catch{}
  return {state:'uncertain',reason:'fake_provider_result_unknown',fakeProviderSends:1};
}
