import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateS3aFakeEnvelope,N1A_S3A_PRODUCTION_GATE} from '../security-contract-v1/s3aEnvelope.ts';
import type {
 S3aEnvelope,S3aExpected,S3aFakeReaders,S3aCurrentResource,
 S3aCurrentMembership,S3aCurrentWitness,S3aIndependentCheckpoint
} from '../security-contract-v1/s3aEnvelope.ts';
import {buildN1aMockDashboard} from '../ops-s1/n1aS1Console.ts';
import {createS3aOfflineAdminHandler,evaluateS3aForMockConsole} from '../ops-s1/n1aS3aSharedConsole.ts';
import type {S3aFakeProofInput} from '../ops-s1/n1aS3aSharedConsole.ts';
import {SERVICES} from '../ops-s1/healthModel.ts';
import type {Observation} from '../ops-s1/healthModel.ts';
import type {SyntheticInput} from '../ops-s1/syntheticEvents.ts';

const NOW=1792500000000;
const AT=new Date(NOW-1000).toISOString();
const CURRENT:S3aCurrentResource={
 resourceId:'synthetic-track-one',sourceRevision:'etag-1',
 contentDigest:'a'.repeat(64),activeTranscriptVersion:'transcript-v1',
 permissionRevision:'2',correctionRevision:'3',
 entitled:true,revoked:false,deleted:false,revocationPending:false
};
const {entitled,revoked,deleted,revocationPending,...resourceProof}=CURRENT;
const PROOF:S3aEnvelope={
 schemaVersion:'N1A-S3A-FAKE-v1',issuer:'fake-starry-id-and-independent-witness',
 audience:'n1a-s3a-offline-only',appId:'echo',subjectId:'synthetic-member-one',
 requestId:'synthetic-req-one',nonce:'synthetic-nonce-one',
 action:'transcript.searchEvidence',sessionRevision:'4',membershipRevision:'5',
 securitySeq:'19',checkpointSeq:'19',restoreEpoch:'6',
 revocationWatermark:'3',deletionWatermark:'4',issuedAtMs:NOW-1000,expiresAtMs:NOW+4000,
 approvalGrantId:'',resources:[resourceProof],fakeAttestation:'fake-registry-ticket'
};
const EXPECTED:S3aExpected={appId:'echo',subjectId:PROOF.subjectId,requestId:PROOF.requestId,
 action:PROOF.action,resourceIds:[CURRENT.resourceId]};
const platform=()=>SERVICES.map(service=>({
 service,source:'fixture' as const,verified:true,access:'granted' as const,
 observedAt:AT,windowMinutes:15,requests:300,serverErrors:0
})) satisfies Observation[];
type Counter={attestation:number;membership:number;witness:number;checkpoint:number;resource:number};
function fake(faults?:{membershipUnavailable?:boolean;checkpointMissing?:boolean;
                         unentitled?:boolean;contentChanged?:boolean;failedReaders?:boolean}) {
 const count:Counter={attestation:0,membership:0,witness:0,checkpoint:0,resource:0};
 const member:S3aCurrentMembership={subjectId:PROOF.subjectId,active:true,
  appAllowed:true,centralSuperAdmin:false,sessionRevision:'4',membershipRevision:'5'};
 const witness:S3aCurrentWitness={sourceId:'fake-witness',securitySeq:'19',
  restoreEpoch:'6',revocationWatermark:'3',deletionWatermark:'4'};
 const checkpoint:S3aIndependentCheckpoint={sourceId:'fake-independent-checkpoint',
  headSeq:'19',checkpointSeq:'19',restoreEpoch:'6'};
 const readers:S3aFakeReaders={
  verifyFakeAttestation:async()=>{count.attestation++;return true;},
  readMembership:async()=>{count.membership++;return faults?.membershipUnavailable?null:member;},
  readWitness:async()=>{count.witness++;return witness;},
  readIndependentCheckpoint:async()=>{
   count.checkpoint++;return faults?.checkpointMissing?null:checkpoint;
  },
  readResource:async()=>{
   count.resource++;
   if(faults?.failedReaders)throw Error('SECRET-RESOURCE-PATH');
   return {...CURRENT,entitled:!faults?.unentitled,
    contentDigest:faults?.contentChanged?'b'.repeat(64):CURRENT.contentDigest};
  },
 };
 const proof:S3aFakeProofInput={envelope:PROOF,expected:EXPECTED,readers,phase:'SEND'};
 return {proof,count};
}
const incident=(origin:SyntheticInput['origin'],kind:SyntheticInput['kind']):SyntheticInput=>
 ({origin,kind,verified:true,observedAt:AT});
function allLocked(x:Awaited<ReturnType<typeof evaluateS3aForMockConsole>>){
 assert.equal(N1A_S3A_PRODUCTION_GATE,false);
 assert.equal(x.sharedVerifierInvoked,true);
 assert.equal(x.mode,'offline_mock_only');
 assert.equal(x.productionAuthorized,false);assert.equal(x.actionsAllowed,false);
 assert.equal(x.newAiSpendingAllowed,false);assert.equal(x.restoreAllowed,false);
 assert.equal(x.retriesAllowed,false);assert.equal(x.proof.productionAuthorized,false);
 assert.equal(x.proof.realAuthority,false);assert.equal(x.proof.locked,true);
}
test('AI6-S3A-01 ACTUALLY calls AI2 evaluator and S1 dashboard model in one process',async()=>{
 const f=fake();const decision=await evaluateS3aFakeEnvelope(
  f.proof.envelope,f.proof.expected,f.proof.readers,'SEND',NOW
 );
 assert.equal(decision.reason,'FAKE_EVIDENCE_CONSISTENT');
 assert.equal(decision.productionAuthorized,false);
 const own=buildN1aMockDashboard(platform(),[],NOW);
 assert.equal(own.cloud.overall,'normal');
 const x=await evaluateS3aForMockConsole(platform(),[],f.proof,NOW);
 assert.deepEqual(f.count,{attestation:2,membership:2,witness:2,checkpoint:2,resource:2});
 assert.equal(x.proof.state,'fake_consistent');
 assert.equal(x.domains.app_security.status,'unknown'); // never true green from fake proof
 assert.equal(x.domains.backup_restore.status,'unknown');
 assert.equal(x.cloud.overall,'normal');allLocked(x);
});
test('AI6-S3A-02 membership revoked/authority unavailable cannot inherit platform green',async()=>{
 const f=fake({membershipUnavailable:true});
 const x=await evaluateS3aForMockConsole(platform(),[],f.proof,NOW);
 assert.equal(x.proof.state,'fake_denied');
 assert.equal(x.proof.reasonCode,'STARRY_ID_MEMBER_UNAVAILABLE');
 assert.equal(x.domains.app_security.status,'unknown');
 assert.equal(x.cloud.overall,'normal');allLocked(x);
});
test('AI6-S3A-03 missing independent checkpoint: App/backup unknown; platform stays normal',async()=>{
 const f=fake({checkpointMissing:true});
 const x=await evaluateS3aForMockConsole(platform(),[],f.proof,NOW);
 assert.equal(x.proof.reasonCode,'WITNESS_UNKNOWN');
 assert.equal(x.domains.app_security.status,'unknown');
 assert.equal(x.domains.backup_restore.status,'unknown');
 assert.ok(x.cloud.services.every(s=>s.status==='normal'));allLocked(x);
});
test('AI6-S3A-04 track-specific entitlement false always denied, no transcript exposed',async()=>{
 const f=fake({unentitled:true});
 const x=await evaluateS3aForMockConsole(platform(),[],f.proof,NOW);
 assert.equal(x.proof.reasonCode,'RESOURCE_NOT_CURRENTLY_ENTITLED');
 assert.equal(x.domains.app_security.status,'unknown');
 assert.equal(JSON.stringify(x).includes(CURRENT.resourceId),false);allLocked(x);
});
test('AI6-S3A-05 changed SHA256 with unchanged ETag fails safely',async()=>{
 const f=fake({contentChanged:true});
 const x=await evaluateS3aForMockConsole(platform(),[],f.proof,NOW);
 assert.equal(x.proof.reasonCode,'RESOURCE_SOURCE_OR_PERMISSION_CHANGED');
 assert.equal(x.proof.state,'fake_denied');allLocked(x);
});
test('AI6-S3A-06 confirmed backup corruption red survives successful AI2 fake verifier',async()=>{
 const x=await evaluateS3aForMockConsole(platform(),[incident('ai7','backup_integrity_fault')],
   fake().proof,NOW);
 assert.equal(x.proof.state,'fake_consistent');
 assert.equal(x.domains.backup_restore.status,'fault');
 assert.equal(x.domains.backup_restore.conflict,true);
 assert.equal(x.cloud.services.find(s=>s.service==='r2')?.status,'normal');
 allLocked(x);
});
test('AI6-S3A-07 confirmed transcript failure red survives missing witness',async()=>{
 const x=await evaluateS3aForMockConsole(platform(),[incident('ai2','workflow_failed')],
   fake({checkpointMissing:true}).proof,NOW);
 assert.equal(x.domains.app_security.status,'fault');
 assert.equal(x.domains.app_security.conflict,true);
 assert.equal(x.cloud.services.find(s=>s.service==='workflows')?.status,'normal');
 allLocked(x);
});
test('AI6-S3A-08 AI fee hold unaffected by platform/backup/proof success',async()=>{
 const x=await evaluateS3aForMockConsole(platform(),[incident('ai3','b07_uncertain_hold')],
   fake().proof,NOW);
 assert.equal(x.domains.ai_billing.status,'warning');
 assert.equal(x.cloud.services.find(s=>s.service==='workers_ai')?.status,'normal');
 assert.equal(x.newAiSpendingAllowed,false);allLocked(x);
});
test('AI6-S3A-09 fake proof reader throws: unknown without disclosing exception',async()=>{
 const f=fake({failedReaders:true});
 const x=await evaluateS3aForMockConsole(platform(),[],f.proof,NOW);
 assert.equal(x.proof.reasonCode,'AUTHORITY_UNREACHABLE');
 assert.equal(x.domains.app_security.status,'unknown');
 assert.equal(JSON.stringify(x).includes('SECRET-RESOURCE-PATH'),false);
 allLocked(x);
});
test('AI6-S3A-10 invalid phase and request binding denied by shared verifier',async()=>{
 const f=fake();
 const invalid={...f.proof,phase:'before_commit' as const};
 const x=await evaluateS3aForMockConsole(platform(),[],invalid,NOW);
 assert.equal(x.proof.reasonCode,'ACTION_PHASE_MISMATCH');
 const bad={...f.proof,expected:{...f.proof.expected,requestId:'another-request'}};
 const y=await evaluateS3aForMockConsole(platform(),[],bad,NOW);
 assert.equal(y.proof.reasonCode,'ACTION_SCOPE_MISMATCH');
 allLocked(x);allLocked(y);
});
test('AI6-S3A-11 absent proof never green, no verifier data/no real authorization',async()=>{
 const x=await evaluateS3aForMockConsole(platform(),[],null,NOW);
 assert.equal(x.proof.state,'unknown');
 assert.equal(x.domains.app_security.status,'unknown');
 assert.equal(x.domains.backup_restore.status,'unknown');
 allLocked(x);
});
test('AI6-S3A-12 platform fault survives fake proof and App unrelated status',async()=>{
 const bad=platform().map(o=>o.service==='d1'?{...o,serverErrors:45}:o);
 const x=await evaluateS3aForMockConsole(bad,[],fake().proof,NOW);
 assert.equal(x.cloud.services.find(s=>s.service==='d1')?.status,'fault');
 assert.equal(x.anyConfirmedFault,true);allLocked(x);
});
test('AI6-S3A-13 extra secret and PII in input never reach REST-ready UI JSON',async()=>{
 const f=fake();
 const p={...f.proof,
  envelope:{...PROOF,subjectId:PROOF.subjectId,secretToken:'DO-NOT-RENDER-SECRET',
   email:'private@example.invalid',rawTranscript:'RAW_TRANSCRIPT_PRIVATE'} as S3aEnvelope};
 const x=await evaluateS3aForMockConsole(platform(),[],p,NOW);
 const raw=JSON.stringify(x);
 for(const s of ['DO-NOT-RENDER-SECRET','private@example.invalid','RAW_TRANSCRIPT_PRIVATE',
  PROOF.subjectId,PROOF.requestId,PROOF.nonce,CURRENT.resourceId])
  assert.equal(raw.includes(s),false,s);
 allLocked(x);
});
const req=(method='GET')=>new Request('https://fake.invalid/admin/ops/n1a-s3a-offline',{method});
const admin=()=>({subject:'fake-super-admin',centralSuperAdmin:true,
 starryIdCheckedInFixture:true,expiresAt:NOW+10000});
test('AI6-S3A-14 fake non-admin forbidden before proof, cloud, or incident reads',async()=>{
 let reads=0;
 const h=createS3aOfflineAdminHandler({
  now:()=>NOW,checkFakeAdmin:async()=>({...admin(),centralSuperAdmin:false}),
  readFakeCloud:async()=>{reads++;return platform();},
  readFakeIncidents:async()=>{reads++;return [];},
  readFakeProof:async()=>{reads++;return fake().proof;},
  mayRead:()=>true,
 });
 assert.equal((await h(req())).status,403);assert.equal(reads,0);
});
test('AI6-S3A-15 2000 fake members rejected, zero fake data-source reads',async()=>{
 let reads=0;
 const h=createS3aOfflineAdminHandler({
  now:()=>NOW,checkFakeAdmin:async()=>null,
  readFakeCloud:async()=>{reads++;return platform();},
  readFakeIncidents:async()=>{reads++;return [];},
  readFakeProof:async()=>{reads++;return fake().proof;},
  mayRead:()=>true,
 });
 const res=await Promise.all(Array.from({length:2000},()=>h(req())));
 assert.ok(res.every(x=>x.status===403));assert.equal(reads,0);
});
test('AI6-S3A-16 admin fake revocation invalidates next GET, no saved authorization',async()=>{
 let live=true,metrics=0,proofs=0;
 const h=createS3aOfflineAdminHandler({
  now:()=>NOW,checkFakeAdmin:async()=>live?admin():null,
  readFakeCloud:async()=>{metrics++;return platform();},
  readFakeIncidents:async()=>[],
  readFakeProof:async()=>{proofs++;return fake().proof;},
  mayRead:()=>true,
 });
 const first=await h(req());assert.equal(first.status,200);
 const data=await first.json();
 assert.equal(data.domains.app_security.status,'unknown');
 live=false;
 const second=await h(req());assert.equal(second.status,403);
 assert.deepEqual(await second.json(),{error:'access_denied'});
 assert.equal(metrics,1);assert.equal(proofs,1);
});
test('AI6-S3A-17 each authorized GET revalidates shared AI2 proof, only metrics snapshot cached',async()=>{
 let metrics=0,incidents=0,proofs=0,resource=0;
 const h=createS3aOfflineAdminHandler({
  now:()=>NOW,checkFakeAdmin:async()=>admin(),
  readFakeCloud:async()=>{metrics++;return platform();},
  readFakeIncidents:async()=>{incidents++;return [];},
  readFakeProof:async()=>{proofs++;const f=fake();return{...f.proof,
   readers:{...f.proof.readers,readResource:async(...args)=>{resource++;return f.proof.readers.readResource(...args)}}};},
  mayRead:()=>true,
 });
 assert.equal((await h(req())).status,200);
 assert.equal((await h(req())).status,200);
 assert.deepEqual([metrics,incidents,proofs,resource],[1,1,2,2]);
});
test('AI6-S3A-18 invalid method or endpoint: no fake source reads',async()=>{
 let reads=0;
 const h=createS3aOfflineAdminHandler({
  now:()=>NOW,checkFakeAdmin:async()=>admin(),
  readFakeCloud:async()=>{reads++;return platform();},
  readFakeIncidents:async()=>{reads++;return[];},
  readFakeProof:async()=>{reads++;return fake().proof;},
  mayRead:()=>true,
 });
 assert.equal((await h(req('POST'))).status,405);
 assert.equal((await h(new Request('https://fake.invalid/another'))).status,404);
 assert.equal(reads,0);
});
test('AI6-S3A-19 fake proof unavailable does not turn green or leak errors',async()=>{
 const h=createS3aOfflineAdminHandler({
  now:()=>NOW,checkFakeAdmin:async()=>admin(),
  readFakeCloud:async()=>platform(),readFakeIncidents:async()=>[],
  readFakeProof:async()=>{throw Error('PRIVATE_FAKE_PROOF_SECRET');},
  mayRead:()=>true,
 });
 const res=await h(req());assert.equal(res.status,200);
 assert.equal(res.headers.get('Cache-Control'),'no-store');
 const body=await res.text();
 assert.equal(body.includes('PRIVATE_FAKE_PROOF_SECRET'),false);
 assert.equal(JSON.parse(body).domains.app_security.status,'unknown');
});
test('AI6-S3A-20 check imported AI2 function and S1 model are called in actual adapter',()=>{
 const bridge=readFileSync(new URL('../ops-s1/n1aS3aSharedConsole.ts',import.meta.url),'utf8');
 assert.match(bridge,/import \{ evaluateS3aFakeEnvelope/);
 assert.match(bridge,/import \{ buildN1aMockDashboard/);
 assert.match(bridge,/await evaluateS3aFakeEnvelope\(/);
 assert.match(bridge,/buildN1aMockDashboard\(/);
 assert.doesNotMatch(bridge,/\bfetch\s*\(|\bsetInterval\s*\(|\bAI\.run\s*\(|\.retry\s*\(/);
});
