import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {validateB07Scope,validateB07Policy,b07Simulation,saveB07Policy,b07Dashboard,B07Error}
  from '../worker/starryAiB07Budget';
import {renderStarryAiB07BudgetPage} from '../worker/starryAiB07BudgetPage';
const policy={enabled:true,maxCalls:200,maxMicroTwd:0};
function policyDb(){
 const policies=new Map<string,any>([
  ['global',{scope_key:'global',enabled:1,max_calls:0,max_micro_twd:0,revision:1,actor_id:'migration',updated_at:0}],
  ['member:default',{scope_key:'member:default',enabled:1,max_calls:0,max_micro_twd:0,revision:1,actor_id:'migration',updated_at:0}]
 ]);
 const history=new Map<string,any>();
 function bound(sql:string,args:any[]){
  return {sql,args,async first(){
    if(sql.includes('FROM starry_ai_b07_policies WHERE scope_key='))return policies.get(args[0])||null;
    if(sql.includes('SELECT after_json FROM starry_ai_b07_policy_history')){
      const h=history.get(args[0]);return h&&h.scope_key===args[1]?h:null;
    }
    throw Error('unmocked first '+sql)
  },async all(){
    if(sql.includes('FROM starry_ai_b07_policies ORDER BY'))return {results:[...policies.values()]};
    if(sql.includes('FROM starry_ai_b07_usage WHERE'))return {results:[]};
    if(sql.includes('FROM starry_ai_b07_policy_history WHERE'))return {
      results:[...history.values()].filter(x=>x.scope_key===args[0])};
    throw Error('unmocked all '+sql);
  }};
 }
 return {policies,history,prepare(sql:string){return {bind(...args:any[]){return bound(sql,args)},...bound(sql,[])}},
  async batch(statements:any[]){
    return statements.map(s=>{
      const {sql,args:a}=s;let changes=0;
      if(sql.includes('UPDATE starry_ai_b07_policies')){
        const old=policies.get(a[6]);
        if(old&&old.revision===a[7]){
          policies.set(a[6],{scope_key:a[6],enabled:a[0],max_calls:a[1],max_micro_twd:a[2],
            revision:a[3],actor_id:a[4],updated_at:a[5]});changes=1
        }
      }else if(sql.includes('INSERT OR IGNORE INTO starry_ai_b07_policies')){
        if(!policies.has(a[0])){
          policies.set(a[0],{scope_key:a[0],enabled:a[1],max_calls:a[2],max_micro_twd:a[3],
            revision:a[4],actor_id:a[5],updated_at:a[6]});changes=1;
        }
      }else if(sql.includes('INSERT INTO starry_ai_b07_policy_history')){
        const p=policies.get(a[9]);
        if(p&&p.revision===a[10]&&p.actor_id===a[11]){
          history.set(a[0],{id:a[0],scope_key:a[1],action:a[2],before_json:a[3],
            after_json:a[4],actor_id:a[5],revision:a[6],restored_from:a[7],
            created_at:a[8]});changes=1
        }
      }else throw Error('unmocked batch SQL '+sql);
      return {meta:{changes}};
    })
  }};
}
test('B07 policies: four independent scopes and opaque member identities',()=>{
 assert.equal(validateB07Scope('global'),'global');
 assert.equal(validateB07Scope('app:echostars'),'app:echostars');
 assert.equal(validateB07Scope('task:echostars:echo.qa'),'task:echostars:echo.qa');
 assert.equal(validateB07Scope('member:default'),'member:default');
 assert.equal(validateB07Scope('member:'+'a'.repeat(64)),'member:'+'a'.repeat(64));
 assert.throws(()=>validateB07Scope('member:email@example.com'),B07Error);
 assert.throws(()=>validateB07Scope('task:mirror:echo.qa'),B07Error);
 assert.deepEqual(validateB07Policy(policy),policy);
 assert.throws(()=>validateB07Policy({...policy,maxMicroTwd:-1}),B07Error);
 assert.throws(()=>validateB07Policy({...policy,maxCalls:2.5}),B07Error);
});
test('B07 simulation only: repeat/error/unknown-price always block and never bill',()=>{
 const sample={dailyLimitTwd:50,alreadyTwd:20,nextEstimateTwd:15,scenario:'new'};
 const ok=b07Simulation(sample);
 assert.equal(ok.approved,true);assert.equal(ok.demo,true);assert.equal(ok.noProviderRequests,true);
 for(const scenario of ['duplicate','provider_error','unknown_rate'])
   assert.equal(b07Simulation({...sample,scenario}).approved,false);
 assert.equal(b07Simulation({...sample,dailyLimitTwd:0}).approved,false);
 assert.equal(b07Simulation({...sample,alreadyTwd:49}).approved,false);
});
test('B07 policy version revisions and restore are independent, CAS blocks stale UI',async()=>{
 const db=policyDb(),env={STARRY_ID_DB:db};
 const fresh=await b07Dashboard(env);
 assert.equal(fresh.environment,'staging_only');
 assert.equal(fresh.connectedToLiveAI,false);
 const p=await saveB07Policy(env,'superadmin',{scope:'global',action:'save',expectedRevision:1,...policy});
 assert.equal(p.revision,2);
 await assert.rejects(()=>saveB07Policy(env,'superadmin',{scope:'global',action:'save',expectedRevision:1,...policy}),/stale_budget_revision/);
 const a=await saveB07Policy(env,'superadmin',{scope:'app:echostars',action:'save',expectedRevision:0,...policy});
 assert.equal(a.revision,1);
 assert.equal(db.policies.get('app:echostars')?.max_calls,200);
 const back=await saveB07Policy(env,'superadmin',{scope:'global',action:'restore',expectedRevision:2,revisionId:p.revisionId});
 assert.equal(back.revision,3);
 const history=await b07Dashboard(env,'global');
 assert.equal(history.history.length,2);
 assert.equal(history.policies.find((x:any)=>x.scope==='global')?.maxMicroTwd,0);
});
test('B07 protected admin page distinguishes real ledger from demos and guards existing runtime',async()=>{
 const router=readFileSync('worker/starryIdCentralRouter.ts','utf8');
 assert.match(router,/url.pathname === '\/ai-budget'/);
 assert.match(router,/path === '\/api\/ai-budget'/);
 assert.match(router,/!session.isSuperAdmin/);
 assert.match(router,/origin !== 'https:\/\/id.starry.phd'/);
 const core=readFileSync('worker/starryAiB07Budget.ts','utf8');
 assert.doesNotMatch(core,/env\.AI\.run|fetch\(['"]https?:\/\/|battery_transactions|qa_settings/);
 assert.match(core,/model_or_price_unverified/);
 assert.match(core,/idempotency_key_reused/);
 const page=await renderStarryAiB07BudgetPage().text();
 assert.match(page,/已結算/);assert.match(page,/預留中/);
 assert.match(page,/模擬/);assert.match(page,/member:default/);
 assert.match(page,/ai-budget\/simulate/);
});
test('B07 SQLite 2000 submissions (max 12 worker threads) enforce budgets; not 2000 live users',()=>{
 const run=spawnSync('python3',['tests/b07-budget-sqlite-safety.py'],{
  encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024
 });
 assert.equal(run.error,undefined,String(run.error||''));
 assert.equal(run.status,0,'stdout:\n'+run.stdout+'\nstderr:\n'+run.stderr);
 assert.match(run.stdout,/B07_SQLITE_SAFETY_OK/);
});
