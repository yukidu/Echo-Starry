import { recordAiActivity } from './starryAiManagement';
import { findQaIndexedPassages, qaSearchEvidenceGuard, qaSearchEvidenceIsCurrent, type QaSearchEvidence } from './qaTranscriptSearchIndex';
import { qaSearchRebuildStatus, retryFailedQaSearchRebuild } from './qaTranscriptSearchRebuildQueue';
/**
 * Echo Starry transcript QA.  Server-side-only permissions, pricing and model.
 * No new app/database: transcripts in R2, indexes/comments in Echo D1, batteries in Starry ID D1.
 * Disabled by default until super-admin enables it after production verification.
 */
import { splitSpeakerNames } from '../shared/speakers';
import { pilotReady,selectQaSpeaker } from '../shared/storyAttribution';
import { formatCommentTimestamp } from '../shared/commentTime';
import { requestOpenAiSpeakerQa, OPENAI_SPEAKER_QA_MODEL } from './aiSpeakerQaOpenaiProvider';
import {parseQaRules,validateQaRules,buildQaSystemInstructions,checkQaAnswer,qaRepairMessages,type QaRuleOptions} from '../shared/qaAnswerRules';

type Env = { DB:any; STARRY_ID_DB?:any; R2_BUCKET?:any; AI?:any; OPENAI_API_KEY?:string; [key:string]:any };
type Policy = { daily:number; free:number; cost:number };
const MODELS = [
  { id:'@cf/qwen/qwen3-30b-a3b-fp8', label:'Qwen3 30B', strength:'繁體中文、推理問答' },
  { id:OPENAI_SPEAKER_QA_MODEL, label:'ChatGPT API · GPT-6 Luna', strength:'OpenAI 官方 API、自然對話（按量計費）' },
  { id:'@cf/qwen/qwen3.8-27b', label:'Qwen 3.8 27B', strength:'Cloudflare AI、繁體中文問答' },
  { id:'@cf/zai-org/glm-4.7-flash', label:'GLM-4.7 Flash', strength:'多語對話、長篇理解' },
  { id:'@cf/google/gemma-4-26b-a4b-it', label:'Gemma 4', strength:'長文整理、摘要' },
  { id:'@cf/meta/llama-3.1-8b-instruct-fp8', label:'Llama 3.1 8B', strength:'輕量、簡單提問' },
  { id:'@cf/nvidia/nemotron-3-120b-a12b', label:'Nemotron 3', strength:'複雜問題、多步驟分析' }
] as const;
const DEFAULT_POLICIES:Policy[] = [
  {daily:3,free:3,cost:0},     // 1 guest: configurable free use
  {daily:5,free:2,cost:10},    // 2 member below 15%
  {daily:10,free:4,cost:8},    // 3 15%+
  {daily:25,free:10,cost:4},   // 4 Platinum+
  {daily:40,free:20,cost:2}   // 5 Diamond+
];
// Costs above use central battery units (10 units per battery).
const LABELS = ['未登入的訪客','註冊會員未達15%或15%銅章','15%或15%銅章以上','白金或創辦人白金以上','鑽石級以上'];
const TOKEN_RE = /^[A-Za-z0-9_-]{30,}$/;
const schema = new WeakMap<object,Promise<void>>();
const txt=(x:any)=>String(x??'').trim();
const json=(value:any,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const units=(n:number)=>Number((n/10).toFixed(1));
const day=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);

async function ensure(env:Env){
  if(!env.DB)throw Error('資料庫尚未連線');
  const db=env.DB as object;
  if(!schema.has(db)){
    const p=(async()=>{
      await env.DB.batch([
        env.DB.prepare('CREATE TABLE IF NOT EXISTS qa_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL,updatedAt INTEGER NOT NULL)'),
        env.DB.prepare('CREATE TABLE IF NOT EXISTS qa_daily (identity TEXT NOT NULL,day TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(identity,day))'),
        env.DB.prepare("CREATE TABLE IF NOT EXISTS qa_claims (commentId TEXT PRIMARY KEY,identity TEXT NOT NULL,day TEXT NOT NULL,trackId TEXT NOT NULL,mode TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',error TEXT,createdAt INTEGER NOT NULL)"),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS qa_claims_day ON qa_claims(day,status)'),
        env.DB.prepare('CREATE TABLE IF NOT EXISTS qa_settings_history(id TEXT PRIMARY KEY,createdAt INTEGER NOT NULL,actorId TEXT NOT NULL,changeType TEXT NOT NULL,configJson TEXT NOT NULL)'),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS qa_settings_history_recent ON qa_settings_history(createdAt DESC)'),
        env.DB.prepare('CREATE TABLE IF NOT EXISTS qa_admin_preview_daily(day TEXT NOT NULL,owner TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,owner))'),
      ]);
    })();
    schema.set(db,p);p.catch(()=>schema.delete(db));
  }
  await schema.get(db);
}
async function settings(env:Env){
  await ensure(env);
  const rows=await env.DB.prepare('SELECT key,value FROM qa_settings').all();
  const map=new Map<string,string>((rows.results||[]).map((r:any)=>[txt(r.key),txt(r.value)]));
  let policies=DEFAULT_POLICIES;
  try{
    const p=JSON.parse(map.get('policies')||'null');
    if(Array.isArray(p)&&p.length===5)policies=p.map((x:any,i:number)=>({
      daily:Number(x.daily),free:Number(x.free),cost:Number(x.cost)
    })).map((x:Policy,i:number)=>validatePolicy(x)?x:DEFAULT_POLICIES[i]);
  }catch{}
  const model=map.get('model')||MODELS[0].id;
  return {enabled:map.get('enabled')==='true',model:MODELS.some(x=>x.id===model)?model:MODELS[0].id,policies,globalDaily:Math.max(1,Math.min(100,Number(map.get('globalDaily')||12))),replyDirections:map.get('replyDirections')||'',qaRules:parseQaRules(map)};
}
/**
 * Older mobile/PWA clients omit replyDirections entirely. Do not reject their
 * five-tier saves or erase the instructions already stored by a newer client.
 */
export function parseReplyDirectionsUpdate(body:any):string|undefined{
  if(!body || !Object.prototype.hasOwnProperty.call(body,'replyDirections') || body.replyDirections===undefined)return undefined;
  if(typeof body.replyDirections!=='string' || Array.from(body.replyDirections).length>2000)
    throw new Error('回答格式指令不得超過2000字');
  return body.replyDirections;
}
async function writeQaSettings(env:Env,values:Record<string,string>,who:string,kind:string){
  const now=Date.now(),prior=await settings(env);
  const snapshot={enabled:prior.enabled,model:prior.model,policies:prior.policies,globalDaily:prior.globalDaily,qaRules:prior.qaRules};
  const parts=Object.entries(values).map(([k,v])=>env.DB.prepare('INSERT INTO qa_settings(key,value,updatedAt) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt').bind(k,v,now));
  parts.push(env.DB.prepare('INSERT INTO qa_settings_history(id,createdAt,actorId,changeType,configJson) VALUES (?,?,?,?,?)').bind('qa-'+crypto.randomUUID(),now,who,kind,JSON.stringify(snapshot)));
  await env.DB.batch(parts);
}
function validatePolicy(p:Policy){
  return Number.isInteger(p.daily)&&p.daily>=0&&p.daily<=200&&Number.isInteger(p.free)&&p.free>=0&&p.free<=p.daily&&Number.isInteger(p.cost)&&p.cost>=0&&p.cost<=1000;
}
function cookieToken(req:Request){
  const cookie=req.headers.get('Cookie')||'';
  const item=cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('echostars_session='));
  const t=item?.split('=').slice(1).join('=')||'';
  return TOKEN_RE.test(t)?t:'';
}
export async function actor(req:Request,env:Env){
  const token=cookieToken(req);
  if(!token)return null;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const hash=Array.from(new Uint8Array(digest)).map(n=>n.toString(16).padStart(2,'0')).join('');
  const row:any=await env.DB.prepare("SELECT u.id,u.email,u.role,u.rank,u.approvedRank,u.rankApproved,u.isAdminUser,u.isBlocked,s.expiresAt FROM auth_sessions s JOIN users u ON u.id=s.userId WHERE s.tokenHash=? LIMIT 1").bind(hash).first();
  return row&&!row.isBlocked&&Number(row.expiresAt)>Date.now()?row:null;
}
export const isSuper=(u:any)=>Boolean(u&&(txt(u.email).toLowerCase()==='yukidu@gmail.com'||u.role==='超級管理員'));
export function tier(u:any){
  if(!u)return 0;
  if(!u.rankApproved)return 1;
  const r=txt(u.approvedRank||u.rank);
  if(/鑽石|皇冠|大使/.test(r))return 4;
  if(/白金|紅寶石|藍寶石|明珠|翡翠/.test(r))return 3;
  if(/15%|18%|21%|銀章|金章|銅章/.test(r))return 2;
  return 1;
}
async function identity(req:Request,u:any){
  if(u)return 'member:'+txt(u.id);
  // Do not trust a client-supplied device ID, which could be reset to farm free quota.
  // Hash IP + UA; never store raw network addresses.
  const value=(req.headers.get('CF-Connecting-IP')||'unknown')+'|'+(req.headers.get('User-Agent')||'').slice(0,200);
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return 'guest:'+Array.from(new Uint8Array(hash)).map(n=>n.toString(16).padStart(2,'0')).join('');
}
async function balance(env:Env,user:any){
  if(!user||!env.STARRY_ID_DB)return 0;
  const link:any=await env.STARRY_ID_DB.prepare("SELECT userId FROM legacy_links WHERE sourceApp='echostars' AND sourceUserId=? LIMIT 1").bind(user.id).first().catch(()=>null);
  const central=txt(link?.userId||user.id);
  const valid:any=await env.STARRY_ID_DB.prepare('SELECT id FROM users WHERE id=?').bind(central).first().catch(()=>null);
  if(!valid)return 0;
  const row:any=await env.STARRY_ID_DB.prepare('SELECT COALESCE(SUM(deltaUnits),0) n FROM battery_transactions WHERE userId=?').bind(central).first();
  return {userId:central,units:Number(row?.n||0)};
}
export async function quota(req:Request,env:Env,u:any,cfg:any){
  const t=tier(u),policy=cfg.policies[t],key=await identity(req,u),today=day();
  if(isSuper(u))return {unlimited:true,tier:5,label:'超級管理員',key,today,total:0,freeLeft:0,left:0,daily:0,free:0,cost:0,costUnits:0,reason:'',enabled:true};
  const row:any=await env.DB.prepare('SELECT used FROM qa_daily WHERE identity=? AND day=?').bind(key,today).first();
  const total=Number(row?.used||0),freeLeft=Math.max(0,policy.free-total),left=Math.max(0,policy.daily-total);
  const global:any=cfg.enabled?await env.DB.prepare("SELECT used FROM qa_daily WHERE identity='__global__' AND day=?").bind(today).first():null;
  let reason='';
  if(!cfg.enabled)reason='管理員尚未開啟問答';
  else if(Number(global?.used||0)>=cfg.globalDaily)reason='今日全站問答免費資源已達上限';
  else if(!left)reason='今日使用次數已達上限';
  else if(!freeLeft){
    if(!u)reason='訪客今日免費次數已用完';
    else {const b:any=await balance(env,u);if(!b?.userId||b.units<policy.cost)reason='電池不足，無法繼續召喚';}
  }
  return {tier:t+1,label:LABELS[t],key,today,total,freeLeft,left,daily:policy.daily,free:policy.free,cost:freeLeft?0:units(policy.cost),costUnits:freeLeft?0:policy.cost,reason,enabled:cfg.enabled};
}
function canAccess(u:any,t:any){
  if(isSuper(u))return true;
  // Keep the existing authorized-only and private VIP fences: a public rank is
  // not sufficient to make a member-only/private recording usable by guests.
  if(t.authorizedOnlyVisible&&!u)return false;
  if(t.isPrivateVip)return false; // prevent cross-video VIP leakage
  const required=txt(t.requiredRank);
  if(!required||required==='無'||required==='公開')return true;
  if(!u||!u.rankApproved)return false;
  const order=['無','3%','6%','9%','12%','12%初階','15%','15%銅章','18%','21%','銀章','金章','白金','紅寶石','創辦人白金','創辦人紅寶石','藍寶石','創辦人藍寶石','明珠','翡翠','創辦人翡翠','鑽石級以上'];
  const have=txt(u.approvedRank||u.rank);
  if(/鑽石|皇冠|大使/.test(have))return true;
  return order.indexOf(have)>=0&&order.indexOf(required)>=0&&order.indexOf(have)>=order.indexOf(required);
}
export async function mayUseTranscript(env:Env,u:any,track:any){
  if(!canAccess(u,track))return false;
  const cost=Number(track.stickerUnlockCost||0);
  if(cost<=0||isSuper(u))return true;
  if(!u)return false;
  const row=await env.DB.prepare('SELECT trackId FROM sticker_unlocks WHERE userId=? AND trackId=? LIMIT 1').bind(u.id,track.id).first().catch(()=>null);
  return !!row;
}
export async function reserve(env:Env,q:any,cfg:any,id:string,trackId:string,mode:string){
  // Super-admin has no application quota, counter increments or battery fees.
  // Cloudflare provider limits still apply externally.
  if(q.unlimited){
    const written=await env.DB.prepare("INSERT OR IGNORE INTO qa_claims(commentId,identity,day,trackId,mode,status,createdAt) VALUES (?,?,?,?,?,'pending',?)").bind(id,q.key,q.today,trackId,mode,Date.now()).run();
    return !!written.meta?.changes;
  }
  if(q.daily<1)return false;
  // Conditional increment is atomic in D1; never exceed user limit or global free budget.
  const db=env.DB;
  const global=await db.prepare("INSERT INTO qa_daily(identity,day,used) VALUES ('__global__',?,1) ON CONFLICT(identity,day) DO UPDATE SET used=used+1 WHERE used<? RETURNING used").bind(q.today,cfg.globalDaily).first();
  if(!global)return false;
  const personal=await db.prepare('INSERT INTO qa_daily(identity,day,used) VALUES (?,?,1) ON CONFLICT(identity,day) DO UPDATE SET used=used+1 WHERE used<? RETURNING used').bind(q.key,q.today,q.daily).first();
  if(!personal){await db.prepare("UPDATE qa_daily SET used=max(0,used-1) WHERE identity='__global__' AND day=?").bind(q.today).run();return false;}
  const inserted=await db.prepare("INSERT OR IGNORE INTO qa_claims(commentId,identity,day,trackId,mode,status,createdAt) VALUES (?,?,?,?,?,'pending',?)").bind(id,q.key,q.today,trackId,mode,Date.now()).run();
  if(!inserted.meta?.changes){
    await releaseCounters(env,q);
    return false;
  }
  return true;
}
async function releaseCounters(env:Env,q:any){
  if(q.unlimited)return;
  await env.DB.batch([
    env.DB.prepare("UPDATE qa_daily SET used=max(0,used-1) WHERE identity='__global__' AND day=?").bind(q.today),
    env.DB.prepare("UPDATE qa_daily SET used=max(0,used-1) WHERE identity=? AND day=?").bind(q.key,q.today)
  ]);
}
async function fail(env:Env,q:any,id:string,msg:string){
  await env.DB.prepare("UPDATE qa_claims SET status='failed',error=? WHERE commentId=? AND status='pending'").bind(msg.slice(0,300),id).run();
  await releaseCounters(env,q);
}
export async function excerpts(env:Env,track:any,u:any,mode:string,question:string){
  let rows=[track];
  if(mode==='all'){
    const data=await env.DB.prepare("SELECT * FROM tracks WHERE audioUrl IS NOT NULL AND TRIM(audioUrl)<>'' ORDER BY uploadDate DESC LIMIT 180").all();
    const people=new Set(splitSpeakerNames(track.speaker).map(s=>s.toLowerCase()));
    rows=(data.results||[]).filter((r:any)=>splitSpeakerNames(r.speaker).some(s=>people.has(s.toLowerCase()))&&canAccess(u,r));
  }
  const terms=question.toLowerCase().split(/[\s，。、？！?!.]+/).filter(x=>x.length>=2).slice(0,8);
  // One D1 lookup for all candidate recordings: no per-segment status requests.
  const candidates=rows.slice(0,70);
  const placeholders=candidates.map(()=>'?').join(',');
  const approvals=placeholders?await env.DB.prepare("SELECT p.trackId,p.status,p.revision,t.speaker,i.updatedAt,i.r2Key FROM ai_story_pilots p JOIN tracks t ON t.id=p.trackId LEFT JOIN transcript_index i ON i.trackId=p.trackId WHERE p.trackId IN ("+placeholders+")")
    .bind(...candidates.map((x:any)=>x.id)).all():{results:[]};
  const pilotMap=new Map((approvals.results||[]).map((x:any)=>[x.trackId,x]));
  const selectedSpeaker=selectQaSpeaker(question,track.speaker);
  const found:{score:number;part:string;title:string;evidence?:QaSearchEvidence}[]=[];
  // C09/C10 opt-in: never query an index before the explicit D1 migration and
  // reviewed backfill. The current member/rank/sticker and pilot gates are reused.
  let indexed:Awaited<ReturnType<typeof findQaIndexedPassages>>|null=null;
  if(env.QA_CHINESE_SEARCH_ENABLED==='true' && candidates.length){
    const eligible:string[]=[];
    for(const row of candidates){
      if(pilotMap.has(row.id))continue; // approved speaker stories use their existing, reviewed facts
      if(mode==='all'&&splitSpeakerNames(row.speaker).length>1)continue;
      if(await mayUseTranscript(env,u,row))eligible.push(row.id);
    }
    if(eligible.length){
      try {
        indexed=await findQaIndexedPassages(env.DB,question,eligible);
        const allowed=new Map(candidates.filter((r:any)=>eligible.includes(r.id)).map((r:any)=>[r.id,r]));
        for(const hit of indexed.hits){
          const source:any=allowed.get(hit.trackId);
          if(!source)continue;
          found.push({
            score:hit.score,
            part:'【'+txt(source.title)+'｜'+txt(source.speaker)+'】'+hit.content,
            title:txt(source.title),
            evidence:{trackId:hit.trackId,generation:hit.generation,
              changeRevision:hit.changeRevision,sourceKey:hit.sourceKey,
              sourceUpdatedAt:hit.sourceUpdatedAt}
          });
        }
      }catch(error){
        // A broken index cannot bypass access checks or prevent the old reader.
        console.warn('C09 search index unavailable',error instanceof Error?error.name:'unknown');
        // Corrected or revoked content must NEVER silently fall back to the
        // original R2 text if the index fails after explicit activation.
        return {prompt:'',sources:[],evidence:[]};
      }
    }
  }
  let fallbackReads=0;
  for(const row of candidates){
    if(!await mayUseTranscript(env,u,row))continue;
    const pilot:any=pilotMap.get(row.id);
    if(pilot){
      if(!pilotReady(pilot,pilot.updatedAt,pilot.r2Key,pilot.speaker)||!selectedSpeaker)continue;
      if(!splitSpeakerNames(pilot.speaker).includes(selectedSpeaker))continue;
      const facts=await env.DB.prepare('SELECT text,kind FROM ai_story_facts WHERE trackId=? AND owner=? AND sourceRevision=? ORDER BY start LIMIT 60').bind(row.id,selectedSpeaker,pilot.revision).all();
      for(const fact of facts.results||[]){
        const text=txt(fact.text)+(fact.kind==='shared'?'（夫妻共同經歷）':fact.kind==='retold'?'（由另一位講者轉述）':'');
        const score=terms.reduce((sum,x)=>sum+(text.toLowerCase().includes(x)?1:0),0);
        found.push({score,part:'【'+txt(row.title)+'｜AI 故事歸屬（未經獨立查證）：'+selectedSpeaker+'】'+text,title:txt(row.title)});
      }
      continue;
    }
    // All-talk search must not reintroduce unreviewed multi-speaker recordings.
    if(mode==='all'&&splitSpeakerNames(row.speaker).length>1)continue;
    if(indexed?.blocked.has(row.id))continue; // mutated source: no stale R2 fallback
    if(indexed?.covered.has(row.id))continue; // search directly from D1; no R2 read
    // Safety gate: an unindexed R2 original has no revision evidence that can
    // be checked atomically at AI publication. While opt-in indexed QA is ON,
    // fail closed rather than cite an older original after a concurrent edit.
    // When the flag is OFF the original QA path stays exactly unchanged.
    if(env.QA_CHINESE_SEARCH_ENABLED==='true')continue;
    // Legacy, flag-OFF only: retain the existing bounded R2 reader.
    if(indexed?.covered.size && fallbackReads>=2)continue;
    fallbackReads++;
    const idx:any=await env.DB.prepare("SELECT r2Key FROM transcript_index WHERE trackId=? AND status='ready' LIMIT 1").bind(row.id).first();
    if(!idx?.r2Key)continue;
    const object=await env.R2_BUCKET?.get(idx.r2Key);
    if(!object)continue;
    let data:any;try{data=JSON.parse(await object.text());}catch{continue;}
    const segments=Array.isArray(data.segments)?data.segments:[];
    for(let i=0;i<segments.length;i+=6){
      const text=segments.slice(i,i+6).map((v:any)=>txt(v.text)).join(' ').slice(0,1250);
      if(!text)continue;
      const score=terms.reduce((sum,x)=>sum+(text.toLowerCase().includes(x)?1:0),0);
      found.push({score,part:'【'+txt(row.title)+'｜'+txt(row.speaker)+'】'+text,title:txt(row.title)});
    }
  }
  const ranked=found.sort((a,b)=>b.score-a.score).slice(0,mode==='all'?9:7);
  const evidence=[...new Map(ranked.filter(x=>x.evidence).map(x=>[x.evidence!.trackId,x.evidence!])).values()];
  if(evidence.length && !(await qaSearchEvidenceIsCurrent(env.DB,evidence)))
    return {prompt:'',sources:[],evidence:[]};
  return {prompt:ranked.map(x=>x.part).join('\n').slice(0,9000),
    sources:[...new Set(ranked.map(x=>x.title))].filter(Boolean).slice(0,3),evidence};
}
/** Reply body and model metadata stay separate: show no references but keep
 * internal track evidence and permission checks unchanged.
 * The exact disclaimer is always appended on the server, exactly once.
 */
export const QA_REPLY_DISCLAIMER='<本留言由ai回覆，僅供參考，非本人回覆！>';
export function formatQaAnswer(answer:string,_sources:string[]){
  const stripOld=String(answer||'')
    .replace(/<本留言由ai回覆，僅供參考，非本人回覆！>/g,'')
    .replace(/（根據逐字稿整理，非講者本人回覆）/g,'')
    .replace(/\r\n?/g,'\n');
  const lines=stripOld.split('\n');
  const cleaned:string[]=[];
  for(const line of lines){
    // Source sections are stripped entirely; no titles or citations displayed.
    if(/^\s*(?:[#*>\-]\s*){0,3}(?:參考(?:資料|來源)|資料來源|引用來源|引用資料|來源|References?|Sources?)\s*(?:[:：].*)?$/i.test(line))break;
    cleaned.push(line);
  }
  const body=cleaned.join('\n')
    .replace(/(?:\(|（|\[)\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:\)|）|\])/g,'')
    .replace(/(?:^|\n)\s*(?:\d{1,2}:)?\d{1,2}:\d{2}\s*(?:[-–—>]+)\s*(?:\d{1,2}:)?\d{1,2}:\d{2}[^\n]*/g,'')
    .replace(/[（(【[]\s*(?:參考資料|資料來源|來源)\s*[:：][^）)\]】]*[）)\]】]/g,'')
    .trim();
  return body?body+'\n'+QA_REPLY_DISCLAIMER:'';
}
export function aiText(response:any){
  // Final answer only: never expose hidden reasoning or diagnostic metadata as a user reply.
  const pick=(v:any):string=>{
    if(typeof v==='string')return v.trim();
    if(Array.isArray(v))return v.map(pick).filter(Boolean).join('\n').trim();
    if(v && typeof v==='object'){
      if(['reasoning','thinking','reasoning_content'].includes(String(v.type||'')))return '';
      if(typeof v.text==='string')return v.text.trim();
      return pick(v.content??v.output_text??v.response??v.message);
    }
    return '';
  };
  const value=pick(response?.response)||pick(response?.result?.response)||
    pick(response?.choices?.[0]?.message?.content)||pick(response?.choices?.[0]?.text)||
    pick(response?.output_text)||pick(response?.output)||pick(response?.content);
  return value.slice(0,4000);
}

/** At most 3 model invocations in total, only on a NEW comment.
 * Empty final content does not mean the service is out of credits, so switch to
 * a small fallback model; never rerun old failed comments automatically.
 */
export async function runQaModelOnce(env:Env,chosen:string,messages:any[],maxTokens=1800){
  const answer=chosen===OPENAI_SPEAKER_QA_MODEL
    ?await requestOpenAiSpeakerQa(env,messages,maxTokens)
    :await env.AI.run(chosen,{messages,max_tokens:maxTokens,temperature:0.1});
  return aiText(answer).trim();
}
export async function generateQaAnswer(env:Env,model:string,messages:any[]){
  const candidates=[model,'@cf/qwen/qwen3-30b-a3b-fp8','@cf/meta/llama-3.1-8b-instruct-fp8']
    .filter((id,index,all)=>all.indexOf(id)===index).slice(0,3);
  const failures:string[]=[];
  for(let i=0;i<candidates.length;i++){
    const chosen=candidates[i];
    try{
      const reply=await runQaModelOnce(env,chosen,messages,i===0?1800:1200);
      if(reply){
        // Do not log private member questions or transcript contents.
        if(i)console.warn('QA answered using backup model',i);
        return {reply,model:chosen,attempts:i+1};
      }
      failures.push('empty');
      console.warn('QA provider returned empty final text',i,
        'no final text');
    }catch(error){
      failures.push('provider_error');
      console.warn('QA provider invocation failed',i,
        error instanceof Error?error.message.slice(0,160):'unknown');
    }
  }
  return {reply:'',model:'',attempts:candidates.length,reasons:failures};
}

/** Exactly one quality repair attempt; it does not reserve more daily quota or battery. */
export async function generateQaWithQuality(env:Env,model:string,messages:any[],rules:QaRuleOptions){
  const initial=await generateQaAnswer(env,model,messages);
  if(!initial.reply)return {...initial,qualityIssues:[] as string[],repaired:false};
  let candidate=initial.reply.slice(0,1700);
  let issues=checkQaAnswer(candidate,rules);
  if(!issues.length)return {...initial,reply:candidate,qualityIssues:[],repaired:false};
  try{
    const amended=await runQaModelOnce(env,initial.model,qaRepairMessages(messages,candidate,issues,rules),1400);
    if(amended){
      candidate=amended.slice(0,1700);
      issues=checkQaAnswer(candidate,rules);
      if(!issues.length)return {...initial,reply:candidate,qualityIssues:[],repaired:true};
    }
  }catch(e){console.warn('QA quality repair unavailable',e instanceof Error?e.name:'unknown');}
  return {...initial,reply:'',qualityIssues:issues,repaired:true};
}
export async function insertReply(env:Env,comment:any,track:any,reply:string,selectedSpeaker='',evidence:QaSearchEvidence[]=[]){
  const createdAt=Date.now(),id='qa-'+crypto.randomUUID(),name=selectedSpeaker||txt(track.speaker)||'演講者';
  const guard=qaSearchEvidenceGuard(evidence);
  // When indexed evidence is used, the decisive version verification AND the
  // comment write occur in the same atomic D1 INSERT statement. A transcript
  // changed while the AI model was generating makes the INSERT write 0 rows.
  const insert=env.DB.prepare(
    "INSERT INTO comments(id,trackId,authorName,authorAvatar,authorBadge,authorEmail,deviceId,content,timestamp,createdAt,replyToId,replyToAuthor,isAdmin,likes,likedBy) "+
    (evidence.length?
      "SELECT ?,?,?,?,?,?,?,?,?,?,?,?,0,0,'[]' WHERE "+guard.where:
      "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,0,'[]')")
  ).bind(id,track.id,name,txt(track.speakerAvatar),'AI_SPEAKER','','',reply,
    formatCommentTimestamp({createdAt}),createdAt,comment.id,txt(comment.authorName),...guard.params);
  const results=await env.DB.batch([
    insert,
    env.DB.prepare('UPDATE tracks SET commentsCount = (SELECT COUNT(*) FROM comments WHERE trackId=?) WHERE id=?').bind(track.id,track.id)
  ]);
  if(evidence.length && !Number(results?.[0]?.meta?.changes))
    throw Error('搜尋來源在 AI 回答期間變更，拒絕發布舊資料');
}
async function charge(env:Env,u:any,q:any,commentId:string){
  if(q.unlimited||!q.costUnits)return true;
  const b:any=await balance(env,u);if(!b?.userId||b.units<q.costUnits)return false;
  // Conditional D1 insert guards double-spend across concurrent requests.
  const tx=await env.STARRY_ID_DB.prepare("INSERT OR IGNORE INTO battery_transactions(id,userId,deltaUnits,balanceAfterUnits,type,sourceApp,sourceId,description,actorUserId,uniqueKey,createdAt,trackId) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(deltaUnits),0) FROM battery_transactions WHERE userId=?)>=?")
    .bind('battery-'+crypto.randomUUID(),b.userId,-q.costUnits,b.units-q.costUnits,'ai_speaker_qa_cost','echostars',commentId,'召喚演講者回答問題',b.userId,'echostars:qa:'+commentId,Date.now(),q.trackId||'',b.userId,q.costUnits).run();
  return !!tx.meta?.changes;
}
async function refund(env:Env,u:any,q:any,commentId:string){
  if(!q.costUnits||!u)return;
  const b:any=await balance(env,u);if(!b?.userId)return;
  await env.STARRY_ID_DB.prepare("INSERT OR IGNORE INTO battery_transactions(id,userId,deltaUnits,balanceAfterUnits,type,sourceApp,sourceId,description,actorUserId,uniqueKey,createdAt,trackId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind('battery-'+crypto.randomUUID(),b.userId,q.costUnits,b.units+q.costUnits,'ai_speaker_qa_refund','echostars',commentId,'回答失敗退還電池',b.userId,'echostars:qa:refund:'+commentId,Date.now(),q.trackId||'').run();
}
export async function processQaAfterComment(req:Request,env:Env,ctx:any,comment:any,mode:string){
  if(!['current','all'].includes(mode)||!comment?.id)return;
  const work=(async()=>{
    let q:any=null,charged=false,replyInserted=false,u:any=null;
    try{
      const cfg=await settings(env);
      u=await actor(req,env);
      if(!cfg.enabled&&!isSuper(u))return;
      // Assert the newly stored author matches the authenticated user.
      if(u?txt(comment.authorEmail).toLowerCase()!==txt(u.email).toLowerCase():!!txt(comment.authorEmail))return;
      if(comment.replyToId){
        const root:any=await env.DB.prepare('SELECT * FROM comments WHERE id=? AND trackId=? LIMIT 1').bind(comment.replyToId,comment.trackId).first();
        if(!root)return;
        let entry=root,depth=0;
        while(entry.replyToId&&depth++<60){
          entry=await env.DB.prepare('SELECT * FROM comments WHERE id=? AND trackId=? LIMIT 1').bind(entry.replyToId,comment.trackId).first();
          if(!entry)return;
        }
        if(entry.replyToId||entry.authorBadge==='AI_SPEAKER')return;
        if(u?txt(entry.authorEmail).toLowerCase()!==txt(u.email).toLowerCase():txt(entry.deviceId)!==txt(comment.deviceId)||!!entry.authorEmail)return;
        if(!u){
          // A deviceId is public in legacy comment JSON and can be spoofed.
          // Require the original root's server-side fingerprint too.
          const rootClaim:any=await env.DB.prepare('SELECT identity FROM qa_claims WHERE commentId=? LIMIT 1').bind(entry.id).first();
          if(!rootClaim||txt(rootClaim.identity)!==await identity(req,null))return;
        }
      }
      const track:any=await env.DB.prepare('SELECT * FROM tracks WHERE id=? LIMIT 1').bind(comment.trackId).first();
      if(!track||!await mayUseTranscript(env,u,track)||!env.R2_BUCKET||!env.AI)return;
      const pilot:any=await env.DB.prepare("SELECT p.status,p.revision,t.speaker,i.updatedAt,i.r2Key FROM ai_story_pilots p JOIN tracks t ON t.id=p.trackId LEFT JOIN transcript_index i ON i.trackId=p.trackId WHERE p.trackId=? LIMIT 1").bind(track.id).first();
      if(pilot&&!pilotReady(pilot,pilot.updatedAt,pilot.r2Key,pilot.speaker))return;
      const selectedSpeaker=pilot?selectQaSpeaker(comment.content,track.speaker):'';
      if(pilot&&!selectedSpeaker)return;
      q=await quota(req,env,u,cfg);
      if(q.reason)return;
      q.trackId=track.id;
      if(!await reserve(env,q,cfg,comment.id,track.id,mode))return;
      const source=await excerpts(env,track,u,mode,comment.content);
      if(!source.prompt){await fail(env,q,comment.id,'尚未有可引用的逐字稿');return;}
      if(source.evidence?.length && !(await qaSearchEvidenceIsCurrent(env.DB,source.evidence))){
        await fail(env,q,comment.id,'搜尋來源更新中，請重新提問');return;
      }
      await recordAiActivity(env as any,'echo.qa');
      const messages=[
        {role:'system',content:buildQaSystemInstructions(cfg.qaRules)},
        {role:'user',content:'學員問題：'+txt(comment.content).slice(0,1200)+'\n\n演講者分享的內容（僅供查核事實，不要在答案中提起素材格式）：\n'+source.prompt}
      ];
      const result=await generateQaWithQuality(env,cfg.model,messages,cfg.qaRules);
      const reply=result.reply;
      if(!reply){await fail(env,q,comment.id,'AI 無法產生符合規則的回答，本次不扣電池');return;}
      if(!await charge(env,u,q,comment.id)){await fail(env,q,comment.id,'電池不足，未扣款');return;}
      charged=q.costUnits>0;
      await insertReply(env,comment,track,formatQaAnswer(reply,source.sources),selectedSpeaker,source.evidence||[]);
      replyInserted=true;
      await env.DB.prepare("UPDATE qa_claims SET status='done',error=NULL WHERE commentId=?").bind(comment.id).run().catch(()=>null);
    }catch(e){
      console.warn('AI speaker QA failed',e instanceof Error?e.message:'unknown');
      if(!replyInserted && charged)await refund(env,u,q,comment.id).catch(()=>null);
      if(q && !replyInserted)await fail(env,q,comment.id,'服務暫時無法回答').catch(()=>null);
    }
  })();
  if(ctx?.waitUntil)ctx.waitUntil(work);else await work;
}
export async function handleQaRequest(req:Request,env:Env):Promise<Response|null>{
  const url=new URL(req.url),path=url.pathname,method=req.method.toUpperCase();
  if(!path.startsWith('/api/qa/'))return null;
  if(url.hostname!=='echo.starry.phd'&&!url.hostname.endsWith('.workers.dev'))return json({error:'無效網域'},404);
  try{
    const cfg=await settings(env),u=await actor(req,env),admin=isSuper(u);
    if(path==='/api/qa/progress'&&method==='GET'){
      const commentId=txt(url.searchParams.get('commentId')).slice(0,120);
      if(!/^c-[a-z0-9-]{20,}$/i.test(commentId))return json({error:'無效留言編號'},400);
      // A comment's author alone can read its AI generation status.
      // Never return private results by guessing another comment ID.
      const key=await identity(req,u);
      const row:any=await env.DB.prepare(
        'SELECT status,error FROM qa_claims WHERE commentId=? AND identity=? LIMIT 1'
      ).bind(commentId,key).first();
      if(!row)return json({status:'starting'});
      const state=txt(row.status);
      return json({
        status:state==='done'?'done':state==='failed'?'failed':'pending',
        ...(state==='failed'?{reason:txt(row.error)||'本次回覆失敗，未扣電池'}:{})
      });
    }
    if(path==='/api/qa/status'&&method==='GET'){
      const q=await quota(req,env,u,cfg);
      const trackId=txt(url.searchParams.get('trackId'));
      const track:any=trackId?await env.DB.prepare('SELECT * FROM tracks WHERE id=?').bind(trackId).first():null;
      if(trackId&&(!track||!await mayUseTranscript(env,u,track)))q.reason='沒有此音檔的問答權限';
      else if(trackId&&!q.reason){
        const pilot:any=await env.DB.prepare("SELECT p.status,p.revision,t.speaker,i.updatedAt,i.r2Key FROM ai_story_pilots p JOIN tracks t ON t.id=p.trackId LEFT JOIN transcript_index i ON i.trackId=p.trackId WHERE p.trackId=? LIMIT 1").bind(trackId).first();
        if(pilot&&!pilotReady(pilot,pilot.updatedAt,pilot.r2Key,pilot.speaker))q.reason='多人故事正在自動分析，完成可靠歸屬前暫停此場 AI 問答';
      }
      else if(trackId&&!q.reason){
        const index:any=await env.DB.prepare("SELECT status FROM transcript_index WHERE trackId=? LIMIT 1").bind(trackId).first().catch(()=>null);
        if(index?.status!=='ready')q.reason='本場演講逐字稿尚未完成';
      }
      return json({enabled:(cfg.enabled||q.unlimited)&&!q.reason,reason:q.reason,tier:q.tier,label:q.label,daily:q.daily,free:q.free,freeLeft:q.freeLeft,left:q.left,cost:q.cost,unlimited:!!q.unlimited});
    }
    if(!admin)return json({error:'只有超級管理員可以管理逐字稿與問答設定'},403);
    if(path==='/api/qa/index-rebuild/status'&&method==='GET'){
      if(env.QA_CHINESE_SEARCH_WRITE_ENABLED!=='true')return json({enabled:false,waiting:0,processing:0,retrying:0,failed:0});
      return json({enabled:true,...await qaSearchRebuildStatus(env.DB)});
    }
    if(path==='/api/qa/index-rebuild/retry'&&method==='POST'){
      if(env.QA_CHINESE_SEARCH_WRITE_ENABLED!=='true')return json({error:'索引功能尚未授權啟用'},409);
      const body:any=await req.json().catch(()=>({}));
      const trackId=txt(body.trackId);
      if(!trackId||trackId.length>128)return json({error:'請指定正確音檔'},400);
      const queued=await retryFailedQaSearchRebuild(env.DB,trackId);
      return json({queued,message:queued?'已重新排入安全佇列':'沒有可重試的失敗索引'});
    }

    if(path==='/api/qa/search'&&method==='GET'){
      // Admin-triggered search only: NEVER scan cloud files on each keystroke.
      const term=txt(url.searchParams.get('q')).slice(0,80);
      const speaker=txt(url.searchParams.get('speaker')).toLowerCase();
      if(term.length<2)return json({error:'關鍵字至少輸入兩個字'},400);
      const indexed:any=await env.DB.prepare("SELECT t.id,t.title,t.speaker,i.r2Key FROM transcript_index i JOIN tracks t ON t.id=i.trackId WHERE i.status='ready' AND i.r2Key IS NOT NULL ORDER BY t.uploadDate DESC").all();
      const candidates=(indexed.results||[]).filter((row:any)=>!speaker||splitSpeakerNames(row.speaker).some(n=>n.toLowerCase()===speaker));
      const hits:any[]=[];
      for(const row of candidates.slice(0,100)){
        const object=await env.R2_BUCKET?.get(row.r2Key);
        if(!object)continue;
        let file:any;try{file=JSON.parse(await object.text());}catch{continue;}
        for(const seg of Array.isArray(file.segments)?file.segments:[]){
          const line=txt(seg.text),at=line.toLowerCase().indexOf(term.toLowerCase());
          if(at>=0){
            hits.push({trackId:row.id,title:row.title,speaker:row.speaker,start:Number(seg.start||0),text:line.slice(Math.max(0,at-50),at+term.length+130)});
            if(hits.length>=100)break;
          }
        }
        if(hits.length>=100)break;
      }
      return json({matches:hits,scanned:Math.min(candidates.length,100),partial:candidates.length>100||hits.length>=100});
    }
    if(path==='/api/qa/retry'&&method==='POST'){
      const body:any=await req.json().catch(()=>({}));
      const id=txt(body.trackId);
      if(!id||id.length>128)return json({error:'請指定正確音檔'},400);
      const result=await env.DB.prepare("UPDATE transcript_index SET status='pending',error=NULL,updatedAt=? WHERE trackId=? AND status='failed'").bind(Date.now(),id).run();
      return json({success:!!result.meta?.changes,message:result.meta?.changes?'已重新排隊，系統會接續處理':'此音檔目前不是異常狀態'});
    }
    if(path==='/api/qa/admin'&&method==='GET'){
      const rows=await env.DB.prepare("SELECT t.id,t.title,t.speaker,t.speakerRank,t.requiredRank,COALESCE(i.status,'pending') status,i.error,i.updatedAt,i.segmentCount,i.wordCount,i.durationSeconds FROM tracks t LEFT JOIN transcript_index i ON i.trackId=t.id WHERE t.audioUrl IS NOT NULL AND TRIM(t.audioUrl)<>'' ORDER BY t.uploadDate DESC,t.id").all();
      const items=rows.results||[];
      const history=await env.DB.prepare("SELECT q.commentId,q.createdAt,q.mode,q.status,q.error,t.title,c.authorName FROM qa_claims q LEFT JOIN tracks t ON t.id=q.trackId LEFT JOIN comments c ON c.id=q.commentId ORDER BY q.createdAt DESC LIMIT 50").all();
      const used:any=await env.DB.prepare("SELECT used FROM qa_daily WHERE identity='__global__' AND day=?").bind(day()).first();
      return json({items,history:history.results||[],models:MODELS,openAiConfigured:!!String(env.OPENAI_API_KEY||'').trim(),policies:cfg.policies.map((p:any,i:number)=>({tier:i+1,label:LABELS[i],daily:p.daily,free:p.free,cost:units(p.cost)})),model:cfg.model,enabled:cfg.enabled,globalDaily:cfg.globalDaily,globalUsed:Number(used?.used||0),replyDirections:cfg.replyDirections,qaRules:cfg.qaRules});
    }
    if(path==='/api/qa/settings/history'&&method==='GET'){
      const rows=await env.DB.prepare('SELECT id,createdAt,changeType FROM qa_settings_history ORDER BY createdAt DESC LIMIT 20').all();
      return json({items:rows.results||[]});
    }
    if(path==='/api/qa/settings/restore'&&method==='POST'){
      const body:any=await req.json().catch(()=>null),id=txt(body?.id);
      if(!id||id.length>100)return json({error:'請指定歷史版本'},400);
      const row:any=await env.DB.prepare('SELECT configJson FROM qa_settings_history WHERE id=?').bind(id).first();
      if(!row)return json({error:'歷史版本不存在'},404);
      let prior:any;try{prior=JSON.parse(row.configJson);}catch{return json({error:'歷史版本內容無法讀取'},409);}
      if(!prior||!MODELS.some(x=>x.id===prior.model)||!Array.isArray(prior.policies)||prior.policies.length!==5)return json({error:'歷史版本不相容'},409);
      if(prior.model===OPENAI_SPEAKER_QA_MODEL&&!String(env.OPENAI_API_KEY||'').trim())return json({error:'OpenAI 金鑰目前未設定'},503);
      let rules:QaRuleOptions;try{rules=validateQaRules(prior.qaRules);}catch{return json({error:'歷史指令不相容'},409);}
      const pp=prior.policies.map((x:any)=>({daily:Number(x.daily),free:Number(x.free),cost:Number(x.cost)}));
      if(pp.some((x:Policy)=>!validatePolicy(x))||!Number.isInteger(prior.globalDaily)||prior.globalDaily<1||prior.globalDaily>100)return json({error:'歷史額度不相容'},409);
      await writeQaSettings(env,{
        enabled:String(prior.enabled===true),model:prior.model,policies:JSON.stringify(pp),globalDaily:String(prior.globalDaily),
        qaRoleDirections:rules.roleDirections,qaStyleDirections:rules.styleDirections,qaQualityDirections:rules.qualityDirections,
        qaQualityEnabled:String(rules.qualityEnabled),qaEmojiMin:String(rules.emojiMin),replyDirections:rules.styleDirections.slice(0,2000)
      },txt(u?.id)||'superadmin','restore');
      return json({success:true,message:'已還原設定，往後的新回答將使用這個版本'});
    }
    if(path==='/api/qa/preview'&&method==='POST'){
      const body:any=await req.json().catch(()=>null),trackId=txt(body?.trackId),question=txt(body?.question);
      if(!trackId||trackId.length>128||!question||question.length>600)return json({error:'請選擇音檔並輸入不超過600字的問題'},400);
      if(!MODELS.some(x=>x.id===body?.model))return json({error:'模型選擇無效'},400);
      if(body.model===OPENAI_SPEAKER_QA_MODEL&&!String(env.OPENAI_API_KEY||'').trim())return json({error:'OpenAI 金鑰未設定'},503);
      let rules:QaRuleOptions;try{rules=validateQaRules(body.qaRules);}catch(e){return json({error:e instanceof Error?e.message:'回答規則錯誤'},400);}
      const track:any=await env.DB.prepare('SELECT * FROM tracks WHERE id=? LIMIT 1').bind(trackId).first();
      if(!track||!await mayUseTranscript(env,u,track))return json({error:'沒有音檔使用權限'},403);
      const source=await excerpts(env,track,u,'current',question);
      if(!source.prompt)return json({error:'選定音檔沒有可用的逐字稿'},422);
      const counter:any=await env.DB.prepare('INSERT INTO qa_admin_preview_daily(day,owner,used) VALUES (?,?,1) ON CONFLICT(day,owner) DO UPDATE SET used=used+1 WHERE used<10 RETURNING used').bind(day(),txt(u?.id)||'admin').first();
      if(!counter)return json({error:'今日測試回答已達10次，請明天再試'},429);
      const messages=[
        {role:'system',content:buildQaSystemInstructions(rules)},
        {role:'user',content:'學員問題：'+question+'\n\n演講者分享內容（僅供確認事實，不要提起素材來源）：\n'+source.prompt}
      ];
      const result=await generateQaWithQuality(env,body.model,messages,rules);
      if(!result.reply)return json({success:false,answer:'',qualityIssues:result.qualityIssues,previewUsed:counter.used,message:'未產出符合條件的回答。沒有公開留言，也未扣會員電池'});
      return json({success:true,answer:formatQaAnswer(result.reply,source.sources),modelUsed:result.model,previewUsed:counter.used,repaired:result.repaired,qualityIssues:[]});
    }
    if(path==='/api/qa/settings'&&method==='PUT'){
      const body:any=await req.json().catch(()=>null);
      if(!body||!MODELS.some(x=>x.id===body.model)||!Array.isArray(body.policies)||body.policies.length!==5)return json({error:'設定內容不完整'},400);
      if(body.model===OPENAI_SPEAKER_QA_MODEL&&!String(env.OPENAI_API_KEY||'').trim())return json({error:'尚未設定 OpenAI API 金鑰，無法選用 ChatGPT API'},503);
      const pp=body.policies.map((x:any)=>({daily:Number(x.daily),free:Number(x.free),cost:Number(x.cost)*10}));
      if(pp.some((x:any)=>!validatePolicy(x)))return json({error:'請確認每日上限、免費次數與電池數量'},400);
      const globalDaily=Number(body.globalDaily);
      if(!Number.isInteger(globalDaily)||globalDaily<1||globalDaily>100)return json({error:'每日總預算需介於 1～100'},400);
      let replyDirections:string|undefined;
      try{replyDirections=parseReplyDirectionsUpdate(body);}
      catch{return json({error:'回答格式指令不得超過2000字'},400);}
      const updatedSettings:Record<string,string>={
        enabled:String(body.enabled===true),model:body.model,
        policies:JSON.stringify(pp),globalDaily:String(globalDaily)
      };
      if(replyDirections!==undefined) updatedSettings.replyDirections=replyDirections;
      // Older mobile/PWA clients may omit three new layers: preserve them.
      if(body.qaRules!==undefined){
        let rules:QaRuleOptions;try{rules=validateQaRules(body.qaRules);}catch(e){return json({error:e instanceof Error?e.message:'回答規則無效'},400);}
        updatedSettings.qaRoleDirections=rules.roleDirections;
        updatedSettings.qaStyleDirections=rules.styleDirections;
        updatedSettings.qaQualityDirections=rules.qualityDirections;
        updatedSettings.qaQualityEnabled=String(rules.qualityEnabled);
        updatedSettings.qaEmojiMin=String(rules.emojiMin);
        updatedSettings.replyDirections=rules.styleDirections.slice(0,2000);
      }else if(replyDirections!==undefined){
        updatedSettings.qaStyleDirections=replyDirections;
      }
      await writeQaSettings(env,updatedSettings,txt(u?.id)||'superadmin','save');
      return json({success:true});
    }
    const match=path.match(/^\/api\/qa\/transcripts\/([^/]+)$/);
    if(match&&method==='GET'){
      const id=decodeURIComponent(match[1]);
      const row:any=await env.DB.prepare('SELECT r2Key,status FROM transcript_index WHERE trackId=?').bind(id).first();
      if(!row||row.status!=='ready'||!row.r2Key)return json({error:'逐字稿尚未完成'},404);
      const obj=await env.R2_BUCKET?.get(row.r2Key);
      if(!obj)return json({error:'逐字稿檔案不存在'},404);
      const data=JSON.parse(await obj.text());
      const segments=Array.isArray(data?.segments)?data.segments:[];
      const baseline = new Map<string,string>((Array.isArray(data?.cleanedSegments)?data.cleanedSegments:[])
        .map((x:any)=>[String(x.id),String(x.text)]));
      const displaySegments=segments.map((seg:any)=>({...seg,text:baseline.get(String(seg.id))||seg.text}));
      const originalText=segments.map((seg:any)=>txt(seg.text)).join('\n')||txt(data?.text);
      const text=displaySegments.map((seg:any)=>txt(seg.text)).join('\n')||originalText;
      return json({trackId:id,text,originalText,segments:displaySegments,originalSegments:segments,
        cleanupVersion:data?.cleanupVersion||null,chineseCount:(text.match(/\p{Script=Han}/gu)||[]).length,
        totalChars:[...text].filter(x=>!/\s/.test(x)).length});
    }
    return json({error:'找不到管理功能'},404);
  }catch(e){console.error('QA request failed',e);return json({error:'服務暫時無法使用'},503);}
}
