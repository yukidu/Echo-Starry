/**
 * F22-S1: read-only AI speaker usage statistics.
 * Does not create tables, invoke AI, touch member balances, or read private questions.
 * Costs remain unknown until B07 has a LIVE, reconciled, per-request metering link.
 */
import { actor } from './aiSpeakerQaRouter';

type Env = {
  DB?: any; STARRY_ID_DB?: any; STARRY_ID_SUPER_ADMIN_EMAILS?: string;
};
const DAY=86_400_000;
const timeZoneOffset=8*3_600_000;
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'private, no-store',
  'X-Robots-Tag':'noindex, nofollow',
  'X-Content-Type-Options':'nosniff'
}});
const safeString=(v:unknown)=>String(v??'').trim();
const isMember=(v:unknown)=>safeString(v).startsWith('member:');
export type F22Period='today'|'7d'|'30d'|'all';
export type F22Grouping='track'|'speaker';
export type F22Sort='calls'|'members'|'repeat'|'cost';
export function f22Window(period:F22Period,now=Date.now()){
  const today=new Date(now+timeZoneOffset);
  const midnight=Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate())-timeZoneOffset;
  const days=period==='today'?1:period==='7d'?7:period==='30d'?30:0;
  const start=days?midnight-(days-1)*DAY:0;
  return {start,end:now+1,startDay:new Date(start+timeZoneOffset).toISOString().slice(0,10),
    endDay:today.toISOString().slice(0,10)};
}
/**
 * Echo session proves possession of a valid Echo user session, not central admin role.
 * Map it to an active Starry ID user and verify LIVE central membership on every request.
 * Echo's local '超級管理員' role alone is never accepted.
 */
export async function f22CentralSuperAdmin(req:Request,env:Env){
  if(!env.STARRY_ID_DB)return false;
  const local=await actor(req,env as any).catch(()=>null);
  if(!local?.id||!local.email)return false;
  const db=env.STARRY_ID_DB;
  const row:any=await db.prepare(
    "SELECT u.id,u.primaryEmail,u.status,central.status AS centralStatus,"+
    "central.role AS centralRole "+
    "FROM users u "+
    "JOIN app_memberships central ON central.userId=u.id AND central.appId='starry-id' "+
    "WHERE (u.id IN (SELECT userId FROM legacy_links WHERE sourceApp='echostars' AND sourceUserId=?) "+
    "OR lower(u.primaryEmail)=lower(?)) LIMIT 1"
  ).bind(local.id,local.email).first();
  if(!row||row.status!=='active'||row.centralStatus!=='active')return false;
  if(safeString(row.primaryEmail).toLowerCase()!==safeString(local.email).toLowerCase())return false;
  const configured=safeString(env.STARRY_ID_SUPER_ADMIN_EMAILS)||'yukidu@gmail.com';
  const allow=new Set(configured.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean));
  return row.centralRole==='super-admin'||allow.has(safeString(row.primaryEmail).toLowerCase());
}

const base=(
  "WITH scoped AS ("+
    "SELECT commentId,identity,trackId,status,createdAt,"+
      "LAG(createdAt) OVER (PARTITION BY identity,trackId ORDER BY createdAt,commentId) AS previousAt "+
    "FROM qa_claims INDEXED BY qa_claims_day "+
    "WHERE day>=? AND day<=? AND createdAt>=? AND createdAt<?"+
  "), measured AS ("+
    "SELECT *, CASE WHEN previousAt IS NULL THEN NULL ELSE createdAt-previousAt END AS gapMs FROM scoped"+
  ") "
);
const measures=[
  "COUNT(*) AS calls",
  "COUNT(DISTINCT CASE WHEN identity LIKE 'member:%' THEN identity END) AS members",
  "SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS successes",
  "SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failures",
  "SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending",
  "SUM(CASE WHEN gapMs BETWEEN 0 AND 300000 THEN 1 ELSE 0 END) AS repeat5",
  "SUM(CASE WHEN gapMs BETWEEN 0 AND 1800000 THEN 1 ELSE 0 END) AS repeat30",
  "SUM(CASE WHEN gapMs BETWEEN 0 AND 3600000 THEN 1 ELSE 0 END) AS repeat60"
].join(',');
const orderBy:Record<F22Sort,string>={
  calls:'calls DESC',members:'members DESC',repeat:'repeat30 DESC',
  // Cost cannot be ranked until independently metered, B07-01 is staging-only.
  cost:'calls DESC'
};
function makeSummarySql(){
  return base+'SELECT '+measures+' FROM measured';
}
function makeTrendSql(){
  return base+"SELECT strftime('%Y-%m-%d',createdAt/1000,'unixepoch','+8 hours') AS day,"+
    "COUNT(*) AS calls FROM measured GROUP BY day ORDER BY day ASC LIMIT 366";
}
function makeRankingSql(group:F22Grouping,sort:F22Sort){
  if(group==='track'){
    return base+"SELECT m.trackId AS id,COALESCE(t.title,'已刪除音檔') AS title,"+
      "COALESCE(t.speaker,'') AS speaker,COALESCE(t.uploadDate,'') AS uploadDate,"+
      "COALESCE(GROUP_CONCAT(DISTINCT ts.speakerName),'') AS linkedSpeakers,"+
      measures+" FROM measured m LEFT JOIN tracks t ON t.id=m.trackId "+
      "LEFT JOIN track_speakers ts ON ts.trackId=m.trackId "+
      "GROUP BY m.trackId ORDER BY "+orderBy[sort]+",m.trackId LIMIT 60";
  }
  // Join at most one canonical attribution per track BEFORE grouping claims.
  // An unresolved multi-speaker session must never be credited to individuals.
  return base+", speaker_count AS ("+
    "SELECT trackId,COUNT(*) AS n,MIN(speakerName) AS onlySpeaker FROM track_speakers GROUP BY trackId"+
  "), owned AS ("+
    "SELECT m.*,"+
      "CASE WHEN sc.n=1 THEN sc.onlySpeaker "+
      "WHEN sc.n>1 OR instr(COALESCE(t.speaker,''),'&')>0 THEN '多人演講（未歸屬）' "+
      "ELSE COALESCE(NULLIF(TRIM(t.speaker),''),'未指定講者') END AS speakerName "+
    "FROM measured m LEFT JOIN tracks t ON t.id=m.trackId "+
    "LEFT JOIN speaker_count sc ON sc.trackId=m.trackId"+
  ") SELECT speakerName AS id,speakerName AS title,"+
      "COUNT(DISTINCT trackId) AS trackCount,"+measures+
      " FROM owned GROUP BY speakerName ORDER BY "+orderBy[sort]+",speakerName LIMIT 60";
}
export function normalizedF22Metrics(r:any){
  const n=(k:string)=>Number.isFinite(Number(r?.[k]))?Math.max(0,Number(r[k])):0;
  return {calls:n('calls'),members:n('members'),successes:n('successes'),
    failures:n('failures'),pending:n('pending'),
    repeat5:n('repeat5'),repeat30:n('repeat30'),repeat60:n('repeat60'),
    // Three independent states; NEVER replace unknown with zero.
    actualTwd:null,estimatedTwd:null,costState:'no_history' as const,
    costSource:'not_metered' as const,responseMs:null,tokenCount:null,fallbackCalls:null};
}
export async function f22Statistics(env:Env,period:F22Period,group:F22Grouping,sort:F22Sort,
  now=Date.now()){
  if(!env.DB)throw new Error('f22_echo_database_missing');
  const w=f22Window(period,now);
  const bind=(sql:string)=>env.DB.prepare(sql).bind(w.startDay,w.endDay,w.start,w.end);
  // Three bounded read-only indexed queries. No R2 reads, KV writes or new schema.
  const [summary,rankings,trend]=await Promise.all([
    bind(makeSummarySql()).first(),
    bind(makeRankingSql(group,sort)).all(),
    bind(makeTrendSql()).all()
  ]);
  return {period,group,sort,range:{from:w.start,to:now},
    totals:normalizedF22Metrics(summary),
    rows:(rankings?.results||[]).map((r:any)=>({
      id:safeString(r.id),title:safeString(r.title),
      ...(group==='track'?{speaker:safeString(r.speaker),
        uploadDate:safeString(r.uploadDate),
        linkedSpeakers:safeString(r.linkedSpeakers).split(',').filter(Boolean)}:
        {trackCount:Number(r.trackCount||0)}),
      ...normalizedF22Metrics(r)
    })),
    trend:(trend?.results||[]).map((r:any)=>({day:safeString(r.day),calls:Number(r.calls||0)})),
    costDisclosure:{
      actual:'無可靠的逐筆實際費用紀錄',
      estimate:'尚無可驗證的逐筆估算',
      b07:'B07-01 尚未接入正式 AI，預留不是實際成本；會員電池也不是台幣成本'
    },
    recordingDisclosure:'多人演講無明確對象記錄時歸類「多人演講（未歸屬）」，不重複分給個別講者',
    historyDisclosure:'過去未保存的 Token、速度、備援與實際費用不能補算',
    limit:60
  };
}
export async function handleF22SpeakerUsage(req:Request,env:Env):Promise<Response|null>{
  const url=new URL(req.url);
  if(url.pathname!=='/api/admin/ai-speaker-usage')return null;
  if(req.method!=='GET')return json({error:'method_not_allowed'},405);
  if(url.hostname!=='echo.starry.phd'&&!url.hostname.endsWith('.workers.dev')&&url.hostname!=='localhost')
    return json({error:'invalid_host'},404);
  try{
    if(!await f22CentralSuperAdmin(req,env))return json({error:'central_super_admin_required'},403);
    const p=url.searchParams.get('period')||'7d',g=url.searchParams.get('group')||'track';
    const s=url.searchParams.get('sort')||'calls';
    if(!['today','7d','30d','all'].includes(p)||!['track','speaker'].includes(g)||
       !['calls','members','repeat','cost'].includes(s))
      return json({error:'invalid_statistics_filter'},400);
    return json(await f22Statistics(env,p as F22Period,g as F22Grouping,s as F22Sort));
  }catch{
    // Never expose SQL, member data, provider internals or error stack.
    return json({error:'statistics_temporarily_unavailable'},503);
  }
}
