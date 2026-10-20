import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  FakeStarryIdSource, applyFakeEvent, fakeStats, newFakeDatabase,
  setupFakeAccount, reserveFakeBatch, fakeBudgetTotals, markFakeUncertain,
  TEST_ONLY, productionAuthorized, F22_N1A_S1_GATE_ENABLED,
  type FakeEnvelope,
} from '../f22-n1a-s1/offlineModel.ts';

/**
 * N1A-S1 second-round compatibility tests, entirely fake and offline.
 * This is a FROZEN SHAPE EXERCISE based on AI2 Draft #469 SecurityProofV1:
 * it does not import/execute #469, authenticate Starry ID or access AI3's ledger.
 * Passing negative tests PROVES blockers are REPRODUCIBLE, not resolved.
 */
const NOW=Date.parse('2026-10-20T11:30:00Z');
const secret='N1A-ROUND2-TEST-ONLY';
const source=()=>new FakeStarryIdSource(secret);
const account=(db:DatabaseSync,patch:Record<string,unknown>={})=>
  setupFakeAccount(db,{
    accountId:'one-account',plan:'workers-free',periodKey:'fake-utc-day',
    capReads:5_000_000,capWrites:100_000,observedReads:0,observedWrites:0,
    now:NOW,evidence:'fake-verified',...patch,
  } as any);
const reserve=(db:DatabaseSync,id:string,reads=0,writes=0,now=NOW)=>
  reserveFakeBatch(db,{
    accountId:'one-account',batchId:id,periodKey:'fake-utc-day',now,reads,writes,
  });

type ProofShape = {
  schemaVersion:'N1A-S1-FAKE-v1'; issuer:'fake-star-id-plus-witness';
  audience:'n1a-offline-only'; action:'ai.attempt'; appId:string;
  subjectId:string;resourceId:string;requestId:string;approvalGrantId:string;
  membershipRevision:string;sourceRevision:string;permissionRevision:string;
  correctionRevision:string;securitySeq:string;restoreEpoch:string;
  revocationWatermark:string;deletionWatermark:string;
  issuedAtMs:number;expiresAtMs:number;fakeAttestation:string;
};
const proof=():ProofShape=>({
 schemaVersion:'N1A-S1-FAKE-v1',issuer:'fake-star-id-plus-witness',
 audience:'n1a-offline-only',action:'ai.attempt',
 appId:'echo',subjectId:'member-1',resourceId:'talk-1',
 requestId:'logical-attempt-1',approvalGrantId:'grant-1',
 membershipRevision:'7',sourceRevision:'ETag.content.v2',
 permissionRevision:'6',correctionRevision:'2',securitySeq:'30',
 restoreEpoch:'2',revocationWatermark:'5',deletionWatermark:'4',
 issuedAtMs:NOW-1000,expiresAtMs:NOW+5000,
 fakeAttestation:'FAKE-UNVERIFIED-NOT-A-CREDENTIAL',
});
type LiveShape = {
 memberActive:boolean;membershipRevision:string;anchorPresent:boolean;
 securitySeq:string;restoreEpoch:string;revocationWatermark:string;deletionWatermark:string;
 resourceActive:boolean;sourceRevision:string;permissionRevision:string;correctionRevision:string;
};
const live=():LiveShape=>({
 memberActive:true,membershipRevision:'7',anchorPresent:true,securitySeq:'30',
 restoreEpoch:'2',revocationWatermark:'5',deletionWatermark:'4',
 resourceActive:true,sourceRevision:'ETag.content.v2',permissionRevision:'6',correctionRevision:'2',
});
const canonical=(s:unknown)=>typeof s==='string'&&/^(0|[1-9]\d{0,19})$/.test(s)&&BigInt(s)<=18446744073709551615n;
/**
 * TEST-ONLY acceptance predicate of SHAPE expectations, NOT an implementation
 * of AI2's assessFakeSecurityProof or a trusted attestation verifier.
 * Real cross-service verification remains BLOCKED.
 */
function fakeShapeGate(p:ProofShape|any,v:LiveShape,now=NOW):'FAKE_SHAPE_OK'|'BLOCKED'{
 if(p.schemaVersion!=='N1A-S1-FAKE-v1'||p.audience!=='n1a-offline-only'||
    p.issuer!=='fake-star-id-plus-witness'||p.action!=='ai.attempt'||
    typeof p.approvalGrantId!=='string'||!p.approvalGrantId||
    !Number.isSafeInteger(now)||now>=p.expiresAtMs||p.issuedAtMs>now||
    p.expiresAtMs-p.issuedAtMs>30000)return 'BLOCKED';
 for(const field of ['membershipRevision','permissionRevision','correctionRevision',
    'securitySeq','restoreEpoch','revocationWatermark','deletionWatermark'])
   if(!canonical(p[field]))return 'BLOCKED';
 if(typeof p.sourceRevision!=='string'||!p.sourceRevision)return 'BLOCKED';
 if(!v.memberActive||!v.anchorPresent||!v.resourceActive)return 'BLOCKED';
 for(const field of ['membershipRevision','securitySeq','restoreEpoch',
    'revocationWatermark','deletionWatermark','sourceRevision',
    'permissionRevision','correctionRevision'] as const)
   if(p[field]!==v[field])return 'BLOCKED';
 return 'FAKE_SHAPE_OK';
}
const makeEvent=(s:FakeStarryIdSource,key:string,subject='member-1')=>
 s.firstAccept({logicalSourceId:key,app:'echo',subject,track:'talk-1',
   acceptedAtUtcMs:NOW-2000,state:'pending'});

test('N1A-R2-01 contract sourceRevision:number (F22 event) is NOT content sourceRevision:string (#469)',()=>{
 assert.equal(TEST_ONLY,true);
 assert.equal(productionAuthorized,false);
 assert.equal(F22_N1A_S1_GATE_ENABLED,false);
 const s=source();s.register('member-1');const e=makeEvent(s,'logical-1');
 const p=proof();
 assert.equal(typeof e.sourceRevision,'number');
 assert.equal(typeof p.sourceRevision,'string');
 assert.equal(e.sourceRevision,1);
 assert.equal(p.sourceRevision,'ETag.content.v2');
 // No number-to-string coercion, even when content's version happens to look numeric.
 const numericContent={...p,sourceRevision:'1'};
 assert.notEqual(e.sourceRevision,numericContent.sourceRevision);
 assert.equal(fakeShapeGate({...p,sourceRevision:1},live()),'BLOCKED');
 assert.equal(fakeShapeGate(p,live()),'FAKE_SHAPE_OK');
});

test('N1A-R2-02 membership revoked after precheck: second fake gate denies (core by itself has NO auth gate)',()=>{
 const s=source();s.register('member-1');const db=newFakeDatabase();
 try{
  const p=proof(),v=live(),e=makeEvent(s,'revoked-between-checks');
  assert.equal(fakeShapeGate(p,v),'FAKE_SHAPE_OK');
  assert.equal(applyFakeEvent(db,s,e),'APPLIED');
  v.memberActive=false;
  assert.equal(fakeShapeGate(p,v),'BLOCKED');
  // NEGATIVE PROOF: existing F22 fakeStats has no live membership-proof port.
  assert.equal(fakeStats(db,'all',NOW).registeredMembers,1);
  console.log('N1A_R2_BLOCKER: PRIVATE_STATS_NEEDS_FRESH_AUTH_AND_REVOCATION_POLICY');
 }finally{db.close();}
});

test('N1A-R2-03 witness unavailable / epoch rollback / membership revision change always block',()=>{
 const p=proof();
 for(const state of [
  {...live(),anchorPresent:false},{...live(),restoreEpoch:'1'},
  {...live(),revocationWatermark:'6'},{...live(),securitySeq:'29'},
  {...live(),membershipRevision:'8'},{...live(),memberActive:false},
  {...live(),sourceRevision:'ETag.content.v3'},
  {...live(),correctionRevision:'3'},{...live(),permissionRevision:'7'},
 ]){
  assert.equal(fakeShapeGate(p,state),'BLOCKED');
 }
 assert.equal(fakeShapeGate({...p,membershipRevision:7},live()),'BLOCKED');
 assert.equal(fakeShapeGate({...p,securitySeq:'030'},live()),'BLOCKED');
 assert.equal(fakeShapeGate({...p,sourceRevision:1},live()),'BLOCKED');
 assert.equal(fakeShapeGate({...p,expiresAtMs:NOW},live()),'BLOCKED');
});

test('N1A-R2-04 event correction increments EVENT version; CONTENT version unchanged',()=>{
 const s=source();s.register('member-1');const db=newFakeDatabase();
 try{
  const first=makeEvent(s,'status-change'),p=proof();
  assert.equal(applyFakeEvent(db,s,first),'APPLIED');
  assert.equal(fakeStats(db,'all',NOW).pending,1);
  const corrected=s.revise('echo','status-change',{state:'done',track:'talk-2'});
  assert.equal(corrected.sourceRevision,2);
  assert.equal(p.sourceRevision,'ETag.content.v2');
  assert.equal(fakeShapeGate(p,live()),'FAKE_SHAPE_OK');
  assert.equal(applyFakeEvent(db,s,corrected),'APPLIED');
  assert.equal(fakeStats(db,'all',NOW).calls,1);
  assert.equal(fakeStats(db,'all',NOW).done,1);
  assert.equal(fakeStats(db,'all',NOW,'talk-1').calls,0);
  assert.equal(fakeStats(db,'all',NOW,'talk-2').calls,1);
  assert.equal(applyFakeEvent(db,s,first),'STALE_IGNORED');
  assert.equal(applyFakeEvent(db,s,corrected),'DUPLICATE_NOOP');
  const withdrawn=s.revise('echo','status-change',{active:false});
  assert.equal(applyFakeEvent(db,s,withdrawn),'APPLIED');
  assert.equal(fakeStats(db,'all',NOW).calls,0);
  assert.equal(fakeStats(db,'all',NOW).registeredMembers,0);
 }finally{db.close();}
});

test('N1A-R2-05 content source correction DOES NOT authorize event status correction',()=>{
 const s=source();s.register('member-1');const db=newFakeDatabase();
 try{
  const first=makeEvent(s,'doc-correction'),p=proof();
  applyFakeEvent(db,s,first);
  assert.equal(fakeShapeGate(p,{...live(),sourceRevision:'ETag.content.v3'}),'BLOCKED');
  // Negative boundary: event version remains 1 and accepted request still counted;
  // no automatic projection invalidation has been integrated in original Fake model.
  assert.equal(fakeStats(db,'all',NOW).calls,1);
  assert.equal((db.prepare('SELECT revision AS v FROM fake_f22_events WHERE event_id=?')
    .get(first.globalEventId) as any).v,1);
  console.log('N1A_R2_BLOCKER: EXTERNAL_CONTENT_PROOF_CHANGE_REQUIRES_SEPARATE_POLICY');
 }finally{db.close();}
});

test('N1A-R2-06 AI spending hold is NOT a confirmed provider charge nor a completed question',()=>{
 const s=source();s.register('member-1');const db=newFakeDatabase();
 try{
  const e=makeEvent(s,'spend-held');applyFakeEvent(db,s,e);
  const p=proof();const spend={approvalGrantId:p.approvalGrantId,state:'held' as const,amountEstimatedTwd:100};
  assert.equal(fakeShapeGate(p,live()),'FAKE_SHAPE_OK');
  assert.equal(spend.state,'held');
  assert.equal(fakeStats(db,'all',NOW).calls,1);
  assert.equal(fakeStats(db,'all',NOW).pending,1);
  assert.equal(fakeStats(db,'all',NOW).done,0);
  assert.equal(fakeStats(db,'all',NOW).actualTwd,null);
  assert.equal(fakeStats(db,'all',NOW).estimatedTwd,null);
  assert.notEqual(spend.amountEstimatedTwd,fakeStats(db,'all',NOW).actualTwd);
  console.log('N1A_R2_BLOCKER: B07_HELD_IS_NOT_SETTLED_COST');
 }finally{db.close();}
});

test('N1A-R2-07 new AI hold while membership revoked/unknown must be blocked; D1 reservation is NOT approval to spend',()=>{
 const db=newFakeDatabase();try{
  account(db);
  const d1=reserve(db,'d1-allowed',1,1);
  assert.equal(d1.permitted,true);
  const p=proof();
  const revoked={...live(),memberActive:false};
  assert.equal(fakeShapeGate(p,revoked),'BLOCKED');
  const witnessMissing={...live(),anchorPresent:false};
  assert.equal(fakeShapeGate(p,witnessMissing),'BLOCKED');
  // Negative proof: D1 quota reservation has no B07 grant, no provider claim,
  // no current Starry-ID or witness; it cannot authorize AI spending.
  assert.equal(fakeBudgetTotals(db,'one-account').pendingWrite,1);
  assert.equal(fakeStats(db,'all',NOW).calls,0);
  console.log('N1A_R2_BLOCKER: SPEND_HOLD_REQUIRES_INDEPENDENT_B07_GRANT_AND_FRESH_PROOF');
 }finally{db.close();}
});

test('N1A-R2-08 two batches reuse same EXPIRED account quota snapshot: both fail closed, zero reservations',()=>{
 const db=newFakeDatabase();try{
  account(db,{now:NOW-300001,observedWrites:78000});
  const a=reserve(db,'expired-batch-a',2560,1280);
  const b=reserve(db,'expired-batch-b',2560,1280);
  assert.equal(a.permitted,false);assert.equal(b.permitted,false);
  assert.equal(a.state,'UNKNOWN_LOCKED');assert.equal(b.state,'UNKNOWN_LOCKED');
  assert.equal(fakeBudgetTotals(db,'one-account').pendingWrite,0);
  assert.equal((db.prepare('SELECT COUNT(*) n FROM fake_f22_reservations').get() as any).n,0);
 }finally{db.close();}
});

test('N1A-R2-09 two fresh batches competing on same 78000 snapshot: first reserves, second blocked at >=80%',()=>{
 const db=newFakeDatabase();try{
  account(db,{observedWrites:78000});
  const first=reserve(db,'fresh-a',2560,1280),second=reserve(db,'fresh-b',2560,1280);
  assert.equal(first.state,'SAFE_RESERVED');assert.equal(second.state,'WARNING_PAUSED');
  assert.equal(fakeBudgetTotals(db,'one-account').write,79280);
  assert.equal(fakeBudgetTotals(db,'one-account').pendingWrite,1280);
  markFakeUncertain(db,'one-account','fresh-a');
  assert.equal(reserve(db,'fresh-a',2560,1280).state,'RESERVED_UNCERTAIN');
  assert.equal(fakeBudgetTotals(db,'one-account').pendingWrite,1280);
 }finally{db.close();}
});

test('N1A-R2-10 sourceRevision string version can carry ETag, event numeric version cannot be substituted',()=>{
 const p=proof();
 assert.equal(fakeShapeGate({...p,sourceRevision:'18446744073709551615'},{
   ...live(),sourceRevision:'18446744073709551615'
 }),'FAKE_SHAPE_OK');
 assert.equal(fakeShapeGate({...p,securitySeq:'18446744073709551616'},live()),'BLOCKED');
 // Event revision is separate numeric monotonic field and bounded by JS safe ints.
 const s=source();s.register('member-1');const e:FakeEnvelope=makeEvent(s,'version-domain');
 assert.equal(Number.isSafeInteger(e.sourceRevision),true);
 assert.equal(typeof p.securitySeq,'string');
 assert.notEqual(e.sourceRevision,p.securitySeq);
});
