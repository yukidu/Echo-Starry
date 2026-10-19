/**
 * A02/A05 central model metadata administration.
 * No provider inference, no runtime model routing, no secret values and no activation.
 * All writes preserve immutable checkpoints and use optimistic concurrency in one D1 batch.
 */
import { AI_TASK_CATALOG } from './starryAiManagement';

export type ModelAdminEnv = { STARRY_ID_DB?: any; OPENAI_API_KEY?: string };
type View = {
  modelId:string;name:string;provider:string;version:string;capabilities:string[];
  tasks:string[];routeKind:'workers_ai'|'direct'|'gateway'|'unverified';
  registryStatus:'unverified'|'verified'|'disabled';updatedAt:number
};
type Operation = 'create'|'update'|'disable'|'restore';
const ID=/^[a-zA-Z0-9@:_./-]{2,200}$/;
const ALLOWED_PROVIDERS=new Set(['Cloudflare Workers AI','OpenAI','Anthropic','Google AI','其他']);
const ROUTES=new Set(['workers_ai','direct','gateway','unverified']);
const TASK_IDS=new Set<string>(AI_TASK_CATALOG.map(t=>t.id));
const BINDINGS=new Set(['none','OPENAI_API_KEY']);
const FIELD_BYTES=200;

export class AdminInputError extends Error {
  constructor(public code:string,public status=400){super(code)}
}
function need(c:unknown,code:string,status=400):asserts c {
  if(!c) throw new AdminInputError(code,status);
}
function str(v:unknown,limit=FIELD_BYTES) {
  return typeof v==='string' ? v.trim().slice(0,limit) : '';
}
function list(v:unknown,limit:number,approved?:Set<string>):string[]{
  need(Array.isArray(v)&&v.length<=limit,'invalid_list');
  const output=v.map(s=>str(s,80));
  need(output.every(s=>s.length>0&&(!approved||approved.has(s))), 'invalid_list_value');
  need(new Set(output).size===output.length,'duplicate_list');
  return output;
}
function safeView(row:any):View {
  return {
    modelId:row.model_id,name:row.display_name,provider:row.provider,
    version:row.model_version||'',capabilities:JSON.parse(row.capabilities_json),
    tasks:JSON.parse(row.tasks_json),routeKind:row.route_kind,
    registryStatus:row.registry_status,updatedAt:row.updated_at
  };
}
function parseDraft(input:any,existing?:View):View {
  need(input&&typeof input==='object'&&!Array.isArray(input),'invalid_body');
  const modelId=str(input.modelId);need(ID.test(modelId)&&!modelId.includes('..'),'invalid_model_id');
  if(existing)need(existing.modelId===modelId,'model_id_immutable');
  const name=str(input.name);need(name.length>=2&&name.length<=120,'invalid_name');
  const provider=str(input.provider);need(ALLOWED_PROVIDERS.has(provider),'invalid_provider');
  const version=str(input.version,120);
  const capabilities=list(input.capabilities||[],12);
  const tasks=list(input.tasks||[],12,TASK_IDS);
  const routeKind=str(input.routeKind) as View['routeKind'];
  need(ROUTES.has(routeKind),'invalid_route');
  // Verified is never granted through the metadata wizard, and disabled is sticky.
  return {modelId,name,provider,version,capabilities,tasks,routeKind,
    registryStatus:existing?.registryStatus==='disabled'?'disabled':'unverified',updatedAt:0};
}
function binding(v:any,provider:string) {
  const secret=str(v||'none',35);
  need(BINDINGS.has(secret),'invalid_secret_reference');
  if(secret==='OPENAI_API_KEY')need(provider==='OpenAI','provider_secret_mismatch');
  return secret;
}
function prepareUpsert(db:any,v:View,actor:string,ts:number,expected:number|null){
  const vars=[v.name,v.provider,v.version||null,JSON.stringify(v.capabilities),
    JSON.stringify(v.tasks),v.routeKind,v.registryStatus,ts,actor,v.modelId];
  if(expected===null){
    return db.prepare(`INSERT OR IGNORE INTO starry_ai_models
      (model_id,display_name,provider,model_version,capabilities_json,tasks_json,route_kind,
        registry_status,updated_at,updated_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(v.modelId,v.name,v.provider,v.version||null,JSON.stringify(v.capabilities),
      JSON.stringify(v.tasks),v.routeKind,'unverified',ts,actor);
  }
  // Never overwrite runtime status, pricing, gateway, free eligibility or other app config.
  return db.prepare(`UPDATE starry_ai_models SET
    display_name=?,provider=?,model_version=?,capabilities_json=?,tasks_json=?,
    route_kind=?,registry_status=?,updated_at=?,updated_by=?
    WHERE model_id=? AND updated_at=?`).bind(...vars,expected);
}

export function isValidModelAdminMethod(action:unknown):action is Operation {
  return action==='create'||action==='update'||action==='disable'||action==='restore';
}
export function dryRunModelDraft(input:any){
  const view=parseDraft(input);
  binding(input.secretBinding,view.provider);
  return {valid:true,modelId:view.modelId,registryStatus:'unverified',
    liveTest:false,cost:0,canActivate:false,reason:'僅檢查格式；尚未執行供應商真實測試或模型啟用'};
}

export async function modelAdminHistory(env:ModelAdminEnv,modelId:unknown){
  need(typeof modelId==='string'&&ID.test(modelId),'invalid_model_id');
  const db=env.STARRY_ID_DB;need(db,'central_model_database_unavailable',503);
  const data=await db.prepare(`SELECT revision_id,model_id,actor_id,action,after_json,restored_from,created_at
    FROM starry_ai_model_revisions WHERE model_id=? ORDER BY created_at DESC,revision_id DESC LIMIT 30`).bind(modelId).all();
  return {revisions:(data?.results||[]).map((x:any)=>({
    id:x.revision_id,modelId:x.model_id,actorId:x.actor_id,action:x.action,
    snapshot:JSON.parse(x.after_json),restoredFrom:x.restored_from,createdAt:x.created_at
  })),readonly:true};
}

export async function modelAdminSecretStatus(env:ModelAdminEnv,modelId:string){
  need(ID.test(modelId),'invalid_model_id');
  const db=env.STARRY_ID_DB;need(db,'central_model_database_unavailable',503);
  const row=await db.prepare('SELECT secret_binding FROM starry_ai_model_secret_refs WHERE model_id=?').bind(modelId).first();
  const secret=str(row?.secret_binding||'none');
  return {binding:secret,configured:secret==='OPENAI_API_KEY'?Boolean(env.OPENAI_API_KEY):false,
    note:'只檢查既有 Worker secret 是否存在；無法讀取或顯示金鑰內容，未進行模型連線測試'};
}

export async function applyModelAdminAction(env:ModelAdminEnv,actor:string,body:any){
  const db=env.STARRY_ID_DB;need(db,'central_model_database_unavailable',503);
  need(actor&&actor.length<200,'invalid_actor',403);
  need(body&&isValidModelAdminMethod(body.action),'invalid_action');
  const action=body.action as Operation;
  const id=str(body.modelId);
  need(ID.test(id)&&!id.includes('..'),'invalid_model_id');
  const currentRow=await db.prepare('SELECT * FROM starry_ai_models WHERE model_id=? LIMIT 1').bind(id).first();
  const before=currentRow?safeView(currentRow):null;
  if(action==='create')need(!before,'model_already_exists',409);
  else need(before,'model_not_found',404);
  let snapshot:View;
  let requestedBinding='none';
  let sourceRevision:string|null=null;
  if(action==='create'||action==='update'){
    if(action==='create'){
      const count=await db.prepare('SELECT COUNT(*) AS n FROM starry_ai_models').first();
      need(Number(count?.n||0)<100,'model_limit_reached',409);
    } else need(body.expectedUpdatedAt===before!.updatedAt,'model_changed_reload',409);
    snapshot=parseDraft(body,before||undefined);
    requestedBinding=binding(body.secretBinding,snapshot.provider);
  } else if(action==='disable'){
    need(body.expectedUpdatedAt===before!.updatedAt,'model_changed_reload',409);
    snapshot={...before!,registryStatus:'disabled',updatedAt:0};
    // Disable cannot automatically remove a separately configured secret.
  } else {
    need(body.expectedUpdatedAt===before!.updatedAt,'model_changed_reload',409);
    need(typeof body.revisionId==='string'&&body.revisionId.length<=130,'invalid_revision');
    const target=await db.prepare(`SELECT after_json FROM starry_ai_model_revisions WHERE revision_id=? AND model_id=? LIMIT 1`)
      .bind(body.revisionId,id).first();
    need(target?.after_json,'revision_not_found',404);
    const old=JSON.parse(target.after_json);
    need(old?.modelId===id,'revision_mismatch',409);
    // Restore metadata only. Never revive a disabled model or revalidate past approvals.
    snapshot=parseDraft({...old,modelId:id},before!);
    sourceRevision=body.revisionId;
  }
  const now=Math.max(Date.now(),Number(before?.updatedAt||0)+1);
  const next={...snapshot,updatedAt:now};
  const revisionId='ai3-'+crypto.randomUUID();
  const opActor=actor.slice(0,120);
  const statements=[prepareUpsert(db,next,opActor,now,before?before.updatedAt:null)];
  // A restore/disable must discard prior secret references instead of trusting historical credentials.
  const effectiveBinding=(action==='create'||action==='update')?requestedBinding:'none';
  statements.push(db.prepare(`INSERT INTO starry_ai_model_secret_refs(model_id,secret_binding,reviewed_at)
    SELECT model_id,?,? FROM starry_ai_models WHERE model_id=? AND updated_at=? AND updated_by=?
    ON CONFLICT(model_id) DO UPDATE SET secret_binding=excluded.secret_binding,reviewed_at=excluded.reviewed_at`)
    .bind(effectiveBinding,now,id,now,opActor));
  statements.push(db.prepare(`INSERT INTO starry_ai_model_revisions
    (revision_id,model_id,actor_id,action,before_json,after_json,restored_from,created_at)
    SELECT ?,?,?,?,?,?,?,? FROM starry_ai_models WHERE model_id=? AND updated_at=? AND updated_by=?`)
    .bind(revisionId,id,opActor,action,before?JSON.stringify(before):null,
      JSON.stringify(next),sourceRevision,now,id,now,opActor));
  const results=await db.batch(statements);
  if(!(results?.[0]?.meta?.changes>0))throw new AdminInputError('model_changed_reload',409);
  if(!(results?.[results.length-1]?.meta?.changes>0))throw Error('model_audit_commit_failed');
  return {success:true,action,modelId:id,updatedAt:now,revisionId,
    registryStatus:next.registryStatus,cost:0,paidCalls:0,runtimeModelUnchanged:true,
    message: action==='restore'?'已還原目錄資料，模型仍需重新驗證；正式 App 選型不受影響':
      '已記錄模型資料及稽核版本，不會執行付費模型測試或自動啟用'};
}
