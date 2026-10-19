/**
 * A04-01: Starry ID model selection CONTROL PLANE, staging only.
 * NO app runtime connections, NO model inference, NO credential reads.
 * Each (appId, taskId) owns its own independent saved selection.
 */
export type AiRoutingEnv = { STARRY_ID_DB?: any };
export type AiRoutingChoice = { primary: string; backups: string[] };
export type AiTask = { appId: string; app: string; taskId: string; title: string; capabilities: readonly string[] };
export const AI_ROUTING_TASKS: readonly AiTask[] = Object.freeze([
  {appId:'echostars',app:'繁星回聲',taskId:'echo.qa',title:'AI 問問題',capabilities:['文字問答']},
  {appId:'echostars',app:'繁星回聲',taskId:'echo.bio',title:'演講者人物摘要',capabilities:['摘要']},
  {appId:'echostars',app:'繁星回聲',taskId:'echo.transcribe',title:'Whisper 逐字稿',capabilities:['語音轉文字']},
  {appId:'echostars',app:'繁星回聲',taskId:'echo.normalize',title:'逐字稿繁中校正',capabilities:['文字整理','校正']},
  {appId:'echostars',app:'繁星回聲',taskId:'echo.story',title:'多人故事歸屬（尚待中央核准模型）',capabilities:['文字問答','推理']},
  {appId:'mirror',app:'繁星心鏡',taskId:'mirror.reading',title:'AI 解籤（僅中央設定）',capabilities:['文字問答','推理']}
]);
type Row={model_id:string;display_name:string;provider:string;capabilities_json:string;tasks_json:string;
  registry_status:string;route_kind:string;free_eligibility:string;gateway_status:string};
type PolicyRow={app_id:string;task_id:string;selection_json:string;revision:number;updated_by:string;updated_at:number};
export class RoutingInputError extends Error {
  constructor(public code:string,public httpStatus=400){super(code)}
}
function requireRule(ok:unknown,code:string,status=400):asserts ok{
  if(!ok)throw new RoutingInputError(code,status);
}
export function routingTask(appId:unknown,taskId:unknown):AiTask{
  const task=AI_ROUTING_TASKS.find(t=>t.appId===appId&&t.taskId===taskId);
  requireRule(task,'unknown_app_or_task');
  return task;
}
function choices(input:unknown):AiRoutingChoice{
  requireRule(input&&typeof input==='object'&&!Array.isArray(input),'invalid_selection');
  const v=input as Record<string,unknown>;
  const primary=v.primary,backups=v.backups;
  requireRule(typeof primary==='string'&&primary.length>=2&&primary.length<=200,'invalid_primary');
  requireRule(Array.isArray(backups)&&backups.length<=3,'invalid_backup_count');
  requireRule(backups.every(x=>typeof x==='string'&&x.length>=2&&x.length<=200),'invalid_backup');
  const all=[primary,...backups] as string[];
  requireRule(new Set(all).size===all.length,'duplicate_model');
  return {primary,backups:backups as string[]};
}
function parseList(raw:string):string[]{
  try{const a=JSON.parse(raw);return Array.isArray(a)?a.filter((x:unknown)=>typeof x==='string'):[]}
  catch{return []}
}
function compatible(task:AiTask,row:Row):boolean{
  // Gateway integration belongs to B06; unverified price/free eligibility cannot be routed.
  return row.registry_status==='verified'
    && (row.route_kind==='workers_ai'||row.route_kind==='direct')
    && (row.free_eligibility==='eligible'||row.free_eligibility==='not_eligible')
    && parseList(row.tasks_json).includes(task.taskId)
    && task.capabilities.some(c=>parseList(row.capabilities_json).includes(c));
}
function safeRow(r:Row){return {modelId:r.model_id,name:r.display_name,provider:r.provider}}
function database(env:AiRoutingEnv):any{
  requireRule(env.STARRY_ID_DB,'central_database_unavailable',503);
  return env.STARRY_ID_DB;
}
async function modelRows(db:any):Promise<Row[]>{
  const data=await db.prepare(`SELECT model_id,display_name,provider,capabilities_json,tasks_json,
    registry_status,route_kind,free_eligibility,gateway_status FROM starry_ai_models LIMIT 100`).all();
  return Array.isArray(data?.results)?data.results:[];
}
async function verifySelection(db:any,task:AiTask,selection:AiRoutingChoice){
  const models=await modelRows(db);
  const available=models.filter(r=>compatible(task,r));
  const ids=[selection.primary,...selection.backups];
  requireRule(ids.every(id=>available.some(r=>r.model_id===id)),'model_not_approved_or_incompatible',409);
  return available;
}
function readSaved(r:PolicyRow){
  const choice=choices(JSON.parse(r.selection_json));
  return {appId:r.app_id,taskId:r.task_id,selection:choice,revision:r.revision,
    status:'staged',updatedBy:r.updated_by,updatedAt:r.updated_at};
}
export async function readAiRoutingControl(env:AiRoutingEnv,appId?:string,taskId?:string){
  const db=database(env);
  const [models,rows]=await Promise.all([modelRows(db),db.prepare(
    'SELECT app_id,task_id,selection_json,revision,updated_by,updated_at FROM starry_ai_task_routes ORDER BY app_id,task_id LIMIT 100'
  ).all()]);
  const items=(rows?.results||[]).map(readSaved);
  let history:any[]=[];
  if(appId!==undefined||taskId!==undefined){
    const task=routingTask(appId,taskId);
    const r=await db.prepare(`SELECT id,action,actor_id,before_json,after_json,restored_from,revision,created_at
      FROM starry_ai_task_route_revisions WHERE app_id=? AND task_id=? ORDER BY revision DESC LIMIT 30`)
      .bind(task.appId,task.taskId).all();
    history=(r?.results||[]).map((x:any)=>({id:x.id,action:x.action,
      actorId:x.actor_id,before:x.before_json?JSON.parse(x.before_json):null,
      after:JSON.parse(x.after_json),restoredFrom:x.restored_from,
      revision:x.revision,createdAt:x.created_at}));
  }
  return {tasks:AI_ROUTING_TASKS,models:models.map(safeRow),
    eligibleByTask:Object.fromEntries(AI_ROUTING_TASKS.map(t=>[
      t.taskId,models.filter(r=>compatible(t,r)).map(safeRow)])),
    policies:items,history,
    status:'staging_only',enabledForRuntime:false,
    notice:'中央模型目前未核准時不得保存；選型只儲存草稿，不會影響各 App 的正式 AI 模型或電池'};
}
export async function previewAiRouting(env:AiRoutingEnv,input:any){
  const task=routingTask(input?.appId,input?.taskId);
  const selected=choices(input?.selection);
  const db=database(env);
  const eligible=await verifySelection(db,task,selected);
  return {valid:true,appId:task.appId,taskId:task.taskId,selection:selected,
    eligibleModels:eligible.filter(m=>[selected.primary,...selected.backups].includes(m.model_id)).map(safeRow),
    stagedOnly:true,willChangeLiveApps:false,providerCalls:0,cost:0};
}
export async function saveAiRouting(env:AiRoutingEnv,actorId:string,input:any){
  const db=database(env);
  requireRule(typeof actorId==='string'&&actorId.length>0&&actorId.length<=128,'invalid_actor',403);
  const task=routingTask(input?.appId,input?.taskId);
  requireRule(input?.action==='save'||input?.action==='restore','invalid_action');
  const old:PolicyRow|null=await db.prepare(`SELECT app_id,task_id,selection_json,revision,updated_by,updated_at
    FROM starry_ai_task_routes WHERE app_id=? AND task_id=?`).bind(task.appId,task.taskId).first();
  const version=old?.revision||0;
  requireRule(Number.isSafeInteger(input.expectedRevision)&&input.expectedRevision===version,'stale_revision',409);
  let selection:AiRoutingChoice, restoredFrom:string|null=null;
  if(input.action==='restore'){
    requireRule(old&&typeof input.revisionId==='string'&&input.revisionId.length<=128,'invalid_restore',400);
    const previous=await db.prepare(`SELECT after_json FROM starry_ai_task_route_revisions
      WHERE id=? AND app_id=? AND task_id=?`).bind(input.revisionId,task.appId,task.taskId).first();
    requireRule(previous?.after_json,'history_missing',404);
    selection=choices(JSON.parse(previous.after_json));
    restoredFrom=input.revisionId;
  }else selection=choices(input.selection);
  // Revalidate *every* model before saving and on every historical restore.
  await verifySelection(db,task,selection);
  const now=Date.now(),revision=version+1,revisionId='route-'+crypto.randomUUID();
  const payload=JSON.stringify(selection),before=old?.selection_json||null;
  const write=old
    ?db.prepare(`UPDATE starry_ai_task_routes SET selection_json=?,revision=?,updated_by=?,updated_at=?
      WHERE app_id=? AND task_id=? AND revision=?`)
      .bind(payload,revision,actorId,now,task.appId,task.taskId,version)
    :db.prepare(`INSERT OR IGNORE INTO starry_ai_task_routes
      (app_id,task_id,selection_json,revision,status,updated_by,updated_at)
      VALUES (?,?,?,?,'staged',?,?)`)
      .bind(task.appId,task.taskId,payload,revision,actorId,now);
  // Both are one D1 transaction. A race loses without writing a phantom history row.
  const audit=db.prepare(`INSERT INTO starry_ai_task_route_revisions
    (id,app_id,task_id,action,actor_id,before_json,after_json,restored_from,revision,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,? FROM starry_ai_task_routes
    WHERE app_id=? AND task_id=? AND revision=? AND updated_by=?`)
    .bind(revisionId,task.appId,task.taskId,input.action,actorId,before,payload,
      restoredFrom,revision,now,task.appId,task.taskId,revision,actorId);
  const results=await db.batch([write,audit]);
  requireRule(Number(results?.[0]?.meta?.changes||0)===1,'stale_revision',409);
  requireRule(Number(results?.[1]?.meta?.changes||0)===1,'revision_audit_failed',503);
  return {success:true,appId:task.appId,taskId:task.taskId,revision,revisionId,
    stagedOnly:true,enabledForRuntime:false,providerCalls:0,liveAppUnchanged:true,
    message:'中央選型草稿已儲存並保留歷史紀錄；尚未套用至任何 App'};
}
