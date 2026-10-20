/** C09/C10-Q1: OFFLINE-ONLY ordinary D1 search prototype.
 * No active Echo router imports this module. There are no AI or R2 calls.
 * A production caller must supply a *current independent authority*, an epoch,
 * the original source version and allowed track IDs; absence means no evidence.
 */
export type Subtitle = { id:string; start:number; end:number; text:string };
export type SearchDoc = {
  trackId:string; version:string; sourceKey:string; sourceUpdatedAt:number;
  permissionsRevision:string; epoch:string; segments:Subtitle[];
};
export type IndexedParagraph = {
  trackId:string; version:string; ordinal:number; fromSegment:string; toSegment:string;
  startMs:number; endMs:number; content:string; tokens:string[];
};
export type Evidence = IndexedParagraph & {score:number};
export type LiveAuthority = {
  /** Empty/unknown/failed current authority -> NO results. Must not be an Echo D1 restored snapshot. */
  check(trackIds:readonly string[]):Promise<{
    epoch:string; allowedTrackIds:string[]; sourceVersions:Record<string,string>;
    permissionsRevisions:Record<string,string>;
  } | null>;
};

// Search-only, curated equivalences. These NEVER change the original transcript
// and never produce the final spoken answer. Unknown terms remain lexical.
const phraseVariants:readonly (readonly string[])[] = [
  ['學習','研習','進修'],['新手','初學者','新人'],['團隊','小組','夥伴'],
  ['訓練','培訓','培育'],['成長','進步','精進'],['方法','方式','辦法'],
  ['費用','成本','花費'],['獎勵','回饋'],['訊息','消息','通知'],
  ['修正','訂正','更正'],['逐字稿','文字紀錄','逐字記錄'],
  ['播放','收聽'],['分享','轉傳'],['健康','保健'],['飲食','餐食'],
  ['會員','用戶'],['管理員','管理者'],['權限','存取資格'],
  ['儲存','保存'],['刪除','移除'],['下載','取得檔案'],
  ['查詢','搜尋','檢索'],['電池','點數'],['錄音','音檔'],
  ['備份','備存'],['還原','復原'],['不能','不可','無法'],
  ['沒有','並無','未曾'],['不會','不可能'],['不要','切勿'],
  ['提醒','提示'],['活動','聚會'],['時間','時段'],
  ['個人','自己'],['案例','例子'],['步驟','流程']
];
// A finite list, not blind single-character Han conversion. Ambiguous names
// and names of people must never be silently rewritten by search normalization.
const phraseHanPairs:readonly (readonly [string,string])[] = [
  ['团队','團隊'],['学习','學習'],['培训','培訓'],['成长','成長'],
  ['进步','進步'],['方法','方法'],['费用','費用'],['成本','成本'],
  ['奖励','獎勵'],['会员','會員'],['权限','權限'],['录音','錄音'],
  ['录制','錄製'],['听取','聽取'],['播放','播放'],['查询','查詢'],
  ['搜索','搜尋'],['检索','檢索'],['问题','問題'],['答案','答案'],
  ['备份','備份'],['恢复','恢復'],['还原','還原'],['删除','刪除'],
  ['储存','儲存'],['存储','儲存'],['下载','下載'],['分享','分享'],
  ['时间','時間'],['管理','管理'],['通知','通知'],['讯息','訊息'],
  ['设置','設定'],['纪录','紀錄'],['记录','紀錄'],['错误','錯誤'],
  ['处理','處理'],['数据','資料'],['资料','資料'],['简体','簡體'],
  ['繁体','繁體'],['说明','說明'],['为什么','為什麼'],['怎么','怎麼'],
  ['请问','請問'],['这个','這個'],['用户','用戶'],['运作','運作'],
  ['电池','電池'],['点数','點數'],['活动','活動'],['习惯','習慣'],
  ['饮食','飲食'],['营养','營養'],['健康','健康'],['身体','身體'],
  ['训练','訓練'],['计划','計畫'],['练习','練習'],['文件','文件'],
  ['设定','設定'],['发布','發布'],['审核','審核'],['删除前','刪除前'],
  ['复原','復原'],['问题集','問題集'],['重复','重複']
];
const negativeRe=/不能|不可|無法|沒有|並無|未曾|從未|不會|不可能|不要|切勿/u;
const questionStop=new Set(['請問','什麼','為什麼','如何','怎麼','是否','哪些','哪個','這個','那個','可以','請教','我想','知道','一下','嗎','呢','的是','有關','相關','關於']);
const lexicalStop=new Set(['我們','你們','他們','一個','這些','那些','以及','還有','就是','什麼','怎麼','如果','因為','但是','或者','所以','怎樣','為何','需要','應該','可以']);
function escapeRegex(s:string){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
export function normalizeSearchText(input:string):string {
  let s=String(input||'').normalize('NFKC').toLowerCase();
  for(const [from,to] of phraseHanPairs) s=s.replace(new RegExp(escapeRegex(from),'gu'),to);
  return s;
}
function variants(text:string):string[] {
  const matched:string[]=[];
  phraseVariants.forEach((list,n)=>{if(list.some(w=>text.includes(w)))matched.push('c'+String(n).padStart(2,'0'));});
  return matched;
}
function lexicalTerms(text:string):string[] {
  const parts=text.match(/[\p{Script=Han}]+|[a-z0-9]{2,}/gu)||[];
  const terms:string[]=[];
  for(const part of parts){
    if(/^\p{Script=Han}/u.test(part)){
      for(let i=0;i<part.length-1;i++){
        const t=part.slice(i,i+2);
        if(!lexicalStop.has(t)&&!questionStop.has(t))terms.push('h'+t);
      }
    } else terms.push('w'+part.slice(0,32));
  }
  return terms;
}
export function searchTokens(input:string):string[]{
  const text=normalizeSearchText(input);
  return [...new Set([...variants(text),...lexicalTerms(text)])];
}
export function queryTokens(input:string):string[]{
  let q=normalizeSearchText(input);
  for(const w of [...questionStop,'有什麼','說明','介紹','重點','內容'].sort((a,b)=>b.length-a.length))
    q=q.replace(new RegExp(escapeRegex(w),'gu'),' ');
  const conceptIds=variants(q);
  // Do not count the characters *inside an already recognized concept* twice;
  // otherwise a synonym of different length is unfairly penalized by its own
  // original Han bigrams. Retain uncommon names/anchors as exact lexical terms.
  for(const group of phraseVariants){
    for(const phrase of [...group].sort((a,b)=>b.length-a.length))
      q=q.replace(new RegExp(escapeRegex(phrase),'gu'),' ');
  }
  q=q.replace(/[的與和是有要在把]/gu,' ');
  return [...new Set([...conceptIds,...lexicalTerms(q)])].slice(0,14);
}
export function makeParagraphs(doc:SearchDoc):IndexedParagraph[]{
  if(!doc.trackId || !doc.version || !doc.sourceKey || !doc.epoch || !doc.permissionsRevision || !Number.isFinite(doc.sourceUpdatedAt))
    throw Error('incomplete source version; refuse indexing');
  const out:IndexedParagraph[]=[];
  let group:Subtitle[]=[],charCount=0,hanCount=0;
  const flush=()=>{
    if(!group.length)return;
    const content=group.map(x=>x.text.trim()).filter(Boolean).join(' ');
    if(content) out.push({trackId:doc.trackId,version:doc.version,ordinal:out.length,
      fromSegment:group[0].id,toSegment:group[group.length-1].id,
      startMs:Math.round(group[0].start*1000),endMs:Math.round(group[group.length-1].end*1000),
      content,tokens:searchTokens(content)});
    group=[];charCount=0;hanCount=0;
  };
  for(const s of doc.segments){
    if(!s.id || !s.text.trim() || !Number.isFinite(s.start)||!Number.isFinite(s.end)||s.end<=s.start)continue;
    const han=(s.text.match(/\p{Script=Han}/gu)||[]).length;
    if(group.length&&(charCount+s.text.length>900||hanCount+han>450))flush();
    group.push(s);charCount+=s.text.length;hanCount+=han;
    if(charCount>=900||hanCount>=450)flush();
  }
  flush();return out;
}
export function lexicalScore(question:string,paragraph:IndexedParagraph):number {
  const q=normalizeSearchText(question), text=normalizeSearchText(paragraph.content);
  const neg=negativeRe.test(q);
  // Do not let a positive passage masquerade as evidence of a negative claim.
  if(neg&&!negativeRe.test(text))return 0;
  // Explicit negative phrases should appear as a real phrase, not a scattered
  // combination of negation from one sentence and topic from another.
  const negPhrases=q.match(/(?:不能|不可|無法|沒有|並無|未曾|從未|不會|不可能|不要|切勿)[\p{Script=Han}]{2,5}/gu)||[];
  if(negPhrases.length&&!negPhrases.some(p=>text.includes(p))){
    // A synonym like 不可 / 不能 can differ; permit only if there is a
    // matching topic concept and a negative in the *same paragraph*.
    const qConcept=queryTokens(q).filter(x=>x.startsWith('c'));
    if(!qConcept.some(x=>paragraph.tokens.includes(x)))return 0;
  }
  const terms=queryTokens(q);
  if(!terms.length)return 0;
  const matched=terms.filter(x=>paragraph.tokens.includes(x));
  const covered=matched.length/terms.length;
  if(covered<0.46 || matched.length<Math.min(2,terms.length))return 0;
  const core=matched.filter(x=>x.startsWith('c')).length;
  const compact=q.replace(/[？?！!。，、\s]/g,'');
  const bonus=compact.length>=3&&text.includes(compact)?4:0;
  return Math.round(100*(covered+core*0.07)+bonus);
}
export type IndexState = {trackId:string;version:string;sourceKey:string;sourceUpdatedAt:number;permissionsRevision:string;epoch:string;generation:string;invalidated:number};
export type Candidate = {paragraph:IndexedParagraph;state:IndexState};
/**
 * This in-memory adapter implements the same current-source and generation
 * gates the proposed ordinary-SQL schema must maintain. It is NOT permission
 * authority and must never be treated as a connected production engine.
 */
export function filterAuthorizedEvidence(input:{
  query:string; candidates:Candidate[]; authorityResponse:Awaited<ReturnType<LiveAuthority['check']>>;
  currentSources:Record<string,{version:string;sourceKey:string;sourceUpdatedAt:number}>;
}):Evidence[] {
  const authority=input.authorityResponse;
  if(!authority?.epoch || !Array.isArray(authority.allowedTrackIds))return [];
  const allowed=new Set(authority.allowedTrackIds);
  const hits:Evidence[]=[];
  for(const {paragraph:p,state:s} of input.candidates){
    const current=input.currentSources[p.trackId];
    if(!current || !allowed.has(p.trackId) || s.invalidated!==0 ||
       s.epoch!==authority.epoch || s.version!==current.version ||
       s.sourceKey!==current.sourceKey || s.sourceUpdatedAt!==current.sourceUpdatedAt ||
       authority.sourceVersions[p.trackId]!==s.version ||
       authority.permissionsRevisions[p.trackId]!==s.permissionsRevision ||
       p.version!==s.version)continue;
    const score=lexicalScore(input.query,p);
    if(score>0)hits.push({...p,score});
  }
  hits.sort((a,b)=>b.score-a.score||a.trackId.localeCompare(b.trackId)||a.ordinal-b.ordinal);
  const seen=new Set<string>();
  return hits.filter(h=>{if(seen.has(h.trackId))return false;seen.add(h.trackId);return true;}).slice(0,5);
}

/** SQL retrieval is strictly bounded to authority-allowed track IDs (<=70),
 * terms (<=14) and raw paragraph hits (<=180). Never performs LIKE scans.
 * Permission checks MUST run again at final answer publication by its caller.
 * This OFF prototype has no installed real actor/authority integration.
 */
export async function queryOrdinaryPostings(db:any,question:string,allowedTrackIds:string[]):Promise<Candidate[]> {
  const ids=[...new Set(allowedTrackIds)].filter(Boolean).slice(0,70);
  const terms=queryTokens(question);
  if(!ids.length||!terms.length)return [];
  const rows=await db.prepare(
    'SELECT p.trackId,p.sourceVersion AS version,p.ordinal,p.fromSegment,p.toSegment,p.startMs,p.endMs,p.content,'+
    's.activeGeneration AS generation,s.sourceVersion,s.sourceKey,s.sourceUpdatedAt,'+
    's.permissionsRevision,s.authorityEpoch AS epoch,s.invalidated '+
    'FROM q1_postings q JOIN q1_paragraphs p ON p.id=q.paragraphId '+
    'JOIN q1_source_state s ON s.trackId=p.trackId AND s.activeGeneration=p.generation '+
    'WHERE q.term IN ('+terms.map(()=>'?').join(',')+') '+
    'AND p.trackId IN ('+ids.map(()=>'?').join(',')+') '+
    'AND s.invalidated=0 AND s.sourceVersion=p.sourceVersion '+
    'GROUP BY p.id ORDER BY COUNT(*) DESC LIMIT 180'
  ).bind(...terms,...ids).all();
  return (rows?.results||[]).map((r:any)=>({
    paragraph:{trackId:String(r.trackId),version:String(r.version),ordinal:Number(r.ordinal),
      fromSegment:String(r.fromSegment),toSegment:String(r.toSegment),
      startMs:Number(r.startMs),endMs:Number(r.endMs),content:String(r.content),
      tokens:searchTokens(String(r.content))},
    state:{trackId:String(r.trackId),version:String(r.version),generation:String(r.generation),
      sourceKey:String(r.sourceKey),sourceUpdatedAt:Number(r.sourceUpdatedAt),
      permissionsRevision:String(r.permissionsRevision),epoch:String(r.epoch),
      invalidated:Number(r.invalidated)}
  }));
}
/** A secure host must re-check its current external authority on every read;
 * no cache of prior ACL/epoch proof is accepted by this prototype. */
export async function searchQ1WithAuthority(db:any,query:string,trackIds:string[],authority:LiveAuthority,
  currentSources:Record<string,{version:string;sourceKey:string;sourceUpdatedAt:number}>):Promise<Evidence[]> {
  // This remains unconnected until an actual CURRENT authority and Echo source
  // revision read are available, not a restored D1 snapshot or a KV guess.
  const ids=[...new Set(trackIds)].filter(Boolean);
  if(!authority||!ids.length||ids.length>70)return [];
  const before=await authority.check(ids).catch(()=>null);
  if(!before?.epoch)return [];
  const permitted=before.allowedTrackIds.filter(x=>ids.includes(x));
  const candidates=await queryOrdinaryPostings(db,query,permitted);
  // A post-query check rejects revocation that arrives during SQL execution.
  // A later AI answer publication must independently repeat this check.
  const after=await authority.check(ids).catch(()=>null);
  if(!after || after.epoch!==before.epoch)return [];
  for(const id of permitted){
    if(!after.allowedTrackIds.includes(id) ||
       before.sourceVersions[id]!==after.sourceVersions[id] ||
       before.permissionsRevisions[id]!==after.permissionsRevisions[id])return [];
  }
  return filterAuthorizedEvidence({query,candidates,authorityResponse:after,currentSources});
}

/** Stage a new generation in ordinary tables WITHOUT switching the public
 * generation. A crash leaves invisible rows; explicit orphan cleanup may be
 * implemented only after the backup owner approves retention policy.
 * This is intentionally not called from any existing Echo route.
 */
export async function stageOrdinaryQ1(db:any,doc:SearchDoc,generation:string):Promise<number>{
  if(!generation || generation.length>80 || !/^[\w-]+$/.test(generation))throw Error('invalid generation');
  const paragraphs=makeParagraphs(doc);
  if(!paragraphs.length || paragraphs.length>2000)throw Error('invalid paragraph count');
  // A state row for a new fake track is born INVALID, not searchable.
  await db.prepare('INSERT OR IGNORE INTO q1_source_state(trackId,activeGeneration,sourceVersion,sourceKey,'+
    'sourceUpdatedAt,permissionsRevision,authorityEpoch,invalidated,sourceRevision,updatedAt) '+
    'VALUES(?,?,?,?,?,?,?,1,0,?)').bind(doc.trackId,'unpublished',doc.version,doc.sourceKey,
      doc.sourceUpdatedAt,doc.permissionsRevision,doc.epoch,Date.now()).run();
  for(const p of paragraphs){
    // UNIQUE(trackId,generation,ordinal) prevents staging two different
    // answers into one generation. No REPLACE or overwrite of old content.
    const inserted=await db.prepare('INSERT INTO q1_paragraphs(trackId,generation,sourceVersion,ordinal,'+
      'fromSegment,toSegment,startMs,endMs,content) VALUES(?,?,?,?,?,?,?,?,?) RETURNING id')
      .bind(doc.trackId,generation,doc.version,p.ordinal,p.fromSegment,p.toSegment,p.startMs,p.endMs,p.content).first();
    if(!inserted?.id)throw Error('failed to stage paragraph');
    for(let i=0;i<p.tokens.length;i+=32){
      const chunk=p.tokens.slice(i,i+32).map(term=>db.prepare('INSERT INTO q1_postings(term,paragraphId) VALUES(?,?)')
        .bind(term,Number(inserted.id)));
      if(!db.batch)throw Error('D1 batch unavailable; cannot stage terms');
      await db.batch(chunk);
    }
  }
  return paragraphs.length;
}

/** In the eventual application this MUST run in the same source mutation D1
 * transaction. This function alone cannot guarantee upstream wiring or restore
 * safety, so all external integrations remain disabled pending review. */
export async function invalidateQ1Source(db:any,trackId:string):Promise<boolean>{
  const result=await db.prepare('UPDATE q1_source_state SET invalidated=1,sourceRevision=sourceRevision+1,'+
    'updatedAt=? WHERE trackId=? RETURNING trackId').bind(Date.now(),trackId).first();
  return Boolean(result?.trackId);
}

/** One atomic UPDATE moves the sole active generation pointer. A no-row match
 * does not commit a half-published run because there is ONLY ONE mutable
 * authoritative state row here. Proof is checked before the update, and
 * authorisation must again be checked at query and eventual answer-publish.
 */
export async function publishOrdinaryQ1(db:any,doc:SearchDoc,generation:string,
  expectedSourceRevision:number,authority:LiveAuthority):Promise<boolean>{
  if(!authority||!Number.isSafeInteger(expectedSourceRevision)||expectedSourceRevision<0)return false;
  const proof=await authority.check([doc.trackId]).catch(()=>null);
  if(!proof || proof.epoch!==doc.epoch || !proof.allowedTrackIds.includes(doc.trackId) ||
    proof.sourceVersions[doc.trackId]!==doc.version ||
    proof.permissionsRevisions[doc.trackId]!==doc.permissionsRevision)return false;
  const row=await db.prepare('SELECT COUNT(*) AS n FROM q1_paragraphs '+
    'WHERE trackId=? AND generation=? AND sourceVersion=?').bind(doc.trackId,generation,doc.version).first();
  if(!(Number(row?.n)>0))return false;
  const updated=await db.prepare('UPDATE q1_source_state SET activeGeneration=?,invalidated=0,'+
    'sourceVersion=?,sourceKey=?,sourceUpdatedAt=?,permissionsRevision=?,authorityEpoch=?,'+
    'sourceRevision=sourceRevision+1,updatedAt=? WHERE trackId=? AND sourceRevision=? '+
    'AND invalidated=1 RETURNING trackId')
    .bind(generation,doc.version,doc.sourceKey,doc.sourceUpdatedAt,doc.permissionsRevision,
      doc.epoch,Date.now(),doc.trackId,expectedSourceRevision).first();
  return Boolean(updated?.trackId);
}
