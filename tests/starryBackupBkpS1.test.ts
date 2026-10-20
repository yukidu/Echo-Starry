import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  bkpS1Preflight,bkpS1Sha256,bkpS1TimecodePayload,bkpS1PlanRetention,
  BKP_S1_RUNTIME_ENABLED
} from '../worker/starryBackupBkpS1.ts';
import type {RestoreRequest,BackupManifest,TranscriptVersion,BackupObject,SnapshotState,RestoreAuthority} from '../worker/starryBackupBkpS1.ts';

type MutableFixture={
  manifest:BackupManifest; base:BackupManifest; snapshot:SnapshotState;
  authority:RestoreAuthority; files:Map<string,string>;
  refresh():Promise<RestoreRequest>;
};
const segments=[{id:'s1',start:0,end:1,text:'繁星安全測試'},{id:'s2',start:1,end:2,text:'已核准'}];
const json=JSON.stringify({segments});
const txt=segments.map(s=>s.text).join('\n');
const vtt='WEBVTT\n\n'+segments.map((s,i)=>
  `${i+1}\n00:00:0${s.start}.000 --> 00:00:0${s.end}.000\n${s.text}\n`).join('\n');
async function fixture():Promise<MutableFixture>{
  const files=new Map<string,string>();
  async function obj(version:string,format:'json'|'txt'|'vtt'|'raw',content:string):Promise<BackupObject>{
    const key=`synthetic/${version}/${format}`; files.set(key,content);
    return {key,format,bytes:new TextEncoder().encode(content).length,sha256:await bkpS1Sha256(content)};
  }
  const current:TranscriptVersion={
    id:'v2',trackId:'synthetic-track',status:'published',active:true,
    sourceAudioKey:'synthetic/audio.mp3',sourceAudioRevision:'etag-v2:123',
    rawOrigin:'pre-normalization-processed',legacyMissingRaw:false,
    segmentCount:2,timecodeHash:await bkpS1Sha256(bkpS1TimecodePayload(segments)),
    objects:[await obj('v2','json',json),await obj('v2','txt',txt),
      await obj('v2','vtt',vtt),await obj('v2','raw',JSON.stringify({segments}))]
  };
  const historic:TranscriptVersion={
    ...current,id:'legacy',status:'approved-history',active:false,
    rawOrigin:'legacy-unavailable',legacyMissingRaw:true,
    objects:[await obj('legacy','json',json),await obj('legacy','txt',txt),await obj('legacy','vtt',vtt)]
  };
  const common={restoreEpoch:17,deletionWatermark:11,revocationWatermark:11,
    correctionWatermark:7,entitlementWatermark:8};
  const base:BackupManifest={id:'full-1',mode:'full',state:'verified-success',parentId:null,
    baseId:'full-1',createdAt:100,...common,versions:[current,historic]};
  const manifest:BackupManifest={...base,id:'delta-2',mode:'delta',parentId:'full-1',
    createdAt:200,versions:[current,historic]};
  const snapshot:SnapshotState={
    activeByTrack:{'synthetic-track':'v2'},publishedVersionIds:['v2'],approvedHistoryIds:['legacy'],
    correctionEventIds:['correction-1'],unlockIds:['unlock-1'],rewardUniqueKeys:['reward-1'],
    revokedRewardKeys:[],deletedTrackIds:[],d1PublicationConsistent:true,
    correctionWatermark:7,entitlementWatermark:8,deletionWatermark:11,revocationWatermark:11
  };
  const authority:RestoreAuthority={available:true,independentlyStored:true,active:true,
    epoch:18,deletionWatermark:11,revocationWatermark:11,
    currentDeletedTrackIds:[],currentRevokedTrackIds:[]};
  const f:MutableFixture={manifest,base,snapshot,authority,files,refresh:async()=>{
    const manifests=[f.base,f.manifest];
    const trustedManifestHashes:Record<string,string>={};
    for(const m of manifests)trustedManifestHashes[m.id]=await bkpS1Sha256(JSON.stringify(m));
    const r:RestoreRequest={backupId:'delta-2',lastGoodId:'delta-2',manifests,snapshot:f.snapshot,
      authority:f.authority,searchLocked:true,publicationLocked:true,stagingOnly:true,
      objectReader:{read:async key=>f.files.get(key)??null},trustedManifestHashes};
    return r;
  }};
  return f;
}
async function run(modify?:(f:MutableFixture,r:RestoreRequest)=>void){
  const f=await fixture();const r=await f.refresh();
  const oldManifests=r.manifests,oldSnap=r.snapshot,oldAuthority=r.authority;
  modify?.(f,r);
  // Mutators may replace fixture objects or intentionally override a request field.
  const manifests=r.manifests===oldManifests?[f.base,f.manifest]:r.manifests;
  const snapshot=r.snapshot===oldSnap?f.snapshot:r.snapshot;
  const authority=r.authority===oldAuthority?f.authority:r.authority;
  const trustedManifestHashes:Record<string,string>={};
  for(const m of manifests)trustedManifestHashes[m.id]=await bkpS1Sha256(JSON.stringify(m));
  return bkpS1Preflight({...r,manifests,snapshot,authority,trustedManifestHashes});
}
function rejected(reason:string,modify:(f:MutableFixture,r:RestoreRequest)=>void){
  return async()=>{
    const result=await run(modify);
    assert.equal(result.eligible,false,JSON.stringify(result));
    assert.ok(result.reasons.includes(reason),JSON.stringify(result.reasons));
    assert.equal(result.sideEffects,0);
  };
}

test('S76 fixture is OFF and contains no runtime activation',()=>assert.equal(BKP_S1_RUNTIME_ENABLED,false));
test('R01 complete full/delta approved version and rights ACCEPT',async()=>{
  const result=await run();assert.equal(result.eligible,true,JSON.stringify(result));
  assert.deepEqual(result.chain,['full-1','delta-2']);assert.deepEqual(result.legacyMissingRawIds,['legacy']);
  assert.equal(result.sideEffects,0);
});
test('R02 missing current VTT REJECT',rejected('object_not_found',(f)=>f.files.delete('synthetic/v2/vtt')));
test('R03 changed TXT without checksum update REJECT',rejected('object_hash_mismatch',(f)=>f.files.set('synthetic/v2/txt','惡意變更')));
test('R04 false segment count REJECT',rejected('segment_count_mismatch',(f)=>{
  const versions=[...f.manifest.versions];versions[0]={...versions[0],segmentCount:99};
  f.manifest={...f.manifest,versions};
}));
test('R05 false timecode checksum REJECT',rejected('timecode_hash_mismatch',(f)=>{
  const versions=[...f.manifest.versions];versions[0]={...versions[0],timecodeHash:'f'.repeat(64)};
  f.manifest={...f.manifest,versions};
}));
test('R06 delta without full base REJECT',rejected('chain_missing_parent',(f,r)=>{
  (r as unknown as {manifests:BackupManifest[]}).manifests=[f.manifest];
}));
test('R07 legacy missing raw correctly marked remains ACCEPT',async()=>{
  const result=await run(); assert.equal(result.eligible,true);
  assert.deepEqual(result.legacyMissingRawIds,['legacy']);
});
test('R08 current published raw missing REJECT',rejected('required_object_missing',(f)=>{
  const versions=[...f.manifest.versions];versions[0]={...versions[0],objects:versions[0].objects.filter(x=>x.format!=='raw')};
  f.manifest={...f.manifest,versions};
}));
test('R09 DB active/published inconsistency REJECT',rejected('d1_publication_inconsistent',(f)=>{
  f.snapshot={...f.snapshot,d1PublicationConsistent:false};
}));
test('R10 unapproved candidate cannot become active REJECT',rejected('active_pointer_not_published',(f)=>{
  const versions=[...f.manifest.versions];versions[0]={...versions[0],status:'awaiting_review'};
  f.manifest={...f.manifest,versions};
}));
test('R11 external deletion high watermark advanced REJECT',rejected('snapshot_outdated_authority',(f)=>{
  f.authority={...f.authority,deletionWatermark:14};
}));
test('R12 authority missing REJECT',rejected('authority_unavailable',(_f,r)=>{
  (r as {authority:null}).authority=null;
}));
test('R13 restore epoch must advance even at same revision number REJECT',rejected('restore_epoch_not_advanced',(f)=>{
  f.authority={...f.authority,epoch:17};
}));
test('R14 search not locked before restore REJECT',rejected('restore_not_isolated',(_f,r)=>{
  (r as {searchLocked:boolean}).searchLocked=false;
}));
test('R15 duplicate reward key REJECT',rejected('duplicate_entitlement',(f)=>{
  f.snapshot={...f.snapshot,rewardUniqueKeys:['reward-1','reward-1']};
}));
test('R16 currently revoked track REJECT',rejected('active_track_deleted_or_revoked',(f)=>{
  f.authority={...f.authority,currentRevokedTrackIds:['synthetic-track']};
}));
test('R17 approved historical version missing REJECT',rejected('approved_version_missing',(f)=>{
  f.manifest={...f.manifest,versions:f.manifest.versions.filter(x=>x.id!=='legacy')};
}));
test('R18 referenced R2 object absent REJECT',rejected('object_not_found',(f)=>{
  f.files.delete('synthetic/legacy/json');
}));

test('unverified selected restore point cannot substitute lastGood',rejected('not_last_verified_good',(_f,r)=>{
  (r as {lastGoodId:string}).lastGoodId='full-1';
}));
test('invalid or tampered backup manifest trusted digest REJECT',async()=>{
  const f=await fixture(),r=await f.refresh();
  (r as {trustedManifestHashes:Record<string,string>}).trustedManifestHashes['delta-2']='f'.repeat(64);
  assert.ok((await bkpS1Preflight(r)).reasons.includes('manifest_chain_hash_mismatch'));
});
test('restore authority exists only as injected Fake; must be independently stored',rejected('authority_unavailable',(f)=>{
  f.authority={...f.authority,independentlyStored:false};
}));
test('historical legacy missing raw exception cannot be falsely applied to active',rejected('invalid_legacy_raw_exception',(f)=>{
  const versions=[...f.manifest.versions];versions[0]={...versions[0],legacyMissingRaw:true,rawOrigin:'legacy-unavailable'};
  f.manifest={...f.manifest,versions};
}));
test('candidate waiting review does not qualify as published',rejected('active_pointer_not_published',(f)=>{
  f.snapshot={...f.snapshot,activeByTrack:{'synthetic-track':'legacy'}};
}));
test('retention keeps lastGood base and all parents, does not delete anything',async()=>{
  const f=await fixture();
  const p=bkpS1PlanRetention({manifests:[f.base,f.manifest],lastGoodId:'delta-2',
    retentionDays:7,now:200+90*86400000});
  assert.equal(p.blocked,false);assert.deepEqual(p.keepIds,['delta-2','full-1']);
  assert.deepEqual(p.candidates,[]);
});
test('retention with unknown base/lastGood fails closed without deletion candidates',async()=>{
  const f=await fixture();
  const p=bkpS1PlanRetention({manifests:[f.manifest],lastGoodId:'delta-2',
    retentionDays:7,now:200+90*86400000});
  assert.equal(p.blocked,true);assert.deepEqual(p.candidates,[]);
});
test('retention may only suggest human-approved removal of unrelated expired full backup',async()=>{
  const f=await fixture();const old:BackupManifest={...f.base,id:'other-full',baseId:'other-full',createdAt:20};
  const p=bkpS1PlanRetention({manifests:[old,f.base,f.manifest],lastGoodId:'delta-2',
    retentionDays:7,now:200+90*86400000});
  assert.deepEqual(p.candidates,[{id:'other-full',reason:'expired-unreferenced',requiresHumanApproval:true}]);
});
test('SQLite zero-row UPDATE is not automatically a failed transaction',()=>{
  const python=['import sqlite3,json', 'db=sqlite3.connect(":memory:")',
    'db.execute("CREATE TABLE pointers (id TEXT PRIMARY KEY, value TEXT)")',
    'db.execute("CREATE TABLE runs (id TEXT PRIMARY KEY, state TEXT)")',
    'db.execute("INSERT INTO pointers VALUES (\'a\',\'old\')")',
    'db.execute("INSERT INTO runs VALUES (\'r\',\'awaiting_review\')")',
    'db.commit()', 'db.execute("BEGIN")',
    'x=db.execute("UPDATE pointers SET value=\'new\' WHERE id=\'a\'").rowcount',
    'y=db.execute("UPDATE runs SET state=\'published\' WHERE id=\'missing\'").rowcount',
    'db.commit()', 'print(json.dumps({"rows":[x,y],"pointer":db.execute("SELECT value FROM pointers").fetchone()[0],"run":db.execute("SELECT state FROM runs").fetchone()[0]}))'].join('\n');
  const p=spawnSync('python3',['-c',python],{encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);const r=JSON.parse(p.stdout);
  assert.deepEqual(r,{rows:[1,0],pointer:'new',run:'awaiting_review'});
});


/** AI2 P0-1: authoritative deletion/revocation revisions must match exactly.
 * A stale but otherwise "available" authority is not a proof of no revocation. */
test('S76 P0-1 stale external deletion watermark cannot approve restore',rejected(
  'authority_watermark_older',(f)=>{
    f.authority={...f.authority,deletionWatermark:10,epoch:18};
  }));
test('S76 P0-1 stale external revocation watermark cannot approve restore',rejected(
  'authority_watermark_older',(f)=>{
    f.authority={...f.authority,revocationWatermark:10,epoch:18};
  }));
test('S76 P0-1 watermark ahead of snapshot rejects even with higher epoch',rejected(
  'snapshot_outdated_authority',(f)=>{
    f.authority={...f.authority,revocationWatermark:12,epoch:19};
  }));
test('S76 P0-1 same watermark and epoch revision with live revoke rejects',rejected(
  'active_track_deleted_or_revoked',(f)=>{
    f.authority={...f.authority,revocationWatermark:11,epoch:18,
      currentRevokedTrackIds:['synthetic-track']};
  }));
test('S76 P0-1 invalid external authority revision number fails closed',rejected(
  'authority_watermark_invalid',(f)=>{
    f.authority={...f.authority,deletionWatermark:Number.NaN};
  }));

/** A parent-only history object is a restore dependency despite the leaf
 * containing all its own objects and a valid signed leaf manifest. */
function addBaseOnlyApprovedHistory(f:MutableFixture):string{
  const source=f.base.versions.find(v=>v.id==='legacy')!;
  const objects=source.objects.map(o=>{
    const key=o.key.replace('synthetic/legacy/','synthetic/parent-only/');
    f.files.set(key,f.files.get(o.key)!);
    return {...o,key};
  });
  f.base={...f.base,versions:[...f.base.versions,{
    ...source,id:'parent-only',active:false,status:'approved-history',objects
  }]};
  f.snapshot={...f.snapshot,approvedHistoryIds:[...f.snapshot.approvedHistoryIds,'parent-only']};
  return objects.find(o=>o.format==='txt')!.key;
}
test('S76 P0-2 parent-only approved-history object is verified even if absent from leaf',async()=>{
  const f=await fixture();
  addBaseOnlyApprovedHistory(f);
  const r=await f.refresh();
  const result=await bkpS1Preflight(r);
  assert.equal(result.eligible,true,JSON.stringify(result.reasons));
  assert.deepEqual(result.chain,['full-1','delta-2']);
});
test('S76 P0-2 missing parent-only R2 dependency rejects an intact delta leaf',async()=>{
  const f=await fixture();
  const parentKey=addBaseOnlyApprovedHistory(f);
  f.files.delete(parentKey);
  const result=await bkpS1Preflight(await f.refresh());
  assert.equal(result.eligible,false);
  assert.ok(result.reasons.includes('object_not_found'),JSON.stringify(result.reasons));
});
test('S76 P0-2 parent-only R2 corruption rejects an intact delta leaf',async()=>{
  const f=await fixture();
  const parentKey=addBaseOnlyApprovedHistory(f);
  f.files.set(parentKey,'tampered after signed manifest');
  const result=await bkpS1Preflight(await f.refresh());
  assert.equal(result.eligible,false);
  assert.ok(result.reasons.includes('object_hash_mismatch'),JSON.stringify(result.reasons));
});
test('S76 P0-2 conflicting immutable ID across base and delta is forbidden',rejected(
  'version_immutability_conflict',(f)=>{
    const versions=[...f.manifest.versions];
    versions[1]={...versions[1],sourceAudioRevision:'changed-old-source'};
    f.manifest={...f.manifest,versions};
  }));

/** AI2 P1: validate every record before suggesting any expiry cleanup. */
test('S76 P1 duplicate backup IDs block all retention cleanup suggestions',async()=>{
  const f=await fixture();
  const duplicated={...f.base,createdAt:50};
  const p=bkpS1PlanRetention({manifests:[f.base,duplicated,f.manifest],
    lastGoodId:'delta-2',retentionDays:7,now:200+90*86400000});
  assert.equal(p.blocked,true);
  assert.deepEqual(p.candidates,[]);
});
test('S76 P1 expired orphan delta with missing parent blocks every cleanup suggestion',async()=>{
  const f=await fixture();
  const orphan:BackupManifest={...f.manifest,id:'expired-orphan',baseId:'missing-full',
    parentId:'missing-full',createdAt:20};
  const p=bkpS1PlanRetention({manifests:[f.base,f.manifest,orphan],
    lastGoodId:'delta-2',retentionDays:7,now:200+90*86400000});
  assert.equal(p.blocked,true);
  assert.deepEqual(p.candidates,[]);
});
test('S76 P1 old cyclic delta pair blocks all cleanup suggestions',async()=>{
  const f=await fixture();
  const a:BackupManifest={...f.manifest,id:'cycle-a',parentId:'cycle-b',createdAt:30};
  const b:BackupManifest={...f.manifest,id:'cycle-b',parentId:'cycle-a',createdAt:30};
  const p=bkpS1PlanRetention({manifests:[f.base,f.manifest,a,b],
    lastGoodId:'delta-2',retentionDays:7,now:200+90*86400000});
  assert.equal(p.blocked,true);
  assert.deepEqual(p.candidates,[]);
});
test('S76 P1 delta with unrelated base cannot become expired cleanup candidate',async()=>{
  const f=await fixture();
  const alien:BackupManifest={...f.manifest,id:'alien-delta',
    parentId:'full-1',baseId:'wrong-base',createdAt:30};
  const p=bkpS1PlanRetention({manifests:[f.base,f.manifest,alien],
    lastGoodId:'delta-2',retentionDays:7,now:200+90*86400000});
  assert.equal(p.blocked,true);
  assert.deepEqual(p.candidates,[]);
});
