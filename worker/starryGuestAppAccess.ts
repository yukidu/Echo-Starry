/**
 * Starry ecosystem Guest App Access v1.
 *
 * Guest is a POLICY PRINCIPAL, not a member. Never add a user to users,
 * profiles, app_memberships, existing per-member decisions or member counts.
 *
 * Integration contract:
 *  - A deny/default guest never acquires any member API or private data.
 *  - Only explicit adapters listed in GUEST_ADAPTERS may be enabled.
 *  - Apps independently enforce a narrow list of *public* capabilities.
 *  - This module's support list must only name fully deployed adapters.
 *  - Every mutation requires central super-admin auth (upstream), origin
 *    protection, short-lived preview, explicit confirmation and audit.
 */
type GuestEnv = {STARRY_ID_DB?:any;STARRY_ID_ALLOWED_APPS?:string};
// Special guest-only principal: never a real users.id or bulk member.
export const GUEST_PRINCIPAL_ID='starry:guest';
const ADMIN_ORIGIN='https://id.starry.phd';
const VALID_APP=/^[a-z0-9][a-z0-9-]{0,39}$/;
const PREVIEW_TTL_MS=5*60*1000;
const APP_LABELS:Record<string,string>={
  starryphd:'繁星入口',echostars:'繁星回聲',downloadstarry:'繁星下載',
  gostarry:'繁星任意門',quotes:'繁星雞湯',boxstarry:'繁星膠囊',
  'starry-mirror':'繁星心鏡','starry-eye':'繁星視界',
  'starry-ai':'繁星 AI','starry-sync':'繁星同步'
};
// Only downloadstarry is in this two-repo release. Supported means:
// anonymous homepage browsing + non-sensitive front-end interaction;
// downloads/favorites/history/private APIs remain logged-in-only.
export const GUEST_ADAPTERS:Readonly<Record<string,string>>=Object.freeze({
  downloadstarry:'公開首頁與非會員互動（不含下載、收藏、紀錄及私人 API）'
});
// Schema is provisioned with an explicit D1 migration, not on HTTP requests.
// The three tables already exist in production. A read request must NEVER
// issue CREATE TABLE / db.batch: doing DDL during a GET can lock the shared
// D1 database, slow access decisions and leave the admin UI loading.
// Other Apps read starry_guest_app_policies, so failing closed is essential.
// See migrations/20261019_guest_app_access.sql.
const respond=(value:unknown,status=200)=>new Response(JSON.stringify(value),{
  status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}
});
const reject=(message:string,status=400)=>respond({error:message},status);

export async function guestAccessEnabled(db:any,appId:string):Promise<boolean>{
  if(!db || !Object.prototype.hasOwnProperty.call(GUEST_ADAPTERS,appId))return false;
  try{
    const row=await db.prepare('SELECT allowed FROM starry_guest_app_policies WHERE appId=? LIMIT 1')
      .bind(appId).first();
    return row?.allowed===1;
  }catch{
    // During staged rollout, the guest table may not exist yet. Fail closed.
    return false;
  }
}

function availableApps(env:GuestEnv):string[]{
  const ids=String(env.STARRY_ID_ALLOWED_APPS||'').split(',').map(x=>x.trim().toLowerCase());
  return [...new Set(ids.filter(id=>VALID_APP.test(id)&&id!=='starry-id'))].sort();
}
async function currentValue(db:any,appId:string):Promise<boolean>{
  const row=await db.prepare('SELECT allowed FROM starry_guest_app_policies WHERE appId=? LIMIT 1').bind(appId).first();
  return row?.allowed===1;
}
async function catalog(db:any,env:GuestEnv){
  const listed=availableApps(env);
  const rows:any=await db.prepare('SELECT appId,allowed FROM starry_guest_app_policies').all();
  const enabled=new Set((rows?.results||[]).filter((r:any)=>r.allowed===1).map((r:any)=>String(r.appId)));
  return listed.map(id=>({
    id,label:APP_LABELS[id]||id,integrated:Object.prototype.hasOwnProperty.call(GUEST_ADAPTERS,id),
    capability:GUEST_ADAPTERS[id]||'尚未整合訪客權限，暫不允許開放',
    allowed:Object.prototype.hasOwnProperty.call(GUEST_ADAPTERS,id)&&enabled.has(id)
  }));
}
function assertApp(appId:unknown,env:GuestEnv):string{
  if(typeof appId!=='string'||!availableApps(env).includes(appId))throw Error('不在中央 App 清單內');
  if(!Object.prototype.hasOwnProperty.call(GUEST_ADAPTERS,appId))throw Error('這個 App 尚未完成訪客安全整合，不能開放');
  return appId;
}
async function preview(db:any,env:GuestEnv,actor:string,input:any){
  let appId:string,after:boolean,undoOperationId:string|null=null;
  if(typeof input?.undoOperationId==='string'){
    const old:any=await db.prepare('SELECT * FROM starry_guest_app_operations WHERE id=? LIMIT 1')
      .bind(input.undoOperationId).first();
    if(!old||old.undoneBy)throw Error('此訪客權限操作不存在或已還原');
    appId=assertApp(old.appId,env);
    after=old.beforeAllowed===1;
    undoOperationId=old.id;
    if(await currentValue(db,appId)!==(old.afterAllowed===1))
      throw Error('此 App 訪客權限後來已更動，請先確認目前設定');
  }else{
    appId=assertApp(input?.appId,env);
    if(typeof input?.allowed!=='boolean')throw Error('請明確選擇訪客是否允許');
    after=input.allowed;
  }
  const before=await currentValue(db,appId);
  if(before===after)throw Error('訪客權限沒有需要變更');
  const now=Date.now();
  const id=crypto.randomUUID();
  await db.prepare(`INSERT INTO starry_guest_app_previews
    (id,actorUserId,appId,beforeAllowed,afterAllowed,undoOperationId,createdAt,expiresAt)
    VALUES(?,?,?,?,?,?,?,?)`)
    .bind(id,actor,appId,Number(before),Number(after),undoOperationId,now,now+PREVIEW_TTL_MS).run();
  return {previewId:id,appId,appLabel:APP_LABELS[appId]||appId,
    beforeAllowed:before,afterAllowed:after,capability:GUEST_ADAPTERS[appId],
    kind:undoOperationId?'undo':'change',expiresAt:now+PREVIEW_TTL_MS};
}
async function commit(db:any,actor:string,input:any){
  if(input?.confirm!==true || input?.confirmationText!=='確認變更')
    throw Error('請先檢查預覽並輸入「確認變更」');
  if(typeof input?.previewId!=='string'||!/^[0-9a-f-]{36}$/.test(input.previewId))
    throw Error('預覽代碼不正確');
  const item:any=await db.prepare(`SELECT * FROM starry_guest_app_previews
    WHERE id=? AND actorUserId=? LIMIT 1`).bind(input.previewId,actor).first();
  if(!item||item.consumedAt||Number(item.expiresAt)<=Date.now())
    throw Error('預覽已過期或已使用，請重新預覽');
  if(!Object.prototype.hasOwnProperty.call(GUEST_ADAPTERS,item.appId))throw Error('App 整合已停用');
  const before=await currentValue(db,item.appId);
  if(before!==(item.beforeAllowed===1))throw Error('訪客權限已被其他管理員更動，請重新預覽');
  if(item.undoOperationId){
    const old:any=await db.prepare('SELECT * FROM starry_guest_app_operations WHERE id=?')
      .bind(item.undoOperationId).first();
    if(!old||old.undoneBy||old.appId!==item.appId||old.afterAllowed!==item.beforeAllowed)
      throw Error('要還原的操作已變更，請重新預覽');
  }
  const now=Date.now(),operationId=crypto.randomUUID();
  const batch=[
    db.prepare(`UPDATE starry_guest_app_previews SET consumedAt=? WHERE id=? AND actorUserId=?
      AND consumedAt IS NULL AND expiresAt>?`).bind(now,item.id,actor,now),
    db.prepare(`INSERT INTO starry_guest_app_policies(appId,allowed,updatedAt,updatedBy)
      VALUES(?,?,?,?) ON CONFLICT(appId) DO UPDATE SET
      allowed=excluded.allowed,updatedAt=excluded.updatedAt,updatedBy=excluded.updatedBy`)
      .bind(item.appId,item.afterAllowed,now,actor),
    db.prepare(`INSERT INTO starry_guest_app_operations
      (id,actorUserId,appId,beforeAllowed,afterAllowed,createdAt,sourceOperationId)
      VALUES(?,?,?,?,?,?,?)`)
      .bind(operationId,actor,item.appId,item.beforeAllowed,item.afterAllowed,now,item.undoOperationId)
  ];
  if(item.undoOperationId)batch.push(db.prepare(
    'UPDATE starry_guest_app_operations SET undoneBy=? WHERE id=? AND undoneBy IS NULL'
  ).bind(operationId,item.undoOperationId));
  const res=await db.batch(batch);
  if(Number(res?.[0]?.meta?.changes||0)!==1)
    throw Error('預覽已執行，請勿重複送出');
  return {success:true,operationId,appId:item.appId,allowed:item.afterAllowed===1};
}

export async function handleGuestAppPolicyAdmin(
  request:Request,env:GuestEnv,actorUserId:string
):Promise<Response>{
  if(!env.STARRY_ID_DB)return reject('中央資料庫暫時不可用',503);
  if(request.method!=='GET'&&request.headers.get('Origin')!==ADMIN_ORIGIN)
    return reject('必須從 Starry ID 官網操作訪客權限',403);
  try{
    const db=env.STARRY_ID_DB;
    // Read-only requests must perform only SELECT queries. Schema changes
    // belong in migrations; missing tables surface a clear error instead of
    // starting DDL inside the admin request.
    const path=new URL(request.url).pathname;
    if(path==='/api/admin/app-access/guest'&&request.method==='GET')
      return respond({principal:'guest',countedAsMember:false,apps:await catalog(db,env)});
    if(path==='/api/admin/app-access/guest/history'&&request.method==='GET'){
      const result:any=await db.prepare(`SELECT id,appId,beforeAllowed,afterAllowed,createdAt,undoneBy
        FROM starry_guest_app_operations ORDER BY createdAt DESC LIMIT 25`).all();
      return respond({operations:(result?.results||[]).map((row:any)=>({
        ...row,label:APP_LABELS[row.appId]||row.appId
      }))});
    }
    if(path==='/api/admin/app-access/guest/preview'&&request.method==='POST')
      return respond(await preview(db,env,actorUserId,await request.json().catch(()=>({}))));
    if(path==='/api/admin/app-access/guest/commit'&&request.method==='POST')
      return respond(await commit(db,actorUserId,await request.json().catch(()=>({}))));
    return reject('找不到訪客權限操作',404);
  }catch(error){
    console.error('Starry guest access request failed', error instanceof Error?error.message:'unknown');
    // Never leak raw database/SQL internals to clients.
    if(error instanceof Error && /no such table|d1_|database|sqlite|syntax error|SQLITE/i.test(error.message))
      return reject('訪客權限資料服務暫時無法使用，請稍後重新讀取',503);
    return reject(error instanceof Error?error.message:'訪客權限服務暫時無法使用',409);
  }
}
