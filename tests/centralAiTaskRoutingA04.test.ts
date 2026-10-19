import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {routingTask,previewAiRouting,saveAiRouting,readAiRoutingControl,RoutingInputError,AI_ROUTING_TASKS} from '../worker/starryAiTaskRouting';
import {renderStarryAiTaskRoutingPage} from '../worker/starryAiTaskRoutingPage';

const model=(id:string,task:string,capability='文字問答',status='verified',free='eligible')=>({
  model_id:id,display_name:id,provider:'Cloudflare Workers AI',
  tasks_json:JSON.stringify([task]),capabilities_json:JSON.stringify([capability]),
  registry_status:status,free_eligibility:free,route_kind:'workers_ai',gateway_status:'unverified'
});
function fakeDb(){
 const models:any[]=[model('@cf/test/qa-a','echo.qa'),model('@cf/test/qa-b','echo.qa'),
   model('@cf/test/qa-c','echo.qa'),model('@cf/test/qa-d','echo.qa'),
   model('@cf/test/bio','echo.bio','摘要'),model('@cf/test/whisper','echo.transcribe','語音轉文字')];
 const policies=new Map<string,any>();
 const audits=new Map<string,any>();
 const calls:string[]=[];
 const key=(a:string,b:string)=>a+'|'+b;
 const bound=(sql:string,args:any[])=>({
  sql,args,
  async first(){
   calls.push(sql);
   if(sql.includes('FROM starry_ai_task_routes WHERE'))return policies.get(key(args[0],args[1]))||null;
   if(sql.includes('SELECT after_json FROM starry_ai_task_route_revisions')){
    const r=audits.get(args[0]);return r&&r.app_id===args[1]&&r.task_id===args[2]?r:null;
   }
   throw Error('unsupported first '+sql);
  },async all(){
   calls.push(sql);
   if(sql.includes('FROM starry_ai_models LIMIT'))return {results:models};
   if(sql.includes('FROM starry_ai_task_routes ORDER BY'))return {results:[...policies.values()]};
   if(sql.includes('FROM starry_ai_task_route_revisions WHERE app_id=')){
    return {results:[...audits.values()].filter(x=>x.app_id===args[0]&&x.task_id===args[1])};
   }
   throw Error('unsupported all '+sql);
  }
 });
 let onBatch:(()=>void)|undefined;
 const db={
  models,policies,audits,calls,
  setOnBatch(f:()=>void){onBatch=f},
  prepare(sql:string){return {bind(...args:any[]){return bound(sql,args)},...bound(sql,[])}},
  async batch(statements:any[]){
   if(onBatch){const f=onBatch;onBatch=undefined;f()}
   const out:any[]=[];
   for(const s of statements){
    const sql=s.sql??'',a=s.args??[];calls.push(sql);
    let changes=0;
    if(sql.startsWith('INSERT OR IGNORE INTO starry_ai_task_routes')){
      const k=key(a[0],a[1]);if(!policies.has(k)){policies.set(k,{app_id:a[0],task_id:a[1],
        selection_json:a[2],revision:a[3],updated_by:a[4],updated_at:a[5]});changes=1}
    }else if(sql.startsWith('UPDATE starry_ai_task_routes SET')){
      const k=key(a[4],a[5]),p=policies.get(k);
      if(p&&p.revision===a[6]){
        policies.set(k,{...p,selection_json:a[0],revision:a[1],updated_by:a[2],updated_at:a[3]});changes=1
      }
    }else if(sql.startsWith('INSERT INTO starry_ai_task_route_revisions')){
      const p=policies.get(key(a[10],a[11]));
      if(p&&p.revision===a[12]&&p.updated_by===a[13]){
        audits.set(a[0],{id:a[0],app_id:a[1],task_id:a[2],action:a[3],actor_id:a[4],
          before_json:a[5],after_json:a[6],restored_from:a[7],revision:a[8],created_at:a[9]});
        changes=1;
      }
    }else throw Error('unexpected SQL '+sql);
    out.push({meta:{changes}});
   }
   return out;
  }
 };
 return db;
}
const payload=(appId='echostars',taskId='echo.qa',primary='@cf/test/qa-a',backups:string[]=[])=>({
 appId,taskId,selection:{primary,backups},expectedRevision:0,action:'save'
});
test('A04 independent catalogue includes story attribution without changing existing scheduler',()=>{
 assert.ok(AI_ROUTING_TASKS.some(x=>x.taskId==='echo.story'));
 assert.equal(routingTask('echostars','echo.transcribe').capabilities[0],'語音轉文字');
 assert.throws(()=>routingTask('mirror','echo.qa'),RoutingInputError);
 assert.throws(()=>routingTask('starry-id','echo.qa'),RoutingInputError);
});
test('A04 rejects any unapproved/incompatible model, duplicate backups, 4 backups and unverified cost status',async()=>{
 const db=fakeDb(),env={STARRY_ID_DB:db};
 const good=await previewAiRouting(env,payload());
 assert.equal(good.valid,true);assert.equal(good.providerCalls,0);assert.equal(good.willChangeLiveApps,false);
 db.models[0].registry_status='unverified';
 await assert.rejects(()=>previewAiRouting(env,payload()),/model_not_approved_or_incompatible/);
 db.models[0].registry_status='verified';db.models[0].free_eligibility='unverified';
 await assert.rejects(()=>previewAiRouting(env,payload()),/model_not_approved_or_incompatible/);
 db.models[0].free_eligibility='eligible';
 await assert.rejects(()=>previewAiRouting(env,payload('echostars','echo.transcribe')),/model_not_approved_or_incompatible/);
 await assert.rejects(()=>previewAiRouting(env,payload('echostars','echo.qa','@cf/test/qa-a',['@cf/test/qa-a'])),/duplicate_model/);
 await assert.rejects(()=>previewAiRouting(env,payload('echostars','echo.qa','@cf/test/qa-a',['a','b','c','d'])),/invalid_backup_count/);
 await assert.rejects(()=>previewAiRouting(env,payload('echostars','echo.story')),/model_not_approved_or_incompatible/);
});
test('A04 saves separate app/task records with 0–3 ordered backup models and append-only history',async()=>{
 const db=fakeDb(),env={STARRY_ID_DB:db};
 const x=await saveAiRouting(env,'admin-1',payload('echostars','echo.qa','@cf/test/qa-a',['@cf/test/qa-b','@cf/test/qa-c','@cf/test/qa-d']));
 assert.equal(x.revision,1);assert.equal(x.stagedOnly,true);assert.equal(x.enabledForRuntime,false);
 const updated=await saveAiRouting(env,'admin-2',{...payload('echostars','echo.qa','@cf/test/qa-b',['@cf/test/qa-a']),expectedRevision:1});
 assert.equal(updated.revision,2);
 const separate=await saveAiRouting(env,'admin-1',payload('echostars','echo.bio','@cf/test/bio'));
 assert.equal(separate.revision,1);assert.equal(db.policies.size,2);
 const panel=await readAiRoutingControl(env,'echostars','echo.qa');
 assert.equal(panel.history.length,2);assert.equal(panel.policies.length,2);
 assert.equal(panel.policies.find(x=>x.taskId==='echo.qa')?.selection.backups[0],'@cf/test/qa-a');
 assert.equal(panel.enabledForRuntime,false);
 assert.equal(db.audits.size,3);
});
test('A04 stale revisions do not overwrite other administrator saves',async()=>{
 const db=fakeDb(),env={STARRY_ID_DB:db};
 await saveAiRouting(env,'admin-1',payload());
 await assert.rejects(()=>saveAiRouting(env,'admin-2',payload()),/stale_revision/);
 assert.equal(db.audits.size,1);
 const k='echostars|echo.qa';
 db.setOnBatch(()=>{db.policies.get(k).revision=77});
 await assert.rejects(()=>saveAiRouting(env,'admin-3',{...payload(),expectedRevision:1}),/stale_revision/);
 assert.equal(db.audits.size,1);
});
test('A04 restore must revalidate approvals and never impacts live apps',async()=>{
 const db=fakeDb(),env={STARRY_ID_DB:db};
 const first=await saveAiRouting(env,'admin-1',payload());
 const second=await saveAiRouting(env,'admin-1',{...payload('echostars','echo.qa','@cf/test/qa-b'),expectedRevision:1});
 const restored=await saveAiRouting(env,'admin-1',{appId:'echostars',taskId:'echo.qa',
  action:'restore',revisionId:first.revisionId,expectedRevision:2});
 assert.equal(restored.revision,3);assert.equal(restored.liveAppUnchanged,true);
 assert.equal(db.audits.size,3);
 db.models[0].registry_status='disabled';
 await assert.rejects(()=>saveAiRouting(env,'admin-1',{appId:'echostars',taskId:'echo.qa',
  action:'restore',revisionId:first.revisionId,expectedRevision:3}),/model_not_approved_or_incompatible/);
 assert.equal(db.audits.size,3);
 assert.ok(second.revisionId);
});
test('A04 private central control is admin-only and cannot call providers or mutate other app runtime',async()=>{
 const router=readFileSync('worker/starryIdCentralRouter.ts','utf8');
 assert.match(router,/path === '\/api\/ai-routing'/);
 assert.match(router,/!session.isSuperAdmin/);
 assert.match(router,/origin !== 'https:\/\/id.starry.phd'/);
 assert.match(router,/url.pathname === '\/ai-routing'/);
 const core=readFileSync('worker/starryAiTaskRouting.ts','utf8');
 assert.doesNotMatch(core,/env\.AI\.run|fetch\(.*api\.openai|OPENAI_API_KEY|battery_transactions|qa_settings/);
 assert.match(core,/status:'staging_only'/);
 const page=await renderStarryAiTaskRoutingPage().text();
 assert.match(page,/主要模型/);assert.match(page,/備援 3/);
 assert.match(page,/尚未核准/);assert.match(page,/版本歷史/);
 assert.match(page,/\/api\/ai-routing\/preview/);
});
test('A04 additive migration has no existing data deletion or AI runtime defaults',()=>{
 const migration=readFileSync('starry-id/migrations/20261020_ai_task_routing_a04_01.sql','utf8');
 assert.match(migration,/CREATE TABLE IF NOT EXISTS starry_ai_task_routes/);
 assert.match(migration,/CREATE TABLE IF NOT EXISTS starry_ai_task_route_revisions/);
 assert.doesNotMatch(migration,/DROP TABLE|ALTER TABLE|DELETE FROM|UPDATE qa_settings|INSERT INTO qa_settings/i);
});
