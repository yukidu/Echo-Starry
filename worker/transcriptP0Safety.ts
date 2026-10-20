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
export async function failUnclaimedRun(db:Db,runId:string,trackId:string,error:unknown){
  // A Workflow may fail before its run can be claimed. Quarantine that queued
  // reservation without creating a new paid job or mutating existing ready.
  const now=Date.now(),message=error instanceof Error?error.message:String(error);
  const result=await db.prepare("UPDATE transcript_runs SET state='failed',error=?,updatedAt=? "+
    "WHERE runId=? AND trackId=? AND state='queued' AND generation=0 RETURNING intent")
    .bind(message.slice(0,300),now,runId,trackId).first();
  if(result?.intent==='first')await db.prepare(
    "UPDATE transcript_index SET status='failed',error=?,updatedAt=? "+
    "WHERE trackId=? AND status='queued' AND r2Key IS NULL AND workingRunId IS NULL")
    .bind('transcript task failed before starting',now,trackId).run();
}
export async function assertUnfundedWhisperBlocked(env:any,run:SafeRun){
  // Until B07 is integrated with a per-segment atomic provider-attempt
  // reservation, a UI confirmation is NOT authorization for billable AI.
  // This intentionally prevents ALL Gate2 Workflow Whisper requests.
  if(!env || !run)fail('cost gate prerequisites missing');
  fail('B07 per-segment hard-budget authority is not integrated; Whisper refused');
}
export async function sha256(value:string):Promise<string>{
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
// P0 output must be internally coherent. Independent file hashes alone are insufficient.
function canonicalSegments(json:string,txt:string,vtt:string){
  const file:any=JSON.parse(json);
  const segments:any[]=file?.segments;
  if(!Array.isArray(segments)||segments.length===0)fail('missing recognized segments');
  const ids=new Set<string>();
  for(const segment of segments){
    if(typeof segment?.id!=='string' || !segment.id || ids.has(segment.id) ||
       typeof segment.text!=='string' ||
       !Number.isFinite(Number(segment.start)) || !Number.isFinite(Number(segment.end)) ||
       Number(segment.start)<0 || Number(segment.end)<=Number(segment.start))
      fail('invalid segment metadata or duplicate segment ID');
    ids.add(segment.id);
  }
  const lines=segments.map(s=>s.text);
  if(txt!==lines.join('\n') || (typeof file.text==='string'&&file.text!==txt))
    fail('JSON/TXT recognized text mismatch');
  const cues=vtt.replace(/\r/g,'').split(/\n\s*\n/).slice(1);
  if(!vtt.startsWith('WEBVTT')||cues.length!==segments.length)fail('VTT cue count mismatch');
  const time=(n:number)=>{
    const ms=Math.max(0,Math.round(n*1000));
    const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),
      sec=Math.floor(ms%60000/1000),rest=ms%1000;
    return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+
      String(sec).padStart(2,'0')+'.'+String(rest).padStart(3,'0');
  };
  for(let i=0;i<cues.length;i++){
    const expected=time(Number(segments[i].start))+' --> '+time(Number(segments[i].end));
    const parts=cues[i].trim().split('\n');
    const stamp=parts[0]===String(i+1)?parts[1]:parts[0];
    const content=parts[0]===String(i+1)?parts.slice(2):parts.slice(1);
    if(stamp!==expected || content.join('\n').trim()!==lines[i].trim())
      fail('JSON/VTT timecodes or recognized text mismatch');
  }
  return {segmentCount:segments.length,timecodeChecksum:JSON.stringify(
    segments.map(s=>[s.id,s.start,s.end]))};
}
async function verifyCandidateObjects(env:SafeEnv,version:any,run:SafeRun){
  if(version.trackId!==run.trackId || version.runId!==run.runId ||
     version.sourceAudioEtag!==run.sourceAudioEtag)fail('candidate version/source mismatch');
  const manifestObj=await env.R2_BUCKET.get(version.manifestKey);
  if(!manifestObj)fail('candidate manifest missing');
  const manifestRaw=await manifestObj.text();
  if(await sha256(manifestRaw)!==version.checksum)fail('candidate manifest checksum mismatch');
  const manifest=JSON.parse(manifestRaw);
  if(manifest?.version!==2 || manifest.versionId!==version.versionId ||
     manifest.trackId!==run.trackId || manifest.runId!==run.runId ||
     manifest.sourceAudioEtag!==run.sourceAudioEtag ||
     !Array.isArray(manifest.checks) || manifest.checks.length!==4)
    fail('candidate manifest identity mismatch');
  const data:Record<string,string>={};
  const expectedKeys:Record<string,string>={
    json:version.jsonKey,txt:version.txtKey,vtt:version.vttKey,raw:version.rawKey
  };
  for(const check of manifest.checks){
    if(typeof check?.name!=='string' || check.key!==expectedKeys[check.name] ||
       check.sha256!==String(check.sha256||'') || Object.hasOwn(data,check.name))
      fail('candidate manifest object mismatch');
    const obj=await env.R2_BUCKET.get(check.key);
    if(!obj)fail('candidate artifact missing');
    const content=await obj.text();
    if(await sha256(content)!==check.sha256)fail('candidate artifact corrupted');
    data[check.name]=content;
  }
  if(Object.keys(data).length!==4)fail('candidate incomplete');
  canonicalSegments(data.json,data.txt,data.vtt);
  const raw=JSON.parse(data.raw);
  if(!Array.isArray(raw?.segments))fail('missing Whisper raw segments');
}
export async function stageSafeVersion(env:SafeEnv,run:SafeRun,items:{
  json:string;txt:string;vtt:string;raw:string;language:string
}){
  await assertLiveRun(env.DB,run);
  await assertSourceRevision(env,run);
  const parsed=canonicalSegments(items.json,items.txt,items.vtt);
  const raw=JSON.parse(items.raw);
  if(!Array.isArray(raw?.segments))fail('invalid raw transcription');
  // Each *attempt* gets its own cryptographically unique location. Retry can
  // never PUT into an already published candidate's key, even on a stale job.
  const versionId=crypto.randomUUID();
  const base='transcripts/'+encodeURIComponent(run.trackId)+'/versions/'+versionId;
  const objects=[
    {name:'json',key:base+'/transcript.json',value:items.json},
    {name:'txt',key:base+'/transcript.txt',value:items.txt},
    {name:'vtt',key:base+'/transcript.vtt',value:items.vtt},
    {name:'raw',key:base+'/raw-whisper.json',value:items.raw}
  ];
  const checks=[];
  for(const obj of objects)checks.push({name:obj.name,key:obj.key,sha256:await sha256(obj.value)});
  const manifest=JSON.stringify({
    version:2,versionId,trackId:run.trackId,runId:run.runId,
    sourceAudioKey:run.sourceAudioKey,sourceAudioEtag:run.sourceAudioEtag,
    language:items.language,segmentCount:parsed.segmentCount,
    timecodeHash:await sha256(parsed.timecodeChecksum),checks
  });
  const manifestKey=base+'/manifest.json',checksum=await sha256(manifest);
  for(const obj of [...objects,{name:'manifest',key:manifestKey,value:manifest}]){
    await assertLiveRun(env.DB,run);
    if(await env.R2_BUCKET.get(obj.key))fail('immutable candidate key already occupied');
    await env.R2_BUCKET.put(obj.key,obj.value);
  }
  const version={
    versionId,trackId:run.trackId,runId:run.runId,
    jsonKey:objects[0].key,txtKey:objects[1].key,vttKey:objects[2].key,
    rawKey:objects[3].key,manifestKey,checksum,
    sourceAudioKey:run.sourceAudioKey,sourceAudioEtag:run.sourceAudioEtag
  };
  await verifyCandidateObjects(env,version,run);
  await assertSourceRevision(env,run);
  await env.DB.prepare(
    'INSERT INTO transcript_versions(versionId,trackId,runId,jsonKey,txtKey,vttKey,rawKey,manifestKey,checksum,sourceAudioKey,sourceAudioEtag,createdAt) '+
    'VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(versionId,run.trackId,run.runId,version.jsonKey,version.txtKey,
      version.vttKey,version.rawKey,manifestKey,checksum,
      run.sourceAudioKey,run.sourceAudioEtag,Date.now()).run();
  const changed=await env.DB.prepare(
    "UPDATE transcript_runs SET state='awaiting_review',candidateVersionId=?,updatedAt=? "+
    "WHERE runId=? AND generation=? AND state='processing' AND leaseUntil>? RETURNING runId")
    .bind(versionId,Date.now(),run.runId,run.generation,Date.now()).first();
  if(!changed)fail('candidate lost ownership before review');
  return version;
}
export async function publishSafeVersion(env:SafeEnv,runId:string,approvedBy:string|null){
  const db=env.DB;
  if(!db.batch)fail('D1 atomic batch unavailable');
  const run=await db.prepare("SELECT * FROM transcript_runs WHERE runId=? AND state='awaiting_review' LIMIT 1")
    .bind(runId).first() as SafeRun|null;
  if(!run || !run.candidateVersionId)fail('candidate not awaiting review');
  const version=await db.prepare('SELECT * FROM transcript_versions WHERE versionId=? AND runId=?')
    .bind(run.candidateVersionId,runId).first() as any;
  if(!version)fail('candidate version not found');
  if(run.intent==='relisten'){
    if(!approvedBy || approvedBy!==run.approvedBy)fail('candidate requires verified human approval');
    // Mapping/approval of historical corrections is NOT yet implemented.
    // Fail closed until an independently reviewed mapping service is integrated.
    const corrections=await db.prepare('SELECT id FROM transcript_corrections WHERE trackId=? LIMIT 1')
      .bind(run.trackId).first();
    const events=await db.prepare('SELECT id FROM transcript_correction_events WHERE trackId=? LIMIT 1')
      .bind(run.trackId).first();
    if(corrections||events)fail('manual correction version mapping not yet approved');
  }
  // Never rely on a snapshot restored from Echo D1 for a current revocation.
  // Production currently has no configured independent authority, so NO new
  // active version can be published merely by enabling the feature flag.
  if(!env.P0_AUTHORITY)fail('independent current authority unavailable');
  const proof=await env.P0_AUTHORITY.verifyPublication({
    trackId:run.trackId,runId,actorId:approvedBy,
    sourceAudioEtag:run.sourceAudioEtag,intendedActiveKey:run.expectedActiveR2Key
  });
  if(!proof?.allowed || !proof.epoch || !proof.permissionRevision || !proof.correctionRevision)
    fail('current revoke/delete/correction authority did not approve');
  await assertSourceRevision(env,run);
  await verifyCandidateObjects(env,version,run);
  const now=Date.now();
  // Cloudflare D1 batch is transactional. Both updates share the SAME database
  // transaction; any SQLite error rolls back the entire publication attempt.
  const valid =
    " AND EXISTS(SELECT 1 FROM transcript_runs r JOIN tracks t ON t.id=r.trackId "+
    "WHERE r.runId=? AND r.trackId=transcript_index.trackId "+
    "AND r.state='awaiting_review' AND r.candidateVersionId=? "+
    "AND t.audioUrl=r.sourceAudioUrl)";
  const indexSql=run.intent==='first'
    ? "UPDATE transcript_index SET status='ready',r2Key=?,activeVersionId=?,workingRunId=NULL,error=NULL,updatedAt=? "+
      "WHERE trackId=? AND status='processing' AND workingRunId=? AND r2Key IS NULL"+valid
    : "UPDATE transcript_index SET status='ready',r2Key=?,activeVersionId=?,error=NULL,updatedAt=? "+
      "WHERE trackId=? AND status='ready' AND r2Key=?"+valid;
  const indexStmt=db.prepare(indexSql)
    .bind(version.jsonKey,version.versionId,now,run.trackId,
      run.intent==='first'?runId:run.expectedActiveR2Key,runId,version.versionId);
  const runStmt=db.prepare(
    "UPDATE transcript_runs SET state='published',publishedEpoch=?,publishedPermissionRevision=?,"+
    "publishedCorrectionRevision=?,updatedAt=? WHERE runId=? AND state='awaiting_review' "+
    "AND candidateVersionId=? AND EXISTS(SELECT 1 FROM transcript_index "+
    "WHERE trackId=transcript_runs.trackId AND status='ready' AND activeVersionId=?)")
    .bind(proof.epoch,proof.permissionRevision,proof.correctionRevision,now,
      runId,version.versionId,version.versionId);
  const results=await db.batch([indexStmt,runStmt]);
  if(results?.length!==2 || Number(results[0]?.meta?.changes)!==1 ||
     Number(results[1]?.meta?.changes)!==1)
    fail('atomic publication refused or inconsistent; manual investigation required');
  return {published:true,r2Key:version.jsonKey,versionId:version.versionId};
}
