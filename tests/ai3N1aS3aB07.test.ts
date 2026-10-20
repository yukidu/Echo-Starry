import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {
  evaluateS3aFakeEnvelope, N1A_S3A_PRODUCTION_GATE,
  type S3aEnvelope, type S3aExpected, type S3aFakeReaders,
} from '../security-contract-v1/s3aEnvelope.ts';

// Test-only IPC. No shell, credentials, URL, user-selected program, or DB path.
class OfflineLedger {
  private child=spawn('python3',['-I',fileURLToPath(new URL('./ai3_s3a_fake_driver.py',import.meta.url))],
    {env:{PATH:process.env.PATH??'/usr/bin:/bin'},stdio:['pipe','pipe','pipe']});
  private pending:{resolve:(v:any)=>void;reject:(e:Error)=>void}[]=[];
  private closed=false;
  constructor(){
    createInterface({input:this.child.stdout}).on('line',line=>{
      const next=this.pending.shift();
      if(!next)return;
      try{const value=JSON.parse(line);if(value.error)next.reject(Error(value.error));else next.resolve(value.result)}
      catch{next.reject(Error('invalid offline fixture reply'))}
    });
    this.child.stderr.resume();
    const fail=()=>{this.closed=true;for(const p of this.pending.splice(0))p.reject(Error('offline child unavailable'))};
    this.child.on('error',fail);this.child.on('exit',fail);
  }
  async call(op:string,fields:Record<string,unknown>={}):Promise<any>{
    if(this.closed)throw Error('offline child closed');
    return new Promise((resolve,reject)=>{
      this.pending.push({resolve,reject});
      this.child.stdin.write(JSON.stringify({...fields,op})+'\n');
    });
  }
  close(){this.child.stdin.end()}
}
const now=1_792_500_000_000;
function fixture(){
  let active=true, available=true, entitled=true, revision='5', source='etag-one';
  const reads={membership:0,witness:0,checkpoint:0,resource:0};
  const resource={resourceId:'track-one',sourceRevision:'etag-one',contentDigest:'a'.repeat(64),
    activeTranscriptVersion:'v1',permissionRevision:'2',correctionRevision:'7'};
  const proof=(grant:string,request='req-one'):S3aEnvelope=>({
    schemaVersion:'N1A-S3A-FAKE-v1',issuer:'fake-starry-id-and-independent-witness',
    audience:'n1a-s3a-offline-only',appId:'echo',subjectId:'member-one',requestId:request,
    nonce:'nonce-one',action:'ai.attempt',sessionRevision:'4',membershipRevision:'5',
    securitySeq:'19',checkpointSeq:'19',restoreEpoch:'6',revocationWatermark:'3',
    deletionWatermark:'4',issuedAtMs:now-1000,expiresAtMs:now+4000,
    approvalGrantId:grant,fakeAttestation:'fake-known-registry-ticket',resources:[resource],
  });
  // Registry checks bind the FULL synthetic envelope, not just its fake ticket string.
  const registry=new Set<string>();
  const readers:S3aFakeReaders={
    verifyFakeAttestation:async p=>registry.has(JSON.stringify(p)),
    readMembership:async()=>{reads.membership++;return {subjectId:'member-one',active,appAllowed:true,
      centralSuperAdmin:false,sessionRevision:'4',membershipRevision:revision}},
    readWitness:async()=>{reads.witness++;return available?{sourceId:'fake-witness',securitySeq:'19',
      restoreEpoch:'6',revocationWatermark:'3',deletionWatermark:'4'}:null},
    readIndependentCheckpoint:async()=>{reads.checkpoint++;return {sourceId:'fake-independent-checkpoint',
      checkpointSeq:'19',headSeq:'19',restoreEpoch:'6'}},
    readResource:async()=>{reads.resource++;return {...resource,sourceRevision:source,
      entitled,revoked:false,deleted:false,revocationPending:false}},
  };
  const expected=(request:string):S3aExpected=>({appId:'echo',subjectId:'member-one',
    requestId:request,action:'ai.attempt',resourceIds:['track-one']});
  return {proof,readers,reads,expected,register:(p:S3aEnvelope)=>registry.add(JSON.stringify(p)),
    revoke:()=>{active=false},changeRevision:()=>{revision='6'},unavailable:()=>{available=false},
    denyResource:()=>{entitled=false},changeSource:()=>{source='etag-two'}};
}
type Fixture=ReturnType<typeof fixture>;
// The only integrated reserve/claim path calls the ORIGINAL shared TS function.
async function gated(f:Fixture,db:OfflineLedger,p:S3aEnvelope,op:'reserve'|'claim',run='run-one'){
  const d=await evaluateS3aFakeEnvelope(p,f.expected(p.requestId),f.readers,'before_commit',now);
  assert.equal(d.productionAuthorized,false);assert.equal(d.irreversibleActionsAllowed,false);
  assert.equal(d.providerCalls,0);assert.equal(d.restoreWrites,0);
  if(!d.simulatedAllowed)return {decision:d,result:'shared_gate_denied'};
  // This fixture only models a single resource and fixed synthetic source/model.
  if(p.resources.length!==1||p.resources[0].resourceId!=='track-one'||
      p.resources[0].sourceRevision!=='etag-one'||p.resources[0].contentDigest!=='a'.repeat(64))
    return {decision:d,result:'adapter_scope_denied'};
  return {decision:d,result:await db.call(op,{grant:p.approvalGrantId,request:p.requestId,run})};
}
async function setup(t:any){
  const db=new OfflineLedger();t.after(()=>db.close());
  const f=fixture(),g=await db.call('issue'),p=f.proof(g.id);f.register(p);
  return {db,f,g,p};
}
test('AI3-S3A-01 exact TS verifier → original Python reserve/claim → fake send/settle',async t=>{
  const {db,f,p}=await setup(t);
  assert.equal(N1A_S3A_PRODUCTION_GATE,false);
  assert.equal((await gated(f,db,p,'reserve')).result,'reserved');
  assert.equal(await db.call('enqueue',{grant:p.approvalGrantId,run:'run-one'}),'success');
  assert.equal((await gated(f,db,p,'claim')).result,'one_ticket');
  assert.equal(await db.call('send',{grant:p.approvalGrantId}),'confirmed');
  assert.equal(await db.call('settle',{grant:p.approvalGrantId}),'settled');
  const s=await db.call('snapshot');assert.equal(s.fakeSends,1);assert.equal(s.realProviderCalls,0);
  assert.deepEqual(f.reads,{membership:2,witness:2,checkpoint:2,resource:2});
});
test('AI3-S3A-02 changed requestKey/runId cannot reserve or claim twice',async t=>{
  const {db,f,p}=await setup(t);
  await gated(f,db,p,'reserve');await db.call('enqueue',{grant:p.approvalGrantId,run:'run-one'});
  assert.equal((await gated(f,db,p,'claim')).result,'one_ticket');
  const replay=f.proof(p.approvalGrantId,'req-two');f.register(replay);
  assert.equal((await gated(f,db,replay,'reserve','run-two')).result,'denied_duplicate');
  await db.call('enqueue',{grant:p.approvalGrantId,run:'run-two'});
  assert.equal((await gated(f,db,replay,'claim','run-two')).result,'denied_used');
  assert.equal((await db.call('snapshot')).tickets,1);
});
test('AI3-S3A-03 a new valid grant cannot bypass the unresolved source hold',async t=>{
  const {db,f,p}=await setup(t);await gated(f,db,p,'reserve');
  const newer=await db.call('issue'),p2=f.proof(newer.id,'req-two');f.register(p2);
  const v=await gated(f,db,p2,'reserve','run-two');
  assert.equal(v.decision.simulatedAllowed,true);assert.equal(v.result,'denied_prior_unresolved');
  assert.equal((await gated(f,db,p2,'claim','run-two')).result,'denied_queue');
  assert.equal((await db.call('snapshot')).runs,1);
});
for(const mutation of ['revoke','changeRevision','unavailable','denyResource','changeSource'] as const){
  test('AI3-S3A-04 send preflight rereads after reserve: '+mutation,async t=>{
    const {db,f,p,g}=await setup(t);await gated(f,db,p,'reserve');
    await db.call('enqueue',{grant:g.id,run:'run-one'});f[mutation]();
    assert.equal((await gated(f,db,p,'claim')).result,'shared_gate_denied');
    const s=await db.call('snapshot');assert.equal(s.tickets,0);assert.equal(s.fakeSends,0);
    assert.equal(s.totals[1],g.held);assert.equal(f.reads.membership,2);
  });
}
test('AI3-S3A-05 timeout retains hold, denies replay and another grant, never sends twice',async t=>{
  const {db,f,p,g}=await setup(t);await gated(f,db,p,'reserve');
  await db.call('enqueue',{grant:g.id,run:'run-one'});await gated(f,db,p,'claim');
  assert.equal(await db.call('send',{grant:g.id,outcome:'timeout'}),'unknown');
  const replay=f.proof(g.id,'req-again');f.register(replay);
  assert.equal((await gated(f,db,replay,'reserve')).result,'denied_duplicate');
  assert.equal((await gated(f,db,replay,'claim')).result,'denied_hold');
  assert.equal(await db.call('send',{grant:g.id}),'denied_repeat_send');
  const g2=await db.call('issue'),p2=f.proof(g2.id);f.register(p2);
  assert.equal((await gated(f,db,p2,'reserve')).result,'denied_prior_unresolved');
  const s=await db.call('snapshot');assert.equal(s.totals[1],g.held);assert.equal(s.fakeSends,1);
});
test('AI3-S3A-06 invoice line can reconcile only once across two unknown jobs',async t=>{
  const {db,f,p,g}=await setup(t),invoice='f'.repeat(64);
  async function unknown(proof:S3aEnvelope,run:string){
    assert.equal((await gated(f,db,proof,'reserve',run)).result,'reserved');
    await db.call('enqueue',{grant:proof.approvalGrantId,run});
    assert.equal((await gated(f,db,proof,'claim',run)).result,'one_ticket');
    assert.equal(await db.call('send',{grant:proof.approvalGrantId,outcome:'timeout'}),'unknown');
  }
  await unknown(p,'run-one');
  assert.equal(await db.call('attest',{grant:g.id,invoice}),true);
  assert.equal(await db.call('reconcile',{grant:g.id,invoice}),'reconciled');
  // Reconciliation makes the earlier unknown accounted; a genuinely new grant is valid.
  const g2=await db.call('issue'),p2=f.proof(g2.id,'req-two');f.register(p2);
  await unknown(p2,'run-two');
  assert.equal(await db.call('reconcile',{grant:g2.id,invoice}),'denied_invoice_reused');
  assert.equal(await db.call('reconcile',{grant:g2.id,invoice:'c'.repeat(64)}),'denied_invoice_unverified');
  const s=await db.call('snapshot');assert.equal(s.reconciliations,1);assert.equal(s.totals[1],g2.held);
});
test('AI3-S3A-07 tampered grant is rejected by real imported TS fake registry check',async t=>{
  const {db,f,p}=await setup(t);
  const r=await gated(f,db,{...p,approvalGrantId:'forged-grant'},'reserve');
  assert.equal(r.decision.reason,'FAKE_ATTESTATION_NOT_IN_REGISTRY');
  assert.equal((await db.call('snapshot')).runs,0);
});
