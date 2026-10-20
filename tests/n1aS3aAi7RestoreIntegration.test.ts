import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateS3aFakeEnvelope, N1A_S3A_PRODUCTION_GATE,
  type S3aEnvelope, type S3aCurrentResource,
  type S3aCurrentMembership, type S3aCurrentWitness,
  type S3aIndependentCheckpoint, type S3aFakeReaders
} from '../security-contract-v1/s3aEnvelope.ts';
import {
  fakeEventHash,sha256FakeText,N1A_BKP_RUNTIME_ENABLED,
  type SimulatedRestoreInput,type MockEnvironment,type MockWitness,
  type MockIndependentHead,type MockTrustedFloor,type MockStarryId,
  type MockBackup,type MockEvent
} from '../n1a-bkp-s1/fakeRestoreGate.ts';
import {
  AI7_S3A_RESTORE_RUNTIME_ENABLED,ai7S3aFakeApprovalNonce,
  simulateAi7S3aSharedRestore,type Ai7S3aInput
} from '../n1a-bkp-s3a/sharedRestoreIntegration.ts';

const NOW=1_792_500_000_000, DAY=86_400_000;
type Fixture= {
  input:Ai7S3aInput;
  w:MockWitness|null;h:MockIndependentHead|null;floor:MockTrustedFloor|null;
  id:MockStarryId|null;sw:S3aCurrentWitness|null;sc:S3aIndependentCheckpoint|null;
  files:Map<string,string>;members:Map<string,S3aCurrentMembership>;
  resources:Map<string,S3aCurrentResource>;claims:Set<string>;
  sharedReads:{attest:number;membership:number;witness:number;checkpoint:number;resource:number};
  s1Reads:{witness:number;floor:number;id:number};
  attested:boolean;
};

async function fixture():Promise<Fixture>{
  const first={seq:'1',kind:'epoch_reserve' as const,target:'fake-backup',prevHash:'GENESIS'};
  const hash=await fakeEventHash(first);
  const w:MockWitness={
    sourceId:'fake-worm-source',headSeq:'1',headHash:hash,restoreEpoch:'6',
    minStarryIdRevision:'8',observedAtMs:NOW-2000,events:[{...first,hash}]
  };
  const h:MockIndependentHead={
    sourceId:'fake-checkpoint-source',headSeq:'1',headHash:hash,
    restoreEpoch:'6',observedAtMs:NOW-2000
  };
  const floor:MockTrustedFloor={
    sourceId:'fake-third-floor',headSeq:'1',headHash:hash,
    restoreEpoch:'6',observedAtMs:NOW-2000
  };
  const id:MockStarryId={
    revision:'9',observedAtMs:NOW-2000,members:[
      {id:'member-legacy',active:true,centralSuperAdmin:false},
      {id:'admin-one',active:true,centralSuperAdmin:true},
      {id:'admin-two',active:true,centralSuperAdmin:true}
    ]
  };
  const rawOld='假歷史核准稿｜不是真實會員音檔';
  const rawNew='假現行公開稿｜不是真實會員音檔';
  const files=new Map([['fake/r2/old.txt',rawOld],['fake/r2/new.txt',rawNew]]);
  const oldHash=await sha256FakeText(rawOld),newHash=await sha256FakeText(rawNew);
  const backups:MockBackup[]=[
    {id:'full',kind:'full',parentId:null,
      createdAtMs:NOW-80*DAY,securitySeq:'1',state:'verified-success',
      files:[{key:'fake/r2/old.txt',trackId:'old-track',sha256:oldHash,
        bytes:new TextEncoder().encode(rawOld).length,
        memberIds:['member-legacy'],review:'approved-history'}]},
    {id:'delta',kind:'delta',parentId:'full',
      createdAtMs:NOW-2*DAY,securitySeq:'1',state:'verified-success',
      files:[{key:'fake/r2/new.txt',trackId:'current-track',sha256:newHash,
        bytes:new TextEncoder().encode(rawNew).length,
        memberIds:['member-legacy'],review:'published'}]}
  ];
  const manifestHash=await sha256FakeText(JSON.stringify(backups));
  const approvals=['admin-one','admin-two'].map(reviewerId=>({
    reviewerId,requestId:'req-recover-1',backupId:'delta',manifestHash,
    headHash:hash,restoreEpoch:'6',reviewerIdRevision:'9',
    decision:'approve' as const,approvedAtMs:NOW-1000
  }));
  const members=new Map<string,S3aCurrentMembership>(['admin-one','admin-two'].map(subjectId=>
    [subjectId,{subjectId,active:true,appAllowed:true,centralSuperAdmin:true,
      sessionRevision:'4',membershipRevision:'5'}] as const));
  const resources=new Map<string,S3aCurrentResource>([
    ['old-track',{resourceId:'old-track',sourceRevision:'etag-old',
      contentDigest:oldHash,activeTranscriptVersion:'v1',permissionRevision:'2',
      correctionRevision:'1',entitled:true,revoked:false,deleted:false,revocationPending:false}],
    ['current-track',{resourceId:'current-track',sourceRevision:'etag-current',
      contentDigest:newHash,activeTranscriptVersion:'v2',permissionRevision:'2',
      correctionRevision:'1',entitled:true,revoked:false,deleted:false,revocationPending:false}]
  ]);
  const proofs=await Promise.all(approvals.map(async approval=>{
    const nonce=await ai7S3aFakeApprovalNonce('req-recover-1','delta',
      manifestHash,approval.reviewerId,hash,'6');
    const {entitled:_a,revoked:_b,deleted:_c,revocationPending:_d,...old}=resources.get('old-track')!;
    const {entitled:_e,revoked:_f,deleted:_g,revocationPending:_h,...curr}=resources.get('current-track')!;
    const proof:S3aEnvelope={
      schemaVersion:'N1A-S3A-FAKE-v1',
      issuer:'fake-starry-id-and-independent-witness',
      audience:'n1a-s3a-offline-only',
      appId:'echo',subjectId:approval.reviewerId,
      requestId:'req-recover-1',action:'backup.commit',
      nonce,sessionRevision:'4',membershipRevision:'5',
      securitySeq:'1',checkpointSeq:'1',restoreEpoch:'6',
      revocationWatermark:'0',deletionWatermark:'0',
      issuedAtMs:NOW-1000,expiresAtMs:NOW+3000,
      approvalGrantId:'',fakeAttestation:'SIMULATED-TEST-ATTESTATION',
      resources:[old,curr]
    };
    return proof;
  }));
  const f:Fixture={
    input:undefined as unknown as Ai7S3aInput,
    w,h,floor,id,files,members,resources,claims:new Set(),
    sw:{sourceId:'fake-witness',securitySeq:'1',restoreEpoch:'6',
      revocationWatermark:'0',deletionWatermark:'0'},
    sc:{sourceId:'fake-independent-checkpoint',checkpointSeq:'1',
      headSeq:'1',restoreEpoch:'6'},
    sharedReads:{attest:0,membership:0,witness:0,checkpoint:0,resource:0},
    s1Reads:{witness:0,floor:0,id:0},attested:true
  };
  const env:MockEnvironment={
    readWitness:async()=>{f.s1Reads.witness++;return f.w;},
    readIndependentHead:async()=>f.h,
    readTrustedFloor:async()=>{f.s1Reads.floor++;return f.floor;},
    readStarryId:async()=>{f.s1Reads.id++;return f.id;},
    readFakeR2:async key=>f.files.get(key)??null,
    claimFakeReviewOnce:async key=>{
      if(f.claims.has(key))return false;
      f.claims.add(key);return true;
    }
  };
  const shared:S3aFakeReaders={
    verifyFakeAttestation:async()=>{f.sharedReads.attest++;return f.attested;},
    readMembership:async subjectId=>{f.sharedReads.membership++;return f.members.get(subjectId)??null;},
    readWitness:async()=>{f.sharedReads.witness++;return f.sw;},
    readIndependentCheckpoint:async()=>{f.sharedReads.checkpoint++;return f.sc;},
    readResource:async(_app,id)=>{f.sharedReads.resource++;return f.resources.get(id)??null;}
  };
  const restore:SimulatedRestoreInput={
    nowMs:NOW,freshnessMs:5000,approvalAgeMs:5000,
    requestId:'req-recover-1',selectedBackupId:'delta',lastGoodId:'delta',
    manifestHash,backups,approvals,lock:{
      searchLocked:true,publicReadsLocked:true,publicationsLocked:true,
      cleanupLocked:true,restoreEpoch:'6'
    },retentionDays:7,env
  };
  f.input={restore,appId:'echo',envelopes:proofs,readers:shared};
  return f;
}
async function blocked(code:string,change:(f:Fixture)=>void|Promise<void>){
  const f=await fixture();
  await change(f);
  const r=await simulateAi7S3aSharedRestore(f.input);
  assert.equal(r.simulatedEligible,false,JSON.stringify(r.reasons));
  assert.ok(r.reasons.includes(code),JSON.stringify(r.reasons));
  assert.equal(r.productionAuthorized,false);
  assert.equal(r.executableRestore,false);
  assert.equal(r.executableDelete,false);
  assert.equal(r.sideEffects,0);
  assert.deepEqual(r.cleanupReviewOnly,[]);
  assert.deepEqual(r.executableCleanupCandidates,[]);
}
async function addTombstone(f:Fixture,kind:MockEvent['kind'],target:string){
  const prev=f.w!;
  const ev={seq:'2',kind,target,prevHash:prev.headHash};
  const hash=await fakeEventHash(ev);
  f.w={...prev,headSeq:'2',headHash:hash,events:[...prev.events,{...ev,hash}]};
  f.h={...f.h!,headSeq:'2',headHash:hash};
  f.floor={...f.floor!,headSeq:'2',headHash:hash};
  f.sw={...f.sw!,securitySeq:'2'};
  f.sc={...f.sc!,headSeq:'2',checkpointSeq:'2'};
  const approvals=f.input.restore.approvals.map(a=>({...a,headHash:hash}));
  f.input={...f.input,
    restore:{...f.input.restore,approvals},
    envelopes:await Promise.all(f.input.envelopes.map(async(e,i)=>({
      ...e,securitySeq:'2',checkpointSeq:'2',
      nonce:await ai7S3aFakeApprovalNonce(
        f.input.restore.requestId,f.input.restore.selectedBackupId,
        f.input.restore.manifestHash,approvals[i].reviewerId,hash,'6')
    })))
  };
}

test('S3A-7-01 imports and actually runs BOTH original functions in one Node process',async()=>{
  assert.equal(N1A_S3A_PRODUCTION_GATE,false);
  assert.equal(N1A_BKP_RUNTIME_ENABLED,false);
  assert.equal(AI7_S3A_RESTORE_RUNTIME_ENABLED,false);
  const f=await fixture();
  const d=await simulateAi7S3aSharedRestore(f.input);
  assert.equal(d.simulatedEligible,true,JSON.stringify(d.reasons));
  assert.equal(d.sharedChecks.length,4,'two superadmins × two live verifier passes');
  assert.ok(d.sharedChecks.every(x=>x.result.simulatedAllowed));
  assert.equal(f.sharedReads.membership,4);
  assert.equal(f.sharedReads.witness,4);
  assert.equal(f.sharedReads.checkpoint,4);
  assert.equal(f.sharedReads.resource,8,'two historical resources × two reviewers × two stages');
  assert.equal(d.backupDecision?.verifiedFileCount,2,'historical ancestor + current leaf');
  assert.equal(f.s1Reads.witness,3,'one pre-bind plus two S1 stage reads');
  assert.equal(f.claims.size,1);
  assert.equal(d.executableRestore,false);assert.equal(d.executableDelete,false);
  assert.equal(d.productionAuthorized,false);assert.equal(d.sideEffects,0);
});
test('S3A-7-02 membership revision ≠ global ID revision ≠ securitySeq',async()=>{
  const f=await fixture();assert.equal(f.input.envelopes[0].membershipRevision,'5');
  assert.equal(f.id?.revision,'9');assert.equal(f.w?.headSeq,'1');
  const d=await simulateAi7S3aSharedRestore(f.input);
  assert.equal(d.simulatedEligible,true);
});
test('S3A-7-03 revoked reviewer is blocked even though backup ID snapshot says active',async()=>{
  await blocked('REVIEWER_REVOKED_AT_WITNESS',f=>addTombstone(f,'member_revoke_pending','admin-one'));
});
test('S3A-7-04 historic member tombstone in full parent cannot revive',async()=>{
  await blocked('HISTORIC_MEMBER_TOMBSTONE',f=>addTombstone(f,'member_deleted','member-legacy'));
});
test('S3A-7-05 parent-only historic track revoked, leaf still valid',async()=>{
  await blocked('HISTORIC_TRACK_TOMBSTONE',f=>addTombstone(f,'track_revoke_pending','old-track'));
});
test('S3A-7-06 same request, two matching approvals are single use',async()=>{
  const f=await fixture();
  const d1=await simulateAi7S3aSharedRestore(f.input);
  assert.equal(d1.simulatedEligible,true,JSON.stringify(d1.reasons));
  const d2=await simulateAi7S3aSharedRestore(f.input);
  assert.equal(d2.simulatedEligible,false);
  assert.ok(d2.reasons.includes('REVIEW_ALREADY_CONSUMED'));
  assert.equal(f.claims.size,1);
  assert.deepEqual(d2.executableCleanupCandidates,[]);
});
test('S3A-7-07 reusing an old envelope for a different backup manifest is denied',async()=>{
  await blocked('BACKUP_MANIFEST_NONCE_MISMATCH',async f=>{
    const backups=[...f.input.restore.backups];
    backups[1]={...backups[1],createdAtMs:backups[1].createdAtMs-100};
    const manifestHash=await sha256FakeText(JSON.stringify(backups));
    f.input={...f.input,restore:{...f.input.restore,backups,manifestHash,
      approvals:f.input.restore.approvals.map(a=>({...a,manifestHash}))}};
  });
});
test('S3A-7-08 one reviewer loses current central role before first shared check',async()=>{
  await blocked('SHARED_VERIFIER_DENIED:CENTRAL_ADMIN_REQUIRED',f=>{
    f.members.set('admin-two',{...f.members.get('admin-two')!,centralSuperAdmin:false});
  });
});
test('S3A-7-09 second reviewer removed during second stage, abort before S1 once claim',async()=>{
  const f=await fixture();const original=f.input.readers.readMembership;
  let twoReads=0;
  const readers:S3aFakeReaders={...f.input.readers,readMembership:async(subject,app)=>{
    const x=await original(subject,app);
    if(subject==='admin-two'&&++twoReads===2)return {...x!,active:false};
    return x;
  }};
  f.input={...f.input,readers};
  const d=await simulateAi7S3aSharedRestore(f.input);
  assert.equal(d.simulatedEligible,false);
  assert.ok(d.reasons.includes('SHARED_VERIFIER_DENIED:STARRY_ID_MEMBER_UNAVAILABLE'));
  assert.equal(f.claims.size,0);
});
test('S3A-7-10 shared witness disappears, no fallback to S1 successful evidence',async()=>{
  await blocked('SHARED_VERIFIER_DENIED:WITNESS_UNKNOWN',f=>{f.sw=null;});
});
test('S3A-7-11 external last-known floor unavailable blocks BEFORE shared verifier',async()=>{
  const f=await fixture();f.floor=null;
  const r=await simulateAi7S3aSharedRestore(f.input);
  assert.ok(r.reasons.includes('S1_WITNESS_OR_FLOOR_MISSING'));
  assert.equal(f.sharedReads.attest,0);assert.equal(f.claims.size,0);
  assert.equal(r.executableRestore,false);
});
test('S3A-7-12 dual witness simultaneously rolls back but third floor remembers latest',async()=>{
  await blocked('S1_S3A_SECURITY_VERSION_MISMATCH',f=>{
    f.w={...f.w!,headSeq:'0'};
  });
});
test('S3A-7-13 second witness changes epoch between shared check passes',async()=>{
  const f=await fixture();
  const original=f.input.readers.readWitness;let calls=0;
  const readers:S3aFakeReaders={...f.input.readers,readWitness:async()=>{
    const w=await original();calls++;
    return calls>=3?{...w!,restoreEpoch:'7'}:w;
  }};
  f.input={...f.input,readers};
  const d=await simulateAi7S3aSharedRestore(f.input);
  assert.ok(d.reasons.includes('SHARED_VERIFIER_DENIED:INDEPENDENT_WITNESS_CONFLICT'));
  assert.equal(d.simulatedEligible,false);assert.equal(f.claims.size,0);
});
test('S3A-7-14 current track entitlement revoked while two admins are active',async()=>{
  await blocked('SHARED_VERIFIER_DENIED:RESOURCE_NOT_CURRENTLY_ENTITLED',f=>{
    const old=f.resources.get('current-track')!;
    f.resources.set('current-track',{...old,revoked:true});
  });
});
test('S3A-7-15 source content silently changed without ETag bump is rejected',async()=>{
  await blocked('SHARED_VERIFIER_DENIED:RESOURCE_SOURCE_OR_PERMISSION_CHANGED',f=>{
    const old=f.resources.get('old-track')!;
    f.resources.set('old-track',{...old,contentDigest:'a'.repeat(64)});
  });
});
test('S3A-7-16 tampering parent raw Fake R2 object is blocked by real S1 fake function',async()=>{
  await blocked('BACKUP_OBJECT_TAMPERED',f=>{f.files.set('fake/r2/old.txt','被竄改的歷史稿');});
});
test('S3A-7-17 parent full missing => no chance to ignore historic versions',async()=>{
  await blocked('BACKUP_PARENT_MISSING',f=>{
    f.input={...f.input,restore:{...f.input.restore,
      backups:f.input.restore.backups.slice(1)}};
  });
});
test('S3A-7-18 empty historical member association is refused',async()=>{
  await blocked('BAD_FILE_LINKAGE',async f=>{
    const backups=f.input.restore.backups.map((b,i)=>i===0?
      {...b,files:b.files.map(x=>({...x,memberIds:[]}))}:b);
    const manifestHash=await sha256FakeText(JSON.stringify(backups));
    const approvals=f.input.restore.approvals.map(a=>({...a,manifestHash}));
    f.input={...f.input,restore:{...f.input.restore,backups,manifestHash,approvals},
      envelopes:await Promise.all(f.input.envelopes.map(async(e,i)=>({
        ...e,nonce:await ai7S3aFakeApprovalNonce(
          f.input.restore.requestId,f.input.restore.selectedBackupId,
          manifestHash,approvals[i].reviewerId,approvals[i].headHash,'6')
      })))
    };
  });
});
test('S3A-7-19 same track multiple historical versions is a schema limitation not silent allow',async()=>{
  await blocked('HISTORICAL_SCOPE_UNREPRESENTABLE',f=>{
    const backups=f.input.restore.backups.map((b,i)=>i===0?
      {...b,files:[...b.files,{...b.files[0],key:'fake/r2/other.txt'}]}:b);
    f.input={...f.input,restore:{...f.input.restore,backups}};
  });
});
test('S3A-7-20 different head/epoch proofs between reviewers reject',async()=>{
  await blocked('TWO_REVIEWERS_WITNESS_DISAGREES',f=>{
    f.input={...f.input,envelopes:f.input.envelopes.map((e,i)=>i===1?
      {...e,restoreEpoch:'7'}:e)};
  });
});
test('S3A-7-21 approval grant for another fake reviewer cannot be reassigned',async()=>{
  await blocked('BACKUP_RESOURCE_OR_APPROVER_NOT_BOUND',f=>{
    f.input={...f.input,envelopes:f.input.envelopes.map((e,i)=>i===1?
      {...e,subjectId:'admin-three'}:e)};
  });
});
test('S3A-7-22 no independent side effects even if envelope and S1 gate both approve',async()=>{
  const f=await fixture();
  const d=await simulateAi7S3aSharedRestore(f.input);
  assert.equal(d.simulatedEligible,true);
  assert.deepEqual(d.executableCleanupCandidates,[]);
  assert.equal(d.productionAuthorized,false);
  assert.equal(d.executableRestore,false);
  assert.equal(d.executableDelete,false);
  assert.equal(d.sideEffects,0);
  assert.ok(d.sharedChecks.every(x=>x.result.providerCalls===0&&x.result.restoreWrites===0));
});
