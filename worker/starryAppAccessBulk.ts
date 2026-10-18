/**
 * Starry ID audited, resumable bulk app access operations.
 *
 * A filtered selection is always resolved into a server-side snapshot at
 * preview time. The admin never sends a list of permissions to be trusted.
 * Each step is a short D1 batch transaction, with a lease and before-value
 * comparison to prevent accidental repeats and detect concurrent edits.
 *
 * Interruptions leave an explicit resumable/undoable operation, never a
 * falsely reported all-or-nothing success.
 */
type BulkEnv = { STARRY_ID_DB?: any };
type Selection = {scope:'filtered'|'manual'; search?:string;rank?:string;excludedIds?:string[];userIds?:string[]};
type Intent = {selection:Selection;mode:'grant'|'revoke'|'replace';appIds:string[]};
type BulkItem = {userId:string;appId:string;beforeDecision:string|null;afterDecision:string;applied:number;reverted:number;currentDecision:string|null};
const ID=/^[A-Za-z0-9._:-]{1,128}$/;
const APP=/^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_MEMBERS=5000;
const STEP_CHANGES=120;
const PREVIEW_MS=15*60*1000;
const LEASE_MS=45*1000;
const schemaReady=new WeakMap<object,Promise<void>>();

export async function ensureBulkAccessSchema(db:any):Promise<void>{
  let ready=schemaReady.get(db as object);
  if(!ready){
    ready=db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS starry_app_access_bulk_jobs (
        id TEXT PRIMARY KEY, actorUserId TEXT NOT NULL, mode TEXT NOT NULL,
        selectionJson TEXT NOT NULL, appIdsJson TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('preview','running','completed','conflict','reverting','reverted','undo_conflict')),
        memberCount INTEGER NOT NULL DEFAULT 0, totalChanges INTEGER NOT NULL DEFAULT 0,
        doneChanges INTEGER NOT NULL DEFAULT 0, revertedChanges INTEGER NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL, confirmedAt INTEGER,
        undoPreviewAt INTEGER, lockUntil INTEGER, lastError TEXT, updatedAt INTEGER NOT NULL
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS starry_app_access_bulk_items (
        jobId TEXT NOT NULL, userId TEXT NOT NULL, appId TEXT NOT NULL,
        beforeDecision TEXT, afterDecision TEXT NOT NULL CHECK(afterDecision IN ('allow','deny')),
        applied INTEGER NOT NULL DEFAULT 0, reverted INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(jobId,userId,appId)
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS starry_app_access_bulk_jobs_actor ON starry_app_access_bulk_jobs(actorUserId,createdAt DESC)'),
      db.prepare('CREATE INDEX IF NOT EXISTS starry_app_access_bulk_items_pending ON starry_app_access_bulk_items(jobId,applied,reverted)')
    ]).then(()=>undefined).catch((error:any)=>{schemaReady.delete(db as object);throw error;});
    schemaReady.set(db as object,ready as Promise<void>);
  }
  await ready;
}
function failure(message:string, status=409){
  return new Response(JSON.stringify({error:message}),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}
function success(value:any){
  return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}
export function parseBulkSelection(raw:any):Selection{
  if(!raw||typeof raw!=='object'||!['filtered','manual'].includes(raw.scope))throw Error('請重新選取會員');
  if(raw.scope==='manual'){
    const ids=raw.userIds;
    if(!Array.isArray(ids)||!ids.length||ids.length>MAX_MEMBERS||new Set(ids).size!==ids.length||!ids.every((id:any)=>typeof id==='string'&&ID.test(id)))throw Error('會員選取資料不正確');
    return {scope:'manual',userIds:ids};
  }
  if(typeof raw.search!=='string'||raw.search.length>80||typeof raw.rank!=='string'||raw.rank.length>100)throw Error('篩選條件不正確');
  const excludes=raw.excludedIds;
  if(!Array.isArray(excludes)||excludes.length>MAX_MEMBERS||!excludes.every((v:any)=>typeof v==='string'&&ID.test(v))||new Set(excludes).size!==excludes.length)throw Error('全選排除清單不正確');
  return {scope:'filtered',search:raw.search.trim(),rank:raw.rank,excludedIds:excludes};
}
const RANK_EXPR="CASE WHEN p.rankApproved=1 THEN TRIM(COALESCE(p.approvedRank,'')) ELSE '' END";
function selectionSQL(selection:Selection):{where:string;params:any[]}{
  if(selection.scope==='manual')return {where:'u.id IN (SELECT value FROM json_each(?))',params:[JSON.stringify(selection.userIds)]};
  const clauses=['u.id NOT IN (SELECT value FROM json_each(?))'];
  const params:any[]=[JSON.stringify(selection.excludedIds)];
  const search=(selection.search||'').trim();
  if(search){
    const like='%'+search+'%';
    clauses.push("(LOWER(COALESCE(p.name,'')) LIKE LOWER(?) OR LOWER(u.primaryEmail) LIKE LOWER(?) OR LOWER(COALESCE(p.amwayId,'')) LIKE LOWER(?))");
    params.push(like,like,like);
  }
  if(selection.rank){
    clauses.push(RANK_EXPR+'=?');
    params.push(selection.rank==='__unapproved__'?'':selection.rank);
  }
  return {where:clauses.join(' AND '),params};
}
async function loadJob(db:any,id:string,actor:string){
  if(!ID.test(id))throw Error('作業代碼不正確');
  const row:any=await db.prepare('SELECT * FROM starry_app_access_bulk_jobs WHERE id=? AND actorUserId=?').bind(id,actor).first();
  if(!row)throw Error('找不到這項批次作業');
  return row;
}
function describe(job:any){
  return {jobId:job.id,status:job.status,mode:job.mode,memberCount:Number(job.memberCount),changeCount:Number(job.totalChanges),
    done:Number(job.doneChanges),reverted:Number(job.revertedChanges),lastError:job.lastError||null,
    createdAt:Number(job.createdAt),expiresAt:Number(job.expiresAt)};
}
async function preview(db:any,actor:string,input:Intent,apps:string[]){
  const selection=parseBulkSelection(input?.selection);
  if(!['grant','revoke','replace'].includes(input?.mode))throw Error('設定方式不正確');
  if(!Array.isArray(input.appIds)||new Set(input.appIds).size!==input.appIds.length||!input.appIds.every(v=>typeof v==='string'&&apps.includes(v)))throw Error('App 名稱不正確');
  if(input.mode!=='replace'&&!input.appIds.length)throw Error('請勾選至少一個 App');
  const {where,params}=selectionSQL(selection);
  const count:any=await db.prepare('SELECT COUNT(*) AS count FROM users u LEFT JOIN profiles p ON p.userId=u.id WHERE '+where)
    .bind(...params).first();
  const memberCount=Number(count?.count||0);
  if(!memberCount)throw Error('沒有符合條件的會員');
  if(memberCount>MAX_MEMBERS)throw Error('超過批次上限 5,000 人，請縮小篩選條件');
  if(selection.scope==='manual'&&memberCount!==selection.userIds?.length)throw Error('會員名單已有異動，請重新整理');
  const targets=(input.mode==='replace'?apps:input.appIds).map(id=>({
    id,after:input.mode==='revoke'?'deny':input.mode==='replace'&&!input.appIds.includes(id)?'deny':'allow'
  }));
  const id=crypto.randomUUID(),now=Date.now();
  const statements=[
    db.prepare(`INSERT INTO starry_app_access_bulk_jobs
      (id,actorUserId,mode,selectionJson,appIdsJson,status,memberCount,createdAt,expiresAt,updatedAt)
      VALUES (?,?,?,?,?,'preview',?,?,?,?)`)
      .bind(id,actor,input.mode,JSON.stringify(selection),JSON.stringify(input.appIds),memberCount,now,now+PREVIEW_MS,now),
    db.prepare(`INSERT INTO starry_app_access_bulk_items
      (jobId,userId,appId,beforeDecision,afterDecision)
      SELECT ?,u.id,json_extract(a.value,'$.id'),d.decision,json_extract(a.value,'$.after')
      FROM users u LEFT JOIN profiles p ON p.userId=u.id CROSS JOIN json_each(?) a
      LEFT JOIN starry_app_access_decisions d ON d.userId=u.id AND d.appId=json_extract(a.value,'$.id')
      WHERE ${where}
      AND COALESCE(d.decision,'') <> json_extract(a.value,'$.after')`)
      .bind(id,JSON.stringify(targets),...params)
  ];
  await db.batch(statements);
  const total:any=await db.prepare('SELECT COUNT(*) AS count FROM starry_app_access_bulk_items WHERE jobId=?').bind(id).first();
  const changeCount=Number(total?.count||0);
  await db.prepare('UPDATE starry_app_access_bulk_jobs SET totalChanges=? WHERE id=?').bind(changeCount,id).run();
  const examples:any=await db.prepare(`SELECT b.userId,p.name,b.appId,b.beforeDecision,b.afterDecision
    FROM starry_app_access_bulk_items b LEFT JOIN profiles p ON p.userId=b.userId
    WHERE b.jobId=? ORDER BY b.userId,b.appId LIMIT 18`).bind(id).all();
  return {jobId:id,status:'preview',kind:'bulk',mode:input.mode,memberCount,changeCount,expiresAt:now+PREVIEW_MS,
    examples:examples?.results||[],exampleCount:Math.min(18,changeCount),
    message:changeCount===0?'沒有需要變更的權限':'預覽已建立，需再次確認才會執行；執行後會保存完整修改紀錄'};
}
async function confirm(db:any,actor:string,input:any){
  if(input?.confirm!==true||input?.confirmationText!=='確認變更')throw Error('請先再次確認');
  const job=await loadJob(db,String(input.jobId||''),actor);
  if(job.status!=='preview'||Date.now()>Number(job.expiresAt))throw Error('預覽已失效，請重新預覽');
  const now=Date.now();
  const row:any=await db.prepare("UPDATE starry_app_access_bulk_jobs SET status='running',confirmedAt=?,updatedAt=? WHERE id=? AND actorUserId=? AND status='preview' AND expiresAt>?")
    .bind(now,now,job.id,actor,now).run();
  if(Number(row?.meta?.changes||0)!==1)throw Error('這項作業已開始，請查詢進度');
  return describe({...job,status:'running'});
}
async function report(db:any,actor:string,id:string){return describe(await loadJob(db,id,actor));}
async function undoPreview(db:any,actor:string,id:string){
  const job=await loadJob(db,id,actor);
  if(!['running','completed','conflict','undo_conflict'].includes(job.status)||Number(job.doneChanges)<=Number(job.revertedChanges))throw Error('這項作業目前沒有可以還原的修改');
  if(Number(job.lockUntil||0)>Date.now())throw Error('作業進行中，請稍後再試');
  const mismatches:any=await db.prepare(`SELECT COUNT(*) AS count FROM starry_app_access_bulk_items b
    LEFT JOIN starry_app_access_decisions d ON d.userId=b.userId AND d.appId=b.appId
    WHERE b.jobId=? AND b.applied=1 AND b.reverted=0
    AND COALESCE(d.decision,'')<>COALESCE(b.afterDecision,'')`).bind(job.id).first();
  if(Number(mismatches?.count||0)>0)throw Error('部分會員權限已被其他操作更改，不會強制覆蓋；請由管理員個別確認');
  const now=Date.now();
  await db.prepare('UPDATE starry_app_access_bulk_jobs SET undoPreviewAt=?,updatedAt=? WHERE id=? AND actorUserId=?')
    .bind(now,now,job.id,actor).run();
  return {...describe(job),status:'undo_preview',undoExpiresAt:now+PREVIEW_MS,message:'僅還原此作業已修改的權限；未執行的項目不受影響'};
}
async function confirmUndo(db:any,actor:string,input:any){
  if(input?.confirm!==true||input?.confirmationText!=='確認變更')throw Error('請再次確認還原');
  const job=await loadJob(db,String(input.jobId||''),actor);
  const now=Date.now();
  if(!['running','completed','conflict','undo_conflict'].includes(job.status)||!job.undoPreviewAt||
    now-Number(job.undoPreviewAt)>PREVIEW_MS)throw Error('還原預覽已失效');
  if(Number(job.lockUntil||0)>now)throw Error('作業仍在執行，請稍後重試');
  const changed:any=await db.prepare("UPDATE starry_app_access_bulk_jobs SET status='reverting',updatedAt=?,undoPreviewAt=NULL,lastError=NULL WHERE id=? AND actorUserId=? AND status IN ('running','completed','conflict','undo_conflict') AND (lockUntil IS NULL OR lockUntil<?)")
    .bind(now,job.id,actor,now).run();
  if(Number(changed?.meta?.changes||0)!==1)throw Error('作業狀態已改變，請重新整理');
  return describe({...job,status:'reverting'});
}
/** A request applies/reverts at most STEP_CHANGES entries atomically. */
async function step(db:any,actor:string,id:string){
  const job=await loadJob(db,id,actor);
  if(!['running','reverting'].includes(job.status))return describe(job);
  const now=Date.now();
  const lease:any=await db.prepare("UPDATE starry_app_access_bulk_jobs SET lockUntil=? WHERE id=? AND actorUserId=? AND status=? AND (lockUntil IS NULL OR lockUntil<?)")
    .bind(now+LEASE_MS,id,actor,job.status,now).run();
  if(Number(lease?.meta?.changes||0)!==1)throw Error('另一個視窗正在處理，請稍後重試');
  const reverse=job.status==='reverting';
  const where=reverse?'b.applied=1 AND b.reverted=0':'b.applied=0';
  try {
    const raw:any=await db.prepare(`SELECT b.userId,b.appId,b.beforeDecision,b.afterDecision,b.applied,b.reverted,d.decision AS currentDecision
      FROM starry_app_access_bulk_items b LEFT JOIN starry_app_access_decisions d ON d.userId=b.userId AND d.appId=b.appId
      WHERE b.jobId=? AND ${where} ORDER BY b.userId,b.appId LIMIT ?`).bind(id,STEP_CHANGES).all();
    const rows:BulkItem[]=raw?.results||[];
    if(!rows.length){
      const status=reverse?'reverted':'completed';
      await db.prepare('UPDATE starry_app_access_bulk_jobs SET status=?,lockUntil=NULL,updatedAt=? WHERE id=? AND actorUserId=?').bind(status,Date.now(),id,actor).run();
      return describe({...job,status});
    }
    const collision=rows.find(r=>(r.currentDecision||null)!==(reverse?r.afterDecision:(r.beforeDecision||null)));
    if(collision){
      await db.prepare("UPDATE starry_app_access_bulk_jobs SET status=?,lastError=?,lockUntil=NULL,updatedAt=? WHERE id=? AND actorUserId=?")
        .bind(reverse?'undo_conflict':'conflict','會員權限已被其他操作修改，作業已安全停止；請檢查及還原',Date.now(),id,actor).run();
      throw Error('會員權限已經改變，作業已停止。已完成部分可透過操作紀錄預覽還原');
    }
    const keys=JSON.stringify(rows.map(x=>x.userId+'|'+x.appId));
    const join="b.userId || '|' || b.appId IN (SELECT value FROM json_each(?))";
    const stamp=Date.now();
    const updateDecision=reverse?'b.beforeDecision':'b.afterDecision';
    const writes:any[]=[
      db.prepare(`INSERT INTO starry_app_access_decisions (userId,appId,decision,updatedAt,updatedBy)
        SELECT b.userId,b.appId,${updateDecision},?,?
        FROM starry_app_access_bulk_items b WHERE b.jobId=? AND ${join} AND ${updateDecision} IS NOT NULL
        ON CONFLICT(userId,appId) DO UPDATE SET decision=excluded.decision,updatedAt=excluded.updatedAt,updatedBy=excluded.updatedBy`)
        .bind(stamp,actor,id,keys)
    ];
    if(reverse)writes.push(db.prepare(`DELETE FROM starry_app_access_decisions
      WHERE EXISTS (SELECT 1 FROM starry_app_access_bulk_items b
        WHERE b.jobId=? AND b.userId=starry_app_access_decisions.userId AND b.appId=starry_app_access_decisions.appId
        AND b.beforeDecision IS NULL AND ${join})`).bind(id,keys));
    writes.push(db.prepare(`UPDATE starry_app_access_bulk_items SET ${reverse?'reverted':'applied'}=1
      WHERE jobId=? AND (userId || '|' || appId) IN (SELECT value FROM json_each(?))`).bind(id,keys));
    writes.push(db.prepare(`UPDATE starry_app_access_bulk_jobs
      SET ${reverse?'revertedChanges':'doneChanges'}=${reverse?'revertedChanges':'doneChanges'}+?,updatedAt=?,lockUntil=NULL
      WHERE id=? AND actorUserId=? AND status=?`).bind(rows.length,stamp,id,actor,job.status));
    await db.batch(writes);
    const current=await loadJob(db,id,actor);
    if(Number(reverse?current.revertedChanges:current.doneChanges)>=Number(reverse?current.doneChanges:current.totalChanges)){
      const status=reverse?'reverted':'completed';
      await db.prepare('UPDATE starry_app_access_bulk_jobs SET status=?,updatedAt=? WHERE id=? AND actorUserId=?').bind(status,Date.now(),id,actor).run();
      return describe({...current,status});
    }
    return describe(current);
  } finally {
    await db.prepare('UPDATE starry_app_access_bulk_jobs SET lockUntil=NULL WHERE id=? AND actorUserId=?').bind(id,actor).run().catch(()=>undefined);
  }
}
async function details(db:any,actor:string,id:string,offset:number){
  const job=await loadJob(db,id,actor);
  const safeOffset=Number.isSafeInteger(offset)&&offset>=0?Math.min(offset,100000):0;
  const rows:any=await db.prepare(`SELECT b.userId,p.name,b.appId,b.beforeDecision,b.afterDecision,b.applied,b.reverted
    FROM starry_app_access_bulk_items b LEFT JOIN profiles p ON p.userId=b.userId
    WHERE b.jobId=? ORDER BY b.userId,b.appId LIMIT 200 OFFSET ?`).bind(job.id,safeOffset).all();
  const items=rows?.results||[];
  return {jobId:job.id,totalChanges:Number(job.totalChanges),items,nextOffset:safeOffset+items.length,
    hasMore:safeOffset+items.length<Number(job.totalChanges)};
}
async function recent(db:any,actor:string){
  const r:any=await db.prepare(`SELECT id,mode,status,memberCount,totalChanges,doneChanges,revertedChanges,createdAt,expiresAt,lastError
    FROM starry_app_access_bulk_jobs WHERE actorUserId=? AND status<>'preview'
    ORDER BY createdAt DESC LIMIT 25`).bind(actor).all();
  return {jobs:(r?.results||[]).map((j:any)=>({jobId:j.id,mode:j.mode,status:j.status,memberCount:j.memberCount,changeCount:j.totalChanges,
    done:j.doneChanges,reverted:j.revertedChanges,createdAt:j.createdAt,lastError:j.lastError||null}))};
}
export async function handleStarryAppAccessBulk(request:Request,env:BulkEnv,actor:string,apps:string[]):Promise<Response>{
  const db=env.STARRY_ID_DB;
  if(!db)return failure('中央會員資料庫無法使用',503);
  try{
    await ensureBulkAccessSchema(db);
    const path=new URL(request.url).pathname, method=request.method.toUpperCase();
    const input=method==='POST'?await request.json().catch(()=>({})):{} as any;
    const id=String((input as any).jobId||new URL(request.url).searchParams.get('jobId')||'');
    if(path==='/api/admin/app-access/bulk/preview'&&method==='POST')return success(await preview(db,actor,input as Intent,apps));
    if(path==='/api/admin/app-access/bulk/confirm'&&method==='POST')return success(await confirm(db,actor,input));
    if(path==='/api/admin/app-access/bulk/step'&&method==='POST')return success(await step(db,actor,id));
    if(path==='/api/admin/app-access/bulk/status'&&method==='GET')return success(await report(db,actor,id));
    if(path==='/api/admin/app-access/bulk/details'&&method==='GET')
      return success(await details(db,actor,id,Number(new URL(request.url).searchParams.get('offset')||0)));
    if(path==='/api/admin/app-access/bulk/history'&&method==='GET')return success(await recent(db,actor));
    if(path==='/api/admin/app-access/bulk/undo-preview'&&method==='POST')return success(await undoPreview(db,actor,id));
    if(path==='/api/admin/app-access/bulk/undo-confirm'&&method==='POST')return success(await confirmUndo(db,actor,input));
    return failure('不存在的批次管理操作',404);
  }catch(error){
    const message=error instanceof Error?error.message:'批次權限管理暫時無法使用';
    console.warn('Starry bulk App access operation failed',message);
    if(/^(D1|SQLITE|database|TypeError|Error:)/i.test(message))return failure('資料庫暫時忙碌，請稍後查詢作業進度，勿重複建立作業',503);
    return failure(message,409);
  }
}
