import test from 'node:test';
import assert from 'node:assert/strict';
import {
  N1A_BKP_RUNTIME_ENABLED, fakeEventHash, isCanonicalBkpVersion,
  sha256FakeText, simulateN1aBackupGate
} from '../n1a-bkp-s1/fakeRestoreGate.ts';
import type {
  MockEvent, MockWitness, MockIndependentHead, MockStarryId,
  MockBackup, MockApproval, MockEnvironment, SimulatedRestoreInput
} from '../n1a-bkp-s1/fakeRestoreGate.ts';

const NOW=Date.UTC(2026,9,20,18,0);
const DAY=86400000;
type F={
  input:SimulatedRestoreInput; files:Map<string,string>;
  beforeW:MockWitness|null; afterW:MockWitness|null;
  beforeH:MockIndependentHead|null;afterH:MockIndependentHead|null;
  beforeId:MockStarryId|null;afterId:MockStarryId|null;
};
async function event(seq:string,kind:MockEvent['kind'],target:string,prevHash:string):Promise<MockEvent>{
  const unsigned={seq,kind,target,prevHash};
  return {...unsigned,hash:await fakeEventHash(unsigned)};
}
async function fixture():Promise<F>{
  const e1=await event('1','epoch_reserve','restore-controller','GENESIS');
  const e2=await event('2','correction_changed','unrelated-track',e1.hash);
  const w:MockWitness={sourceId:'fake-worm-storage',headSeq:'2',headHash:e2.hash,
    restoreEpoch:'9',minStarryIdRevision:'12',observedAtMs:NOW-1000,
    events:[e1,e2]};
  const h:MockIndependentHead={sourceId:'fake-other-head-witness',headSeq:'2',
    headHash:e2.hash,restoreEpoch:'9',observedAtMs:NOW-1000};
  const id:MockStarryId={revision:'12',observedAtMs:NOW-1000,members:[
    {id:'m-current',active:true,centralSuperAdmin:false},
    {id:'m-legacy',active:true,centralSuperAdmin:false},
    {id:'admin-one',active:true,centralSuperAdmin:true},
    {id:'admin-two',active:true,centralSuperAdmin:true}
  ]};
  const files=new Map<string,string>([
    ['fake/legacy.txt','舊版核准逐字稿'],
    ['fake/current.txt','新版核准逐字稿']
  ]);
  const full:MockBackup={id:'full',parentId:null,kind:'full',
    createdAtMs:NOW-50*DAY,state:'verified-success',securitySeq:'1',files:[{
      key:'fake/legacy.txt',sha256:await sha256FakeText(files.get('fake/legacy.txt')!),
      bytes:new TextEncoder().encode(files.get('fake/legacy.txt')!).length,
      trackId:'track-legacy',memberIds:['m-legacy'],review:'approved-history'
    }]};
  const delta:MockBackup={id:'delta',parentId:'full',kind:'delta',
    createdAtMs:NOW-DAY,state:'verified-success',securitySeq:'1',files:[{
      key:'fake/current.txt',sha256:await sha256FakeText(files.get('fake/current.txt')!),
      bytes:new TextEncoder().encode(files.get('fake/current.txt')!).length,
      trackId:'track-current',memberIds:['m-current'],review:'published'
    }]};
  const backups=[full,delta];
  const manifestHash=await sha256FakeText(JSON.stringify(backups));
  const approval=(reviewerId:string):MockApproval=>({
    reviewerId,requestId:'restore-r1',backupId:'delta',manifestHash,
    headHash:e2.hash,restoreEpoch:'9',reviewerIdRevision:'12',
    decision:'approve',approvedAtMs:NOW-500
  });
  const f:F={
    files,beforeW:w,afterW:w,beforeH:h,afterH:h,beforeId:id,afterId:id,
    input:undefined as unknown as SimulatedRestoreInput
  };
  const env:MockEnvironment={
    readWitness:async phase=>phase==='before'?f.beforeW:f.afterW,
    readIndependentHead:async phase=>phase==='before'?f.beforeH:f.afterH,
    readStarryId:async phase=>phase==='before'?f.beforeId:f.afterId,
    readFakeR2:async key=>f.files.get(key)??null
  };
  f.input={nowMs:NOW,freshnessMs:5000,approvalAgeMs:5000,
    requestId:'restore-r1',selectedBackupId:'delta',lastGoodId:'delta',
    manifestHash,backups,approvals:[approval('admin-one'),approval('admin-two')],
    lock:{searchLocked:true,publicReadsLocked:true,publicationsLocked:true,
      cleanupLocked:true,restoreEpoch:'9'},
    retentionDays:7,env};
  return f;
}
async function denied(expected:string,edit:(f:F)=>void|Promise<void>){
  const f=await fixture();await edit(f);
  const result=await simulateN1aBackupGate(f.input);
  assert.equal(result.simulatedEligible,false,JSON.stringify(result));
  assert.equal(result.productionAuthorized,false);
  assert.equal(result.restoreLocked,true);
  assert.equal(result.sideEffects,0);
  assert.deepEqual(result.retentionCandidates,[],'no cleanup candidates after failure');
  assert.ok(result.reasons.includes(expected),JSON.stringify(result.reasons));
}
async function addEvent(f:F,kind:MockEvent['kind'],target:string){
  if(!f.beforeW||!f.beforeH)throw Error('missing fake');
  const seq=(BigInt(f.beforeW.headSeq)+1n).toString();
  const next=await event(seq,kind,target,f.beforeW.headHash);
  f.beforeW={...f.beforeW,headSeq:seq,headHash:next.hash,events:[...f.beforeW.events,next]};
  f.afterW=f.beforeW;
  f.beforeH={...f.beforeH,headSeq:seq,headHash:next.hash};f.afterH=f.beforeH;
  f.input={...f.input,approvals:f.input.approvals.map(a=>({...a,headHash:next.hash}))};
}
test('runtime is always OFF; happy Fake returns no production restore capability',async()=>{
  assert.equal(N1A_BKP_RUNTIME_ENABLED,false);
  const f=await fixture(),r=await simulateN1aBackupGate(f.input);
  assert.equal(r.simulatedEligible,true,JSON.stringify(r));
  assert.equal(r.productionAuthorized,false);assert.equal(r.restoreLocked,true);
  assert.equal(r.sideEffects,0);assert.equal(r.verifiedFileCount,2);
  assert.deepEqual(r.retentionCandidates,[]);
});
test('canonical uint64 rejects floats, negative, leading zeros and overflow',()=>{
  for(const v of ['0','1','18446744073709551615'])assert.equal(isCanonicalBkpVersion(v),true);
  for(const v of ['01','-1','1.5','18446744073709551616',1,''])assert.equal(isCanonicalBkpVersion(v),false);
});
test('no WORM evidence => deny restore and cleanup',async()=>denied('AUTHORITY_MISSING',f=>{f.beforeW=null;f.afterW=null}));
test('independent checkpoint unavailable => deny',async()=>denied('AUTHORITY_MISSING',f=>{f.beforeH=null;f.afterH=null}));
test('same control domain claiming two sources => deny',async()=>denied('WITNESS_NOT_INDEPENDENT',f=>{
  f.beforeH={...f.beforeH!,sourceId:f.beforeW!.sourceId};f.afterH=f.beforeH;
}));
test('counter mismatch between witness and high-water checkpoint => deny',async()=>denied('HEAD_DISAGREEMENT',f=>{
  f.beforeH={...f.beforeH!,headSeq:'1'};f.afterH=f.beforeH;
}));
test('hiding latest event from both witness and checkpoint fails hash chain',async()=>denied('HEAD_CHAIN_MISMATCH',f=>{
  f.beforeW={...f.beforeW!,headSeq:'1',events:f.beforeW!.events.slice(0,1)};
  f.afterW=f.beforeW;f.beforeH={...f.beforeH!,headSeq:'1'};f.afterH=f.beforeH;
}));
test('tampered historical event body => reject',async()=>denied('EVENT_TAMPERED',f=>{
  const events=[...f.beforeW!.events];events[1]={...events[1],target:'tampered'};
  f.beforeW={...f.beforeW!,events};f.afterW=f.beforeW;
}));
test('nonconsecutive securitySeq event => deny',async()=>denied('EVENT_CHAIN_INVALID',f=>{
  const events=[...f.beforeW!.events];events[1]={...events[1],seq:'3'};
  f.beforeW={...f.beforeW!,events};f.afterW=f.beforeW;
}));
test('witness timestamp too old => deny',async()=>denied('WITNESS_STALE',f=>{
  f.beforeW={...f.beforeW!,observedAtMs:NOW-6000};f.afterW=f.beforeW;
}));
test('Starry ID inaccessible => deny',async()=>denied('STARRY_ID_UNKNOWN',f=>{f.beforeId=null;f.afterId=null}));
test('Starry ID rolled back relative to witnessed high water => deny',async()=>denied('STARRY_ID_ROLLBACK',f=>{
  f.beforeId={...f.beforeId!,revision:'11'};f.afterId=f.beforeId;
}));
test('old member revoked after snapshot stays forbidden',async()=>denied('HISTORIC_MEMBER_TOMBSTONE',async f=>{
  await addEvent(f,'member_revoke_pending','m-legacy');
}));
test('old historical track deleted after snapshot stays forbidden',async()=>denied('HISTORIC_TRACK_TOMBSTONE',async f=>{
  await addEvent(f,'track_deleted','track-legacy');
}));
test('deleted current member with old active backup => deny',async()=>denied('HISTORIC_MEMBER_TOMBSTONE',async f=>{
  await addEvent(f,'member_deleted','m-current');
}));
test('current track pending revocation freezes restoration',async()=>denied('HISTORIC_TRACK_TOMBSTONE',async f=>{
  await addEvent(f,'track_revoke_pending','track-current');
}));
test('correction changed after chosen backup requires reconciliation',async()=>denied('CORRECTION_AFTER_BACKUP',async f=>{
  await addEvent(f,'correction_changed','track-legacy');
}));
test('historical file missing in Fake R2 => deny',async()=>denied('BACKUP_OBJECT_MISSING',f=>{
  f.files.delete('fake/legacy.txt');
}));
test('historical file tampered in Fake R2 => deny',async()=>denied('BACKUP_OBJECT_TAMPERED',f=>{
  f.files.set('fake/legacy.txt','變更後的舊稿');
}));
test('a missing member mapping for historical track => deny',async()=>denied('BAD_FILE_LINKAGE',f=>{
  const backups=[...f.input.backups];
  backups[0]={...backups[0],files:[{...backups[0].files[0],memberIds:[]}]};
  f.input={...f.input,backups};
}));
test('the blank member ID is never considered a public file',async()=>denied('BAD_FILE_LINKAGE',f=>{
  const backups=[...f.input.backups];backups[0]={...backups[0],files:[{...backups[0].files[0],memberIds:[' ']}]};
  f.input={...f.input,backups};
}));
test('selected restore is not lastGood => deny',async()=>denied('BACKUP_CHAIN_INVALID',f=>{
  f.input={...f.input,lastGoodId:'full'};
}));
test('orphan incremental backup => deny',async()=>denied('BACKUP_GRAPH_INVALID',f=>{
  f.input={...f.input,backups:f.input.backups.map(b=>b.id==='delta'?{...b,parentId:'unavailable'}:b)};
}));
test('cyclic backup parent => deny',async()=>denied('BACKUP_GRAPH_INVALID',f=>{
  f.input={...f.input,backups:f.input.backups.map(b=>b.id==='delta'?{...b,parentId:'delta'}:b)};
}));
test('unsanctioned manifest change => deny',async()=>denied('MANIFEST_TAMPERED',f=>{
  f.input={...f.input,backups:[...f.input.backups].reverse()};
}));
test('zero approvals => locked',async()=>denied('TWO_APPROVERS_REQUIRED',f=>{
  f.input={...f.input,approvals:[]};
}));
test('one current admin cannot self-approve twice',async()=>denied('TWO_APPROVERS_REQUIRED',f=>{
  f.input={...f.input,approvals:[f.input.approvals[0],f.input.approvals[0]]};
}));
test('one valid admin still insufficient',async()=>denied('TWO_APPROVERS_REQUIRED',f=>{
  f.input={...f.input,approvals:[f.input.approvals[0]]};
}));
test('approver role revoked by current ID => deny',async()=>denied('APPROVER_INVALID',f=>{
  f.beforeId={...f.beforeId!,members:f.beforeId!.members.map(m=>m.id==='admin-two'?{...m,centralSuperAdmin:false}:m)};
  f.afterId=f.beforeId;
}));
test('old approval for a different backup hash cannot be replayed',async()=>denied('APPROVAL_REPLAY_OR_SCOPE',f=>{
  f.input={...f.input,approvals:f.input.approvals.map((a,i)=>i?{...a,manifestHash:'0'.repeat(64)}:a)};
}));
test('approval from stale ID revision cannot be replayed',async()=>denied('APPROVAL_REPLAY_OR_SCOPE',f=>{
  f.input={...f.input,approvals:f.input.approvals.map((a,i)=>i?{...a,reviewerIdRevision:'11'}:a)};
}));
test('expired approval => deny',async()=>denied('APPROVAL_EXPIRED',f=>{
  f.input={...f.input,approvals:f.input.approvals.map((a,i)=>i?{...a,approvedAtMs:NOW-10000}:a)};
}));
test('witness changes during approval => lock/recheck',async()=>denied('WITNESS_CHANGED_DURING_REVIEW',async f=>{
  const e=await event('3','member_revoke_pending','m-legacy',f.beforeW!.headHash);
  f.afterW={...f.beforeW!,headSeq:'3',headHash:e.hash,events:[...f.beforeW!.events,e]};
  f.afterH={...f.beforeH!,headSeq:'3',headHash:e.hash};
}));
test('Starry ID membership changes after review => lock/recheck',async()=>denied('MEMBERSHIP_CHANGED_DURING_REVIEW',f=>{
  f.afterId={...f.afterId!,members:f.afterId!.members.map(m=>m.id==='admin-one'?{...m,active:false}:m)};
}));
test('locked search must stay locked => deny',async()=>denied('RESTORE_NOT_LOCKED',f=>{
  f.input={...f.input,lock:{...f.input.lock,searchLocked:false}};
}));
test('cleanup must stay locked => deny',async()=>denied('RESTORE_NOT_LOCKED',f=>{
  f.input={...f.input,lock:{...f.input.lock,cleanupLocked:false}};
}));
test('cleanup never returns candidates when authority unavailable, 7/30/90 days',async()=>{
  for(const retentionDays of [7,30,90] as const){
    const f=await fixture();
    f.beforeH=null;f.afterH=null;f.input={...f.input,retentionDays};
    const r=await simulateN1aBackupGate(f.input);
    assert.equal(r.simulatedEligible,false);
    assert.equal(r.retentionCandidates.length,0);
    assert.equal(r.productionAuthorized,false);
  }
});
test('under 7/30/90 days old unrelated backup is only suggested, never deleted',async()=>{
  for(const retentionDays of [7,30,90] as const){
    const f=await fixture();
    const old:MockBackup={id:'independent-full',parentId:null,kind:'full',
      createdAtMs:NOW-45*DAY,state:'verified-success',securitySeq:'1',files:[]};
    const backups=[...f.input.backups,old];
    const manifestHash=await sha256FakeText(JSON.stringify(backups));
    f.input={...f.input,backups,retentionDays,manifestHash,
      approvals:f.input.approvals.map(a=>({...a,manifestHash}))};
    const r=await simulateN1aBackupGate(f.input);
    assert.equal(r.simulatedEligible,true,JSON.stringify(r));
    assert.equal(r.retentionCandidates.includes('independent-full'),retentionDays!==90);
    assert.equal(r.productionAuthorized,false);
    assert.equal(r.sideEffects,0);
  }
});
test('2000 fake members, one historical revoked => no restoration',async()=>{
  const f=await fixture();
  const many=Array.from({length:2000},(_,i)=>({id:'synthetic-'+i,active:i!==1999,centralSuperAdmin:false}));
  f.beforeId={...f.beforeId!,members:[...f.beforeId!.members,...many]};f.afterId=f.beforeId;
  const backup=f.input.backups[0];
  const backups=[{...backup,files:backup.files.map(fl=>({...fl,memberIds:[...fl.memberIds,'synthetic-1999']}))},f.input.backups[1]];
  f.input={...f.input,backups};
  const result=await simulateN1aBackupGate(f.input);
  assert.equal(result.simulatedEligible,false);
  assert.ok(result.reasons.includes('MEMBER_MISSING_OR_REVOKED'));
  assert.equal(result.productionAuthorized,false);
});


test('malformed head sequence fails closed without throwing',async()=>denied('BACKUP_SECURITY_VERSION_INVALID',f=>{
  f.beforeW={...f.beforeW!,headSeq:'nonsense'};f.afterW=f.beforeW;
  f.beforeH={...f.beforeH!,headSeq:'nonsense'};f.afterH=f.beforeH;
}));
test('unverified unrelated old backup never becomes an expiry-delete candidate',async()=>denied('BACKUP_GRAPH_INVALID',f=>{
  const stale:MockBackup={id:'other-bad-full',parentId:null,kind:'full',
    createdAtMs:NOW-120*DAY,securitySeq:'1',state:'failed',files:[]};
  f.input={...f.input,backups:[...f.input.backups,stale]};
}));
