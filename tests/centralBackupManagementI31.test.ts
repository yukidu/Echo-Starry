import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BACKUP_RESOURCES,backupDefaults,getBackupResource,validateBackupDraft,
  previewBackupPolicy,readBackupManagement,stageBackupPolicy,BackupPolicyError}
  from '../worker/starryBackupPolicy';
import {renderStarryBackupManagementPage} from '../worker/starryBackupManagementPage';

function fakeDb(){
 const policies=new Map<string,any>(),history:any[]=[],runs:any[]=[],queries:string[]=[];
 let onBatch:(()=>void)|undefined;
 const bind=(sql:string,args:any[])=>({sql,args,
  async first(){queries.push(sql);if(sql.includes('FROM starry_backup_policies WHERE'))return policies.get(args[0])||null;
   throw Error('unexpected first');},
  async all(){queries.push(sql);
   if(sql.includes('FROM starry_backup_policies ORDER BY'))return {results:[...policies.values()]};
   if(sql.includes('FROM starry_backup_policy_revisions ORDER BY'))return {results:history.slice().reverse()};
   if(sql.includes('FROM starry_backup_runs ORDER BY'))return {results:runs};
   throw Error('unexpected all');}
 });
 return {policies,history,runs,queries,
  onBatch(f:()=>void){onBatch=f;},
  prepare(sql:string){return {...bind(sql,[]),bind(...args:any[]){return bind(sql,args);}}},
  async batch(statements:any[]){if(onBatch){const f=onBatch;onBatch=undefined;f();}
   const out:any[]=[];
   for(const s of statements){const a=s.args;queries.push(s.sql);let changes=0;
    if(s.sql.includes('INSERT OR IGNORE INTO starry_backup_policies')){
     if(!policies.has(a[0])){policies.set(a[0],{resource_id:a[0],resource_kind:a[1],
      interval_days:a[2],retention_days:a[3],revision:a[4],updated_by:a[5],updated_at:a[6],enabled:0});changes=1;}
    }else if(s.sql.includes('UPDATE starry_backup_policies SET')){
     const old=policies.get(a[5]);
     if(old?.revision===a[6]&&old?.enabled===0){policies.set(a[5],{...old,interval_days:a[0],
      retention_days:a[1],revision:a[2],updated_by:a[3],updated_at:a[4]});changes=1;}
    }else if(s.sql.includes('INSERT INTO starry_backup_policy_revisions')){
     const cur=policies.get(a[7]);
     if(cur?.revision===a[8]&&cur?.updated_by===a[9]&&cur?.enabled===0){
      history.push({id:a[0],resource_id:a[1],action:'stage',revision:a[2],
       actor_id:a[3],created_at:a[4],before_json:a[5],after_json:a[6]});changes=1;}
    }else throw Error('unexpected write');
    out.push({meta:{changes}});
   }return out;}
 };
}
const draft={resourceId:'d1:starry_id_db',intervalDays:1,retentionDays:30} as const;

test('I31 registry contains 9 D1 + 3 R2 distinct known resources',()=>{
 assert.equal(BACKUP_RESOURCES.length,12);
 assert.equal(BACKUP_RESOURCES.filter(x=>x.kind==='d1').length,9);
 assert.equal(BACKUP_RESOURCES.filter(x=>x.kind==='r2').length,3);
 assert.equal(new Set(BACKUP_RESOURCES.map(x=>x.id)).size,12);
 assert.equal(getBackupResource('r2:satrry-id-center').name,'satrry-id-center');
 assert.equal(backupDefaults(getBackupResource('r2:echoes-audio-bucket')).intervalDays,7);
 assert.throws(()=>getBackupResource('r2:unknown'),BackupPolicyError);
});
test('I31 input cannot enable, address arbitrary resources or choose unsafe retention',()=>{
 assert.deepEqual(validateBackupDraft(draft),draft);
 for(const x of [{...draft,intervalDays:2},{...draft,intervalDays:'1'},
  {...draft,retentionDays:31},{...draft,retentionDays:'90'},
  {...draft,resourceId:'d1:unknown'},null,[]]){
  assert.throws(()=>validateBackupDraft(x),BackupPolicyError);
 }
 const p=previewBackupPolicy(draft);
 assert.equal(p.willCreateBackup,false);assert.equal(p.willReadSourceData,false);
 assert.equal(p.willRestore,false);assert.equal(p.estimatedCost,null);
});
test('I31 staging stores append-only audit and does not enable execution',async()=>{
 const db=fakeDb(),env={STARRY_ID_DB:db};
 const a=await stageBackupPolicy(env,'admin-a',{action:'stage',draft,expectedRevision:0});
 assert.equal(a.revision,1);assert.equal(a.schedulerEnabled,false);
 const b=await stageBackupPolicy(env,'admin-b',{action:'stage',draft:{...draft,retentionDays:90},expectedRevision:1});
 assert.equal(b.revision,2);assert.equal(db.history.length,2);
 assert.equal(db.policies.get(draft.resourceId).enabled,0);
 const state=await readBackupManagement(env);
 assert.equal(state.policies[0].retentionDays,90);
 assert.equal(state.backups.length,0);assert.equal(state.history.length,2);
 assert.equal(state.timeTravel.userConfigurable,false);
 assert.equal(state.liveBackupEnabled,false);assert.equal(state.liveRestoreEnabled,false);
});
test('I31 stale version and racing admin cannot overwrite or forge history',async()=>{
 const db=fakeDb(),env={STARRY_ID_DB:db};
 await stageBackupPolicy(env,'admin-a',{action:'stage',draft,expectedRevision:0});
 await assert.rejects(()=>stageBackupPolicy(env,'admin-b',{action:'stage',draft,expectedRevision:0}),/stale_revision/);
 db.onBatch(()=>{db.policies.get(draft.resourceId).revision=50;});
 await assert.rejects(()=>stageBackupPolicy(env,'admin-a',{action:'stage',draft,expectedRevision:1}),/stale_revision/);
 assert.equal(db.history.length,1);
 await assert.rejects(()=>stageBackupPolicy(env,'admin-a',{action:'enable',draft,expectedRevision:50}),/invalid_action/);
});
test('I32 no fake backup run or unverified billing claim',async()=>{
 const data=await readBackupManagement({STARRY_ID_DB:fakeDb()});
 assert.deepEqual(data.backups,[]);assert.deepEqual(data.history,[]);
 assert.equal(data.billingVerified,false);assert.equal(data.schedulerEnabled,false);
});
test('I31/I32 UI provides draft choices but hard-disables live restore',async()=>{
 const page=renderStarryBackupManagementPage(),html=await page.text();
 assert.equal(html.includes('自動備份管理'),true);
 assert.equal(html.includes('保存天數'),true);
 assert.equal(html.includes('/api/admin/backups/preview'),true);
 assert.equal(html.includes('disabled>🔒 正式覆蓋還原'),true);
 assert.equal(html.includes('Time Travel'),true);
 assert.equal(html.includes('差異備份'),true);
 assert.equal(page.headers.get('Cache-Control'),'private, no-store');
 assert.equal(page.headers.get('Content-Security-Policy')?.includes("frame-ancestors 'none'"),true);
});
test('I31 route is superadmin-only, same-origin; A04 unchanged, migration additive',()=>{
 const router=readFileSync('worker/starryIdCentralRouter.ts','utf8');
 assert.equal(router.includes("path === '/api/admin/backups'"),true);
 assert.equal(router.includes("origin !== 'https://id.starry.phd'"),true);
 assert.equal(router.includes('!session.isSuperAdmin'),true);
 assert.equal(router.includes("url.pathname === '/backup-management'"),true);
 assert.equal(router.includes("path === '/api/ai-routing'"),true);
 const ddl=readFileSync('starry-id/migrations/20261020_backup_policy_i31_i32.sql','utf8');
 assert.equal(ddl.includes('CHECK(enabled=0)'),true);
 assert.equal(ddl.includes('CREATE TABLE IF NOT EXISTS starry_backup_runs'),true);
 for(const forbidden of ['DROP TABLE','ALTER TABLE','DELETE FROM','TRUNCATE','CREATE TRIGGER'])
  assert.equal(ddl.includes(forbidden),false);
 const core=readFileSync('worker/starryBackupPolicy.ts','utf8');
 for(const forbidden of ['.export(','.put(','.delete(','.restore(','cloudflare.request','time_travel/restore'])
  assert.equal(core.includes(forbidden),false);
});
