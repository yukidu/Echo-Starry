import test from 'node:test';
import assert from 'node:assert/strict';
import {
  N1A_BKP_INTEROP_RUNTIME_ENABLED,
  simulateAi7Ai2ProofInterop
} from '../n1a-bkp-s1/fakeSecurityProofInterop.ts';
import type {
  Ai2FakeProofWire, FakeInteropEvidence, FakeInteropRequest
} from '../n1a-bkp-s1/fakeSecurityProofInterop.ts';
import {
  fakeEventHash, sha256FakeText, simulateN1aBackupGate
} from '../n1a-bkp-s1/fakeRestoreGate.ts';
import type {
  MockWitness, MockIndependentHead, MockStarryId, MockBackup,
  MockEnvironment
} from '../n1a-bkp-s1/fakeRestoreGate.ts';

const NOW=1792500000000;
async function fixture():Promise<FakeInteropRequest>{
  const event0={seq:'1',kind:'epoch_reserve' as const,target:'fake-restore',prevHash:'GENESIS'};
  const hash=await fakeEventHash(event0);
  const witness:MockWitness={sourceId:'fake-worm',headSeq:'1',headHash:hash,
    restoreEpoch:'9',minStarryIdRevision:'10',observedAtMs:NOW-1000,
    events:[{...event0,hash}]};
  const head:MockIndependentHead={sourceId:'fake-checkpoint',headSeq:'1',
    headHash:hash,restoreEpoch:'9',observedAtMs:NOW-1000};
  const id:MockStarryId={revision:'12',observedAtMs:NOW-1000,
    members:[
      {id:'member-one',active:true,centralSuperAdmin:false},
      {id:'admin-one',active:true,centralSuperAdmin:true},
      {id:'admin-two',active:true,centralSuperAdmin:true}
    ]};
  const raw='假逐字稿 only for offline validation';
  const backup:MockBackup={id:'base-1',kind:'full',parentId:null,createdAtMs:NOW-3000,
    state:'verified-success',securitySeq:'1',files:[{
      key:'fake/track.txt',sha256:await sha256FakeText(raw),
      bytes:new TextEncoder().encode(raw).length,
      trackId:'track-1',memberIds:['member-one'],review:'published'
    }]};
  const manifestHash=await sha256FakeText(JSON.stringify([backup]));
  const fakeClaims=new Set<string>();
  const env:MockEnvironment={
    readWitness:async()=>witness,
    readIndependentHead:async()=>head,
    readTrustedFloor:async()=>({
      sourceId:'fake-offline-third-trust-floor',
      headSeq:witness.headSeq,headHash:witness.headHash,
      restoreEpoch:witness.restoreEpoch,observedAtMs:NOW-1000
    }),
    claimFakeReviewOnce:async requestId=>{
      if(fakeClaims.has(requestId))return false;
      fakeClaims.add(requestId);return true;
    },
    readStarryId:async()=>id,
    readFakeR2:async()=>raw
  };
  const bkpDecision=await simulateN1aBackupGate({
    nowMs:NOW,freshnessMs:5000,approvalAgeMs:5000,
    requestId:'review-1',selectedBackupId:'base-1',lastGoodId:'base-1',
    manifestHash,backups:[backup],lock:{
      searchLocked:true,publicReadsLocked:true,publicationsLocked:true,
      cleanupLocked:true,restoreEpoch:'9'
    },retentionDays:7,env,
    approvals:['admin-one','admin-two'].map(reviewerId=>({
      reviewerId,requestId:'review-1',backupId:'base-1',
      manifestHash,headHash:hash,restoreEpoch:'9',reviewerIdRevision:'12',
      decision:'approve' as const,approvedAtMs:NOW-100
    }))
  });
  assert.equal(bkpDecision.simulatedEligible,true,JSON.stringify(bkpDecision.reasons));
  const proof:Ai2FakeProofWire={
    schemaVersion:'N1A-S1-FAKE-v1',issuer:'fake-star-id-plus-witness',
    audience:'n1a-offline-only',subjectId:'admin-one',appId:'echo',
    action:'backup.preflight',resourceId:'base-1',requestId:'review-1',
    nonce:'fresh-checkpoint-1',membershipRevision:'5',
    permissionRevision:'8',correctionRevision:'3',sourceRevision:'etag.v2',
    securitySeq:'1',restoreEpoch:'9',
    revocationWatermark:'0',deletionWatermark:'0',
    issuedAtMs:NOW-2000,expiresAtMs:NOW+5000,
    approvalGrantId:'',fakeAttestation:'NOT-A-SIGNATURE'
  };
  const ledgerWatermarks={sourceId:'fake-worm-watermarks',headSeq:'1',headHash:hash,
    revocationWatermark:'0',deletionWatermark:'0'};
  const independentWatermarks={...ledgerWatermarks,sourceId:'fake-checkpoint-watermarks'};
  const evidence:FakeInteropEvidence={
    proof,witness,independentHead:head,starryId:id,
    subjectMembershipRevision:'5',subjectIsCurrentCentralAdmin:true,
    ledgerWatermarks,independentWatermarks
  };
  return {requestId:'review-1',backupId:'base-1',appId:'echo',nowMs:NOW,
    reviewerSubjectId:'admin-one',precheck:evidence,beforeCommit:evidence,
    bkpDecision};
}
async function expectBlocked(code:string,edit:(x:FakeInteropRequest)=>FakeInteropRequest){
  const input=edit(await fixture()),r=simulateAi7Ai2ProofInterop(input);
  assert.equal(r.simulatedConsistent,false,JSON.stringify(r));
  assert.ok(r.reasons.includes(code),JSON.stringify(r.reasons));
  assert.equal(r.productionAuthorized,false);
  assert.equal(r.executableRestore,false);
  assert.equal(r.executableDelete,false);
  assert.deepEqual(r.executableCleanupCandidates,[]);
  assert.deepEqual(r.cleanupReviewOnly,[]);
  assert.equal(r.sideEffects,0);
}
test('AI2 #469 compatible FAKE wire does not authorize real RESTORE or DELETE',async()=>{
  assert.equal(N1A_BKP_INTEROP_RUNTIME_ENABLED,false);
  const r=simulateAi7Ai2ProofInterop(await fixture());
  assert.equal(r.simulatedConsistent,true,JSON.stringify(r.reasons));
  assert.equal(r.productionAuthorized,false);
  assert.equal(r.executableRestore,false);
  assert.equal(r.executableDelete,false);
  assert.deepEqual(r.executableCleanupCandidates,[]);
});
test('AI2 securitySeq is EVENT HEAD, independent of member and ID revisions',async()=>{
  const x=await fixture();
  assert.equal(x.precheck.proof.securitySeq,'1');
  assert.equal(x.precheck.witness?.headSeq,'1');
  assert.equal(x.precheck.proof.membershipRevision,'5');
  assert.equal(x.precheck.starryId?.revision,'12');
  assert.equal(simulateAi7Ai2ProofInterop(x).simulatedConsistent,true);
});
test('incorrectly casting global Starry ID revision as per-member version must fail',async()=>
  expectBlocked('MEMBER_SPECIFIC_REVISION_CONFLICT',x=>({
    ...x,precheck:{...x.precheck,proof:{...x.precheck.proof,membershipRevision:'12'}}
  })));
test('incorrectly casting Starry ID revision as ledger securitySeq must fail',async()=>
  expectBlocked('SECURITY_SEQ_OR_EPOCH_MISMATCH',x=>({
    ...x,precheck:{...x.precheck,proof:{...x.precheck.proof,securitySeq:'12'}}
  })));
test('noncanonical security sequence 01 must fail, never silently number-coerce',async()=>
  expectBlocked('PROOF_VERSION_INVALID',x=>({
    ...x,precheck:{...x.precheck,proof:{...x.precheck.proof,securitySeq:'01'}}
  })));
test('a JS numeric securitySeq rather than uint64 decimal string must fail',async()=>
  expectBlocked('PROOF_VERSION_INVALID',x=>({
    ...x,precheck:{...x.precheck,proof:{...x.precheck.proof,securitySeq:1 as unknown as string}}
  })));
test('overflow securitySeq beyond unsigned 64 must fail',async()=>
  expectBlocked('PROOF_VERSION_INVALID',x=>({
    ...x,precheck:{...x.precheck,proof:{...x.precheck.proof,securitySeq:'18446744073709551616'}}
  })));
test('current revocation watermark higher than AI2 proof must fail',async()=>
  expectBlocked('REVOCATION_OR_DELETION_WATERMARK_MISMATCH',x=>({
    ...x,precheck:{...x.precheck,ledgerWatermarks:{
      ...x.precheck.ledgerWatermarks!,revocationWatermark:'3'
    },independentWatermarks:{
      ...x.precheck.independentWatermarks!,revocationWatermark:'3'
    }}
  })));
test('current deletion watermark lower than AI2 proof must fail',async()=>
  expectBlocked('REVOCATION_OR_DELETION_WATERMARK_MISMATCH',x=>({
    ...x,precheck:{...x.precheck,proof:{...x.precheck.proof,deletionWatermark:'8'}}
  })));
test('independent watermarks do not agree with ledger despite matching head => block',async()=>
  expectBlocked('REVOCATION_OR_DELETION_WATERMARK_MISMATCH',x=>({
    ...x,precheck:{...x.precheck,independentWatermarks:{
      ...x.precheck.independentWatermarks!,deletionWatermark:'1'
    }}
  })));
test('deleted/revoked events unverified because watermark source missing => block',async()=>
  expectBlocked('WATERMARK_EVIDENCE_MISSING',x=>({
    ...x,precheck:{...x.precheck,ledgerWatermarks:null}
  })));
test('external witness absent at final commit => block every cleanup candidate',async()=>
  expectBlocked('AUTHORITY_UNAVAILABLE',x=>({
    ...x,beforeCommit:{...x.beforeCommit,witness:null},
    bkpDecision:{...x.bkpDecision,retentionCandidates:['old-expired-backup']}
  })));
test('independent head absent before approval => block',async()=>
  expectBlocked('AUTHORITY_UNAVAILABLE',x=>({
    ...x,precheck:{...x.precheck,independentHead:null}
  })));
test('Starry ID evidence absent at final commit => block',async()=>
  expectBlocked('AUTHORITY_UNAVAILABLE',x=>({
    ...x,beforeCommit:{...x.beforeCommit,starryId:null}
  })));
test('Starry ID global revision rolls behind independent minimum',async()=>
  expectBlocked('GLOBAL_STARRY_ID_ROLLBACK',x=>({
    ...x,precheck:{...x.precheck,starryId:{...x.precheck.starryId!,revision:'9'}}
  })));
test('dual review sees watermark movement and same request => force fresh approvals',async()=>
  expectBlocked('AUTHORITY_OR_PROOF_CHANGED_DURING_REVIEW',x=>{
    const beforeCommit={...x.beforeCommit,
      proof:{...x.beforeCommit.proof,revocationWatermark:'1'},
      ledgerWatermarks:{...x.beforeCommit.ledgerWatermarks!,revocationWatermark:'1'},
      independentWatermarks:{...x.beforeCommit.independentWatermarks!,revocationWatermark:'1'}
    };
    return {...x,beforeCommit};
  }));
test('dual review sees restoreEpoch movement even if fake proof updated => block',async()=>
  expectBlocked('AUTHORITY_OR_PROOF_CHANGED_DURING_REVIEW',x=>{
    const beforeCommit={...x.beforeCommit,
      proof:{...x.beforeCommit.proof,restoreEpoch:'10'},
      witness:{...x.beforeCommit.witness!,restoreEpoch:'10'},
      independentHead:{...x.beforeCommit.independentHead!,restoreEpoch:'10'}
    };
    return {...x,beforeCommit};
  }));
test('same request retargeted to another backup => block',async()=>
  expectBlocked('PROOF_SCOPE_OR_SCHEMA_INVALID',x=>({
    ...x,precheck:{...x.precheck,proof:{...x.precheck.proof,resourceId:'unapproved-backup'}}
  })));
test('stale or future proof timestamp fails both stages',async()=>
  expectBlocked('PROOF_STALE_OR_FUTURE',x=>({
    ...x,precheck:{...x.precheck,proof:{...x.precheck.proof,expiresAtMs:NOW-1}}
  })));
test('sourceRevision is opaque content revision and not an AI5 numeric event counter',async()=>
  expectBlocked('SOURCE_REVISION_OPAQUE_INVALID',x=>({
    ...x,precheck:{...x.precheck,proof:{...x.precheck.proof,sourceRevision:4 as unknown as string}}
  })));
test('AI2 fake attestation is missing and never substitutes a live signer',async()=>
  expectBlocked('PROOF_SCOPE_OR_SCHEMA_INVALID',x=>({
    ...x,precheck:{...x.precheck,proof:{...x.precheck.proof,fakeAttestation:''}}
  })));
test('one current reviewer role removed cannot pass precheck',async()=>
  expectBlocked('CURRENT_ADMIN_UNVERIFIED',x=>({
    ...x,precheck:{...x.precheck,subjectIsCurrentCentralAdmin:false}
  })));
test('backup itself was blocked => no interop bypass or cleanup proposal',async()=>
  expectBlocked('BACKUP_RESTORE_GATE_BLOCKED',x=>({
    ...x,bkpDecision:{...x.bkpDecision,simulatedEligible:false,
      reasons:['HISTORIC_MEMBER_TOMBSTONE'],retentionCandidates:['old-expired-backup']}
  })));
test('even a fabricated decision claiming real authorization is rejected',async()=>
  expectBlocked('NON_FAKE_RESTORE_RESULT_REJECTED',x=>({
    ...x,bkpDecision:{...x.bkpDecision,productionAuthorized:true as false}
  })));
test('successful consistency can show review-only expired candidate, never executable DELETE',async()=>{
  const x=await fixture();
  const r=simulateAi7Ai2ProofInterop({
    ...x,bkpDecision:{...x.bkpDecision,retentionCandidates:['simulated-older-full']}
  });
  assert.equal(r.simulatedConsistent,true);
  assert.deepEqual(r.cleanupReviewOnly,['simulated-older-full']);
  assert.deepEqual(r.executableCleanupCandidates,[]);
  assert.equal(r.executableRestore,false);
  assert.equal(r.executableDelete,false);
});
