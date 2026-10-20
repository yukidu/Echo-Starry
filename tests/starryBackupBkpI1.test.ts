import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bkpS1Sha256, bkpS1TimecodePayload,
  type BackupManifest, type BackupObject, type TranscriptVersion,
  type RestoreRequest, type SnapshotState
} from '../worker/starryBackupBkpS1.ts';
import {
  BKP_I1_RUNTIME_ENABLED, bkpI1AuthorityHash, bkpI1SimulateRestore,
  type MockAuthorityEvidence, type MockEpochAnchor, type BkpI1Input
} from '../worker/starryBackupBkpI1.ts';

const day=86_400_000;
const now=Date.UTC(2026,9,20,17,0);
const transcript=[{id:'s1',start:0,end:1,text:'模擬資料，不是真實會員'}];
type FakeState={a:(MockAuthorityEvidence|null)[];z:(MockEpochAnchor|null)[];ai:number;zi:number};
type Fixture={input:BkpI1Input;fake:FakeState;files:Map<string,string>;
  authority:MockAuthorityEvidence;anchor:MockEpochAnchor;current:TranscriptVersion;
  full:BackupManifest;delta:BackupManifest;};
async function make():Promise<Fixture>{
  const files=new Map<string,string>();
  async function obj(label:string,format:'json'|'txt'|'vtt'|'raw',text:string):Promise<BackupObject>{
    const key=`FAKE/${label}/${format}`;files.set(key,text);
    return {key,format,bytes:new TextEncoder().encode(text).length,sha256:await bkpS1Sha256(text)};
  }
  const json=JSON.stringify({segments:transcript}),txt=transcript[0].text;
  const vtt=`WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\n${txt}\n`;
  const objects=[
    await obj('v2','json',json),await obj('v2','txt',txt),
    await obj('v2','vtt',vtt),await obj('v2','raw',json)
  ];
  const current:TranscriptVersion={
    id:'v2',trackId:'current-track',status:'published',active:true,
    sourceAudioKey:'FAKE/audio',sourceAudioRevision:'SHA-synthetic:100',
    rawOrigin:'pre-normalization-processed',legacyMissingRaw:false,segmentCount:1,
    timecodeHash:await bkpS1Sha256(bkpS1TimecodePayload(transcript)),objects
  };
  const legacy:TranscriptVersion={
    ...current,id:'legacy',trackId:'old-track',active:false,status:'approved-history',
    rawOrigin:'legacy-unavailable',legacyMissingRaw:true,
    objects:[await obj('legacy','json',json),await obj('legacy','txt',txt),
      await obj('legacy','vtt',vtt)]
  };
  const common={state:'verified-success' as const,restoreEpoch:17,deletionWatermark:11,
    revocationWatermark:11,correctionWatermark:7,entitlementWatermark:8};
  const full:BackupManifest={...common,id:'full',mode:'full',baseId:'full',
    parentId:null,createdAt:now-2*day,versions:[current,legacy]};
  const delta:BackupManifest={...common,id:'delta',mode:'delta',baseId:'full',
    parentId:'full',createdAt:now-day,versions:[current]};
  const snapshot:SnapshotState={
    activeByTrack:{'current-track':'v2'},publishedVersionIds:['v2'],
    approvedHistoryIds:['legacy'],correctionEventIds:['fake-correction'],
    unlockIds:['fake-unlock'],rewardUniqueKeys:['fake-reward'],
    revokedRewardKeys:[],deletedTrackIds:[],d1PublicationConsistent:true,
    correctionWatermark:7,entitlementWatermark:8,deletionWatermark:11,revocationWatermark:11
  };
  const trustedManifestHashes={
    full:await bkpS1Sha256(JSON.stringify(full)),
    delta:await bkpS1Sha256(JSON.stringify(delta))
  };
  const restore:RestoreRequest={
    backupId:'delta',lastGoodId:'delta',manifests:[full,delta],snapshot,
    authority:null,objectReader:{read:async key=>files.get(key)??null},
    trustedManifestHashes,searchLocked:true,publicationLocked:true,stagingOnly:true
  };
  const authority:MockAuthorityEvidence={
    sourceId:'fake-authority',restoreEpoch:18,revision:12,
    deletionWatermark:11,revocationWatermark:11,observedAtMs:now-1000,
    deletedTrackIds:[],revokedTrackIds:[],blockedMemberIds:[],
    activeAdminIds:['fake-admin-a','fake-admin-b']
  };
  const anchor:MockEpochAnchor={
    sourceId:'independent-fake-anchor',restoreEpoch:18,revision:12,
    authorityHash:await bkpI1AuthorityHash(authority),observedAtMs:now-1000
  };
  const fake:FakeState={a:[authority,authority],z:[anchor,anchor],ai:0,zi:0};
  const input:BkpI1Input={
    requestId:'fake-restore-request',existingRestore:restore,
    authorityReader:{read:async()=>fake.a[fake.ai++]??null},
    anchorReader:{read:async()=>fake.z[fake.zi++]??null},
    approvals:['fake-admin-a','fake-admin-b'].map(reviewerId=>({
      reviewerId,requestId:'fake-restore-request',backupId:'delta',
      manifestHash:trustedManifestHashes.delta,authorityEpoch:18,
      decision:'approve' as const,approvedAtMs:now-100
    })),
    memberIdsByTrack:{'current-track':['fake-member-1'],
      'old-track':['fake-member-legacy']},
    nowMs:now,evidenceMaxAgeMs:5000,approvalMaxAgeMs:5000,retentionDays:7
  };
  return {input,fake,files,authority,anchor,current,full,delta};
}
async function gateChange(change:(f:Fixture)=>void|Promise<void>){
  const f=await make();await change(f);
  return bkpI1SimulateRestore(f.input);
}
async function denied(reason:string,change:(f:Fixture)=>void|Promise<void>){
  const r=await gateChange(change);
  assert.equal(r.simulatedEligible,false,JSON.stringify(r));
  assert.equal(r.productionRestoreAuthorized,false);
  assert.equal(r.sideEffects,0);
  assert.ok(r.reasons.includes(reason),JSON.stringify(r.reasons));
}
async function withAuthority(f:Fixture,changes:Partial<MockAuthorityEvidence>,
  target:'both'|'last'='both'){
  const updated={...f.authority,...changes};
  const anchored:MockEpochAnchor={...f.anchor,restoreEpoch:updated.restoreEpoch,
    revision:updated.revision,authorityHash:await bkpI1AuthorityHash(updated)};
  if(target==='both'){f.fake.a=[updated,updated];f.fake.z=[anchored,anchored]}
  else{f.fake.a=[f.authority,updated];f.fake.z=[f.anchor,anchored]}
}
test('BKP-I1 remains OFF, no production authorization',async()=>{
  assert.equal(BKP_I1_RUNTIME_ENABLED,false);
  const r=await gateChange(()=>{});
  assert.equal(r.simulatedEligible,true,JSON.stringify(r));
  assert.equal(r.productionRestoreAuthorized,false);
  assert.equal(r.sideEffects,0);
  assert.deepEqual(r.lastGoodChain,['full','delta']);
  assert.equal(r.simulatedApprovals,2);
});
test('two different, currently valid simulated admins required',async()=>{
  await denied('two_approvers_required',f=>{
    f.input={...f.input,approvals:f.input.approvals.slice(0,1)};
  });
});
test('same admin twice does not count as two people',async()=>{
  await denied('reviewer_not_distinct',f=>{
    f.input={...f.input,approvals:[f.input.approvals[0],f.input.approvals[0]]};
  });
});
test('inactive admin cannot approve',async()=>{
  await denied('reviewer_not_current_superadmin',f=>{
    f.input={...f.input,approvals:[{...f.input.approvals[0],reviewerId:'ex-admin'},f.input.approvals[1]]};
  });
});
test('explicit denied decision vetoes restore',async()=>{
  await denied('approval_denied',f=>{
    f.input={...f.input,approvals:[{...f.input.approvals[0],decision:'deny'},f.input.approvals[1]]};
  });
});
test('approval request id must be bound to this operation',async()=>{
  await denied('approval_binding_mismatch',f=>{
    f.input={...f.input,approvals:[{...f.input.approvals[0],requestId:'replayed-request'},
      f.input.approvals[1]]};
  });
});
test('approval must bind to current immutable manifest checksum',async()=>{
  await denied('approval_binding_mismatch',f=>{
    f.input={...f.input,approvals:[{...f.input.approvals[0],manifestHash:'f'.repeat(64)},
      f.input.approvals[1]]};
  });
});
test('approval for a previous restore epoch cannot be replayed',async()=>{
  await denied('approval_binding_mismatch',f=>{
    f.input={...f.input,approvals:[{...f.input.approvals[0],authorityEpoch:17},
      f.input.approvals[1]]};
  });
});
test('stale approval rejected',async()=>{
  await denied('approval_stale_or_future',f=>{
    f.input={...f.input,approvals:[{...f.input.approvals[0],approvedAtMs:now-9000},
      f.input.approvals[1]]};
  });
});
test('no authority evidence rejects rather than using old D1 rights',async()=>{
  await denied('authority_unavailable',f=>{f.fake.a=[null,null]});
});
test('authority lost between reads fails closed',async()=>{
  await denied('authority_unavailable',f=>{f.fake.a=[f.authority,null]});
});
test('independent anchor not found denies',async()=>{
  await denied('authority_unavailable',f=>{f.fake.z=[null,null]});
});
test('anchor disappeared during review denies',async()=>{
  await denied('authority_unavailable',f=>{f.fake.z=[f.anchor,null]});
});
test('same source falsely claiming independence is rejected',async()=>{
  await denied('authority_not_independent',f=>{
    const same={...f.anchor,sourceId:f.authority.sourceId};
    f.fake.z=[same,same];
  });
});
test('anchor hash tamper rejects even when epoch is numeric',async()=>{
  await denied('epoch_anchor_hash_mismatch',f=>{
    const bad={...f.anchor,authorityHash:'0'.repeat(64)};
    f.fake.z=[bad,bad];
  });
});
test('authority and separate anchor have different epoch, reject',async()=>{
  await denied('epoch_anchor_mismatch',f=>{
    f.fake.z=[{...f.anchor,restoreEpoch:20},{...f.anchor,restoreEpoch:20}];
  });
});
test('stale authority timestamps reject',async()=>{
  await denied('authority_stale_or_future',async f=>{await withAuthority(f,{observedAtMs:now-10000})});
});
test('authority shows epoch older than snapshot, reject',async()=>{
  await denied('bkp_s1:restore_epoch_not_advanced',async f=>{await withAuthority(f,{restoreEpoch:17})});
});
test('epoch rollbacks during review are detected',async()=>{
  await denied('epoch_rolled_back',async f=>{await withAuthority(f,{restoreEpoch:17,revision:11},'last')});
});
test('rights changed while reviewers examined old evidence, reject',async()=>{
  await denied('authority_changed_during_review',async f=>{
    await withAuthority(f,{revokedTrackIds:['old-track']},'last');
  });
});
test('backup old and current deletion watermark higher => reject',async()=>{
  await denied('bkp_s1:snapshot_outdated_authority',async f=>{
    await withAuthority(f,{deletionWatermark:12});
  });
});
test('authority deletion watermark older than backup => reject',async()=>{
  await denied('bkp_s1:authority_watermark_older',async f=>{
    await withAuthority(f,{deletionWatermark:10});
  });
});
test('currently deleted active track blocks old backup restoration',async()=>{
  await denied('restored_track_deleted_or_revoked',async f=>{
    await withAuthority(f,{deletedTrackIds:['current-track']});
  });
});
test('historical-only track revoked now blocks recovery, not just active track',async()=>{
  await denied('restored_track_deleted_or_revoked',async f=>{
    await withAuthority(f,{revokedTrackIds:['old-track']});
  });
});
test('revoked member whose content is in approved history blocks restore',async()=>{
  await denied('member_rights_revoked',async f=>{
    await withAuthority(f,{blockedMemberIds:['fake-member-legacy']});
  });
});
test('member-track mapping unknown fails closed',async()=>{
  await denied('member_mapping_missing',f=>{
    f.input={...f.input,memberIdsByTrack:{'current-track':['fake-member-1']}};
  });
});
test('fake 2000 member records with one revoked account still reject',async()=>{
  await denied('member_rights_revoked',async f=>{
    const memberIds=Array.from({length:2000},(_,i)=>`fake-member-${i}`);
    f.input={...f.input,memberIdsByTrack:{
      'current-track':memberIds,'old-track':['fake-member-legacy']}};
    await withAuthority(f,{blockedMemberIds:['fake-member-1999']});
  });
});
test('old backup missing its full base is not lastGood-restorable',async()=>{
  await denied('retention_topology_untrusted',f=>{
    f.input={...f.input,existingRestore:{
      ...f.input.existingRestore,manifests:[f.delta]}};
  });
});
test('missing ancestor approved historical R2 object is rejected',async()=>{
  await denied('bkp_s1:object_not_found',f=>{
    f.files.delete('FAKE/legacy/vtt');
  });
});
test('modified ancestor R2 bytes rejected even if manifest is valid',async()=>{
  await denied('bkp_s1:object_hash_mismatch',f=>{
    f.files.set('FAKE/legacy/json','{"malicious":true}');
  });
});
test('lastGood pointer changed prevents recovery',async()=>{
  await denied('bkp_s1:not_last_verified_good',f=>{
    f.input={...f.input,existingRestore:{
      ...f.input.existingRestore,lastGoodId:'full'}};
  });
});
test('D1 published pointer inconsistent with run is a hard denial',async()=>{
  await denied('bkp_s1:d1_publication_inconsistent',f=>{
    f.input={...f.input,existingRestore:{
      ...f.input.existingRestore,snapshot:{
        ...f.input.existingRestore.snapshot,d1PublicationConsistent:false}}};
  });
});
test('full/delta manifest tamper denies even when R2 exists',async()=>{
  await denied('review_manifest_hash_mismatch',f=>{
    const changed={...f.delta,entitlementWatermark:9};
    f.input={...f.input,existingRestore:{
      ...f.input.existingRestore,manifests:[f.full,changed]}};
  });
});
test('7/30/90 day retention only proposes manual expiry; never deletes lastGood parent',async()=>{
  const f=await make();
  const unrelated:BackupManifest={...f.full,id:'old-unrelated',baseId:'old-unrelated',
    createdAt:now-45*day};
  const request={...f.input.existingRestore,manifests:[...f.input.existingRestore.manifests,unrelated]};
  for(const [days,expired] of [[7,true],[30,true],[90,false]] as const){
    f.fake.ai=0;f.fake.zi=0;
    const decision=await bkpI1SimulateRestore({
      ...f.input,existingRestore:request,retentionDays:days});
    assert.equal(decision.simulatedEligible,true,JSON.stringify(decision.reasons));
    assert.equal(decision.productionRestoreAuthorized,false);
    assert.ok(decision.retention.keepIds.includes('full'));
    assert.ok(decision.retention.keepIds.includes('delta'));
    assert.equal(decision.retention.candidates.some(c=>c.id==='old-unrelated'),expired);
    assert.ok(decision.retention.candidates.every(c=>c.requiresHumanApproval));
    assert.equal(decision.sideEffects,0);
  }
});
test('7/30/90 all reject incomplete orphan topology, not silently prune',async()=>{
  const f=await make();
  const orphan:BackupManifest={...f.delta,id:'orphan',
    parentId:'missing-base',baseId:'missing-base',createdAt:now-50*day};
  const r={...f.input.existingRestore,manifests:[...f.input.existingRestore.manifests,orphan]};
  for(const days of [7,30,90] as const){
    f.fake.ai=0;f.fake.zi=0;
    const decision=await bkpI1SimulateRestore({...f.input,existingRestore:r,retentionDays:days});
    assert.equal(decision.simulatedEligible,false);
    assert.ok(decision.reasons.includes('retention_topology_untrusted'));
    assert.equal(decision.retention.blocked,true);
    assert.deepEqual(decision.retention.candidates,[]);
  }
});
test('unknown approval expiry policy never authorizes a restore',async()=>{
  await denied('invalid_review_request',f=>{f.input={...f.input,approvalMaxAgeMs:0}});
});
