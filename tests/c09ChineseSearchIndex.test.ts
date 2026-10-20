import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {
  qaSearchTokens,qaQuestionTerms,qaSearchMatchExpression,qaSearchScore,
  buildQaSearchParagraphs,replaceQaSearchGeneration,findQaIndexedPassages,rebuildQaSearchAfterMutation
} from '../worker/qaTranscriptSearchIndex';
import {excerpts} from '../worker/aiSpeakerQaRouter';

const migration=readFileSync(new URL('../migrations/20261020_c09_qa_chinese_search.sql',import.meta.url),'utf8');
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function store(){
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE transcript_index(trackId TEXT PRIMARY KEY,r2Key TEXT,status TEXT,updatedAt INTEGER)');
  db.exec('CREATE TABLE tracks(id TEXT PRIMARY KEY,title TEXT,speaker TEXT,audioUrl TEXT,uploadDate INTEGER,requiredRank TEXT,authorizedOnlyVisible INTEGER DEFAULT 0,isPrivateVip INTEGER DEFAULT 0,stickerUnlockCost INTEGER DEFAULT 0)');
  db.exec('CREATE TABLE ai_story_pilots(trackId TEXT PRIMARY KEY,status TEXT,revision INTEGER)');
  db.exec('CREATE TABLE transcript_correction_events(id TEXT PRIMARY KEY,trackId TEXT,segmentId TEXT,createdAt INTEGER,updatedAt INTEGER,status TEXT,newText TEXT,adminText TEXT)');
  db.exec('CREATE TABLE transcript_corrections(id TEXT PRIMARY KEY,trackId TEXT,segmentId TEXT,newText TEXT,createdAt INTEGER)');
  db.exec(migration);
  const prepare=(sql:string)=>{
    let bound:any[]=[];
    const statement={
      bind(...v:any[]){bound=v;return statement;},
      async all(){return {results:db.prepare(sql).all(...bound)};},
      async first(){return db.prepare(sql).get(...bound)||null;},
      async run(){return db.prepare(sql).run(...bound);}
    };
    return statement;
  };
  const d1={prepare,async batch(stmts:any[]){db.exec('BEGIN');try{for(const s of stmts)await s.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}};
  return {db,d1,close:()=>db.close()};
}
async function seed(s:ReturnType<typeof store>,trackId:string,title:string,speaker:string,body:string,version=1){
  s.db.prepare('INSERT INTO tracks(id,title,speaker,audioUrl,uploadDate,requiredRank) VALUES (?,?,?,?,?,?)')
    .run(trackId,title,speaker,'audio://'+trackId,version,'公開');
  s.db.prepare('INSERT INTO transcript_index(trackId,r2Key,status,updatedAt) VALUES (?,?,?,?)')
    .run(trackId,'transcripts/'+trackId+'/transcript.json','ready',version);
  await replaceQaSearchGeneration(s.d1,{
    trackId,sourceKey:'transcripts/'+trackId+'/transcript.json',sourceUpdatedAt:version,
    generation:trackId+'-v'+version,speaker,subtitles:[{id:'s000001',start:2,end:12,text:body}]
  });
}
const groups:{kind:string;items:[string,string][]}[]=[
  {kind:'兩字詞',items:[
    ['感恩','我常分享感恩的力量，可以改變我們的生活'],
    ['堅持','成功需要堅持，今天付出的努力可以累積'],
    ['學習','持續學習能提升個人的能力'],
    ['目標','設定目標之後要制定具體行動'],
    ['勇氣','培養勇氣才能跨過心中的恐懼']
  ]},
  {kind:'自然問句',items:[
    ['如何面對挫折？','在面對挫折時，我們仍要相信自己'],
    ['怎麼養成好習慣？','養成好習慣，需要每天練習'],
    ['遇到困難要怎麼辦？','遇到困難可以尋求夥伴協助'],
    ['為何要建立信任？','建立信任是長久合作的基礎'],
    ['要怎麼設定方向？','先設定方向，再討論具體安排']
  ]},
  {kind:'繁體與全形',items:[
    ['夢想！','努力追求夢想，將每個承諾付諸行動'],
    ['成長，','在成長過程中保持耐心'],
    ['責任？','承擔責任讓團隊更加穩固'],
    ['ｈｅｌｌｏ','講者在台上說 hello 來問候大家'],
    ['時間。','善用時間能讓工作安排更完整']
  ]},
  {kind:'長句與口語',items:[
    ['我想問你怎麼看待團隊合作這件事','團隊合作需要彼此尊重與理解'],
    ['在不順利的時候如何重新振作起來','不順利的時候要重新振作，保持行動'],
    ['請問怎麼建立長久的人際關係','建立長久的人際關係需要真誠'],
    ['想知道持續前進的秘訣是什麼','持續前進來自願意天天學習'],
    ['我們應該怎麼陪伴剛加入的夥伴','陪伴剛加入的夥伴需要耐心傾聽']
  ]},
  {kind:'講者與故事內容',items:[
    ['夫妻共同經歷','這段夫妻共同經歷需要雙方彼此支持'],
    ['講者親身經歷','講者親身經歷中提到第一次上台'],
    ['家人支持','家人支持幫助我渡過難關'],
    ['團隊培訓','團隊培訓鼓勵夥伴交流經驗'],
    ['分享故事','分享故事之前需要確認故事來源']
  ]},
  {kind:'安全及干擾文字',items:[
    ['安全權限','管理安全權限不可讓私人內容被陌生人搜尋'],
    ['資料來源','回答必須有資料來源支持'],
    ['字幕時間','字幕時間應與音檔對齊'],
    ['原始逐字稿','原始逐字稿不能因搜尋優化被覆蓋'],
    ['搜尋索引','搜尋索引應該避免不必要讀取']
  ]}
];
test('30 representative Chinese questions (6 categories × 5) can retrieve the correct passage',async(t)=>{
  const s=store();
  try{
    let n=0;
    const questions:{kind:string;id:string;question:string}[]=[];
    for(const group of groups){
      for(const [question,body] of group.items){
        n++;const id='q'+n;
        await seed(s,id,group.kind,'講者A',body);
        questions.push({kind:group.kind,id,question});
      }
    }
    assert.equal(n,30);
    const corpus=questions.map(q=>q.id);
    for(const q of questions){
      const out=await findQaIndexedPassages(s.d1,q.question,corpus);
      await t.test(q.kind+' '+q.id+' '+q.question,()=>{
        assert.equal(out.covered.size,30);
        assert.ok(out.hits.slice(0,5).some(h=>h.trackId===q.id),'target should rank in top 5 among 30 competing recordings');
      });
    }
  }finally{s.close();}
});
test('two-character Chinese and full-width Latin words tokenize without AI calls',()=>{
  assert.ok(qaSearchTokens('我很感恩').includes('感恩'));
  assert.ok(qaQuestionTerms('如何面對挫折？').includes('挫折'));
  assert.match(qaSearchMatchExpression('感恩'),/"感恩"/);
  assert.ok(qaSearchTokens('ｈｅｌｌｏ').includes('hello'));
  assert.equal(qaSearchScore('沒有關聯', '感恩和努力'),0);
});
test('paragraph splitting preserves subtitle IDs, time range, speaker, and original input',()=>{
  const segments=Array.from({length:25},(_,i)=>({id:'s'+i,start:i*3,end:i*3+2,text:'感恩帶來勇氣和力量，持續學習可以改變生活。'}));
  const frozen=JSON.stringify(segments);
  const ps=buildQaSearchParagraphs('a','g','演講者',segments);
  assert.ok(ps.length>=1 && ps.length<25);
  assert.equal(ps[0].startMs,0);
  assert.equal(ps[ps.length-1].endMs,74000);
  assert.equal(ps[0].fromSegment,'s0');
  assert.equal(ps[ps.length-1].toSegment,'s24');
  assert.equal(JSON.stringify(segments),frozen);
  const changed=buildQaSearchParagraphs('a','g','演講者',[segments[0]],[{id:'s0',text:'正規化後感恩'}]);
  assert.equal(changed[0].content,'正規化後感恩');
  assert.equal(segments[0].text,'感恩帶來勇氣和力量，持續學習可以改變生活。');
});
test('generation updates are atomic to readers; source revisions fail closed',async()=>{
  const s=store();
  try{
    await seed(s,'v','初版','講者','生命需要感恩',111);
    let out=await findQaIndexedPassages(s.d1,'感恩',['v']);
    assert.equal(out.hits.length,1);
    s.db.prepare('UPDATE transcript_index SET updatedAt=? WHERE trackId=?').run(112,'v');
    out=await findQaIndexedPassages(s.d1,'感恩',['v']);
    assert.equal(out.covered.size,0);
    await replaceQaSearchGeneration(s.d1,{
      trackId:'v',sourceKey:'transcripts/v/transcript.json',sourceUpdatedAt:112,
      generation:'v2',speaker:'講者',subtitles:[{id:'s000001',start:0,end:3,text:'真誠交流增進關係'}]
    });
    out=await findQaIndexedPassages(s.d1,'感恩',['v']);
    assert.equal(out.hits.length,0);
    const updated=await findQaIndexedPassages(s.d1,'真誠',['v']);
    assert.equal(updated.hits.length,1);
    assert.equal(Number(s.db.prepare("SELECT count(*) AS n FROM qa_search_segments WHERE trackId='v'").get()?.n),1);
  }finally{s.close();}
});
test('permission checks run before indexed retrieval; indexed QA uses zero R2 reads',async()=>{
  const s=store();let reads=0;
  try{
    await seed(s,'public','公開演講','講者A','正向面對挫折，持續努力');
    const row:any=s.db.prepare("SELECT * FROM tracks WHERE id='public'").get();
    const env:any={DB:s.d1,R2_BUCKET:{async get(){reads++;throw Error('not expected');}},QA_CHINESE_SEARCH_ENABLED:'true'};
    const result=await excerpts(env,row,null,'current','如何面對挫折？');
    assert.match(result.prompt,/面對挫折/);
    assert.equal(reads,0);
    s.db.prepare('UPDATE tracks SET isPrivateVip=1 WHERE id=?').run('public');
    const locked:any=s.db.prepare("SELECT * FROM tracks WHERE id='public'").get();
    const blocked=await excerpts(env,locked,null,'current','如何面對挫折？');
    assert.equal(blocked.prompt,'');
    assert.equal(reads,0);
  }finally{s.close();}
});
test('search is opt-in; request-time path has no schema creation or backfill',()=>{
  const qa=read('worker/aiSpeakerQaRouter.ts');
  const workflow=read('worker/transcriptWorkflowV282.ts');
  const index=read('worker/qaTranscriptSearchIndex.ts');
  assert.match(qa,/QA_CHINESE_SEARCH_ENABLED==='true'/);
  assert.match(qa,/mayUseTranscript/);
  assert.match(workflow,/QA_CHINESE_SEARCH_WRITE_ENABLED==='true'/);
  assert.match(workflow,/replaceQaSearchGeneration/);
  assert.doesNotMatch(index,/CREATE TABLE|CREATE VIRTUAL TABLE/);
  assert.doesNotMatch(workflow,/backfill/i);
  assert.match(migration,/CREATE VIRTUAL TABLE IF NOT EXISTS qa_search_fts/);
});

test('correction add/accept/supplement/revoke immediately blocks stale results, and rebuild uses effective text',async()=>{
 const s=store();
 try{
  await seed(s,'edit','原始演講','講者','感恩是重要的態度');
  const initial=await findQaIndexedPassages(s.d1,'感恩',['edit']);
  assert.equal(initial.hits.length,1);
  s.db.prepare("INSERT INTO transcript_correction_events(id,trackId,segmentId,createdAt,updatedAt,status,newText) VALUES(?,?,?,?,?,'pending_review',?)")
    .run('event1','edit','s000001',50,50,'有效陪伴能幫助學員');
  const stale=await findQaIndexedPassages(s.d1,'感恩',['edit']);
  assert.equal(stale.hits.length,0);
  assert.equal(stale.blocked.has('edit'),true);
  let reads=0;
  const env:any={DB:s.d1,QA_CHINESE_SEARCH_WRITE_ENABLED:'true',R2_BUCKET:{async get(){
    reads++;return {async text(){return JSON.stringify({
      createdAt:1,segments:[{id:'s000001',start:2,end:12,text:'感恩是重要的態度'}]
    });}};
  }}};
  const rebuilt=await rebuildQaSearchAfterMutation(env,'edit');
  assert.equal(rebuilt.indexed,true);
  assert.equal(reads,1);
  assert.equal((await findQaIndexedPassages(s.d1,'有效陪伴',['edit'])).hits.length,1);
  assert.equal((await findQaIndexedPassages(s.d1,'感恩',['edit'])).hits.length,0);
  s.db.prepare("UPDATE transcript_correction_events SET status='supplemented',adminText='補充修正合作技巧',updatedAt=51 WHERE id='event1'").run();
  assert.equal((await findQaIndexedPassages(s.d1,'有效陪伴',['edit'])).blocked.has('edit'),true);
  await rebuildQaSearchAfterMutation(env,'edit');
  assert.equal((await findQaIndexedPassages(s.d1,'補充修正',['edit'])).hits.length,1);
  s.db.prepare("UPDATE transcript_correction_events SET status='revoked',updatedAt=52 WHERE id='event1'").run();
  assert.equal((await findQaIndexedPassages(s.d1,'補充修正',['edit'])).blocked.has('edit'),true);
  await rebuildQaSearchAfterMutation(env,'edit');
  assert.equal((await findQaIndexedPassages(s.d1,'感恩',['edit'])).hits.length,1);
  assert.equal((await findQaIndexedPassages(s.d1,'補充修正',['edit'])).hits.length,0);
 }finally{s.close();}
});
test('legacy corrections, permissions and physical track deletion automatically invalidate/clean derived rows',async()=>{
 const s=store();
 try{
  await seed(s,'acl','權限管理','講者','公開成長學習與家庭分享');
  s.db.prepare("UPDATE tracks SET requiredRank='鑽石級以上' WHERE id='acl'").run();
  assert.equal((await findQaIndexedPassages(s.d1,'成長',['acl'])).blocked.has('acl'),true);
  const track:any=s.db.prepare("SELECT * FROM tracks WHERE id='acl'").get();
  const env:any={DB:s.d1,QA_CHINESE_SEARCH_ENABLED:'true',R2_BUCKET:{async get(){throw Error('stale R2 read prohibited');}}};
  const blocked=await excerpts(env,track,null,'current','成長');
  assert.equal(blocked.prompt,'');
  await seed(s,'legacy','舊版訂正','講者','成長與夥伴同行');
  s.db.prepare('INSERT INTO transcript_corrections(id,trackId,segmentId,newText,createdAt) VALUES(?,?,?,?,?)')
   .run('legacy1','legacy','s000001','這一段已更正為另一段說法',12);
  assert.equal((await findQaIndexedPassages(s.d1,'成長',['legacy'])).blocked.has('legacy'),true);
  s.db.prepare("DELETE FROM tracks WHERE id='legacy'").run();
  assert.equal(Number((s.db.prepare("SELECT count(*) n FROM qa_search_segments WHERE trackId='legacy'").get() as any).n),0);
  assert.equal(Number((s.db.prepare("SELECT count(*) n FROM qa_search_state WHERE trackId='legacy'").get() as any).n),0);
  assert.equal((await findQaIndexedPassages(s.d1,'成長',['legacy'])).hits.length,0);
 }finally{s.close();}
});
test('simulated 112 recordings: competing searches report local SQLite storage, query P95 and no R2 downloads',async()=>{
 const s=store();
 try{
  const before=(s.db.prepare('PRAGMA page_count').get() as any).page_count *
    (s.db.prepare('PRAGMA page_size').get() as any).page_size;
  const ids:string[]=[];
  for(let i=0;i<112;i++){
    const id='perf-'+i;ids.push(id);
    const specific=i===41?'堅定信念讓家庭與事業持續成長':'團隊溝通合作能提升學習的品質';
    const text=[specific,'透過具體行動與真誠陪伴累積實力，建立信任與目標，持續改善生活。'.repeat(10)].join(' ');
    await seed(s,id,'測試音檔'+i,'模擬講者',text,i+1);
  }
  const bytes=(s.db.prepare('PRAGMA page_count').get() as any).page_count *
    (s.db.prepare('PRAGMA page_size').get() as any).page_size-before;
  const times:number[]=[];
  const question='堅定信念讓家庭與事業持續成長';
  for(let i=0;i<40;i++){
    const start=performance.now();
    const result=await findQaIndexedPassages(s.d1,question,ids.slice(0,70));
    times.push(performance.now()-start);
    assert.ok(result.hits.slice(0,5).some(h=>h.trackId==='perf-41'));
  }
  times.sort((a,b)=>a-b);
  const p95=times[Math.ceil(0.95*times.length)-1];
  // Local SQLite resource measurements, NOT billed Cloudflare D1 metrics.
  console.log('C09 LOCAL SQLITE BENCHMARK '+JSON.stringify({
    documents:112,queries:40,indexBytes:bytes,bytesPerDocument:Math.round(bytes/112),
    searchP95Ms:Number(p95.toFixed(2)),sourceR2Gets:0,
    approximateSegmentInsertCount:Number((s.db.prepare('SELECT count(*) n FROM qa_search_segments').get() as any).n)
  }));
  assert.ok(bytes>0&&bytes<16*1024*1024,'synthetic corpus index should fit 16 MiB in local benchmark');
  assert.ok(Number.isFinite(p95)&&p95>=0);
 }finally{s.close();}
});
