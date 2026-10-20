/**
 * AI7 N1A S3A offline integration. Run AI2's ACTUAL shared S3A verifier
 * and AI7's already-reviewed S1 backup gate in the same Node test process.
 *
 * This never supplies an executable restore/delete command.
 * No production imports, network, account credentials, D1/R2 or persistent DB.
 */
import {
  evaluateS3aFakeEnvelope, N1A_S3A_PRODUCTION_GATE,
  type S3aEnvelope, type S3aFakeReaders, type S3aDecision, type S3aExpected
} from '../security-contract-v1/s3aEnvelope.ts';
import {
  simulateN1aBackupGate, sha256FakeText, N1A_BKP_RUNTIME_ENABLED,
  type SimulatedRestoreInput, type SimulatedRestoreDecision,
  type MockBackup, type MockBackupFile
} from '../n1a-bkp-s1/fakeRestoreGate.ts';

export const AI7_S3A_RESTORE_RUNTIME_ENABLED=false as const;
export type Ai7S3aInput=Readonly<{
  restore:SimulatedRestoreInput;
  appId:string;
  envelopes:readonly S3aEnvelope[];
  readers:S3aFakeReaders;
}>;
export type Ai7S3aDecision=Readonly<{
  simulatedEligible:boolean;
  executableRestore:false;
  executableDelete:false;
  productionAuthorized:false;
  sideEffects:0;
  reasons:readonly string[];
  sharedChecks:readonly Readonly<{reviewerId:string;stage:'first'|'final';result:S3aDecision}>[];
  backupDecision:SimulatedRestoreDecision|null;
  cleanupReviewOnly:readonly string[];
  executableCleanupCandidates:readonly string[];
}>;

function blocked(reasons:readonly string[],checks:Ai7S3aDecision['sharedChecks'],
   backupDecision:SimulatedRestoreDecision|null=null):Ai7S3aDecision {
  return {simulatedEligible:false,executableRestore:false,executableDelete:false,
    productionAuthorized:false,sideEffects:0,reasons:[...new Set(reasons)].sort(),
    sharedChecks:checks,backupDecision,cleanupReviewOnly:[],
    executableCleanupCandidates:[]};
}

/** A deliberate LOCAL test binding, not a signature or approved nonce issuer. */
export async function ai7S3aFakeApprovalNonce(
  requestId:string,backupId:string,manifestHash:string,
  reviewerId:string,headHash:string,epoch:string
):Promise<string>{
  return sha256FakeText(JSON.stringify([
    'AI7-S3A-FAKE-NONCE-v1',requestId,backupId,manifestHash,
    reviewerId,headHash,epoch
  ]));
}

function approvedLineage(input:SimulatedRestoreInput):
  {files:readonly MockBackupFile[];reason:string|null}{
  const map=new Map<string,MockBackup>();
  for(const b of input.backups){
    if(!b.id||map.has(b.id))return {files:[],reason:'DUPLICATE_BACKUP_ID'};
    map.set(b.id,b);
  }
  const chain:MockBackup[]=[];
  const visited=new Set<string>();
  let cursor:string|null=input.selectedBackupId;
  while(cursor!==null){
    if(visited.has(cursor))return {files:[],reason:'BACKUP_PARENT_CYCLE'};
    visited.add(cursor);
    const b=map.get(cursor);
    if(!b)return {files:[],reason:'BACKUP_PARENT_MISSING'};
    chain.push(b);cursor=b.parentId;
  }
  chain.reverse();
  if(chain.length===0||chain[0].kind!=='full'||
     chain.some((b,i)=>b.state!=='verified-success'||i>0&&
       (b.kind!=='delta'||b.parentId!==chain[i-1].id)))
    return {files:[],reason:'BACKUP_CHAIN_INVALID'};
  const files=chain.flatMap(b=>b.files.filter(f=>f.review!=='candidate'));
  if(!files.length)return {files,reason:'BACKUP_HAS_NO_APPROVED_FILES'};
  // AI2 shared envelope describes up to five CURRENT resources, one version
  // each. Multiple historical versions for the same track are NOT representable:
  // reject rather than silently skip an ancestor.
  const ids=files.map(f=>f.trackId);
  if(files.length>5||new Set(ids).size!==ids.length||
    ids.some(id=>!id))return {files,reason:'HISTORICAL_SCOPE_UNREPRESENTABLE'};
  return {files,reason:null};
}

export async function simulateAi7S3aSharedRestore(x:Ai7S3aInput):Promise<Ai7S3aDecision>{
  const checks:{reviewerId:string;stage:'first'|'final';result:S3aDecision}[]=[];
  const deny=(...reasons:string[])=>blocked(reasons,checks);
  if(AI7_S3A_RESTORE_RUNTIME_ENABLED!==false||
     N1A_S3A_PRODUCTION_GATE!==false||N1A_BKP_RUNTIME_ENABLED!==false)
    return deny('OFFLINE_GATE_NOT_OFF');
  if(!/^[A-Za-z0-9_.:-]{1,160}$/.test(x.appId))
    return deny('APP_SCOPE_INVALID');
  const r=x.restore;
  if(!r||r.approvals?.length!==2||x.envelopes?.length!==2||
     r.approvals[0].reviewerId===r.approvals[1].reviewerId||
     x.envelopes[0].subjectId===x.envelopes[1].subjectId)
    return deny('TWO_DISTINCT_APPROVERS_REQUIRED');
  const {files,reason}=approvedLineage(r);
  if(reason)return deny(reason);
  const resourceIds=files.map(f=>f.trackId);
  const seen=new Set<string>();
  // Before exposing even fake 'eligible', explicitly bind all current content
  // SHA-256 and both reviewer envelopes to the selected backup.
  for(let i=0;i<2;i++){
    const envelope=x.envelopes[i],approval=r.approvals[i];
    if(envelope.subjectId!==approval.reviewerId||
       envelope.requestId!==r.requestId||
       envelope.action!=='backup.commit'||
       envelope.appId!==x.appId||
       envelope.resources.length!==files.length||
       envelope.resources.some((proof,j)=>
         proof.resourceId!==files[j].trackId||
         proof.contentDigest!==files[j].sha256))
      return deny('BACKUP_RESOURCE_OR_APPROVER_NOT_BOUND');
    if(seen.has(envelope.subjectId))return deny('REVIEWER_REPEATED');
    seen.add(envelope.subjectId);
    const nonce=await ai7S3aFakeApprovalNonce(
      r.requestId,r.selectedBackupId,r.manifestHash,
      approval.reviewerId,approval.headHash,approval.restoreEpoch);
    if(envelope.nonce!==nonce)return deny('BACKUP_MANIFEST_NONCE_MISMATCH');
  }
  if(x.envelopes[0].securitySeq!==x.envelopes[1].securitySeq||
     x.envelopes[0].checkpointSeq!==x.envelopes[1].checkpointSeq||
     x.envelopes[0].restoreEpoch!==x.envelopes[1].restoreEpoch||
     x.envelopes[0].revocationWatermark!==x.envelopes[1].revocationWatermark||
     x.envelopes[0].deletionWatermark!==x.envelopes[1].deletionWatermark)
    return deny('TWO_REVIEWERS_WITNESS_DISAGREES');

  // Bind the S1 separate historical proof/third trusted floor to the shared
  // envelope's known securitySeq/checkpoint/epoch. Shared verifier itself
  // currently has no actual immutable HEAD hash nor historical tombstone list.
  try {
    const [w,floor]=await Promise.all([
      r.env.readWitness('before'),r.env.readTrustedFloor('before')]);
    if(!w||!floor)return deny('S1_WITNESS_OR_FLOOR_MISSING');
    for(const e of x.envelopes){
      if(e.securitySeq!==w.headSeq||
         e.checkpointSeq!==floor.headSeq||
         e.restoreEpoch!==w.restoreEpoch||
         e.restoreEpoch!==floor.restoreEpoch)
        return deny('S1_S3A_SECURITY_VERSION_MISMATCH');
    }
  }catch{return deny('S1_AUTHORITY_UNREACHABLE');}

  // A real execution of AI2's verifier for BOTH different reviewers.
  // Run it twice to detect intermediate fake membership or head changes,
  // then let the S1 gate do its own before/after witness/tombstone validation.
  for(const stage of ['first','final'] as const){
    for(let i=0;i<2;i++){
      const envelope=x.envelopes[i],approval=r.approvals[i];
      const expected:S3aExpected={appId:x.appId,
        subjectId:approval.reviewerId,requestId:r.requestId,
        action:'backup.commit',resourceIds};
      const v=await evaluateS3aFakeEnvelope(
        envelope,expected,x.readers,'before_commit',r.nowMs);
      checks.push({reviewerId:approval.reviewerId,stage,result:v});
      if(v.simulatedAllowed!==true||v.productionAuthorized!==false||
         v.irreversibleActionsAllowed!==false||v.providerCalls!==0||
         v.restoreWrites!==0)
        return blocked(['SHARED_VERIFIER_DENIED:'+v.reason],checks);
    }
  }
  let decision:SimulatedRestoreDecision;
  try{ decision=await simulateN1aBackupGate(r); }
  catch{return blocked(['S1_GATE_EXCEPTION'],checks);}
  if(!decision.simulatedEligible||decision.productionAuthorized!==false||
     decision.sideEffects!==0||decision.restoreLocked!==true)
    return blocked(['S1_RESTORE_GATE_DENIED',...decision.reasons],checks,decision);
  return {simulatedEligible:true,executableRestore:false,
    executableDelete:false,productionAuthorized:false,sideEffects:0,
    reasons:[],sharedChecks:checks,backupDecision:decision,
    cleanupReviewOnly:[...decision.retentionCandidates],
    executableCleanupCandidates:[]};
}
