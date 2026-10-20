import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  gate2Enabled,requestSafeRun,claimSafeRun,stageSafeVersion,failSafeRun,
  assertLiveRun,publishSafeVersion
} from '../worker/transcriptP0Safety';

const PY = [
'import sys,json,sqlite3',
'path=sys.argv[1]; payload=json.loads(sys.argv[2]); conn=sqlite3.connect(path)',
'conn.row_factory=sqlite3.Row',
'try:',
' if payload.get("batch"):',
'  out=[]',
'  for i,stmt in enumerate(payload["batch"]):',
'   if i==1 and payload.get("failSecond"): raise RuntimeError("injected second statement failure")',
'   cur=conn.execute(stmt["sql"],stmt.get("args",[]))',
'   out.append({"meta":{"changes":cur.rowcount}})',
' elif payload.get("script"): conn.executescript(payload["sql"]); out={}',
' else:',
'  cur=conn.execute(payload["sql"],payload.get("args",[]))',
'  if payload["mode"]=="all": out={"results":[dict(row) for row in cur.fetchall()]}',
'  elif payload["mode"]=="first":',
'   row=cur.fetchone(); out=dict(row) if row is not None else None',
'  else: out={"meta":{"changes":cur.rowcount}}',
' conn.commit();print(json.dumps({"result":out}))',
'except Exception as exc:',
' conn.rollback(); print(json.dumps({"error":str(exc)}));sys.exit(1)',
'finally: conn.close()'
].join('\n');
class FakeD1 {
  failSecond=false;
  constructor(public path:string){}
  async batch(statements:any[]){
    const subprocess=spawnSync('python3',['-c',PY,this.path,JSON.stringify({
      batch:statements.map(item=>({sql:item.sql,args:item.args})),failSecond:this.failSecond
    })],{encoding:'utf8'});
    if(subprocess.status!==0)throw Error('fake batch rolled back: '+(subprocess.stdout||subprocess.stderr||''));
    return JSON.parse(subprocess.stdout||'{}').result;
  }
  call(sql:string,args:unknown[],mode:string,script=false):any{
    const sub=spawnSync('python3',['-c',PY,this.path,JSON.stringify({sql,args,mode,script})],{encoding:'utf8'});
    if(sub.status!==0)throw Error('fake SQLite: '+(sub.stdout||sub.stderr||'').slice(0,900));
    const row=JSON.parse(sub.stdout||'{}');
    if(row.error)throw Error(row.error);
    return row.result;
  }
  script(sql:string){return this.call(sql,[],'run',true);}
  prepare(sql:string){
    const self=this;
    return {bind(...args:unknown[]){
      return {sql,args,
        first:async()=>self.call(sql,args,'first'),
        run:async()=>self.call(sql,args,'run'),
        all:async()=>self.call(sql,args,'all')
      };
    },first:async()=>self.call(sql,[],'first'),all:async()=>self.call(sql,[],'all'),
    run:async()=>self.call(sql,[],'run')};
  }
}
class FakeR2 {
  files=new Map<string,string>(); puts:string[]=[];failAt=0;audioEtag='audio-v1';
  async head(key:string){return key==='audio/demo.mp3'?{etag:this.audioEtag,size:123}:null;}
  async put(key:string,value:string){
    this.puts.push(key);
    if(this.failAt&&this.puts.length===this.failAt)throw Error('injected R2 failure');
    this.files.set(key,value);
  }
  async get(key:string){
    const content=this.files.get(key);
    if(content===undefined)return null;
    return {text:async()=>content};
  }
}
async function fixture(ready=false){
  const dir=mkdtempSync(join(tmpdir(),'gate2-p0-')),db=new FakeD1(join(dir,'fake.db'));
  db.script("CREATE TABLE tracks(id TEXT PRIMARY KEY,audioUrl TEXT,uploadDate TEXT);"+
    "CREATE TABLE transcript_index(trackId TEXT PRIMARY KEY,status TEXT NOT NULL,r2Key TEXT,"+
    "error TEXT,updatedAt INTEGER);"+
    "CREATE TABLE transcript_corrections(id TEXT PRIMARY KEY,trackId TEXT);"+
    "CREATE TABLE transcript_correction_events(id TEXT PRIMARY KEY,trackId TEXT);");
  db.script(readFileSync(new URL('../migrations/20261020_transcript_gate2_p0.sql',import.meta.url),'utf8'));
  await db.prepare("INSERT INTO tracks(id,audioUrl,uploadDate) VALUES('synthetic-a','https://fake.invalid/api/r2/file/audio/demo.mp3','2026-01-01')").run();
  await db.prepare("INSERT INTO transcript_index(trackId,status,r2Key,updatedAt) VALUES('synthetic-a',?,?,1)")
    .bind(ready?'ready':'pending',ready?'transcripts/synthetic-a/legacy.json':null).run();
  const r2=new FakeR2();
  return {db,r2,env:{DB:db,R2_BUCKET:r2,P0_AUTHORITY:{
    verifyPublication:async()=>({allowed:true,epoch:'epoch-9',permissionRevision:'p9',correctionRevision:'c9'})
  }},cleanup:()=>rmSync(dir,{recursive:true,force:true})};
}
const content={json:'{"segments":[{"id":"s000001","text":"虛構文字","start":0,"end":1}]}',
  txt:'虛構文字',vtt:'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n虛構文字',
  raw:'{"segments":[{"text":"虛構文字"}]}',language:'original'};

test('G31 feature is OFF without explicit enable flag',()=>{
  assert.equal(gate2Enabled({}),false);
  assert.equal(gate2Enabled({TRANSCRIPT_P0_ENABLED:'1'}),true);
});
test('SAFE-01/02 original ready cannot enter first-run and duplicate claim is refused',async()=>{
  const {db,cleanup}=await fixture(true);
  try{
    assert.equal(await requestSafeRun(db,{trackId:'synthetic-a',intent:'first',
      requestKey:'first:synthetic-a',sourceAudioKey:'audio/demo.mp3',sourceAudioUrl:'https://fake.invalid/api/r2/file/audio/demo.mp3',sourceAudioEtag:'audio-v1:123'}),null);
    const relisten=await requestSafeRun(db,{trackId:'synthetic-a',intent:'relisten',
      requestKey:'relisten:synthetic-a:legacy',sourceAudioKey:'audio/demo.mp3',sourceAudioUrl:'https://fake.invalid/api/r2/file/audio/demo.mp3',sourceAudioEtag:'audio-v1:123',
      approvedBy:'fake-admin',approvedMaxSeconds:80});
    assert.ok(relisten);
    const duplicate=await requestSafeRun(db,{trackId:'synthetic-a',intent:'relisten',
      requestKey:'relisten:synthetic-a:legacy',sourceAudioKey:'audio/demo.mp3',sourceAudioUrl:'https://fake.invalid/api/r2/file/audio/demo.mp3',sourceAudioEtag:'audio-v1:123',
      approvedBy:'fake-admin',approvedMaxSeconds:80});
    assert.equal(duplicate?.runId,relisten?.runId);
    await db.prepare("UPDATE transcript_runs SET state='queued' WHERE runId=?").bind(relisten!.runId).run();
    const owned=await claimSafeRun(db,relisten!.runId,'synthetic-a');
    assert.equal(owned.state,'processing');
    await assert.rejects(()=>claimSafeRun(db,relisten!.runId,'synthetic-a'),/not queued/);
    const active=await db.prepare("SELECT * FROM transcript_index WHERE trackId='synthetic-a'").first();
    assert.equal(active.status,'ready');
    assert.equal(active.r2Key,'transcripts/synthetic-a/legacy.json');
  }finally{cleanup();}
});
test('SAFE-03 partial R2 candidate writes never change active published transcript',async()=>{
  const {db,r2,env,cleanup}=await fixture(true);
  try{
    r2.files.set('transcripts/synthetic-a/legacy.json','immutable original');
    const run=(await requestSafeRun(db,{trackId:'synthetic-a',intent:'relisten',
      requestKey:'relisten:failed',sourceAudioKey:'audio/demo.mp3',sourceAudioUrl:'https://fake.invalid/api/r2/file/audio/demo.mp3',sourceAudioEtag:'audio-v1:123',
      approvedBy:'fake-admin',approvedMaxSeconds:80}))!;
    await db.prepare("UPDATE transcript_runs SET state='queued' WHERE runId=?").bind(run.runId).run();
    const claimed=await claimSafeRun(db,run.runId,'synthetic-a');
    r2.failAt=2;
    await assert.rejects(()=>stageSafeVersion({DB:db,R2_BUCKET:r2},claimed,content),/injected/);
    await failSafeRun(db,claimed,Error('R2 failed'));
    const active=await db.prepare("SELECT * FROM transcript_index WHERE trackId='synthetic-a'").first();
    assert.equal(active.status,'ready');
    assert.equal(active.r2Key,'transcripts/synthetic-a/legacy.json');
    assert.equal(r2.files.get(active.r2Key),'immutable original');
  }finally{cleanup();}
});
test('SAFE-04/05 new first-run only publishes once and stale callbacks cannot reclaim',async()=>{
  const {db,r2,env,cleanup}=await fixture(false);
  try{
    const run=(await requestSafeRun(db,{trackId:'synthetic-a',intent:'first',
      requestKey:'first:synthetic-a:audio/demo.mp3',sourceAudioKey:'audio/demo.mp3',sourceAudioUrl:'https://fake.invalid/api/r2/file/audio/demo.mp3',sourceAudioEtag:'audio-v1:123'}))!;
    await db.prepare("UPDATE transcript_runs SET state='queued' WHERE runId=?").bind(run.runId).run();
    await db.prepare("UPDATE transcript_index SET status='queued' WHERE trackId='synthetic-a'").run();
    const claimed=await claimSafeRun(db,run.runId,'synthetic-a');
    await stageSafeVersion({DB:db,R2_BUCKET:r2},claimed,content);
    const result=await publishSafeVersion(env,run.runId,null);
    assert.equal(result.published,true);
    const active=await db.prepare("SELECT * FROM transcript_index WHERE trackId='synthetic-a'").first();
    assert.equal(active.status,'ready');
    const candidate=await db.prepare("SELECT candidateVersionId FROM transcript_runs WHERE runId=?").bind(run.runId).first();
    assert.equal(active.activeVersionId,candidate.candidateVersionId);
    assert.notEqual(active.activeVersionId,run.runId);
    assert.ok(active.r2Key.includes('/versions/'));
    await assert.rejects(()=>claimSafeRun(db,run.runId,'synthetic-a'),/not queued/);
    await failSafeRun(db,claimed,Error('stale failure'));
    assert.equal((await db.prepare("SELECT status FROM transcript_index WHERE trackId='synthetic-a'").first()).status,'ready');
  }finally{cleanup();}
});
test('member correction requires a separate review and keeps the prior ready pointer',async()=>{
  const {db,r2,env,cleanup}=await fixture(true);
  try{
    const run=(await requestSafeRun(db,{trackId:'synthetic-a',intent:'relisten',
      requestKey:'relisten:review',sourceAudioKey:'audio/demo.mp3',sourceAudioUrl:'https://fake.invalid/api/r2/file/audio/demo.mp3',sourceAudioEtag:'audio-v1:123',
      approvedBy:'fake-admin',approvedMaxSeconds:80}))!;
    await db.prepare("UPDATE transcript_runs SET state='queued' WHERE runId=?").bind(run.runId).run();
    const claimed=await claimSafeRun(db,run.runId,'synthetic-a');
    await stageSafeVersion({DB:db,R2_BUCKET:r2},claimed,content);
    await db.prepare("INSERT INTO transcript_corrections(id,trackId) VALUES('fake-c1','synthetic-a')").run();
    await assert.rejects(()=>publishSafeVersion(env,run.runId,'fake-admin'),/manual correction version mapping/);
    const active=await db.prepare("SELECT status,r2Key FROM transcript_index WHERE trackId='synthetic-a'").first();
    assert.equal(active.status,'ready');
    assert.equal(active.r2Key,'transcripts/synthetic-a/legacy.json');
  }finally{cleanup();}
});


test('RST-01 atomic publish rolls back pointer AND job when the second D1 statement fails',async()=>{
  const {db,r2,env,cleanup}=await fixture(false);
  try{
    const run=(await requestSafeRun(db,{trackId:'synthetic-a',intent:'first',
      requestKey:'first:atomic',sourceAudioKey:'audio/demo.mp3',sourceAudioUrl:'https://fake.invalid/api/r2/file/audio/demo.mp3',sourceAudioEtag:'audio-v1:123'}))!;
    await db.prepare("UPDATE transcript_runs SET state='queued' WHERE runId=?").bind(run.runId).run();
    await db.prepare("UPDATE transcript_index SET status='queued' WHERE trackId='synthetic-a'").run();
    const claimed=await claimSafeRun(db,run.runId,'synthetic-a');
    await stageSafeVersion(env,claimed,content);
    db.failSecond=true;
    await assert.rejects(()=>publishSafeVersion(env,run.runId,null),/rolled back/);
    const after=await db.prepare("SELECT status,r2Key,activeVersionId FROM transcript_index WHERE trackId='synthetic-a'").first();
    assert.equal(after.status,'processing');
    assert.equal(after.r2Key,null);
    assert.equal((await db.prepare("SELECT state FROM transcript_runs WHERE runId=?").bind(run.runId).first()).state,'awaiting_review');
    db.failSecond=false;
    assert.equal((await publishSafeVersion(env,run.runId,null)).published,true);
  }finally{cleanup();}
});
test('RST-03 corrupted or missing manifest and R2 artifact blocks publication',async()=>{
  const {db,r2,env,cleanup}=await fixture(false);
  try{
    const run=(await requestSafeRun(db,{trackId:'synthetic-a',intent:'first',
      requestKey:'first:integrity',sourceAudioKey:'audio/demo.mp3',sourceAudioUrl:'https://fake.invalid/api/r2/file/audio/demo.mp3',sourceAudioEtag:'audio-v1:123'}))!;
    await db.prepare("UPDATE transcript_runs SET state='queued' WHERE runId=?").bind(run.runId).run();
    await db.prepare("UPDATE transcript_index SET status='queued' WHERE trackId='synthetic-a'").run();
    const claimed=await claimSafeRun(db,run.runId,'synthetic-a');
    const result=await stageSafeVersion(env,claimed,content);
    const before=r2.files.get(result.manifestKey)!;
    r2.files.delete(result.manifestKey);
    await assert.rejects(()=>publishSafeVersion(env,run.runId,null),/manifest missing/);
    r2.files.set(result.manifestKey,before+'tampered');
    await assert.rejects(()=>publishSafeVersion(env,run.runId,null),/manifest checksum/);
    const index=await db.prepare("SELECT status,r2Key FROM transcript_index WHERE trackId='synthetic-a'").first();
    assert.equal(index.status,'processing');
    assert.equal(index.r2Key,null);
  }finally{cleanup();}
});
test('RST-02 unchanged audio URL with modified object revision blocks publication',async()=>{
  const {db,r2,env,cleanup}=await fixture(false);
  try{
    const run=(await requestSafeRun(db,{trackId:'synthetic-a',intent:'first',
      requestKey:'first:audio-revision',sourceAudioKey:'audio/demo.mp3',sourceAudioUrl:'https://fake.invalid/api/r2/file/audio/demo.mp3',sourceAudioEtag:'audio-v1:123'}))!;
    await db.prepare("UPDATE transcript_runs SET state='queued' WHERE runId=?").bind(run.runId).run();
    await db.prepare("UPDATE transcript_index SET status='queued' WHERE trackId='synthetic-a'").run();
    const claimed=await claimSafeRun(db,run.runId,'synthetic-a');
    await stageSafeVersion(env,claimed,content);
    r2.audioEtag='audio-v2';
    await assert.rejects(()=>publishSafeVersion(env,run.runId,null),/audio content revision changed/);
    assert.equal((await db.prepare("SELECT r2Key FROM transcript_index WHERE trackId='synthetic-a'").first()).r2Key,null);
  }finally{cleanup();}
});
test('RST-02 external revocation/unavailable authority fails closed',async()=>{
  const {db,r2,env,cleanup}=await fixture(false);
  try{
    const run=(await requestSafeRun(db,{trackId:'synthetic-a',intent:'first',
      requestKey:'first:revoke',sourceAudioKey:'audio/demo.mp3',sourceAudioUrl:'https://fake.invalid/api/r2/file/audio/demo.mp3',sourceAudioEtag:'audio-v1:123'}))!;
    await db.prepare("UPDATE transcript_runs SET state='queued' WHERE runId=?").bind(run.runId).run();
    await db.prepare("UPDATE transcript_index SET status='queued' WHERE trackId='synthetic-a'").run();
    const claimed=await claimSafeRun(db,run.runId,'synthetic-a');
    await stageSafeVersion(env,claimed,content);
    await assert.rejects(()=>publishSafeVersion({DB:db,R2_BUCKET:r2},run.runId,null),/authority unavailable/);
    (env.P0_AUTHORITY as any).verifyPublication=async()=>({allowed:false,epoch:'epoch-10',permissionRevision:'p10',correctionRevision:'c9'});
    await assert.rejects(()=>publishSafeVersion(env,run.runId,null),/did not approve/);
    assert.equal((await db.prepare("SELECT r2Key FROM transcript_index WHERE trackId='synthetic-a'").first()).r2Key,null);
  }finally{cleanup();}
});
test('RST-04 explicit new approved attempt after failure uses a fresh idempotency key',async()=>{
  const {db,cleanup}=await fixture(true);
  try{
    const input={trackId:'synthetic-a',intent:'relisten' as const,
      sourceAudioKey:'audio/demo.mp3',sourceAudioUrl:'https://fake.invalid/api/r2/file/audio/demo.mp3',sourceAudioEtag:'audio-v1:123',
      approvedBy:'fake-admin',approvedMaxSeconds:80};
    const previous=(await requestSafeRun(db,{...input,requestKey:'relisten:approval-1'}))!;
    await db.prepare("UPDATE transcript_runs SET state='failed' WHERE runId=?").bind(previous.runId).run();
    assert.equal((await requestSafeRun(db,{...input,requestKey:'relisten:approval-1'}))?.state,'failed');
    const fresh=(await requestSafeRun(db,{...input,requestKey:'relisten:approval-2'}))!;
    assert.notEqual(previous.runId,fresh.runId);
    assert.equal(fresh.state,'pending');
  }finally{cleanup();}
});
test('RST-03 output format mismatch and duplicate staging do not publish or overwrite',async()=>{
  const {db,r2,env,cleanup}=await fixture(true);
  try{
    const run=(await requestSafeRun(db,{trackId:'synthetic-a',intent:'relisten',
      requestKey:'relisten:format',sourceAudioKey:'audio/demo.mp3',sourceAudioUrl:'https://fake.invalid/api/r2/file/audio/demo.mp3',sourceAudioEtag:'audio-v1:123',
      approvedBy:'fake-admin',approvedMaxSeconds:80}))!;
    await db.prepare("UPDATE transcript_runs SET state='queued' WHERE runId=?").bind(run.runId).run();
    const claimed=await claimSafeRun(db,run.runId,'synthetic-a');
    await assert.rejects(()=>stageSafeVersion(env,claimed,{...content,txt:'與字幕不一致'}),/mismatch/);
    const version=await stageSafeVersion(env,claimed,content);
    await assert.rejects(()=>stageSafeVersion(env,claimed,content),/lease lost/);
    assert.equal(r2.puts.filter(k=>k===version.jsonKey).length,1);
    assert.equal((await db.prepare("SELECT r2Key FROM transcript_index WHERE trackId='synthetic-a'").first()).r2Key,'transcripts/synthetic-a/legacy.json');
  }finally{cleanup();}
});
