/** BKP-S1: offline, read-only preflight. No API, credentials, scheduler, DB mutations, or restore. */
export const BKP_S1_RUNTIME_ENABLED = false as const;

export type ObjectFormat = 'json' | 'txt' | 'vtt' | 'raw';
export type BackupState = 'verified-success' | 'failed' | 'partial';
export type BackupMode = 'full' | 'delta';
export type BackupObject = Readonly<{
  key: string; sha256: string; bytes: number; format: ObjectFormat;
}>;
export type TranscriptVersion = Readonly<{
  id: string; trackId: string; status: 'published' | 'approved-history' | 'awaiting_review' | 'failed';
  active: boolean; sourceAudioKey: string; sourceAudioRevision: string;
  rawOrigin: 'provider-original' | 'pre-normalization-processed' | 'legacy-unavailable';
  legacyMissingRaw: boolean; segmentCount: number; timecodeHash: string;
  objects: readonly BackupObject[];
}>;
export type BackupManifest = Readonly<{
  id: string; mode: BackupMode; state: BackupState;
  parentId: string | null; baseId: string; createdAt: number;
  restoreEpoch: number; deletionWatermark: number; revocationWatermark: number;
  correctionWatermark: number; entitlementWatermark: number;
  versions: readonly TranscriptVersion[];
}>;
export type SnapshotState = Readonly<{
  activeByTrack: Readonly<Record<string, string>>;
  publishedVersionIds: readonly string[]; approvedHistoryIds: readonly string[];
  correctionEventIds: readonly string[]; unlockIds: readonly string[];
  rewardUniqueKeys: readonly string[]; revokedRewardKeys: readonly string[];
  deletedTrackIds: readonly string[];
  correctionWatermark: number; entitlementWatermark: number;
  deletionWatermark: number; revocationWatermark: number;
  /** Staged state; true only if the caller has separately proven all D1 state changes match. */
  d1PublicationConsistent: boolean;
}>;
export type RestoreAuthority = Readonly<{
  available: boolean; independentlyStored: boolean; active: boolean;
  epoch: number; deletionWatermark: number; revocationWatermark: number;
  currentRevokedTrackIds: readonly string[]; currentDeletedTrackIds: readonly string[];
}>;
export type ObjectReader = Readonly<{
  /** TEST INJECTION ONLY; caller must not pass production R2 bindings under S76. */
  read(key: string): Promise<string | null>;
}>;
export type RestoreRequest = Readonly<{
  backupId: string; lastGoodId: string; manifests: readonly BackupManifest[]; snapshot: SnapshotState;
  authority: RestoreAuthority | null; objectReader: ObjectReader;
  /** Trusted digest ledger supplied by a separately verified, never-rolled-back source. */
  trustedManifestHashes: Readonly<Record<string, string>>;
  searchLocked: boolean; publicationLocked: boolean; stagingOnly: boolean;
}>;
export type PreflightResult = Readonly<{
  eligible: boolean; reasons: readonly string[]; chain: readonly string[];
  legacyMissingRawIds: readonly string[];
  /** Important: only a preflight decision. No objects are copied and no active data are changed. */
  sideEffects: 0;
}>;

const validSha = (s: string) => /^[a-f0-9]{64}$/.test(s);
const unique = (s: readonly string[]) => new Set(s).size === s.length;
const isInt = (n: number) => Number.isSafeInteger(n) && n >= 0;
const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

export async function bkpS1Sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hashed = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashed), x => x.toString(16).padStart(2, '0')).join('');
}

/** Same deterministic timecode encoding when writing a manifest and when reviewing it. */
export function bkpS1TimecodePayload(segments: readonly { id: string; start: number; end: number }[]): string {
  return JSON.stringify(segments.map(s => [s.id, s.start, s.end]));
}
const stamp = (seconds: number) => {
  const total = Math.round(seconds * 1000);
  const h = Math.floor(total / 3600000), m = Math.floor(total % 3600000 / 60000);
  const s = Math.floor(total % 60000 / 1000), ms = total % 1000;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
};
function checkTexts(json: string, txt: string, vtt: string): { segments: { id:string; text:string;start:number;end:number }[] } {
  const parsed = JSON.parse(json) as { segments?: unknown };
  if (!Array.isArray(parsed.segments) || !parsed.segments.length) throw Error('segments_missing');
  const segments = parsed.segments as { id:string; text:string;start:number;end:number }[];
  if (segments.some(s => typeof s.id !== 'string' || !s.id || typeof s.text !== 'string' ||
    !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end <= s.start) ||
    !unique(segments.map(s=>s.id))) throw Error('segments_invalid');
  if (txt !== segments.map(s=>s.text).join('\n')) throw Error('txt_mismatch');
  const expectedVtt = 'WEBVTT\n\n' + segments.map((s,i)=>
    `${i+1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${s.text}\n`).join('\n');
  if (vtt.replace(/\r/g,'').trim() !== expectedVtt.trim()) throw Error('vtt_mismatch');
  return { segments };
}
function chainFor(manifests: readonly BackupManifest[], wantedId:string): {chain: BackupManifest[];errors:string[]} {
  const errors:string[]=[]; const byId = new Map<string,BackupManifest>();
  for(const m of manifests){if(byId.has(m.id))errors.push('duplicate_backup_id'); byId.set(m.id,m)}
  const result:BackupManifest[]=[];const visited=new Set<string>();let next:string|null=wantedId;
  while(next){
    if(visited.has(next)){errors.push('chain_cycle');break} visited.add(next);
    const m=byId.get(next);if(!m){errors.push('chain_missing_parent');break}
    result.push(m);next=m.parentId;
    if(result.length>manifests.length){errors.push('chain_invalid');break}
  }
  result.reverse();
  if(!result.length||result[0].mode!=='full'||result[0].parentId!==null)
    errors.push('chain_missing_full_base');
  const first=result[0];
  for(let i=0;i<result.length;i++){
    const m=result[i];
    if(m.state!=='verified-success')errors.push('chain_unverified');
    if(!first||m.baseId!==first.id||(i>0&&(m.mode!=='delta'||m.parentId!==result[i-1].id||m.createdAt<result[i-1].createdAt)))
      errors.push('chain_inconsistent');
  }
  return {chain:result,errors};
}

/** Refuse to certify an incomplete, revoked, outdated, or logically inconsistent restore point. */
export async function bkpS1Preflight(r:RestoreRequest):Promise<PreflightResult>{
  const errors=new Set<string>();const legacyIds:string[]=[];
  const add=(code:string)=>errors.add(code);
  if(r.lastGoodId!==r.backupId)add('not_last_verified_good');
  const {chain,errors:chainErrors}=chainFor(r.manifests,r.backupId);
  chainErrors.forEach(add);
  for(const manifest of chain){
    const expected=r.trustedManifestHashes[manifest.id];
    if(!expected||!validSha(expected)||await bkpS1Sha256(JSON.stringify(manifest))!==expected)
      add('manifest_chain_hash_mismatch');
  }
  const leaf=chain.at(-1);
  if(!leaf||leaf.id!==r.backupId)add('backup_not_found');
  if(!r.searchLocked||!r.publicationLocked||!r.stagingOnly)add('restore_not_isolated');
  const auth=r.authority;
  if(!auth||!auth.available||!auth.independentlyStored||!auth.active)add('authority_unavailable');
  if(leaf&&auth){
    if(!isInt(auth.epoch)||auth.epoch<=leaf.restoreEpoch)add('restore_epoch_not_advanced');
    if(auth.deletionWatermark>leaf.deletionWatermark||auth.revocationWatermark>leaf.revocationWatermark)
      add('snapshot_outdated_authority');
  }
  const snap=r.snapshot;
  if(!snap.d1PublicationConsistent)add('d1_publication_inconsistent');
  if(!unique(snap.rewardUniqueKeys)||!unique(snap.unlockIds)||!unique(snap.correctionEventIds))
    add('duplicate_entitlement');
  for(const key of snap.revokedRewardKeys)if(!snap.rewardUniqueKeys.includes(key))add('invalid_reward_revocation');
  if(leaf){
    if([leaf.restoreEpoch,leaf.deletionWatermark,leaf.revocationWatermark,leaf.correctionWatermark,leaf.entitlementWatermark]
      .some(n=>!isInt(n)))add('invalid_watermark');
    if(snap.deletionWatermark!==leaf.deletionWatermark||snap.revocationWatermark!==leaf.revocationWatermark||
      snap.correctionWatermark!==leaf.correctionWatermark||snap.entitlementWatermark!==leaf.entitlementWatermark)
      add('watermark_mismatch');
    const versions=new Map<string,TranscriptVersion>();
    for(const v of leaf.versions){
      if(versions.has(v.id))add('duplicate_version'); versions.set(v.id,v);
    }
    for(const [track,versionId] of Object.entries(snap.activeByTrack)){
      const v=versions.get(versionId);
      if(!v||v.trackId!==track||v.status!=='published'||!v.active||!snap.publishedVersionIds.includes(versionId))
        add('active_pointer_not_published');
      if(snap.deletedTrackIds.includes(track)||auth?.currentDeletedTrackIds.includes(track)||auth?.currentRevokedTrackIds.includes(track))
        add('active_track_deleted_or_revoked');
    }
    for(const versionId of [...snap.publishedVersionIds,...snap.approvedHistoryIds]){
      const v=versions.get(versionId);
      if(!v || (snap.publishedVersionIds.includes(versionId) && v.status!=='published') ||
        (snap.approvedHistoryIds.includes(versionId) && v.status!=='approved-history')) add('approved_version_missing');
    }
    for(const v of leaf.versions){
      if(v.active && snap.activeByTrack[v.trackId]!==v.id)add('active_version_conflict');
      if(v.active && v.status!=='published')add('candidate_cannot_be_active');
      if(v.status==='awaiting_review'||v.status==='failed')continue; // excluded from public restore
      if(v.rawOrigin==='legacy-unavailable' && v.legacyMissingRaw)legacyIds.push(v.id);
      if(!v.sourceAudioKey||!v.sourceAudioRevision||!isInt(v.segmentCount)||!validSha(v.timecodeHash))
        add('invalid_version_metadata');
      const objects=new Map<ObjectFormat,BackupObject>();
      for(const obj of v.objects){
        if(objects.has(obj.format))add('duplicate_object_format');
        objects.set(obj.format,obj);
      }
      const required:ObjectFormat[]=['json','txt','vtt'];
      if(!v.legacyMissingRaw)required.push('raw');
      if(v.legacyMissingRaw && (v.status!=='approved-history'||v.rawOrigin!=='legacy-unavailable'))
        add('invalid_legacy_raw_exception');
      for(const kind of required)if(!objects.has(kind))add('required_object_missing');
      const contents=new Map<ObjectFormat,string>();
      for(const obj of v.objects){
        if(!obj.key||!validSha(obj.sha256)||!isInt(obj.bytes)){add('invalid_object_metadata');continue}
        try{
          const body=await r.objectReader.read(obj.key);
          if(body===null){add('object_not_found');continue}
          if(utf8Bytes(body)!==obj.bytes||await bkpS1Sha256(body)!==obj.sha256){add('object_hash_mismatch');continue}
          contents.set(obj.format,body);
        }catch{add('object_read_failed')}
      }
      const raw=contents.get('raw');
      if(raw!==undefined){try{const parsed=JSON.parse(raw);if(!Array.isArray(parsed?.segments))add('raw_segments_invalid')}catch{add('raw_segments_invalid')}}
      const j=contents.get('json'),t=contents.get('txt'),w=contents.get('vtt');
      if(j!==undefined&&t!==undefined&&w!==undefined){
        try{
          const {segments}=checkTexts(j,t,w);
          if(v.segmentCount!==segments.length)add('segment_count_mismatch');
          if(await bkpS1Sha256(bkpS1TimecodePayload(segments))!==v.timecodeHash)add('timecode_hash_mismatch');
        }catch{add('transcript_format_inconsistent')}
      }
    }
  }
  return {eligible:errors.size===0,reasons:[...errors].sort(),chain:chain.map(m=>m.id),
    legacyMissingRawIds:legacyIds,sideEffects:0};
}

export type RetentionCandidate = Readonly<{id:string; reason:'expired-unreferenced'; requiresHumanApproval:true}>;
export type RetentionPlan = Readonly<{ keepIds: readonly string[]; candidates:readonly RetentionCandidate[]; blocked: boolean }>;
/** A plan, never a deletion; conservatively retain any unknown/unverified ancestry. */
export function bkpS1PlanRetention(input:{manifests:readonly BackupManifest[];lastGoodId:string|null;
  retentionDays:7|30|90;now:number}):RetentionPlan{
  const keep=new Set<string>();let blocked=false;
  const lookup=new Map(input.manifests.map(m=>[m.id,m]));
  if(!isInt(input.now)||![7,30,90].includes(input.retentionDays))blocked=true;
  if(!input.lastGoodId||!lookup.has(input.lastGoodId))blocked=true;
  for(const m of input.manifests){
    if(m.state!=='verified-success'||!isInt(m.createdAt)||m.createdAt>input.now) {keep.add(m.id);blocked=true}
    else if(input.now-m.createdAt<=input.retentionDays*86400000)keep.add(m.id);
  }
  if(input.lastGoodId)keep.add(input.lastGoodId);
  // Keep every dependency of every kept backup; unknown dependencies must block deletion.
  for(const id of [...keep]){
    let cursor:string|null=id;const seen=new Set<string>();
    while(cursor){
      if(seen.has(cursor)){blocked=true;break}seen.add(cursor);keep.add(cursor);
      const current=lookup.get(cursor);if(!current){blocked=true;break}
      cursor=current.parentId;
    }
  }
  if(blocked)return {keepIds:[...new Set([...keep,...input.manifests.map(x=>x.id)])].sort(),candidates:[],blocked:true};
  return {keepIds:[...keep].sort(),candidates:input.manifests.filter(m=>!keep.has(m.id))
    .map(m=>({id:m.id,reason:'expired-unreferenced' as const,requiresHumanApproval:true as const})),blocked:false};
}
