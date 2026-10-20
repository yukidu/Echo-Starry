import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {findQaIndexedPassages,replaceQaSearchGeneration} from '../worker/qaTranscriptSearchIndex';
import {drainQaSearchRebuildQueue,qaSearchRebuildStatus,retryFailedQaSearchRebuild,qaSearchRetryDelayMs} from '../worker/qaTranscriptSearchRebuildQueue';
import {excerpts} from '../worker/aiSpeakerQaRouter';

const read=(file:string)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const migration=read('migrations/20261020_c09_qa_chinese_search.sql');
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE tracks(id TEXT PRIMARY KEY,title TEXT,speaker TEXT,audioUrl TEXT,uploadDate INTEGER,requiredRank TEXT,authorizedOnlyVisible INTEGER DEFAULT 0,isPrivateVip INTEGER DEFAULT 0,stickerUnlockCost INTEGER DEFAULT 0)');
 db.exec('CREATE TABLE transcript_index(trackId TEXT PRIMARY KEY,r2Key TEXT,status TEXT,updatedAt INTEGER)');
 db.exec('CREATE TABLE transcript_correction_events(id TEXT PRIMARY KEY,trackId TEXT,segmentId TEXT,createdAt INTEGER,updatedAt INTEGER,status TEXT,newText TEXT,adminText TEXT)');
 db.exec('CREATE TABLE transcript_corrections(id TEXT PRIMARY KEY,trackId TEXT,segmentId TEXT,newText TEXT,createdAt INTEGER)');
 db.exec('CREATE TABLE ai_story_pilots(trackId TEXT PRIMARY KEY,status TEXT,revision INTEGER)');
 db.exec(migration);
 const prepare=(sql:string)=>{
  let params:any[]=[];
  const obj={
   bind(...v:any[]){params=v;return obj;},
   async all(){return {results:db.prepare(sql).all(...params)};},
   async first(){return db.prepare(sql).get(...params)||null;},
   async run(){return db.prepare(sql).run(...params);}
  };return obj;
 };
 const d1={prepare,async batch(stmts:any[]){db.exec('BEGIN');try{for(const item of stmts)await item.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}};
 const raw={createdAt:1,segments:[{id:'s1',start:1,end:3,text:'原始逐字稿提到感恩和學習'}],cleanedSegments:[]};
 let reads=0,fail=0;
 const env:any={DB:d1,QA_CHINESE_SEARCH_WRITE_ENABLED:'true',QA_CHINESE_SEARCH_ENABLED:'true',R2_BUCKET:{
  async get(key:string){reads++;if(fail-->0)throw Error('R2 temporarily unavailable');if(key!=='transcripts/t1/transcript.json')return null;
   return {async text(){return JSON.stringify(raw)}};}
 }};
 const get=()=>({reads});
 const setFail=(n:number)=>{fail=n;};
 const row=(sql:string,...args:any[])=>db.prepare(sql).get(...args) as any;
 const close=()=>db.close();
 return {db,d1,env,row,raw,get,setFail,close};
}
async function initialize(f:ReturnType<typeof fixture>){
 f.db.prepare('INSERT INTO tracks(id,title,speaker,audioUrl,uploadDate,requiredRank) VALUES (?,?,?,?,?,?)')
   .run('t1','可引用演講','講者甲','audio://t1',1,'公開');
 f.db.prepare('INSERT INTO transcript_index(trackId,r2Key,status,updatedAt) VALUES (?,?,?,?)')
   .run('t1','transcripts/t1/transcript.json','ready',1);
 await replaceQaSearchGeneration(f.d1,{
   trackId:'t1',sourceKey:'transcripts/t1/transcript.json',sourceUpdatedAt:1,
   generation:'base',speaker:'講者甲',subtitles:f.raw.segments
 });
}
const correction=(f:ReturnType<typeof fixture>)=>f.db.prepare(
 "INSERT INTO transcript_correction_events(id,trackId,segmentId,createdAt,updatedAt,status,newText) VALUES('c1','t1','s1',20,20,'accepted','管理員核准修正為互相信任')"
).run();
test('transactional correction queues exactly one invalidated track; bounded queue rebuilds approved text',async()=>{
 const f=fixture();
 try{
  await initialize(f);correction(f);
  assert.equal(f.row("SELECT invalidated FROM qa_search_state WHERE trackId='t1'").invalidated,1);
  assert.equal(f.row("SELECT status FROM qa_search_rebuild_jobs WHERE trackId='t1'").status,'pending');
  assert.equal((await findQaIndexedPassages(f.d1,'感恩',['t1'])).blocked.has('t1'),true);
  assert.equal(await drainQaSearchRebuildQueue(f.env,1),1);
  assert.equal(f.get().reads,1);
  assert.equal(f.row("SELECT status FROM qa_search_rebuild_jobs WHERE trackId='t1'").status,'done');
  assert.equal((await findQaIndexedPassages(f.d1,'互相信任',['t1'])).hits.length,1);
  assert.equal((await findQaIndexedPassages(f.d1,'感恩',['t1'])).hits.length,0);
  const status=await qaSearchRebuildStatus(f.d1);
  assert.equal(status.failed,0);
  assert.equal(status.waiting,0);
 }finally{f.close();}
});
test('approved correction revoke queues again, then restores immutable R2 text',async()=>{
 const f=fixture();
 try{
  await initialize(f);correction(f);
  await drainQaSearchRebuildQueue(f.env);
  assert.equal((await findQaIndexedPassages(f.d1,'互相信任',['t1'])).hits.length,1);
  f.db.prepare("UPDATE transcript_correction_events SET status='revoked',updatedAt=25 WHERE id='c1'").run();
  assert.equal(f.row("SELECT status FROM qa_search_rebuild_jobs WHERE trackId='t1'").status,'pending');
  assert.equal((await findQaIndexedPassages(f.d1,'互相信任',['t1'])).blocked.has('t1'),true);
  await drainQaSearchRebuildQueue(f.env);
  assert.equal((await findQaIndexedPassages(f.d1,'互相信任',['t1'])).hits.length,0);
  assert.equal((await findQaIndexedPassages(f.d1,'感恩',['t1'])).hits.length,1);
  assert.equal(f.raw.segments[0].text,'原始逐字稿提到感恩和學習');
 }finally{f.close();}
});
test('temporary R2 failure retries with cooldown and never serves stale R2 as QA',async()=>{
 const f=fixture();
 try{
  await initialize(f);correction(f);f.setFail(1);
  assert.equal(await drainQaSearchRebuildQueue(f.env),1);
  const job=f.row("SELECT * FROM qa_search_rebuild_jobs WHERE trackId='t1'");
  assert.equal(job.status,'retry');assert.equal(job.attempts,1);
  assert.ok(job.nextAttemptAt>Date.now());
  assert.equal((await qaSearchRebuildStatus(f.d1)).retrying,1);
  assert.equal(await drainQaSearchRebuildQueue(f.env),0);
  const row=f.row("SELECT * FROM tracks WHERE id='t1'");
  const noFallback=await excerpts(f.env,row,null,'current','如何感恩？');
  assert.equal(noFallback.prompt,'');assert.equal(f.get().reads,1);
  f.db.prepare("UPDATE qa_search_rebuild_jobs SET nextAttemptAt=0 WHERE trackId='t1'").run();
  assert.equal(await drainQaSearchRebuildQueue(f.env),1);
  assert.equal(f.row("SELECT status FROM qa_search_rebuild_jobs WHERE trackId='t1'").status,'done');
  assert.equal(f.get().reads,2);
 }finally{f.close();}
});
test('five failed attempts cap retries, failed item is visible and superadmin can queue manual retry',async()=>{
 const f=fixture();
 try{
  await initialize(f);correction(f);f.setFail(5);
  for(let i=0;i<5;i++){
   f.db.prepare("UPDATE qa_search_rebuild_jobs SET nextAttemptAt=0 WHERE trackId='t1'").run();
   assert.equal(await drainQaSearchRebuildQueue(f.env),1);
  }
  assert.equal(f.row("SELECT status FROM qa_search_rebuild_jobs WHERE trackId='t1'").status,'failed');
  assert.equal((await qaSearchRebuildStatus(f.d1)).failed,1);
  assert.equal(await drainQaSearchRebuildQueue(f.env),0);
  assert.equal(await retryFailedQaSearchRebuild(f.d1,'t1'),true);
  assert.equal(await drainQaSearchRebuildQueue(f.env),1);
  assert.equal(f.row("SELECT status FROM qa_search_rebuild_jobs WHERE trackId='t1'").status,'done');
  assert.equal(await retryFailedQaSearchRebuild(f.d1,'t1'),false);
  assert.equal(qaSearchRetryDelayMs(1),60_000);
  assert.equal(qaSearchRetryDelayMs(5),25*60_000);
 }finally{f.close();}
});
test('two simultaneous cron and request workers lease one job only; expired lease is reclaimable',async()=>{
 const f=fixture();
 try{
  await initialize(f);correction(f);
  const [a,b]=await Promise.all([drainQaSearchRebuildQueue(f.env),drainQaSearchRebuildQueue(f.env)]);
  assert.equal(a+b,1);
  assert.equal(f.get().reads,1);
  f.db.prepare("UPDATE qa_search_rebuild_jobs SET status='running',leaseUntil=0,nextAttemptAt=0 WHERE trackId='t1'").run();
  assert.equal(await drainQaSearchRebuildQueue(f.env),1);
  assert.equal(f.row("SELECT status FROM qa_search_rebuild_jobs WHERE trackId='t1'").status,'done');
 }finally{f.close();}
});
test('another edit during active rebuild requeues current revision and rejects stale publication',async()=>{
 const f=fixture();
 try{
  await initialize(f);correction(f);
  const originalGet=f.env.R2_BUCKET.get;
  let mutated=false;
  f.env.R2_BUCKET.get=async(key:string)=>{
   const obj=await originalGet(key);
   if(!mutated){
    mutated=true;
    f.db.prepare("UPDATE transcript_correction_events SET status='supplemented',adminText='稍後新修正',updatedAt=30 WHERE id='c1'").run();
   }
   return obj;
  };
  assert.equal(await drainQaSearchRebuildQueue(f.env),1);
  assert.equal(f.row("SELECT status FROM qa_search_rebuild_jobs WHERE trackId='t1'").status,'pending');
  assert.equal((await findQaIndexedPassages(f.d1,'互相信任',['t1'])).blocked.has('t1'),true);
  assert.equal(await drainQaSearchRebuildQueue(f.env),1);
  assert.equal(f.row("SELECT status FROM qa_search_rebuild_jobs WHERE trackId='t1'").status,'done');
  assert.equal((await findQaIndexedPassages(f.d1,'稍後新修正',['t1'])).hits.length,1);
 }finally{f.close();}
});
test('source deletion cleans both queued job and FTS text; permissions change never bypasses member fences',async()=>{
 const f=fixture();
 try{
  await initialize(f);
  f.db.prepare("UPDATE tracks SET requiredRank='鑽石級以上' WHERE id='t1'").run();
  assert.equal(f.row("SELECT status FROM qa_search_rebuild_jobs WHERE trackId='t1'").status,'pending');
  await drainQaSearchRebuildQueue(f.env);
  const track=f.row("SELECT * FROM tracks WHERE id='t1'");
  const noRights=await excerpts(f.env,track,null,'current','感恩');
  assert.equal(noRights.prompt,'');
  f.db.prepare("DELETE FROM tracks WHERE id='t1'").run();
  assert.equal(f.row("SELECT count(*) n FROM qa_search_rebuild_jobs").n,0);
  assert.equal(f.row("SELECT count(*) n FROM qa_search_segments").n,0);
  assert.equal((await findQaIndexedPassages(f.d1,'感恩',['t1'])).hits.length,0);
 }finally{f.close();}
});
test('rebuild queue disabled means no R2 reads, no cron work and no migrations at request time',async()=>{
 const f=fixture();
 try{
  await initialize(f);correction(f);
  f.env.QA_CHINESE_SEARCH_WRITE_ENABLED=undefined;
  assert.equal(await drainQaSearchRebuildQueue(f.env),0);
  assert.equal(f.get().reads,0);
  assert.equal(f.row("SELECT status FROM qa_search_rebuild_jobs WHERE trackId='t1'").status,'pending');
  const entry=read('worker/starryMainInlineLoginRouter.ts');
  const moderator=read('worker/transcriptModerationRouter.ts');
  const worker=read('worker/qaTranscriptSearchRebuildQueue.ts');
  assert.match(entry,/drainQaSearchRebuildQueue/);
  assert.ok(entry.includes("controller.cron==='*/5 * * * *'"));
  assert.match(moderator,/syncQaSearchAfterCorrection/);
  assert.match(moderator,/drainQaSearchRebuildQueue/);
  assert.equal(worker.includes('R2_BUCKET.put'),false);
 }finally{f.close();}
});
