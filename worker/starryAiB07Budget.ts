/**
 * B07-01 cost safety CONTROL PLANE. No live app routing or provider calls.
 * The database trigger, not an in-memory counter, enforces limits atomically.
 * Currency: integer millionths of TWD; counts: metering units.
 * Statistical events are metadata-only for future AI5; tables belong to AI3/B07.
 */
import { AI_ROUTING_TASKS } from './starryAiTaskRouting';
export type B07Env = { STARRY_ID_DB?: any };
export type B07Quote = {
 requestKey:string;fingerprint:string;appId:string;taskId:string;
 memberKey:string;modelId:string;maxUnits:number;
};
export type B07State = 'reserved'|'settled'|'uncertain'|'void';
const MEMBER=/^[a-f0-9]{64}$/;
const REQUEST=/^[a-zA-Z0-9:_-]{8,150}$/;
const MODEL=/^[a-zA-Z0-9@:_./-]{2,200}$/;
const MICRO=1_000_000;
export const B07_COST_SCHEMA_VERSION=1;
export class B07Error extends Error {
 constructor(public code:string,public status=400){super(code)}
}
function requireSafe(v:unknown,code:string,status=400):asserts v{
 if(!v)throw new B07Error(code,status)
}
function dbOf(env:B07Env):any{
 requireSafe(env?.STARRY_ID_DB,'b07_central_database_unavailable',503);
 return env.STARRY_ID_DB;
}
function isInt(n:unknown,min:number,max:number):n is number{
 return Number.isSafeInteger(n)&&Number(n)>=min&&Number(n)<=max
}
export function validateB07Scope(scope:unknown){
 requireSafe(typeof scope==='string'&&scope.length<=220,'invalid_scope');
 if(scope==='global'||scope==='member:default')return scope;
 if(scope.startsWith('member:')){
   requireSafe(MEMBER.test(scope.slice(7)),'invalid_member_ref');return scope
 }
 for(const task of AI_ROUTING_TASKS){
   if(scope==='app:'+task.appId||scope==='task:'+task.appId+':'+task.taskId)
     return scope;
 }
 throw new B07Error('unknown_app_or_task');
}
export function validateB07Policy(v:any){
 requireSafe(v&&typeof v==='object','invalid_policy');
 requireSafe(isInt(v.maxCalls,0,1_000_000),'invalid_daily_calls');
 requireSafe(isInt(v.maxMicroTwd,0,100_000_000_000_000),'invalid_daily_budget');
 requireSafe(typeof v.enabled==='boolean','invalid_enabled');
 return {enabled:v.enabled,maxCalls:v.maxCalls,maxMicroTwd:v.maxMicroTwd};
}
type PolicyRow={scope_key:string;enabled:number;max_calls:number;max_micro_twd:number;revision:number;actor_id:string;updated_at:number};
function publicPolicy(r:PolicyRow){
 return {scope:r.scope_key,enabled:r.enabled===1,maxCalls:r.max_calls,
  maxMicroTwd:r.max_micro_twd,revision:r.revision,updatedAt:r.updated_at};
}
export async function b07Dashboard(env:B07Env,scope?:string){
 const db=dbOf(env);
 if(scope!==undefined)validateB07Scope(scope);
 const results=await Promise.all([
  db.prepare(`SELECT scope_key,enabled,max_calls,max_micro_twd,revision,actor_id,updated_at
    FROM starry_ai_b07_policies ORDER BY scope_key LIMIT 150`).all(),
  db.prepare(`SELECT day,scope_key,calls,held_micro_twd,settled_micro_twd,free_units
    FROM starry_ai_b07_usage WHERE day=? ORDER BY scope_key LIMIT 150`)
    .bind(new Date().toISOString().slice(0,10)).all()
 ]);
 let history:any[]=[];
 if(scope){
  const r=await db.prepare(`SELECT id,action,before_json,after_json,actor_id,revision,restored_from,created_at
    FROM starry_ai_b07_policy_history WHERE scope_key=? ORDER BY revision DESC LIMIT 25`).bind(scope).all();
  history=(r?.results||[]).map((z:any)=>({
   id:z.id,action:z.action,before:z.before_json?JSON.parse(z.before_json):null,
   after:JSON.parse(z.after_json),actorId:z.actor_id,revision:z.revision,
   restoredFrom:z.restored_from,createdAt:z.created_at
  }));
 }
 return {policies:(results[0]?.results||[]).map(publicPolicy),
  usage:results[1]?.results||[],history,
  environment:'staging_only',connectedToLiveAI:false,currency:'micro_twd',
  actualCostNotice:'下方已結算與預留數字僅來自 B07 帳本。其他 App 的真實 AI 費用尚未接入，不得解讀為平台帳單',
  providerCalls:0};
}
export async function saveB07Policy(env:B07Env,actor:string,body:any){
 const db=dbOf(env);
 requireSafe(typeof actor==='string'&&actor.length>0&&actor.length<=128,'invalid_actor',403);
 const scope=validateB07Scope(body?.scope);
 requireSafe(body.action==='save'||body.action==='restore','invalid_action');
 requireSafe(isInt(body.expectedRevision,0,1_000_000),'invalid_revision');
 const old:PolicyRow|null=await db.prepare(`SELECT scope_key,enabled,max_calls,max_micro_twd,revision,actor_id,updated_at
   FROM starry_ai_b07_policies WHERE scope_key=?`).bind(scope).first();
 const ver=old?.revision||0;
 requireSafe(body.expectedRevision===ver,'stale_budget_revision',409);
 let value:ReturnType<typeof validateB07Policy>,restoredFrom:string|null=null;
 if(body.action==='restore'){
  requireSafe(old&&typeof body.revisionId==='string'&&body.revisionId.length<160,'invalid_restore');
  const revision=await db.prepare(`SELECT after_json FROM starry_ai_b07_policy_history
    WHERE id=? AND scope_key=?`).bind(body.revisionId,scope).first();
  requireSafe(revision?.after_json,'budget_revision_missing',404);
  value=validateB07Policy(JSON.parse(revision.after_json));
  restoredFrom=body.revisionId;
 }else value=validateB07Policy(body);
 const now=Date.now(),nextVer=ver+1,id='b07policy-'+crypto.randomUUID();
 const before=old?JSON.stringify(publicPolicy(old)):null;
 const payload=JSON.stringify(value);
 const write=old?db.prepare(`UPDATE starry_ai_b07_policies
   SET enabled=?,max_calls=?,max_micro_twd=?,revision=?,actor_id=?,updated_at=?
   WHERE scope_key=? AND revision=?`)
   .bind(value.enabled?1:0,value.maxCalls,value.maxMicroTwd,nextVer,actor,now,scope,ver)
 :db.prepare(`INSERT OR IGNORE INTO starry_ai_b07_policies
   (scope_key,enabled,max_calls,max_micro_twd,revision,actor_id,updated_at)
   VALUES(?,?,?,?,?,?,?)`)
   .bind(scope,value.enabled?1:0,value.maxCalls,value.maxMicroTwd,nextVer,actor,now);
 const audit=db.prepare(`INSERT INTO starry_ai_b07_policy_history
  (id,scope_key,action,before_json,after_json,actor_id,revision,restored_from,created_at)
  SELECT ?,?,?,?,?,?,?,?,? FROM starry_ai_b07_policies WHERE scope_key=? AND revision=? AND actor_id=?`)
  .bind(id,scope,body.action,before,payload,actor,nextVer,restoredFrom,now,scope,nextVer,actor);
 // Atomic in D1. If a CAS collision happens in the write, no phantom history.
 const rows=await db.batch([write,audit]);
 requireSafe(Number(rows?.[0]?.meta?.changes||0)===1,'stale_budget_revision',409);
 requireSafe(Number(rows?.[1]?.meta?.changes||0)===1,'budget_audit_failed',503);
 return {success:true,scope,revision:nextVer,revisionId:id,stagingOnly:true,
  message:'費用安全政策已儲存為中央草稿；尚未連線任何正式 AI 服務'};
}
export function b07Simulation(input:any){
 const cap=input?.dailyLimitTwd;
 const already=input?.alreadyTwd,estimate=input?.nextEstimateTwd;
 requireSafe([cap,already,estimate].every(x=>isInt(x,0,100000)),'invalid_simulation');
 const code=String(input?.scenario||'new');
 requireSafe(['new','duplicate','provider_error','unknown_rate'].includes(code),'invalid_simulation');
 const blocked=code!=='new'||already+estimate>cap;
 return {demo:true,liveUsage:false,noProviderRequests:true,
   approved:!blocked,reason:code==='duplicate'?'duplicate_request':
     code==='provider_error'?'circuit_open':code==='unknown_rate'?'tariff_unknown':
     blocked?'budget_exceeded':'simulation_only'};
}
/** Internal-only future integration API; caller identity MUST be derived server-side. */
function quote(q:B07Quote){
 requireSafe(q&&typeof q==='object','invalid_quote');
 requireSafe(REQUEST.test(q.requestKey),'invalid_request_key');
 requireSafe(/^[a-f0-9]{64}$/.test(q.fingerprint),'invalid_request_fingerprint');
 requireSafe(MEMBER.test(q.memberKey),'invalid_member_ref');
 requireSafe(MODEL.test(q.modelId)&&!q.modelId.includes('..'),'invalid_model_id');
 requireSafe(isInt(q.maxUnits,1,1_000_000_000),'invalid_reserved_units');
 requireSafe(AI_ROUTING_TASKS.some(x=>x.appId===q.appId&&x.taskId===q.taskId),'unknown_app_or_task');
 return q;
}
function describeExisting(row:any){
 return {requestId:row.id,requestKey:row.request_key,state:row.status,
   billingClass:row.billing_class,reservedMicroTwd:row.held_micro_twd,
   settledMicroTwd:row.actual_micro_twd,freeReservedUnits:row.billing_class==='free_verified'?row.max_units:0,
   duplicate:true,providerCalls:0};
}
export async function b07Reserve(env:B07Env,input:B07Quote){
 const q=quote(input),db=dbOf(env),now=Date.now(),day=new Date(now).toISOString().slice(0,10);
 const existing=await db.prepare('SELECT * FROM starry_ai_b07_calls WHERE request_key=?')
  .bind(q.requestKey).first();
 if(existing){
  requireSafe(existing.fingerprint===q.fingerprint,'idempotency_key_reused',409);
  return describeExisting(existing);
 }
 const tariff=await db.prepare(`SELECT t.billing_class,t.micro_twd_per_unit,t.daily_free_units
   FROM starry_ai_b07_tariffs t JOIN starry_ai_models m ON m.model_id=t.model_id
   WHERE t.model_id=? AND m.registry_status='verified' AND t.valid_until>?
     AND ((t.billing_class='priced' AND m.free_eligibility='not_eligible')
       OR (t.billing_class='free_verified' AND m.free_eligibility='eligible'))
     AND EXISTS (SELECT 1 FROM json_each(m.tasks_json) WHERE value=?)`)
    .bind(q.modelId,now,q.taskId).first();
 requireSafe(tariff,'model_or_price_unverified',409);
 const hold=q.maxUnits*Number(tariff.micro_twd_per_unit);
 requireSafe(Number.isSafeInteger(hold)&&hold>=0&&hold<=100_000_000_000_000,'unbounded_quote',409);
 const id='b07-'+crypto.randomUUID();
 try {
  const r=await db.prepare(`INSERT OR IGNORE INTO starry_ai_b07_calls
    (id,request_key,fingerprint,day,app_id,task_id,member_key,model_id,
     billing_class,status,max_units,held_micro_twd,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,'reserved',?,?,?,?)`)
    .bind(id,q.requestKey,q.fingerprint,day,q.appId,q.taskId,q.memberKey,q.modelId,
      tariff.billing_class,q.maxUnits,hold,now,now).run();
  if(Number(r?.meta?.changes||0)!==1){
   const repeat=await db.prepare('SELECT * FROM starry_ai_b07_calls WHERE request_key=?')
    .bind(q.requestKey).first();
   requireSafe(repeat&&repeat.fingerprint===q.fingerprint,'idempotency_key_reused',409);
   return describeExisting(repeat);
  }
 }catch(e){
  const repeat=await db.prepare('SELECT * FROM starry_ai_b07_calls WHERE request_key=?')
   .bind(q.requestKey).first().catch(()=>null);
  if(repeat){
   requireSafe(repeat.fingerprint===q.fingerprint,'idempotency_key_reused',409);
   return describeExisting(repeat);
  }
  // D1 triggers reject over-budget or free-quota-exhausted reservations atomically.
  throw new B07Error('budget_or_free_quota_exceeded',429);
 }
 return {requestId:id,requestKey:q.requestKey,state:'reserved' as B07State,
  billingClass:tariff.billing_class,reservedMicroTwd:hold,
  settledMicroTwd:0,freeReservedUnits:tariff.billing_class==='free_verified'?q.maxUnits:0,
  duplicate:false,providerCalls:0};
}
export async function b07Complete(env:B07Env,id:string,kind:'settled'|'uncertain'|'void',
  actualUnits=0){
 requireSafe(typeof id==='string'&&/^b07-[a-f0-9-]{36}$/.test(id),'invalid_reservation_id');
 requireSafe(['settled','uncertain','void'].includes(kind),'invalid_completion');
 const db=dbOf(env);
 const old=await db.prepare('SELECT * FROM starry_ai_b07_calls WHERE id=?').bind(id).first();
 requireSafe(old,'reservation_missing',404);
 if(old.status!=='reserved'){
  requireSafe(old.status===kind,'reservation_already_completed',409);
  return {requestId:id,state:old.status,settledMicroTwd:old.actual_micro_twd,idempotent:true}
 }
 if(kind!=='settled')requireSafe(actualUnits===0,'invalid_actual_units');
 else requireSafe(isInt(actualUnits,0,old.max_units),'actual_units_above_hold');
 const tariff=kind==='settled'?await db.prepare(
   'SELECT micro_twd_per_unit FROM starry_ai_b07_tariffs WHERE model_id=?')
  .bind(old.model_id).first():null;
 requireSafe(kind!=='settled'||tariff,'tariff_missing_on_settlement',503);
 const actual=kind==='settled'?actualUnits*Number(tariff.micro_twd_per_unit):0;
 requireSafe(isInt(actual,0,old.held_micro_twd),'actual_cost_above_hold',409);
 const result=await db.prepare(`UPDATE starry_ai_b07_calls
    SET status=?,actual_units=?,actual_micro_twd=?,updated_at=?
    WHERE id=? AND status='reserved'`).bind(kind,actualUnits,actual,Date.now(),id).run();
 if(Number(result?.meta?.changes||0)!==1){
   const fresh=await db.prepare('SELECT status,actual_micro_twd FROM starry_ai_b07_calls WHERE id=?').bind(id).first();
   requireSafe(fresh?.status===kind,'reservation_state_race',409);
   return {requestId:id,state:kind,settledMicroTwd:fresh.actual_micro_twd,idempotent:true};
 }
 return {requestId:id,state:kind,settledMicroTwd:actual,idempotent:false};
}
export async function b07RecordFailure(env:B07Env,modelId:string,reason:string){
 requireSafe(MODEL.test(modelId),'invalid_model_id');
 requireSafe(typeof reason==='string'&&reason.length<=120,'invalid_reason');
 const now=Date.now(),db=dbOf(env);
 const result=await db.prepare(`INSERT INTO starry_ai_b07_circuits(model_id,consecutive_failures,blocked_until,reason,updated_at)
  VALUES (?,1,0,?,?) ON CONFLICT(model_id) DO UPDATE SET
  consecutive_failures=CASE WHEN starry_ai_b07_circuits.updated_at<? THEN 1
    ELSE starry_ai_b07_circuits.consecutive_failures+1 END,
  blocked_until=CASE WHEN starry_ai_b07_circuits.updated_at<? THEN 0
    WHEN starry_ai_b07_circuits.consecutive_failures+1>=3 THEN ? ELSE 0 END,
  reason=excluded.reason,updated_at=excluded.updated_at`)
 .bind(modelId,reason,now,now-600_000,now-600_000,now+3_600_000).run();
 return {recorded:Number(result?.meta?.changes||0)>0,automaticStopAfterFailures:3};
}
