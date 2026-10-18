/* Starry AI Control Plane: central configuration, local scheduling, read-only catalogue. */
export type AiTier = 1 | 2 | 3;
export type AiTaskOrder = { id: string; tier: AiTier; order: number };
type Db = any;
type ControlEnv = { STARRY_ID_DB?: Db; DB?: Db; [key:string]:any };

export const AI_TASK_CATALOG = Object.freeze([
  { id:'mirror.reading',app:'繁星心鏡',title:'AI 個人化解籤',description:'生命靈數、金句、個人資料交叉解籤',model:'Qwen 3.8 27B → GPT-OSS 120B → GLM 4.7 Flash',path:'繁星心鏡 → 主選單 → 超級管理員 → AI 設定',url:'https://mirror.starry.phd/admin',mode:'realtime' },
  { id:'echo.qa',app:'繁星回聲',title:'AI 演講者留言答覆',description:'以逐字稿為根據回覆會員提問',model:'Gemma 4 26B（後台可切換）',path:'繁星回聲 → 管理後台 → 逐字稿管理 → AI 問答設定',url:'https://echo.starry.phd/?starryAiTarget=qa',mode:'realtime' },
  { id:'echo.bio',app:'繁星回聲',title:'演講者 AI 簡介摘要',description:'綜合公開逐字稿產生演講者介紹',model:'GLM 4.7 Flash',path:'繁星回聲 → 管理後台 → 演講者管理',url:'https://echo.starry.phd/?starryAiTarget=speaker',mode:'background' },
  { id:'echo.transcribe',app:'繁星回聲',title:'錄音／影片轉逐字稿',description:'長音檔分段處理；已開始的工作不強制中斷',model:'Whisper Large V3 Turbo',path:'繁星回聲 → 管理後台 → 逐字稿',url:'https://echo.starry.phd/?starryAiTarget=transcript',mode:'background' },
  { id:'echo.normalize',app:'繁星回聲',title:'逐字稿繁中校正（轉錄後自動）',description:'中文錄音轉寫完成後，自動轉台灣繁體並整理標點；不會翻成其他語言，也不能先於語音轉寫執行',model:'GPT-OSS 20B',path:'繁星回聲 → 管理後台 → 逐字稿',url:'https://echo.starry.phd/?starryAiTarget=transcript',mode:'dependent' }
] as const);
export const DEFAULT_AI_ORDER: AiTaskOrder[] = AI_TASK_CATALOG.map((task, i) => ({
  id:task.id,tier:(task.id==='mirror.reading'||task.id==='echo.qa'?1:task.id==='echo.bio'?2:3) as AiTier,order:i
}));

const configCache: { at:number; entries:AiTaskOrder[]; source:'saved'|'default'; updatedAt:number } =
  {at:0,entries:DEFAULT_AI_ORDER,source:'default',updatedAt:0};
let schemaReady:Promise<void>|null = null;
const activityThrottle = new Map<string,number>();
function store(env:ControlEnv):Db { return env.STARRY_ID_DB; }
async function ensure(db:Db) {
  if (!db) throw new Error('central_ai_database_unavailable');
  if (!schemaReady) {
    schemaReady = db.batch([
      db.prepare('CREATE TABLE IF NOT EXISTS starry_ai_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedAt INTEGER NOT NULL, updatedBy TEXT NOT NULL)'),
      db.prepare('CREATE TABLE IF NOT EXISTS starry_ai_audit (id TEXT PRIMARY KEY, actorId TEXT NOT NULL, beforeValue TEXT NOT NULL, afterValue TEXT NOT NULL, createdAt INTEGER NOT NULL)'),
      db.prepare('CREATE TABLE IF NOT EXISTS starry_ai_activity (taskId TEXT PRIMARY KEY, lastStartedAt INTEGER NOT NULL)')
    ]).then(()=>undefined).catch((e:unknown)=>{schemaReady=null;throw e;});
  }
  await schemaReady;
}
export function validateAiOrder(input:unknown):AiTaskOrder[] {
  if (!Array.isArray(input)||input.length!==AI_TASK_CATALOG.length) throw Error('invalid_ai_task_count');
  const keys=new Set<string>(AI_TASK_CATALOG.map(x=>x.id));
  const ids=new Set<string>();
  const output:AiTaskOrder[]=[];
  for(let i=0;i<input.length;i++){
    const entry=input[i];
    if(!entry || typeof entry.id!=='string' || !keys.has(entry.id) || ids.has(entry.id) ||
      ![1,2,3].includes(entry.tier) || !Number.isInteger(entry.order) || entry.order<0)
      throw Error('invalid_ai_task_order');
    ids.add(entry.id);
    output.push({id:entry.id,tier:entry.tier,order:entry.order});
  }
  return output.sort((a,b)=>a.tier-b.tier||a.order-b.order).map((a,i)=>({...a,order:i}));
}
// Preserve existing administrator priorities when a registered App adds a new AI task.
export function mergeAiOrder(raw:unknown):AiTaskOrder[] {
  if(!Array.isArray(raw))return DEFAULT_AI_ORDER;
  const known=new Set<string>(AI_TASK_CATALOG.map(x=>x.id));
  const seen=new Set<string>();
  const ordered:AiTaskOrder[]=[];
  for(const value of raw){
    if(typeof value?.id!=='string'||!known.has(value.id)||seen.has(value.id)||![1,2,3].includes(value.tier))continue;
    seen.add(value.id);
    ordered.push({id:value.id,tier:value.tier,order:ordered.length});
  }
  for(const entry of DEFAULT_AI_ORDER)if(!seen.has(entry.id))ordered.push({...entry,order:ordered.length});
  return validateAiOrder(ordered);
}
async function readConfig(env:ControlEnv) {
  const now=Date.now();
  if(now-configCache.at<10_000) return configCache;
  try {
    const db=store(env);await ensure(db);
    const row=await db.prepare("SELECT value,updatedAt FROM starry_ai_config WHERE key='priority' LIMIT 1").first();
    const entries=row?mergeAiOrder(JSON.parse(row.value)):DEFAULT_AI_ORDER;
    configCache.at=now;configCache.entries=entries;configCache.source=row?'saved':'default';
    configCache.updatedAt=Number(row?.updatedAt||0);
  }catch(e){ console.warn('AI priority default or last-known retained');configCache.at=now; }
  return configCache;
}
export async function loadAiPriorities(env:ControlEnv) {
  const cfg=await readConfig(env);
  return { entries:cfg.entries.map(x=>({...x})),source:cfg.source,updatedAt:cfg.updatedAt };
}
export async function saveAiPriorities(env:ControlEnv,actorId:string,input:unknown) {
  const entries=validateAiOrder(input);
  const db=store(env);await ensure(db);
  const before=await readConfig(env);
  const now=Date.now();
  await db.batch([
    db.prepare("INSERT INTO starry_ai_config(key,value,updatedAt,updatedBy) VALUES ('priority',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt,updatedBy=excluded.updatedBy")
      .bind(JSON.stringify(entries),now,actorId),
    db.prepare('INSERT INTO starry_ai_audit (id,actorId,beforeValue,afterValue,createdAt) VALUES (?,?,?,?,?)')
      .bind(crypto.randomUUID(),actorId,JSON.stringify(before.entries),JSON.stringify(entries),now)
  ]);
  configCache.at=now;configCache.entries=entries;configCache.updatedAt=now;configCache.source='saved';
  return {entries,updatedAt:now};
}
// A short-lived recent-activity signal. This deliberately never blocks an
// interactive request; it merely delays the *start* of lower-priority work.
export async function recordAiActivity(env:ControlEnv,taskId:string) {
  if(!AI_TASK_CATALOG.some(x=>x.id===taskId))return;
  const now=Date.now();
  if(now-(activityThrottle.get(taskId)||0)<8_000)return;
  activityThrottle.set(taskId,now);
  try {
    const db=store(env);await ensure(db);
    await db.prepare('INSERT INTO starry_ai_activity(taskId,lastStartedAt) VALUES (?,?) ON CONFLICT(taskId) DO UPDATE SET lastStartedAt=excluded.lastStartedAt')
      .bind(taskId,now).run();
  }catch { activityThrottle.delete(taskId); }
}
export async function mayStartAiBackground(env:ControlEnv,taskId:string) {
  const cfg=await readConfig(env);
  const target=cfg.entries.find(x=>x.id===taskId);
  if(!target)return true;
  try {
    const db=store(env);await ensure(db);
    const recent=await db.prepare('SELECT taskId FROM starry_ai_activity WHERE lastStartedAt>?')
      .bind(Date.now()-45_000).all();
    const earlier=new Set(cfg.entries.slice(0,cfg.entries.findIndex(x=>x.id===taskId)).map(x=>x.id));
    return !(recent?.results||[]).some((row:any)=>earlier.has(String(row.taskId)));
  }catch { return true; }
}
export async function transcriptTargetConcurrency(env:ControlEnv) {
  const config=await readConfig(env);
  const tier=config.entries.find(x=>x.id==='echo.transcribe')?.tier||3;
  const clear=await mayStartAiBackground(env,'echo.transcribe');
  return clear?(tier===1?5:tier===2?3:2):0;
}
export async function recentAiChanges(env:ControlEnv) {
  try {
    const db=store(env);await ensure(db);
    const rows=await db.prepare('SELECT actorId,createdAt,beforeValue,afterValue FROM starry_ai_audit ORDER BY createdAt DESC LIMIT 12').all();
    return (rows?.results||[]).map((r:any)=>({actorId:r.actorId,createdAt:r.createdAt}));
  }catch{return [];}
}
export async function collectAiCatalog(env:ControlEnv) {
  let items:any[]=AI_TASK_CATALOG.map(x=>({...x,recommendedTier:DEFAULT_AI_ORDER.find(order=>order.id===x.id)?.tier||3,source:'已登記',healthy:true}));
  // Read public metadata only; NEVER access another app's private member data.
  // Model changes in Mirror immediately surface without redeploying Starry ID.
  try {
    const response=await fetch('https://mirror.starry.phd/api/mirror/ai-catalog',{signal:AbortSignal.timeout(1800)});
    if(response.ok){
      const remote=await response.json() as any;
      if(Array.isArray(remote.tasks)){
        const m=remote.tasks.find((x:any)=>x?.id==='mirror.reading');
        if(m&&typeof m.model==='string'&&m.model.length<240){
          items=items.map(x=>x.id==='mirror.reading'?{...x,model:m.model,source:'App 即時提供',healthy:true}:x);
        }
      }
    }
  }catch { items=items.map(x=>x.id==='mirror.reading'?{...x,source:'中央上次登記',healthy:false}:x); }
  // Speaker QA runtime model can change without a deployment.
  try {
    const db=env.DB;
    const row=await db?.prepare("SELECT value FROM qa_settings WHERE key='model' LIMIT 1").first();
    if(typeof row?.value==='string'){
      items=items.map(x=>x.id==='echo.qa'?{...x,model:row.value,source:'App 即時設定'}:x);
    }
  }catch{}
  return items;
}
