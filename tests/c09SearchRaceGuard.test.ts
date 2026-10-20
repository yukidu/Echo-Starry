import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {
 findQaIndexedPassages,replaceQaSearchGeneration,qaSearchEvidenceIsCurrent,
 type QaSearchEvidence
} from '../worker/qaTranscriptSearchIndex';
import {insertReply,excerpts} from '../worker/aiSpeakerQaRouter';

const schema=readFileSync(new URL('../migrations/20261020_c09_qa_chinese_search.sql',import.meta.url),'utf8');
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE tracks(id TEXT PRIMARY KEY,title TEXT,speaker TEXT,audioUrl TEXT,uploadDate INTEGER,requiredRank TEXT,authorizedOnlyVisible INTEGER DEFAULT 0,isPrivateVip INTEGER DEFAULT 0,stickerUnlockCost INTEGER DEFAULT 0,commentsCount INTEGER DEFAULT 0)');
 db.exec('CREATE TABLE transcript_index(trackId TEXT PRIMARY KEY,r2Key TEXT,status TEXT,updatedAt INTEGER)');
 db.exec('CREATE TABLE ai_story_pilots(trackId TEXT PRIMARY KEY,status TEXT,revision INTEGER)');
 db.exec('CREATE TABLE transcript_corrections(id TEXT PRIMARY KEY,trackId TEXT,segmentId TEXT,newText TEXT,createdAt INTEGER)');
 db.exec('CREATE TABLE transcript_correction_events(id TEXT PRIMARY KEY,trackId TEXT,segmentId TEXT,newText TEXT,adminText TEXT,createdAt INTEGER,status TEXT)');
 db.exec("CREATE TABLE comments(id TEXT PRIMARY KEY,trackId TEXT,authorName TEXT,authorAvatar TEXT,authorBadge TEXT,authorEmail TEXT,deviceId TEXT,content TEXT,timestamp TEXT,createdAt INTEGER,replyToId TEXT,replyToAuthor TEXT,isAdmin INTEGER,likes INTEGER,likedBy TEXT)");
 db.exec(schema);
 const prepare=(sql:string)=>{
   let args:any[]=[];
   const statement={
     bind(...p:any[]){args=p;return statement;},
     async first(){return db.prepare(sql).get(...args)||null;},
     async all(){return {results:db.prepare(sql).all(...args)};},
     async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes}};}
   };
   return statement;
 };
 const d1={prepare,async batch(statements:any[]){
   db.exec('BEGIN');
   try{
     const out=[];
     for(const s of statements)out.push(await s.run());
     db.exec('COMMIT');return out;
   }catch(error){db.exec('ROLLBACK');throw error;}
 }};
 return {db,d1,close:()=>db.close()};
}
async function seeded(){
 const fixture=setup(),{db,d1}=fixture;
 db.prepare("INSERT INTO tracks(id,title,speaker,audioUrl,uploadDate,requiredRank) VALUES('t1','公開音檔','講者甲','audio',1,'公開')").run();
 db.prepare("INSERT INTO transcript_index(trackId,r2Key,status,updatedAt) VALUES('t1','transcripts/t1/transcript.json','ready',1)").run();
 await replaceQaSearchGeneration(d1,{
   trackId:'t1',sourceKey:'transcripts/t1/transcript.json',sourceUpdatedAt:1,
   generation:'g1',speaker:'講者甲',
   subtitles:[{id:'s1',start:10,end:20,text:'講者談到感恩是成功的重要條件'}]
 });
 return fixture;
}
function correction(db:DatabaseSync){
 db.prepare("INSERT INTO transcript_correction_events(id,trackId,segmentId,newText,createdAt,status) VALUES('c1','t1','s1','訂正後沒有再提感恩',20,'accepted')").run();
}
function revoke(db:DatabaseSync){
 db.prepare("INSERT INTO transcript_correction_events(id,trackId,segmentId,newText,createdAt,status) VALUES('c1','t1','s1','訂正內容',20,'accepted')").run();
 db.prepare("UPDATE transcript_correction_events SET status='revoked' WHERE id='c1'").run();
}
const MUTATIONS:{name:string;mutate:(db:DatabaseSync)=>void}[]=[
 {name:'accepted correction',mutate:correction},
 {name:'revoke approved correction',mutate:revoke},
 {name:'track deletion',mutate:db=>db.prepare("DELETE FROM tracks WHERE id='t1'").run()},
 {name:'rights change',mutate:db=>db.prepare("UPDATE tracks SET requiredRank='鑽石級以上' WHERE id='t1'").run()},
 {name:'transcript source replacement',mutate:db=>db.prepare("UPDATE transcript_index SET updatedAt=2 WHERE trackId='t1'").run()}
];
for(const action of MUTATIONS){
 test('race between coverage and final FTS SELECT: '+action.name,async()=>{
   const f=await seeded();
   try{
     let changed=false;
     const instrumented={...f.d1,prepare(sql:string){
       const base=f.d1.prepare(sql);
       if(!sql.includes('FROM qa_search_fts JOIN qa_search_segments'))return base;
       return {bind(...args:any[]){
         const bound=base.bind(...args);
         return {async all(){
           if(!changed){changed=true;action.mutate(f.db);}
           return bound.all();
         }};
       }};
     }};
     const result=await findQaIndexedPassages(instrumented,'感恩',['t1']);
     assert.equal(changed,true,'the actual final FTS SQL should be intercepted');
     assert.deepEqual(result.hits,[],'never return pre-mutation text');
   }finally{f.close();}
 });
}
test('race AFTER final FTS read but BEFORE return is rejected by evidence revision recheck',async()=>{
 const f=await seeded();
 try{
  let changed=false;
  const intercept={...f.d1,prepare(sql:string){
    const base=f.d1.prepare(sql);
    if(!sql.startsWith('SELECT 1 AS ok WHERE'))return base;
    return {bind(...args:any[]){
      const bound=base.bind(...args);
      return {async first(){
        if(!changed){changed=true;correction(f.db);}
        return bound.first();
      }};
    }};
  }};
  const result=await findQaIndexedPassages(intercept,'感恩',['t1']);
  assert.equal(changed,true);
  assert.deepEqual(result.hits,[]);
  assert.equal(result.blocked.has('t1'),true);
 }finally{f.close();}
});
test('version stamp check rejects changed source and accepts unchanged source',async()=>{
 const f=await seeded();
 try{
  const result=await findQaIndexedPassages(f.d1,'感恩',['t1']);
  assert.ok(result.hits.length);
  const {trackId,generation,changeRevision,sourceKey,sourceUpdatedAt}=result.hits[0];
  const evidence:QaSearchEvidence[]=[{trackId,generation,changeRevision,sourceKey,sourceUpdatedAt}];
  assert.equal(await qaSearchEvidenceIsCurrent(f.d1,evidence),true);
  f.db.prepare("UPDATE tracks SET speaker='講者乙' WHERE id='t1'").run();
  assert.equal(await qaSearchEvidenceIsCurrent(f.d1,evidence),false);
 }finally{f.close();}
});
test('atomic comment INSERT blocks a correction that occurs during AI generation',async()=>{
 const f=await seeded();
 try{
  const result=await findQaIndexedPassages(f.d1,'感恩',['t1']);
  const evidence:QaSearchEvidence[]=result.hits.map(h=>({
    trackId:h.trackId,generation:h.generation,changeRevision:h.changeRevision,
    sourceKey:h.sourceKey,sourceUpdatedAt:h.sourceUpdatedAt
  }));
  assert.equal(evidence.length,1);
  // The learner receives a model answer after the source has been corrected.
  correction(f.db);
  await assert.rejects(insertReply({DB:f.d1} as any,{id:'c-msg',authorName:'同學'},{
    id:'t1',speaker:'講者甲'
  },'舊版本內容絕不可發布','',evidence),/搜尋來源在 AI 回答期間變更/);
  assert.equal((f.db.prepare('SELECT COUNT(*) n FROM comments').get() as any).n,0);
 }finally{f.close();}
});
test('atomic comment insert publishes when source version remains current',async()=>{
 const f=await seeded();
 try{
  const res=await findQaIndexedPassages(f.d1,'感恩',['t1']);
  const evidence:QaSearchEvidence[]=res.hits.map(h=>({
    trackId:h.trackId,generation:h.generation,changeRevision:h.changeRevision,
    sourceKey:h.sourceKey,sourceUpdatedAt:h.sourceUpdatedAt
  }));
  await insertReply({DB:f.d1} as any,{id:'c-msg',authorName:'同學'},{
    id:'t1',speaker:'講者甲'
  },'經過核准的答案','',evidence);
  assert.equal((f.db.prepare('SELECT COUNT(*) n FROM comments').get() as any).n,1);
 }finally{f.close();}
});
test('race guards remain explicit in the final FTS SQL and the atomic publish SQL',()=>{
 const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
 const index=read('worker/qaTranscriptSearchIndex.ts');
 const router=read('worker/aiSpeakerQaRouter.ts');
 assert.match(index,/JOIN tracks t ON t.id=p.trackId/);
 assert.match(index,/qa_search_fts MATCH \? AND s.invalidated=0 AND i.status='ready'/);
 assert.match(index,/i.r2Key=s.sourceKey AND i.updatedAt=s.sourceUpdatedAt/);
 assert.match(router,/INSERT INTO comments/);
 assert.match(router,/WHERE "\+guard.where/);
 assert.match(router,/qaSearchEvidenceIsCurrent/);
});

test('unindexed R2 originals cannot bypass evidence validation when opt-in search is enabled',async()=>{
 const f=setup();let reads=0;
 try{
  f.db.prepare("INSERT INTO tracks(id,title,speaker,audioUrl,uploadDate,requiredRank) VALUES('old','未索引音檔','講者甲','audio',1,'公開')").run();
  f.db.prepare("INSERT INTO transcript_index(trackId,r2Key,status,updatedAt) VALUES('old','transcripts/old/transcript.json','ready',1)").run();
  const track=f.db.prepare("SELECT * FROM tracks WHERE id='old'").get();
  const env:any={DB:f.d1,QA_CHINESE_SEARCH_ENABLED:'true',R2_BUCKET:{async get(){
    reads++;return {async text(){return JSON.stringify({segments:[{id:'s1',text:'感恩帶來進步'}]});}};
  }}};
  const safe=await excerpts(env,track,null,'current','感恩');
  assert.equal(safe.prompt,'');
  assert.equal(reads,0,'new indexed mode must never quote unverifiable R2');
  env.QA_CHINESE_SEARCH_ENABLED=undefined;
  const legacy=await excerpts(env,track,null,'current','感恩');
  assert.match(legacy.prompt,/感恩帶來進步/);
  assert.equal(reads,1,'legacy flag-off QA behaviour remains available');
 }finally{f.close();}
});
