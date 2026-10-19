import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AdminInputError, dryRunModelDraft, applyModelAdminAction, modelAdminHistory, modelAdminSecretStatus } from '../worker/starryAiModelAdmin';
import { renderStarryAiModelAdminPage } from '../worker/starryAiModelAdminPage';

const model=()=>({
  modelId:'@cf/test/safe-v1',name:'安全測試模型',provider:'Cloudflare Workers AI',version:'v1',
  capabilities:['文字問答'],tasks:['echo.qa'],routeKind:'workers_ai',secretBinding:'none'
});
const row=(a:any)=>({
  model_id:a.modelId,display_name:a.name,provider:a.provider,model_version:a.version,
  capabilities_json:JSON.stringify(a.capabilities),tasks_json:JSON.stringify(a.tasks),route_kind:a.routeKind,
  registry_status:a.registryStatus||'unverified',updated_at:a.updatedAt,updated_by:'tester'
});
function dbMock(){
 const records=new Map<string,any>();
 const revisions=new Map<string,any>();
 const refs=new Map<string,string>();
 const calls:string[]=[];
 function prepare(sql:string){
  return {bind(...args:any[]){return stmt(sql,args)},...stmt(sql,[])};
 }
 function stmt(sql:string,args:any[]){
  return {sql,args,async first(){
    calls.push(sql);
    if(sql.startsWith('SELECT * FROM starry_ai_models'))return records.get(args[0])||null;
    if(sql.includes('COUNT(*) AS n'))return {n:records.size};
    if(sql.includes('SELECT after_json FROM starry_ai_model_revisions'))return revisions.get(args[0])||null;
    if(sql.includes('SELECT secret_binding FROM'))return {secret_binding:refs.get(args[0])||'none'};
    throw Error('unmocked first SQL '+sql);
  },async all(){
    calls.push(sql);
    if(sql.includes('FROM starry_ai_model_revisions WHERE model_id=')){
      return {results:[...revisions.values()].filter(r=>r.model_id===args[0])};
    }
    throw Error('unmocked all SQL '+sql);
  }};
 }
 return {
  calls,records,revisions,refs,prepare,async batch(statements:any[]){
   let done=false,stamp:number|undefined,id:string|undefined,actor:string|undefined;
   const result=[];
   for(const st of statements){
    calls.push(st.sql);
    const s=st.sql, v=st.args;
    let changes=0;
    if(s.includes('INSERT OR IGNORE INTO starry_ai_models')){
      id=v[0];
      if(!records.has(id!)){
        stamp=v[8];actor=v[9];
        records.set(id!,row({modelId:id!,name:v[1],provider:v[2],version:v[3],capabilities:JSON.parse(v[4]),tasks:JSON.parse(v[5]),routeKind:v[6],registryStatus:v[7],updatedAt:stamp}));
        changes=1;done=true;
      }
    }else if(s.includes('UPDATE starry_ai_models SET')){
      id=v[9];const old=records.get(id!);
      if(old&&old.updated_at===v[10]){
        stamp=v[7];actor=v[8];
        records.set(id!,row({modelId:id!,name:v[0],provider:v[1],version:v[2],capabilities:JSON.parse(v[3]),tasks:JSON.parse(v[4]),routeKind:v[5],registryStatus:v[6],updatedAt:stamp}));
        changes=1;done=true;
      }
    }else if(s.includes('INSERT INTO starry_ai_model_secret_refs')){
      if(done&&id===v[2]&&stamp===v[3]){refs.set(id!,v[0]);changes=1}
    }else if(s.includes('INSERT INTO starry_ai_model_revisions')){
      if(done&&id===v[8]&&stamp===v[9]){
        revisions.set(v[0],{revision_id:v[0],model_id:id,actor_id:v[2],action:v[3],before_json:v[4],after_json:v[5],restored_from:v[6],created_at:v[7]});
        changes=1;
      }
    }else throw Error('unmocked batch SQL '+s);
    result.push({meta:{changes}});
   }
   return result;
  }};
}

test('A02: dry-run is free, rejects invalid models and forbids secret body',()=>{
 const ok=dryRunModelDraft(model());
 assert.equal(ok.cost,0);assert.equal(ok.liveTest,false);assert.equal(ok.canActivate,false);
 assert.throws(()=>dryRunModelDraft({...model(),provider:'Bad Vendor'}),AdminInputError);
 assert.throws(()=>dryRunModelDraft({...model(),tasks:['arbitrary'] }),AdminInputError);
 assert.throws(()=>dryRunModelDraft({...model(),secretBinding:'PASTED_PRIVATE_KEY'}),AdminInputError);
 assert.throws(()=>dryRunModelDraft({...model(),modelId:'../../bad'}),AdminInputError);
});

test('A02: create, update and disable preserve auditable before/after and credentials are names only',async()=>{
 const db=dbMock(),env={STARRY_ID_DB:db};
 const first=await applyModelAdminAction(env,'admin-1',{...model(),action:'create'});
 assert.equal(first.registryStatus,'unverified');
 assert.equal(first.paidCalls,0);assert.equal(first.runtimeModelUnchanged,true);
 assert.equal(db.records.size,1);
 await assert.rejects(()=>applyModelAdminAction(env,'admin-1',{...model(),action:'create'}),/model_already_exists/);
 await assert.rejects(()=>applyModelAdminAction(env,'admin-1',{...model(),action:'update',expectedUpdatedAt:0}),/model_changed_reload/);
 const revised=await applyModelAdminAction(env,'admin-2',{...model(),name:'已改名稱',action:'update',expectedUpdatedAt:first.updatedAt});
 assert.equal(db.records.get(model().modelId).display_name,'已改名稱');
 assert.equal((await modelAdminHistory(env,model().modelId)).revisions.length,2);
 const disabled=await applyModelAdminAction(env,'admin-1',{action:'disable',modelId:model().modelId,expectedUpdatedAt:revised.updatedAt});
 assert.equal(disabled.registryStatus,'disabled');
 assert.equal(db.records.get(model().modelId).registry_status,'disabled');
 assert.equal(db.revisions.size,3);
 const status=await modelAdminSecretStatus(env,model().modelId);
 assert.equal(status.configured,false);
 assert.equal(status.binding,'none');
});

test('A05: rollback never reactivates disabled models and never overwrites a newer revision',async()=>{
 const db=dbMock(),env={STARRY_ID_DB:db};
 const c=await applyModelAdminAction(env,'admin-1',{...model(),action:'create'});
 const d=await applyModelAdminAction(env,'admin-1',{action:'disable',modelId:model().modelId,expectedUpdatedAt:c.updatedAt});
 await assert.rejects(()=>applyModelAdminAction(env,'admin-1',{
   action:'restore',modelId:model().modelId,expectedUpdatedAt:c.updatedAt,revisionId:c.revisionId}),/model_changed_reload/);
 const restore=await applyModelAdminAction(env,'admin-1',{
   action:'restore',modelId:model().modelId,expectedUpdatedAt:d.updatedAt,revisionId:c.revisionId});
 assert.equal(restore.registryStatus,'disabled');
 assert.equal(db.records.get(model().modelId).registry_status,'disabled');
 const versions=(await modelAdminHistory(env,model().modelId)).revisions;
 assert.equal(versions.length,3);
 assert.equal(versions.find((x:any)=>x.id===restore.revisionId)?.restoredFrom,c.revisionId);
});

test('A02/A05: central route is superadmin-only, POST same-origin, cannot call provider or enable',async()=>{
 const router=readFileSync('worker/starryIdCentralRouter.ts','utf8');
 assert.match(router,/url.pathname === '\/ai-model-setup'/);
 assert.match(router,/path === '\/api\/ai-model-admin'/);
 assert.match(router,/!session.isSuperAdmin/);
 assert.match(router,/origin !== 'https:\/\/id.starry.phd'/);
 assert.match(router,/application\/json/);
 const admin=readFileSync('worker/starryAiModelAdmin.ts','utf8');
 assert.doesNotMatch(admin,/env\.AI\.run|fetch\(['"]https:\/\//);
 assert.doesNotMatch(admin,/api_key\s*[:=]|secretValue/);
 assert.match(admin,/registryStatus:existing\?\.registryStatus==='disabled'\?'disabled':'unverified'/);
 const page=await renderStarryAiModelAdminPage().text();
 assert.match(page,/免費格式預檢/);
 assert.match(page,/確認還原所選版本/);
 assert.match(page,/金鑰來源/);
 assert.ok(page.includes('/api/ai-model-admin/dry-run'));
});

test('A05: migration is additive, baseline snapshots do not include secrets',()=>{
 const sql=readFileSync('starry-id/migrations/20261020_ai_model_safe_admin.sql','utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS starry_ai_model_revisions/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS starry_ai_model_secret_refs/);
 assert.match(sql,/INSERT OR IGNORE INTO starry_ai_model_revisions/);
 assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM|ALTER TABLE|api_key_value|secret_value|secret_blob/i);
});
