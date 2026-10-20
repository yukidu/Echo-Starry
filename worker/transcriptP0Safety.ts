/* Gate2 P0 candidate safety. Only used when TRANSCRIPT_P0_ENABLED=1 AFTER a
 * separately approved migration. Existing published transcript_index.r2Key
 * remains the sole active pointer. This file never applies migrations. */
export type SafeIntent = 'first'|'relisten';
export type SafeRun = {
  runId:string;trackId:string;intent:SafeIntent;requestKey:string;state:string;
  generation:number;sourceAudioKey:string;sourceAudioUrl:string;sourceAudioEtag:string;expectedActiveR2Key:string|null;
  approvedBy:string|null;approvedAt:number|null;approvedMaxSeconds:number;
  candidateVersionId:string|null;
};
type Db = { prepare(sql:string):any; batch?(statements:any[]):Promise<any[]> };
export type SafeEnv = { DB:Db; R2_BUCKET:any; P0_AUTHORITY?:{
  verifyPublication(input:{
    trackId:string;runId:string;actorId:string|null;sourceAudioEtag:string;
    intendedActiveKey:string|null
  }):Promise<{allowed:boolean;epoch:string;permissionRevision:string;correctionRevision:string}>
} };
const OPEN_STATES = "('pending','queued','processing','awaiting_review')";
export const gate2Enabled=(env:any)=>String(env?.TRANSCRIPT_P0_ENABLED||'')==='1';

function fail(message:string):never {throw new Error('Gate2 safe transcript: '+message);}
export async function sourceRevision(r2:any,key:string):Promise<string>{
  if(!r2 || typeof r2.head!=='function')fail('R2 source revision verifier unavailable');
  const obj=await r2.head(key);
  const etag=String(obj?.etag||'').trim();
  if(!etag || !Number.isFinite(Number(obj?.size)) || Number(obj.size)<1)
    fail('source missing, empty or unversioned');
  return etag+':'+String(obj.size);
}
export async function assertSourceRevision(env:SafeEnv,run:SafeRun){
  const current=await sourceRevision(env.R2_BUCKET,run.sourceAudioKey);
  if(current!==run.sourceAudioEtag)fail('audio content revision changed; candidate rejected');
}
export async function requestSafeRun(db:Db,input:{
  trackId:string;intent:SafeIntent;requestKey:string;sourceAudioKey:string;sourceAudioUrl:string;sourceAudioEtag:string;
  approvedBy?:string;approvedMaxSeconds?:number
}):Promise<SafeRun|null>{
  if(!input.sourceAudioEtag || !input.requestKey || !input.sourceAudioUrl) fail('unversioned candidate request');
  const now=Date.now(),id=crypto.randomUUID();
  const row=await db.prepare(
    "INSERT INTO transcript_runs(runId,trackId,intent,requestKey,state,generation,leaseUntil,"+
    "sourceAudioKey,sourceAudioUrl,sourceAudioEtag,expectedActiveR2Key,approvedBy,approvedAt,approvedMaxSeconds,createdAt,updatedAt) "+
    "SELECT ?,i.trackId,?,?,'pending',0,0,?,?,?,i.r2Key,?,?,?, ?,? "+
    "FROM transcript_index i WHERE i.trackId=? "+
    "AND ((?='first' AND i.status='pending' AND i.r2Key IS NULL) "+
    "OR (?='relisten' AND i.status='ready' AND i.r2Key IS NOT NULL AND ? IS NOT NULL)) "+
    "AND NOT EXISTS(SELECT 1 FROM transcript_runs r WHERE r.trackId=i.trackId AND r.state IN "+OPEN_STATES+") "+
    "ON CONFLICT DO NOTHING RETURNING *")
    .bind(id,input.intent,input.requestKey,input.sourceAudioKey,input.sourceAudioUrl,input.sourceAudioEtag,
      input.approvedBy||null,input.approvedBy?now:null,
      Number(input.approvedMaxSeconds||0),now,now,
      input.trackId,input.intent,input.intent,input.approvedBy||null).first();
  if(row)return row as SafeRun;
  // A repeated, previously approved request must never create a second paid run.
  const existing=await db.prepare('SELECT * FROM transcript_runs WHERE requestKey=? LIMIT 1')
    .bind(input.requestKey).first();
  if(!existing)return null;
  const prev=existing as SafeRun;
  // One HTTP approval nonce represents exactly one actor, audio version and track.
  if(prev.trackId!==input.trackId || prev.intent!==input.intent ||
     prev.sourceAudioEtag!==input.sourceAudioEtag ||
     String(prev.approvedBy||'')!==String(input.approvedBy||''))fail('request key reused across approvals');
  return prev;
}
export async function claimSafeRun(db:Db,runId:string,trackId:string):Promise<SafeRun>{
  const now=Date.now();
  const row=await db.prepare(
    "UPDATE transcript_runs SET state='processing',generation=generation+1,leaseUntil=?,updatedAt=? "+
    "WHERE runId=? AND trackId=? AND state='queued' AND EXISTS("+
    "SELECT 1 FROM transcript_index i JOIN tracks t ON t.id=i.trackId "+
    "WHERE i.trackId=transcript_runs.trackId "+
    "AND t.audioUrl=transcript_runs.sourceAudioUrl "+
    "AND ((transcript_runs.intent='first' AND i.status='queued' AND i.r2Key IS NULL) "+
    "OR (transcript_runs.intent='relisten' AND i.status='ready' "+
    "AND i.r2Key=transcript_runs.expectedActiveR2Key))) RETURNING *")
    .bind(now+15*60_000,now,runId,trackId).first();
  if(!row)fail('run not queued, source changed, or already completed');
  const run=row as SafeRun;
  if(run.intent==='first'){
    const owned=await db.prepare(
      "UPDATE transcript_index SET status='processing',workingRunId=?,updatedAt=? "+
      "WHERE trackId=? AND status='queued' AND r2Key IS NULL "+
      "AND workingRunId IS NULL RETURNING trackId")
      .bind(runId,now,trackId).first();
    if(!owned){
      await db.prepare("UPDATE transcript_runs SET state='failed',error='claim_lost',updatedAt=? "+
        "WHERE runId=? AND generation=? AND state='processing'")
        .bind(Date.now(),runId,run.generation).run();
      fail('initial transcript ownership lost');
    }
  }
  return run;
}
export async function assertLiveRun(db:Db,run:SafeRun):Promise<void>{
  const live=await db.prepare(
    "SELECT r.runId,r.leaseUntil FROM transcript_runs r JOIN transcript_index i ON i.trackId=r.trackId "+
    "JOIN tracks t ON t.id=r.trackId "+
    "WHERE r.runId=? AND r.generation=? AND r.state='processing' AND r.leaseUntil>? "+
    "AND t.audioUrl=r.sourceAudioUrl "+
    "AND ((r.intent='first' AND i.workingRunId=r.runId AND i.r2Key IS NULL) "+
    "OR (r.intent='relisten' AND i.status='ready' "+
    "AND i.r2Key=r.expectedActiveR2Key)) LIMIT 1")
    .bind(run.runId,run.generation,Date.now()).first();
  if(!live)fail('lease lost, source changed, or active transcript protected');
  if(Number(live.leaseUntil||0)<Date.now()+5*60_000){
    const renewed=await db.prepare("UPDATE transcript_runs SET leaseUntil=?,updatedAt=? "+
      "WHERE runId=? AND generation=? AND state='processing' AND leaseUntil>? RETURNING runId")
      .bind(Date.now()+15*60_000,Date.now(),run.runId,run.generation,Date.now()).first();
    if(!renewed)fail('lease expired while renewing');
  }
}
export async function failSafeRun(db:Db,run:SafeRun|null,error:unknown){
  if(!run)return;
  const message=error instanceof Error?error.message:String(error);
  const now=Date.now();
  const updated=await db.prepare(
    "UPDATE transcript_runs SET state='failed',error=?,updatedAt=? "+
    "WHERE runId=? AND generation=? AND state IN ('queued','processing') RETURNING runId")
    .bind(message.slice(0,300),now,run.runId,run.generation).first();
  if(updated&&run.intent==='first'){
    await db.prepare("UPDATE transcript_index SET status='failed',workingRunId=NULL,error=?,updatedAt=? "+
      "WHERE trackId=? AND workingRunId=? AND r2Key IS NULL AND status='processing'")
      .bind(message.slice(0,300),now,run.trackId,run.runId).run();
  }
}
export async function sha256(value:string):Promise<string>{
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function stageSafeVersion(env:SafeEnv,run:SafeRun,items:{
  json:string;txt:string;vtt:string;raw:string;language:string
}){
  await assertLiveRun(env.DB,run);
  const base='transcripts/'+encodeURIComponent(run.trackId)+'/versions/'+encodeURIComponent(run.runId);
  const objects=[
    {type:'json',key:base+'/transcript.json',value:items.json},
    {type:'txt',key:base+'/transcript.txt',value:items.txt},
    {type:'vtt',key:base+'/transcript.vtt',value:items.vtt},
    {type:'raw',key:base+'/raw-whisper.json',value:items.raw}
  ];
  const checks=[];
  for(const obj of objects)checks.push({name:obj.type,key:obj.key,sha256:await sha256(obj.value)});
  const manifest=JSON.stringify({version:1,trackId:run.trackId,runId:run.runId,
    sourceAudioKey:run.sourceAudioKey,language:items.language,checks});
  const manifestKey=base+'/manifest.json';
  // No old/active R2 key is ever written. A failed candidate is not published.
  for(const obj of objects){
    await assertLiveRun(env.DB,run);
    await env.R2_BUCKET.put(obj.key,obj.value);
  }
  await env.R2_BUCKET.put(manifestKey,manifest);
  // Verify every artifact, not just the manifest metadata.
  for(const obj of objects){
    const stored=await env.R2_BUCKET.get(obj.key);
    if(!stored || await sha256(await stored.text())!==await sha256(obj.value))
      fail('candidate R2 checksum mismatch');
  }
  const checksum=await sha256(manifest);
  await env.DB.prepare(
    'INSERT INTO transcript_versions(versionId,trackId,runId,jsonKey,txtKey,vttKey,rawKey,manifestKey,checksum,sourceAudioKey,createdAt) '+
    'VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING')
    .bind(run.runId,run.trackId,run.runId,objects[0].key,objects[1].key,
      objects[2].key,objects[3].key,manifestKey,checksum,run.sourceAudioKey,Date.now()).run();
  const changed=await env.DB.prepare(
    "UPDATE transcript_runs SET state='awaiting_review',candidateVersionId=?,updatedAt=? "+
    "WHERE runId=? AND generation=? AND state='processing' RETURNING runId")
    .bind(run.runId,Date.now(),run.runId,run.generation).first();
  if(!changed)fail('candidate lost ownership before review');
  return {jsonKey:objects[0].key,txtKey:objects[1].key,vttKey:objects[2].key,manifestKey,checksum};
}
export async function publishSafeVersion(db:Db,runId:string,approvedBy:string|null){
  const run=await db.prepare("SELECT * FROM transcript_runs WHERE runId=? AND state='awaiting_review' LIMIT 1")
    .bind(runId).first() as SafeRun|null;
  if(!run)fail('candidate not awaiting review');
  if(run.intent==='relisten'){
    if(!approvedBy)fail('manual second approval required');
    // Cross-version corrections require explicit segment-by-segment review.
    const legacy=await db.prepare('SELECT id FROM transcript_corrections WHERE trackId=? LIMIT 1')
      .bind(run.trackId).first();
    const moderated=await db.prepare('SELECT id FROM transcript_correction_events WHERE trackId=? LIMIT 1')
      .bind(run.trackId).first();
    if(legacy||moderated)fail('manual correction version mapping not yet approved');
  }
  const version=await db.prepare('SELECT * FROM transcript_versions WHERE runId=? LIMIT 1')
    .bind(runId).first() as any;
  if(!version||!version.jsonKey||!version.checksum)fail('missing verified candidate');
  const now=Date.now();
  // Sole public pointer. The AND checks enforce compare-and-swap.
  const query=run.intent==='first'
    ? "UPDATE transcript_index SET status='ready',r2Key=?,activeVersionId=?,workingRunId=NULL,error=NULL,updatedAt=? "+
      "WHERE trackId=? AND status='processing' AND workingRunId=? AND r2Key IS NULL "+
      "AND EXISTS(SELECT 1 FROM transcript_runs r JOIN tracks t ON t.id=r.trackId WHERE r.runId=? AND r.state='awaiting_review' AND t.audioUrl=r.sourceAudioUrl) RETURNING trackId"
    : "UPDATE transcript_index SET status='ready',r2Key=?,activeVersionId=?,error=NULL,updatedAt=? "+
      "WHERE trackId=? AND status='ready' AND r2Key=? "+
      "AND EXISTS(SELECT 1 FROM transcript_runs r JOIN tracks t ON t.id=r.trackId WHERE r.runId=? AND r.state='awaiting_review' AND t.audioUrl=r.sourceAudioUrl) RETURNING trackId";
  const swapped=await db.prepare(query)
    .bind(version.jsonKey,run.runId,now,run.trackId,
      run.intent==='first'?runId:run.expectedActiveR2Key,runId).first();
  if(!swapped)fail('active pointer changed; preserving prior transcript');
  await db.prepare("UPDATE transcript_runs SET state='published',updatedAt=? "+
    "WHERE runId=? AND state='awaiting_review'").bind(now,runId).run();
  return {published:true,r2Key:version.jsonKey};
}
