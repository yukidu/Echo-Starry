import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {guestAccessEnabled,handleGuestAppPolicyAdmin,GUEST_ADAPTERS} from '../worker/starryGuestAppAccess';

const read=(file:string)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const page=read('worker/starryIdMemberCenterPage.ts');
const access=read('worker/starryAppAccess.ts');
const router=read('worker/starryIdCentralRouter.ts');
const bulk=read('worker/starryAppAccessBulk.ts');
const BASE='https://id.starry.phd';
const config={STARRY_ID_ALLOWED_APPS:'downloadstarry,gostarry,echostars,starry-ai'};

function memoryDb(){
  const policies=new Map<string,{allowed:number,updatedAt:number,updatedBy:string}>();
  const previews=new Map<string,any>();
  const operations=new Map<string,any>();
  const statements:string[]=[];
  const prepare=(sql:string)=>({
    run:async()=>({meta:{changes:0}}), // DDL statements are unbound
    all:async()=>{
      if(sql.includes('FROM starry_guest_app_policies'))
        return {results:[...policies].map(([appId,value])=>({appId,...value}))};
      if(sql.includes('FROM starry_guest_app_operations'))
        return {results:[...operations.values()].sort((a,b)=>b.createdAt-a.createdAt)};
      throw Error('Unhandled unbound .all SQL '+sql);
    },
    bind(...params:any[]){
      return {
        async first(){
          if(sql.includes('SELECT allowed FROM starry_guest_app_policies')){
            const row=policies.get(params[0]);
            return row?{allowed:row.allowed}:null;
          }
          if(sql.includes('FROM starry_guest_app_previews')){
            const row=previews.get(params[0]);
            return row?.actorUserId===params[1]?row:null;
          }
          if(sql.includes('FROM starry_guest_app_operations')){
            return operations.get(params[0])||null;
          }
          throw Error('Unhandled .first SQL '+sql);
        },
        async all(){
          if(sql.includes('FROM starry_guest_app_policies'))
            return {results:[...policies].map(([appId,value])=>({appId,...value}))};
          if(sql.includes('FROM starry_guest_app_operations'))
            return {results:[...operations.values()].sort((a,b)=>b.createdAt-a.createdAt)};
          throw Error('Unhandled .all SQL '+sql);
        },
        async run(){
          statements.push(sql);
          if(sql.includes('INSERT INTO starry_guest_app_previews')){
            const [id,actorUserId,appId,beforeAllowed,afterAllowed,undoOperationId,createdAt,expiresAt]=params;
            previews.set(id,{id,actorUserId,appId,beforeAllowed,afterAllowed,undoOperationId,createdAt,expiresAt,consumedAt:null});
            return {meta:{changes:1}};
          }
          if(sql.includes('UPDATE starry_guest_app_previews')){
            const row=previews.get(params[1]);
            if(!row||row.actorUserId!==params[2]||row.consumedAt||row.expiresAt<=params[3])
              return {meta:{changes:0}};
            row.consumedAt=params[0];
            return {meta:{changes:1}};
          }
          if(sql.includes('INSERT INTO starry_guest_app_policies')){
            policies.set(params[0],{allowed:params[1],updatedAt:params[2],updatedBy:params[3]});
            return {meta:{changes:1}};
          }
          if(sql.includes('INSERT INTO starry_guest_app_operations')){
            const [id,actorUserId,appId,beforeAllowed,afterAllowed,createdAt,sourceOperationId]=params;
            operations.set(id,{id,actorUserId,appId,beforeAllowed,afterAllowed,createdAt,sourceOperationId,undoneBy:null});
            return {meta:{changes:1}};
          }
          if(sql.includes('UPDATE starry_guest_app_operations SET undoneBy')){
            const row=operations.get(params[1]);
            if(!row||row.undoneBy)return {meta:{changes:0}};
            row.undoneBy=params[0];
            return {meta:{changes:1}};
          }
          if(sql.includes('CREATE TABLE IF NOT EXISTS'))return {meta:{changes:0}};
          throw Error('Unhandled run SQL '+sql);
        }
      };
    }
  });
  return {
    db:{prepare,batch:async(batch:any[])=>Promise.all(batch.map(x=>x.run()))},
    policies,previews,operations,statements
  };
}
const env=(db:any)=>({...config,STARRY_ID_DB:db});
function req(path:string,method='GET',body?:unknown,origin=BASE){
  return new Request(BASE+path,{
    method,headers:method==='GET'?{}:{Origin:origin,'Content-Type':'application/json'},
    body:method==='GET'?undefined:JSON.stringify(body)
  });
}
async function response(db:any,path:string,method='GET',body?:unknown,origin=BASE){
  const res=await handleGuestAppPolicyAdmin(req(path,method,body,origin),env(db),'admin-1');
  const json=await res.json() as any;
  return {status:res.status,json};
}

test('Guest is a fixed policy principal before paged members, never a users-table record',()=>{
  assert.match(page,/id="guestAccessEntry"/);
  assert.match(page,/id="guestAppPolicies"/);
  assert.match(page,/id="guestAccessHistory"/);
  assert.ok(page.indexOf('id="guestAccessEntry"')<page.indexOf('id="members"'));
  assert.match(page,/function memberCard\(member\)/);
  assert.match(page,/state\.members\.push\(\.\.\.batch\)/);
  assert.match(page,/selectedIds:new Set/);
  assert.doesNotMatch(page,/state\.members\.unshift\([^)]*guest/i);
  assert.doesNotMatch(page,/mergeMemberSelection\(\['guest'\]/i);
  assert.match(bulk,/WHERE.+?user|requireExistingMembers|json_each/);
  assert.match(router,/FROM users u LEFT JOIN profiles p/);
  assert.match(access,/handleGuestAppPolicyAdmin/);
  assert.match(router,/canManageStarryAppAccess\(session\)/);
});
test('Central allowlist exposes only verified guest adapter, defaults all other Apps blocked',async()=>{
  assert.deepEqual(Object.keys(GUEST_ADAPTERS),['downloadstarry']);
  const {db}=memoryDb();
  const result=await response(db,'/api/admin/app-access/guest');
  assert.equal(result.status,200);
  assert.equal(result.json.principal,'guest');
  assert.equal(result.json.countedAsMember,false);
  assert.equal(result.json.apps.length,4);
  const download=result.json.apps.find((a:any)=>a.id==='downloadstarry');
  assert.equal(download.integrated,true);
  assert.equal(download.allowed,false);
  assert.match(download.capability,/不含下載/);
  const unsupported=result.json.apps.find((a:any)=>a.id==='gostarry');
  assert.equal(unsupported.integrated,false);
  assert.equal(unsupported.allowed,false);
});
test('Guest admin GET is SELECT-only and never performs DDL or db.batch during a request',async()=>{
  const sqls:string[]=[];
  const db={
    prepare(sql:string){
      sqls.push(sql);
      if(!/^\s*SELECT\b/i.test(sql))throw Error('GET must never execute schema writes: '+sql);
      return {
        all:async()=>({results:[]}),
        bind(){return {first:async()=>null};}
      };
    },
    batch(){throw Error('Runtime schema initialization is forbidden');}
  };
  const catalog=await response(db,'/api/admin/app-access/guest');
  assert.equal(catalog.status,200);
  assert.equal(catalog.json.principal,'guest');
  assert.equal(catalog.json.apps.length,4);
  const history=await response(db,'/api/admin/app-access/guest/history');
  assert.equal(history.status,200);
  assert.deepEqual(history.json.operations,[]);
  assert.equal(sqls.length,2);
  assert.ok(sqls.every(sql=>/^\s*SELECT\b/i.test(sql)));
});
test('Database failure returns 503 without leaking SQL internals or granting guest access',async()=>{
  const db={prepare(){throw Error('SQLITE_ERROR: no such table: starry_guest_app_policies');}};
  const result=await response(db,'/api/admin/app-access/guest');
  assert.equal(result.status,503);
  assert.match(result.json.error,/暫時無法使用/);
  assert.doesNotMatch(result.json.error,/SQLITE|starry_guest_app_policies/);
});
test('Guest access is fail-closed when database or table is unavailable',async()=>{
  const {db}=memoryDb();
  assert.equal(await guestAccessEnabled(db,'downloadstarry'),false);
  assert.equal(await guestAccessEnabled(db,'gostarry'),false);
  assert.equal(await guestAccessEnabled({prepare(){throw Error('missing table');}},'downloadstarry'),false);
  assert.equal(await guestAccessEnabled(null,'downloadstarry'),false);
});
test('Unsupported App cannot be opened or receive a temporary preview',async()=>{
  const {db,policies}=memoryDb();
  const result=await response(db,'/api/admin/app-access/guest/preview','POST',{appId:'gostarry',allowed:true});
  assert.equal(result.status,409);
  assert.match(result.json.error,/尚未完成訪客安全整合/);
  assert.equal(policies.size,0);
});
test('Preview cannot change permissions until separate confirmation',async()=>{
  const {db,policies}=memoryDb();
  const preview=await response(db,'/api/admin/app-access/guest/preview','POST',{appId:'downloadstarry',allowed:true});
  assert.equal(preview.status,200);
  assert.equal(preview.json.beforeAllowed,false);
  assert.equal(preview.json.afterAllowed,true);
  assert.equal(policies.size,0);
  const invalid=await response(db,'/api/admin/app-access/guest/commit','POST',{
    previewId:preview.json.previewId,confirm:false,confirmationText:'確認變更'
  });
  assert.equal(invalid.status,409);
  assert.equal(policies.size,0);
});
test('Guest settings are audited, isolated, one-time, and reversible by preview',async()=>{
  const {db,policies,operations,statements}=memoryDb();
  const first=await response(db,'/api/admin/app-access/guest/preview','POST',{appId:'downloadstarry',allowed:true});
  assert.equal(first.status,200);
  const confirm={previewId:first.json.previewId,confirm:true,confirmationText:'確認變更'};
  const accepted=await response(db,'/api/admin/app-access/guest/commit','POST',confirm);
  assert.equal(accepted.status,200);
  assert.equal(accepted.json.allowed,true);
  assert.equal(policies.get('downloadstarry')?.allowed,1);
  assert.equal(await guestAccessEnabled(db,'downloadstarry'),true);
  assert.equal(operations.size,1);
  const dup=await response(db,'/api/admin/app-access/guest/commit','POST',confirm);
  assert.equal(dup.status,409);
  const history=await response(db,'/api/admin/app-access/guest/history');
  assert.equal(history.json.operations.length,1);
  const undo=await response(db,'/api/admin/app-access/guest/preview','POST',{
    undoOperationId:accepted.json.operationId
  });
  assert.equal(undo.status,200);
  assert.equal(undo.json.kind,'undo');
  assert.equal(undo.json.afterAllowed,false);
  const restored=await response(db,'/api/admin/app-access/guest/commit','POST',{
    previewId:undo.json.previewId,confirm:true,confirmationText:'確認變更'
  });
  assert.equal(restored.status,200);
  assert.equal(restored.json.allowed,false);
  assert.equal(policies.get('downloadstarry')?.allowed,0);
  assert.equal(operations.size,2);
  assert.ok(statements.every(sql=>!/(INSERT INTO users|UPDATE users|DELETE FROM users|INSERT INTO app_memberships)/i.test(sql)));
});
test('Untrusted origins are blocked from all guest policy writes',async()=>{
  const {db}=memoryDb();
  const bad=await response(db,'/api/admin/app-access/guest/preview','POST',
    {appId:'downloadstarry',allowed:true},'https://evil.example');
  assert.equal(bad.status,403);
});
