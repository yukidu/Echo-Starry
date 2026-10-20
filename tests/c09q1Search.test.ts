import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  makeParagraphs,normalizeSearchText,searchTokens,queryTokens,lexicalScore,
  filterAuthorizedEvidence,searchQ1WithAuthority,stageOrdinaryQ1,publishOrdinaryQ1,invalidateQ1Source
} from '../c09q1/search.ts';
import type {SearchDoc,Candidate,LiveAuthority} from '../c09q1/search.ts';

const pairCases:[string,string,string][]=[
  ['營養攝取','健康餐食','營養攝取與健康餐食要搭配蔬菜'],
  ['會員資料','權限審核','會員資料的權限審核需要本人同意'],
  ['錄音檔案','播放進度','錄音檔案應保存播放進度'],
  ['逐字稿','字幕校對','逐字稿和字幕校對流程需人工確認'],
  ['下載檔案','備份還原','下載檔案前先確認備份還原'],
  ['團隊培訓','新人入門','團隊培訓應照顧新人入門'],
  ['雲端空間','儲存大小','雲端空間需要計算儲存大小'],
  ['活動排程','時間規劃','活動排程要配合時間規劃'],
  ['搜尋結果','引用來源','搜尋結果必須有引用來源'],
  ['音檔分享','公開連結','音檔分享應確認公開連結'],
  ['文字摘要','重點整理','文字摘要呈現重點整理'],
  ['管理後台','操作安全','管理後台強調操作安全'],
  ['手機安裝','桌面圖示','手機安裝可以使用桌面圖示'],
  ['問答歷史','閱讀紀錄','問答歷史要保留閱讀紀錄'],
  ['原始字幕','時間標記','原始字幕必須保有時間標記'],
  ['電池獎勵','訂正紀錄','電池獎勵由訂正紀錄審核'],
  ['夫妻會員','共同資料','夫妻會員保留共同資料關聯'],
  ['使用者登入','安全驗證','使用者登入需要安全驗證'],
  ['個人照片','頭像尺寸','個人照片的頭像尺寸適合手機'],
  ['消息通知','接收時間','消息通知應標示接收時間'],
  ['網站首頁','清單排序','網站首頁支援清單排序']
];
const synonyms:[string,string,string,string][]=[
  ['新手','初學者','學習','研習'],['團隊','夥伴','訓練','培訓'],
  ['修正','更正','逐字稿','逐字記錄'],['錄音','音檔','播放','收聽'],
  ['費用','花費','方法','辦法'],['訊息','通知','下載','取得檔案'],
  ['健康','保健','飲食','餐食'],['備份','備存','還原','復原']
];
const simplicities:[string,string][]=[
  ['團隊學習','团队学习'],['會員權限','会员权限'],
  ['錄音下載','录音下载'],['健康飲食','健康饮食']
];
const negatives:[string,string][]=[
  ['不能刪除已核准的檔案','不能刪除已核准的檔案'],
  ['沒有會員資料不可存取','沒有會員資料不可存取'],
  ['不要重複轉錄成功音檔','不要重複轉錄成功音檔'],
  ['不會公開私人問答內容','不會公開私人問答內容']
];
type Case={kind:string;question:string;answer:string|null};
const corpus:SearchDoc[]=[];
const cases:Case[]=[];
let n=0;
function addDoc(text:string,version='v1'){
  const trackId='fake-'+String(++n).padStart(4,'0');
  corpus.push({trackId,version,sourceKey:'fake-r2/'+trackId+'.json',sourceUpdatedAt:100+n,
    permissionsRevision:'p1',epoch:'epoch-9',segments:[{id:'s1',start:0,end:8,text}]});
  return trackId;
}
for(const [a,b,description] of pairCases){const id=addDoc(description);cases.push({kind:'literal',question:`請問${a}和${b}有哪些重點？`,answer:id});}
for(const [one,other,two,alternate] of synonyms){const id=addDoc(`文件指出${one}與${two}的處理原則是依照人工審核`);cases.push({kind:'synonym',question:`${other}如何${alternate}？`,answer:id});}
for(const [traditional,simplified] of simplicities){const id=addDoc(`${traditional}有標準流程和注意事項`);cases.push({kind:'variant',question:`请问${simplified}流程`,answer:id});}
for(const [text,query] of negatives){const id=addDoc(text);cases.push({kind:'negation',question:query,answer:id});}
for(let i=0;i<3;i++){const id=addDoc(`私密典藏密鑰${['璀璨夜光','翡翠龍影','稻穗晨曦'][i]}應該保密`);cases.push({kind:'private',question:`密鑰${['璀璨夜光','翡翠龍影','稻穗晨曦'][i]}是什麼`,answer:null});void id;}
for(const q of ['水星移民船票','量子草莓宇宙跳躍','火星葡萄日記','南極海底城市'])cases.push({kind:'unanswerable',question:q,answer:null});
assert.equal(cases.length,44);
// Held out from development selection: phrase variations not in the authored
// primary gold cases; evaluate separately to avoid inflating train score.
const heldout:Case[]=[
  ...synonyms.map(([,second,,alternate],i)=>({kind:'heldout-synonym',question:`${second}的${alternate}有什麼說明`,answer:corpus[21+i].trackId})),
  ...simplicities.map(([,simplified],i)=>({kind:'heldout-variant',question:`${simplified}有什么注意事项`,answer:corpus[29+i].trackId}))
];
const candidates:Candidate[]=corpus.map(d=>({
  paragraph:makeParagraphs(d)[0],state:{trackId:d.trackId,version:d.version,
    generation:'g1',sourceKey:d.sourceKey,sourceUpdatedAt:d.sourceUpdatedAt,
    permissionsRevision:d.permissionsRevision,epoch:d.epoch,invalidated:0}
}));
const sources=Object.fromEntries(corpus.map(d=>[d.trackId,{version:d.version,sourceKey:d.sourceKey,sourceUpdatedAt:d.sourceUpdatedAt}]));
const privateIds=new Set(corpus.slice(37,40).map(d=>d.trackId));
const authorityResponse={epoch:'epoch-9',allowedTrackIds:corpus.filter(d=>!privateIds.has(d.trackId)).map(d=>d.trackId),
  sourceVersions:Object.fromEntries(corpus.map(d=>[d.trackId,d.version])),
  permissionsRevisions:Object.fromEntries(corpus.map(d=>[d.trackId,d.permissionsRevision]))};
function evaluate(items:Case[]){
 let eligible=0,top1=0,top5=0,wrongCitation=0,refused=0;
 const byKind:Record<string,{eligible:number;top1:number;top5:number;wrong:number}>={};
 for(const c of items){
  const found=filterAuthorizedEvidence({query:c.question,candidates,authorityResponse,currentSources:sources});
  const kind=byKind[c.kind]??={eligible:0,top1:0,top5:0,wrong:0};
  if(c.answer){eligible++;kind.eligible++;if(found[0]?.trackId===c.answer){top1++;kind.top1++;}
    if(found.some(r=>r.trackId===c.answer)){top5++;kind.top5++;}}
  else if(found.length){wrongCitation++;kind.wrong++;}else refused++;
 }
 return {count:items.length,eligible,top1,top5,wrongCitation,refused,byKind};
}

test('normalization only affects search surface; Chinese variants and concepts',()=>{
 assert.equal(normalizeSearchText('团队学习'), '團隊學習');
 assert.ok(searchTokens('初學者學習').includes('c01'));
 assert.ok(searchTokens('新手研習').includes('c00'));
 assert.deepEqual(queryTokens('請問什麼'),[]);
 assert.equal(corpus[0].segments[0].text,'營養攝取與健康餐食要搭配蔬菜');
});

test('44 prelabelled fake questions + 12 held-out: report recall, reject private sources',()=>{
 const a=evaluate(cases),b=evaluate(heldout);
 console.log('Q1_PRIMARY',JSON.stringify(a));console.log('Q1_HELDOUT',JSON.stringify(b));
 assert.equal(a.count,44);assert.equal(b.count,12);
 assert.equal(a.eligible,37);
 assert.equal(a.wrongCitation,0,'no citation when no legal source exists');
 assert.ok(a.top5/a.eligible>=0.9, 'Top5 recall target >=90% for seeded fake corpus');
 assert.ok(b.top5/b.eligible>=0.75, 'heldout is independently reported, not fit to primary set');
});

test('deny on stale epoch, changed source, correction version and permission removal',()=>{
 const first=candidates[0],target=first.paragraph.trackId,question='營養攝取與健康餐食';
 const baseline=filterAuthorizedEvidence({query:question,candidates:[first],authorityResponse,currentSources:sources});
 assert.equal(baseline.length,1);
 const fresh={...authorityResponse,epoch:'epoch-10'};
 assert.equal(filterAuthorizedEvidence({query:question,candidates:[first],authorityResponse:fresh,currentSources:sources}).length,0);
 assert.equal(filterAuthorizedEvidence({query:question,candidates:[first],authorityResponse:{...authorityResponse,allowedTrackIds:[]},currentSources:sources}).length,0);
 assert.equal(filterAuthorizedEvidence({query:question,candidates:[first],authorityResponse:{...authorityResponse,permissionsRevisions:{...authorityResponse.permissionsRevisions,[target]:'p2'}},currentSources:sources}).length,0);
 assert.equal(filterAuthorizedEvidence({query:question,candidates:[first],authorityResponse,currentSources:{...sources,[target]:{...sources[target],version:'v2'}}}).length,0);
 assert.equal(filterAuthorizedEvidence({query:question,candidates:[{...first,state:{...first.state,invalidated:1}}],authorityResponse,currentSources:sources}).length,0);
 assert.equal(filterAuthorizedEvidence({query:question,candidates:[first],authorityResponse:null,currentSources:sources}).length,0);
});

test('negative queries reject a positive-only explanation, no paid AI',()=>{
 const p=makeParagraphs({...corpus[0],segments:[{id:'s1',start:0,end:5,text:'可以刪除成功的音檔'}]})[0];
 assert.equal(lexicalScore('不能刪除成功的音檔',p),0);
});

test('authority request denial and timeout always fail closed before SQL query',async()=>{
 let hits=0;
 const db={prepare:()=>{hits++;throw Error('must not query');}};
 const authority:LiveAuthority={check:async()=>null};
 assert.deepEqual(await searchQ1WithAuthority(db,'營養攝取',[corpus[0].trackId],authority,sources),[]);
 assert.equal(hits,0);
 const timedOut:LiveAuthority={check:async()=>{throw Error('offline');}};
 assert.deepEqual(await searchQ1WithAuthority(db,'營養攝取',[corpus[0].trackId],timedOut,sources),[]);
 assert.equal(hits,0);
});

test('ordinary SQLite-only schema scale benchmarks 30/112/500/2000 and dump/restore',()=>{
 const dir=mkdtempSync(join(tmpdir(),'c09q1-'));
 try{
  const rows:SearchDoc[]=[];
  const vocab=['團隊新手學習方法','健康飲食營養攝取','錄音下載播放進度','會員權限安全審核',
    '逐字稿訂正錯字','備份還原資料保存','電池獎勵審核流程','雲端空間成本預算',
    '活動時間和講者介紹','分享通知與訊息更新','訓練培訓共同成長','檔案版本撤回權限'];
  // Gradual lengths include genuinely multi-paragraph records, not just 2k one-line snippets.
  for(let i=0;i<2000;i++){
    const base=vocab[i%vocab.length],len=[150,460,990,1800][i%4];
    const sentence=(base+'。'+vocab[(i+3)%vocab.length]+'。');
    const text=sentence.repeat(Math.ceil(len/sentence.length)).slice(0,len);
    const subtitles=[];
    for(let at=0;at<text.length;at+=190)subtitles.push({id:`s${at}`,start:at/10,end:(at+190)/10,text:text.slice(at,at+190)});
    rows.push({trackId:`scale-${String(i).padStart(4,'0')}`,version:'v1',sourceKey:`fake/${i}.json`,sourceUpdatedAt:i+1,
      permissionsRevision:'p1',epoch:'epoch-9',segments:subtitles});
  }
  const fixtures=rows.map(d=>({trackId:d.trackId,version:d.version,sourceKey:d.sourceKey,
    sourceUpdatedAt:d.sourceUpdatedAt,permissionsRevision:d.permissionsRevision,epoch:d.epoch,
    paragraphs:makeParagraphs(d)}));
  writeFileSync(join(dir,'fake.json'),JSON.stringify(fixtures));
  const schema=readFileSync(new URL('../c09q1/schema.sql',import.meta.url),'utf8');
  writeFileSync(join(dir,'schema.sql'),schema);
  const script=new URL('./c09q1Sqlite.py',import.meta.url).pathname;
  const run=spawnSync('python3',[script,dir],{encoding:'utf8',timeout:180000,maxBuffer:4_000_000});
  assert.equal(run.status,0,run.stdout+'\n'+run.stderr);
  const results=JSON.parse(run.stdout.trim());
  console.log('Q1_SQLITE_BENCH',JSON.stringify(results));
  assert.deepEqual(results.map((x:any)=>x.tracks),[30,112,500,2000]);
  assert.ok(results.every((x:any)=>x.rows>0 && x.posts>0 && x.p95_ms>0));
  assert.ok(results.every((x:any)=>x.dump_restore_ok===true));
  assert.ok(results.every((x:any)=>x.query_plan_index_used===true));
  assert.ok(results.every((x:any)=>x.new_generation_ok===true));
  assert.ok(results.every((x:any)=>x.revocation_zero_leak===true));
 }finally{rmSync(dir,{recursive:true,force:true});}
});


test('real TS ordinary-SQL helper: stage, switch, query, invalidate and deny stale publish',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'q1-helpers-'));const dbfile=join(dir,'case.db');
 const code=`import json,sqlite3,sys
p=json.loads(sys.argv[1]);conn=sqlite3.connect(sys.argv[2]);conn.row_factory=sqlite3.Row
try:
 if p.get('batch'):
  cur=[]
  for item in p['batch']:
   c=conn.execute(item['sql'],item['args']);cur.append({'meta':{'changes':c.rowcount}})
  result=cur
 elif p.get('script'): conn.executescript(p['sql']);result=None
 else:
  c=conn.execute(p['sql'],p.get('args',[]))
  if p['mode']=='first':
   r=c.fetchone();result=dict(r) if r else None
  elif p['mode']=='all': result={'results':[dict(r) for r in c.fetchall()]}
  else: result={'meta':{'changes':c.rowcount}}
 conn.commit();print(json.dumps({'result':result}))
except Exception as e:
 conn.rollback();print(json.dumps({'error':str(e)}));sys.exit(1)
finally:conn.close()`;
 const call=(input:any)=>{
  const p=spawnSync('python3',['-c',code,JSON.stringify(input),dbfile],{encoding:'utf8',timeout:20000});
  assert.equal(p.status,0,p.stdout+p.stderr);const r=JSON.parse(p.stdout);if(r.error)throw Error(r.error);return r.result;
 };
 const db:any={prepare:(sql:string)=>({bind:(...args:any[])=>({first:async()=>call({sql,args,mode:'first'}),
   run:async()=>call({sql,args,mode:'run'}),all:async()=>call({sql,args,mode:'all'}),sql,args})}),
   batch:async(statements:any[])=>call({batch:statements.map(i=>({sql:i.sql,args:i.args}))})};
 try{
  const schema=readFileSync(new URL('../c09q1/schema.sql',import.meta.url),'utf8');
  call({script:true,sql:schema});
  const d=corpus[0],gen='g-first';
  assert.equal(await stageOrdinaryQ1(db,d,gen),1);
  const authority:LiveAuthority={check:async()=>({epoch:'epoch-9',allowedTrackIds:[d.trackId],
    sourceVersions:{[d.trackId]:'v1'},permissionsRevisions:{[d.trackId]:'p1'}})};
  assert.equal(await publishOrdinaryQ1(db,d,gen,0,authority),true);
  const hits=await searchQ1WithAuthority(db,'營養攝取健康餐食',[d.trackId],authority,
    {[d.trackId]:{version:'v1',sourceKey:d.sourceKey,sourceUpdatedAt:d.sourceUpdatedAt}});
  assert.equal(hits[0]?.trackId,d.trackId);
  assert.equal(await invalidateQ1Source(db,d.trackId),true);
  const stale=await searchQ1WithAuthority(db,'營養攝取健康餐食',[d.trackId],authority,
    {[d.trackId]:{version:'v1',sourceKey:d.sourceKey,sourceUpdatedAt:d.sourceUpdatedAt}});
  assert.equal(stale.length,0);
  assert.equal(await publishOrdinaryQ1(db,d,gen,0,authority),false);
  const denied:LiveAuthority={check:async()=>null};
  assert.equal(await publishOrdinaryQ1(db,d,gen,1,denied),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
