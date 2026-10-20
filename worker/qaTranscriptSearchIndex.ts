/**
 * C09/C10: opt-in, versioned Chinese transcript search index.
 * Pure text processing; no model calls and no user/question/answer cache.
 * Activation requires an explicit D1 migration + flags; never DDL on GET.
 */
export type QaSubtitle = {id?:string; start?:number; end?:number; text?:string};
export type QaParagraph = {
  trackId:string; generation:string; segmentId:string; fromSegment:string; toSegment:string;
  startMs:number; endMs:number; speaker:string; content:string; searchTokens:string;
};
const hanCount=(s:string)=>(s.match(/\p{Script=Han}/gu)||[]).length;
export function qaSearchTokens(value:string):string[]{
  const text=String(value||'').normalize('NFKC').toLowerCase();
  const parts=text.match(/[\p{Script=Han}]+|[a-z0-9]{2,}/gu)||[];
  const terms:string[]=[];
  for(const part of parts){
    if(/^\p{Script=Han}/u.test(part)){
      for(let i=0;i<part.length-1;i++)terms.push(part.slice(i,i+2));
    }else if(part.length>=2)terms.push(part.slice(0,32));
  }
  return [...new Set(terms)];
}
export function qaQuestionTerms(question:string):string[]{
  const stop=new Set(['如何','怎麼','什么','什麼','請問','可以','能夠','是否','這個','那個','我們','你們','他們','請教','知道','一個','哪些','為什','什麼']);
  return qaSearchTokens(question).filter(t=>!stop.has(t)).slice(0,8);
}
export function buildQaSearchParagraphs(trackId:string,generation:string,speaker:string,subtitles:QaSubtitle[],cleaned:{id?:string;text?:string}[]=[]):QaParagraph[]{
  const overrides=new Map(cleaned.map(s=>[String(s.id||''),String(s.text||'')]));
  const result:QaParagraph[]=[];let current:QaSubtitle[]=[];let length=0,chars=0;
  const flush=()=>{
    if(!current.length)return;
    const first=current[0],last=current[current.length-1];
    const content=current.map(s=>String(s.text||'').trim()).filter(Boolean).join(' ');
    if(content)result.push({
      trackId,generation,segmentId:String(first.id||'')+'..'+String(last.id||''),
      fromSegment:String(first.id||''),toSegment:String(last.id||''),
      startMs:Math.max(0,Math.round(Number(first.start||0)*1000)),
      endMs:Math.max(0,Math.round(Number(last.end||0)*1000)),
      speaker,content,searchTokens:qaSearchTokens(content).join(' ')
    });
    current=[];length=0;chars=0;
  };
  for(const raw of subtitles){
    const id=String(raw.id||'');
    const text=(overrides.get(id)||String(raw.text||'')).trim();
    if(!text)continue;
    const start=Number(raw.start||0),end=Number(raw.end||0);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)continue;
    const count=hanCount(text);
    if(current.length&&(chars+count>550||length+text.length>1050))flush();
    current.push({id,start,end,text});chars+=count;length+=text.length;
    if(chars>=450||length>=900)flush();
  }
  flush();return result;
}
export function qaSearchMatchExpression(question:string):string{
  const terms=qaQuestionTerms(question);
  // Terms are constrained to Han/alphanumeric by qaSearchTokens, quoted for FTS5.
  return terms.map(term=>'"'+term+'"').join(' OR ');
}
export function qaSearchScore(question:string,content:string):number{
  const terms=qaQuestionTerms(question);
  const normalized=String(content||'').normalize('NFKC').toLowerCase();
  let score=terms.reduce((n,t)=>n+(normalized.includes(t)?1:0),0);
  const original=String(question||'').normalize('NFKC').toLowerCase().replace(/[？?!！。\s，、]/g,'');
  if(original.length>=3&&normalized.includes(original))score+=3;
  return score;
}
const rows=(value:any):any[]=>Array.isArray(value?.results)?value.results:[];
/**
 * Build new generation while old generation remains readable; flip active pointer
 * only AFTER all rows are committed. A failed run must not expose partial index.
 */
export async function replaceQaSearchGeneration(db:any,options:{
  trackId:string;sourceKey:string;sourceUpdatedAt:number;generation:string;speaker:string;
  subtitles:QaSubtitle[];cleaned?:{id?:string;text?:string}[];
}):Promise<number>{
  const {trackId,sourceKey,sourceUpdatedAt,generation,speaker,subtitles,cleaned}=options;
  if(!trackId||!sourceKey||!generation||!Number.isFinite(sourceUpdatedAt))throw Error('逐字稿索引來源版本無效');
  const prior:any=await db.prepare('SELECT changeRevision FROM qa_search_state WHERE trackId=?').bind(trackId).first();
  const expectedRevision=Number(prior?.changeRevision||0);
  const paragraphs=buildQaSearchParagraphs(trackId,generation,speaker,subtitles,cleaned||[]);
  if(!paragraphs.length)throw Error('逐字稿沒有可索引的內容');
  // Guard expensive unbounded index jobs; long recordings can be handled in a later batch.
  if(paragraphs.length>2000)throw Error('段落超過安全索引上限');
  for(let i=0;i<paragraphs.length;i+=30){
    const batch=paragraphs.slice(i,i+30).map(p=>db.prepare(
      'INSERT OR IGNORE INTO qa_search_segments(trackId,generation,segmentId,fromSegment,toSegment,startMs,endMs,speaker,content,searchTokens) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(p.trackId,p.generation,p.segmentId,p.fromSegment,p.toSegment,p.startMs,p.endMs,p.speaker,p.content,p.searchTokens));
    await db.batch(batch);
  }
  // Compare-and-swap: a correction or permission mutation during indexing
  // increments changeRevision in its own D1 transaction; stale builds cannot
  // override that invalidation and expose an outdated paragraph.
  const published:any=await db.prepare(
    'INSERT INTO qa_search_state(trackId,activeGeneration,sourceKey,sourceUpdatedAt,segmentCount,updatedAt,invalidated,changeRevision) '+
    'VALUES (?,?,?,?,?,?,0,?) ON CONFLICT(trackId) DO UPDATE SET '+
    'activeGeneration=excluded.activeGeneration,sourceKey=excluded.sourceKey,'+
    'sourceUpdatedAt=excluded.sourceUpdatedAt,segmentCount=excluded.segmentCount,'+
    'updatedAt=excluded.updatedAt,invalidated=0 '+
    'WHERE qa_search_state.changeRevision=excluded.changeRevision RETURNING trackId'
  ).bind(trackId,generation,sourceKey,sourceUpdatedAt,paragraphs.length,Date.now(),expectedRevision).first();
  if(!published?.trackId)throw Error('索引期間來源已變更，取消舊版本發布');
  // Obsolete generations are never used, even if cleanup fails.
  await db.prepare('DELETE FROM qa_search_segments WHERE trackId=? AND generation<>?').bind(trackId,generation).run().catch(()=>null);
  return paragraphs.length;
}
export async function findQaIndexedPassages(db:any,question:string,trackIds:string[]):Promise<{
  covered:Set<string>;blocked:Set<string>;hits:{trackId:string;content:string;startMs:number;endMs:number;fromSegment:string;toSegment:string;score:number}[];
}>{
  const covered=new Set<string>();
  const ids=[...new Set(trackIds)].filter(Boolean).slice(0,70);
  const expression=qaSearchMatchExpression(question);
  if(!ids.length||!expression)return {covered,blocked:new Set<string>(),hits:[]};
  const placeholders=ids.map(()=>'?').join(',');
  // Permission/correction trigger sets invalidated synchronously with original
  // mutation; never fall back to a stale R2-original for those tracks.
  const blocked=new Set<string>();
  const states=rows(await db.prepare(
    'SELECT trackId,invalidated FROM qa_search_state WHERE trackId IN ('+placeholders+')'
  ).bind(...ids).all());
  for(const state of states)if(Number(state.invalidated))blocked.add(String(state.trackId));
  // A changed R2 key/status/version invalidates the index without modifying data.
  const usable=rows(await db.prepare(
    'SELECT s.trackId FROM qa_search_state s JOIN transcript_index i ON i.trackId=s.trackId '+
    'JOIN tracks t ON t.id=s.trackId '+
    "WHERE i.status='ready' AND s.invalidated=0 AND i.r2Key=s.sourceKey AND i.updatedAt=s.sourceUpdatedAt "+
    'AND s.trackId IN ('+placeholders+')'
  ).bind(...ids).all());
  for(const r of usable)covered.add(String(r.trackId));
  if(!covered.size)return {covered,blocked,hits:[]};
  const accepted=[...covered];
  const places=accepted.map(()=>'?').join(',');
  const entries=rows(await db.prepare(
    'SELECT p.trackId,p.content,p.startMs,p.endMs,p.fromSegment,p.toSegment '+
    'FROM qa_search_fts JOIN qa_search_segments p ON p.id=qa_search_fts.rowid '+
    'JOIN qa_search_state s ON s.trackId=p.trackId AND s.activeGeneration=p.generation '+
    'WHERE qa_search_fts MATCH ? AND p.trackId IN ('+places+') '+
    'ORDER BY bm25(qa_search_fts) LIMIT 180'
  ).bind(expression,...accepted).all());
  const hits=entries.map(r=>({...r,score:qaSearchScore(question,String(r.content))}))
    .filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,40);
  return {covered,blocked,hits};
}

/** Rebuild one changed recording; no bulk historical backfill or AI calls.
 * Must only run with explicit search write flag and migrated D1 schema.
 * Caller owns user permissions. Source transcript is read only, once.
 */
export async function rebuildQaSearchAfterMutation(env:{
  DB:any;R2_BUCKET:any;QA_CHINESE_SEARCH_WRITE_ENABLED?:string
},trackId:string):Promise<{indexed:boolean;reason?:string;count?:number}>{
  if(env.QA_CHINESE_SEARCH_WRITE_ENABLED!=='true')return {indexed:false,reason:'disabled'};
  const indexed:any=await env.DB.prepare(
    "SELECT r2Key,updatedAt,status FROM transcript_index WHERE trackId=? LIMIT 1"
  ).bind(trackId).first();
  if(indexed?.status!=='ready'||!indexed.r2Key)return {indexed:false,reason:'missing_source'};
  const track:any=await env.DB.prepare('SELECT speaker FROM tracks WHERE id=? LIMIT 1').bind(trackId).first();
  if(!track)return {indexed:false,reason:'deleted_track'};
  const object=await env.R2_BUCKET?.get(indexed.r2Key);
  if(!object)return {indexed:false,reason:'missing_r2'};
  const source:any=JSON.parse(await object.text());
  if(!Array.isArray(source.segments))return {indexed:false,reason:'bad_source'};
  const base=Number(source.createdAt||0);
  const overrides=new Map<string,string>((Array.isArray(source.cleanedSegments)?source.cleanedSegments:[])
    .map((x:any)=>[String(x.id),String(x.text||'')]));
  // Earlier legacy corrections and current moderation events are both honoured.
  const old=await env.DB.prepare(
    'SELECT segmentId,newText FROM transcript_corrections WHERE trackId=? AND createdAt>=? ORDER BY createdAt,id'
  ).bind(trackId,base).all();
  for(const row of rows(old))overrides.set(String(row.segmentId),String(row.newText||''));
  const moderations=await env.DB.prepare(
    "SELECT segmentId,newText,adminText FROM transcript_correction_events WHERE trackId=? AND createdAt>=? AND status<>'revoked' ORDER BY createdAt,id"
  ).bind(trackId,base).all();
  for(const row of rows(moderations))overrides.set(String(row.segmentId),String(row.adminText||row.newText||''));
  const cleaned=[...overrides].map(([id,text])=>({id,text}));
  // New unique generation per real rebuild, but immutable original segments.
  const generation='qa-'+crypto.randomUUID();
  const count=await replaceQaSearchGeneration(env.DB,{
    trackId,sourceKey:String(indexed.r2Key),sourceUpdatedAt:Number(indexed.updatedAt),
    generation,speaker:String(track.speaker||''),subtitles:source.segments,cleaned
  });
  return {indexed:true,count};
}
