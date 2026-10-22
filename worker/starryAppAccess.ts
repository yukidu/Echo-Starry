/**
 * Starry ID centralized App access administration.
 * Phase 1 is non-disruptive: existing app enrolment is unchanged, explicit
 * admin decisions take precedence. Cross-App enforcement is enabled only
 * after each App's server integration passes its own regression checks.
 */
import { handleStarryAppAccessBulk } from './starryAppAccessBulk';
import { handleGuestAppPolicyAdmin, GUEST_PRINCIPAL_ID } from './starryGuestAppAccess';

type AccessEnv = {
  STARRY_ID_DB?: any;
  STARRY_ID_ALLOWED_APPS?: string;
};

type Decision = 'allow' | 'deny' | null;
type Change = { userId: string; appId: string; before: Decision; after: Decision };
const PROTECTED_APP = 'starry-id';
const MEMBER_LIMIT = 50;
const PREVIEW_TTL = 5 * 60 * 1000;
const MAX_CHANGES = 550;

const APP_LABELS: Record<string, string> = {
  starryphd: '繁星入口', echostars: '繁星回聲',
  downloadstarry: '繁星下載', gostarry: '繁星任意門',
  quotes: '繁星雞湯', boxstarry: '繁星膠囊',
  'starry-mirror': '繁星心鏡', 'starry-eye': '繁星視界',
  'starry-ai': '繁星 AI', 'starry-sync': '繁星同步',
  'gratitude-starry': '繁星感恩日記'
};
const ID_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const APP_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const schemaTasks = new WeakMap<object, Promise<void>>();

function api(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
  });
}
function fail(message: string, status = 400): Response { return api({ error: message }, status); }
function normalizeId(input: unknown): string { return typeof input === 'string' ? input.trim() : ''; }
function appList(env: AccessEnv): string[] {
  const values = String(env.STARRY_ID_ALLOWED_APPS || '').split(',').map(v => v.trim().toLowerCase());
  return [...new Set(values.filter(v => APP_RE.test(v) && v !== PROTECTED_APP))].sort();
}
function isDecision(value: unknown): value is Decision { return value === null || value === 'allow' || value === 'deny'; }

export async function ensureAccessSchema(db: any): Promise<void> {
  const key = db as object;
  let current = schemaTasks.get(key);
  if (!current) {
    current = (async () => {
      await db.batch([
        db.prepare("CREATE TABLE IF NOT EXISTS starry_app_access_decisions (userId TEXT NOT NULL,appId TEXT NOT NULL,decision TEXT NOT NULL CHECK(decision IN ('allow','deny')),updatedAt INTEGER NOT NULL,updatedBy TEXT NOT NULL,PRIMARY KEY(userId,appId))"),
        db.prepare("CREATE TABLE IF NOT EXISTS starry_app_access_operations (id TEXT PRIMARY KEY,actorUserId TEXT NOT NULL,kind TEXT NOT NULL,sourceOperationId TEXT,createdAt INTEGER NOT NULL,revertedBy TEXT)"),
        db.prepare("CREATE TABLE IF NOT EXISTS starry_app_access_changes (operationId TEXT NOT NULL,userId TEXT NOT NULL,appId TEXT NOT NULL,beforeDecision TEXT,afterDecision TEXT,PRIMARY KEY(operationId,userId,appId))"),
        db.prepare("CREATE TABLE IF NOT EXISTS starry_app_access_previews (id TEXT PRIMARY KEY,actorUserId TEXT NOT NULL,kind TEXT NOT NULL,sourceOperationId TEXT,changesJson TEXT NOT NULL,createdAt INTEGER NOT NULL,expiresAt INTEGER NOT NULL,consumedAt INTEGER)")
      ]);
    })().catch(error => { schemaTasks.delete(key); throw error; });
    schemaTasks.set(key, current);
  }
  await current;
}

/** Explicit decisions are checked before any legacy self-enrolment logic. */
export async function readAppAccessDecision(db: any, userId: string, appId: string): Promise<Decision> {
  if (!db || !ID_RE.test(userId) || !APP_RE.test(appId) || appId === PROTECTED_APP) return null;
  await ensureAccessSchema(db);
  const row: any = await db.prepare('SELECT decision FROM starry_app_access_decisions WHERE userId=? AND appId=? LIMIT 1')
    .bind(userId,appId).first();
  return row?.decision === 'allow' || row?.decision === 'deny' ? row.decision : null;
}

// Access-policy activation date: first production deployment of central App controls.
// Historical members remain grandfathered; an explicit admin 'deny' always wins.
// A new member receives Starry ID only until an administrator explicitly grants each App.
export const NEW_MEMBER_GRANT_CUTOFF_MS = Date.parse('2026-10-18T16:30:14.903Z');

export type AppAccessResult = {
  allowed: boolean;
  reason: 'allowed' | 'explicitly_denied' | 'new_member_requires_grant' | 'inactive' | 'membership_blocked' | 'unknown_member';
};

export async function checkStarryAppAccess(db: any, userId: string, appId: string): Promise<AppAccessResult> {
  if (!db || !ID_RE.test(userId) || !APP_RE.test(appId)) return {allowed:false,reason:'unknown_member'};
  await ensureAccessSchema(db);
  const row:any = await db.prepare(`SELECT u.id,u.status,u.createdAt,
      a.decision AS explicitDecision,m.status AS membershipStatus
    FROM users u
    LEFT JOIN starry_app_access_decisions a ON a.userId=u.id AND a.appId=?
    LEFT JOIN app_memberships m ON m.userId=u.id AND m.appId=?
    WHERE u.id=? LIMIT 1`).bind(appId,appId,userId).first();
  if (!row) return {allowed:false,reason:'unknown_member'};
  if (row.status!=='active') return {allowed:false,reason:'inactive'};
  if (appId===PROTECTED_APP) return {allowed:true,reason:'allowed'};
  if (row.explicitDecision==='deny') return {allowed:false,reason:'explicitly_denied'};
  if (row.membershipStatus && row.membershipStatus!=='active') return {allowed:false,reason:'membership_blocked'};
  if (row.explicitDecision==='allow') return {allowed:true,reason:'allowed'};
  const createdAt=Number(row.createdAt);
  // Treat missing/unparseable historical timestamps as existing users; never lock out legacy accounts.
  if (Number.isFinite(createdAt) && createdAt>=NEW_MEMBER_GRANT_CUTOFF_MS)
    return {allowed:false,reason:'new_member_requires_grant'};
  return {allowed:true,reason:'allowed'};
}

async function getDecisions(db: any, ids: string[]): Promise<Map<string, Decision>> {
  const map = new Map<string, Decision>();
  if (!ids.length) return map;
  const holders = ids.map(() => '?').join(',');
  const rows: any = await db.prepare('SELECT userId,appId,decision FROM starry_app_access_decisions WHERE userId IN (' + holders + ')').bind(...ids).all();
  for (const row of rows?.results || []) map.set(String(row.userId)+'|'+String(row.appId),row.decision);
  return map;
}
function currentDecision(map: Map<string,Decision>, userId: string, appId: string): Decision {
  return map.get(userId+'|'+appId) || null;
}
function parseChanges(raw: string): Change[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length > MAX_CHANGES) throw new Error('invalid_preview');
  return parsed.map((item: any) => {
    if (!item || !ID_RE.test(item.userId) || !APP_RE.test(item.appId) ||
      item.appId === PROTECTED_APP || !isDecision(item.before) || !isDecision(item.after))
      throw new Error('invalid_preview');
    return {userId:item.userId,appId:item.appId,before:item.before,after:item.after} as Change;
  });
}
async function requireExistingMembers(db: any, ids: string[]): Promise<any[]> {
  if(ids.includes(GUEST_PRINCIPAL_ID))
    throw new Error('訪客不可被當作會員調整 App 權限');
  const holders = ids.map(() => '?').join(',');
  const found: any = await db.prepare('SELECT u.id,p.name FROM users u LEFT JOIN profiles p ON p.userId=u.id WHERE u.id IN ('+holders+')').bind(...ids).all();
  const rows:any[] = found?.results || [];
  if (rows.length !== ids.length) throw new Error('有會員已不存在，請重新選取');
  return rows;
}
async function createPreview(db: any, actorUserId: string, intent: any, apps: string[]) {
  const now=Date.now();
  let changes: Change[]=[];
  let kind = '';
  let sourceOperationId: string | null = null;
  let members: any[] = [];
  if (intent?.kind === 'undo') {
    sourceOperationId=normalizeId(intent.operationId);
    if (!ID_RE.test(sourceOperationId)) throw new Error('還原代碼不正確');
    const op:any=await db.prepare('SELECT * FROM starry_app_access_operations WHERE id=? LIMIT 1').bind(sourceOperationId).first();
    if (!op || op.revertedBy) throw new Error('這項修改不存在或已還原');
    const rows:any=await db.prepare('SELECT userId,appId,beforeDecision,afterDecision FROM starry_app_access_changes WHERE operationId=?')
      .bind(sourceOperationId).all();
    changes=(rows?.results||[]).map((r:any)=>({userId:String(r.userId),appId:String(r.appId),before:r.afterDecision||null,after:r.beforeDecision||null}));
    kind='undo';
  } else {
    const ids: unknown = intent?.userIds;
    const requestedApps:unknown=intent?.appIds;
    const mode=intent?.mode;
    if (!Array.isArray(ids)||!ids.length||ids.length>MEMBER_LIMIT ||
      !ids.every(x=>typeof x==='string'&&ID_RE.test(x))||new Set(ids).size!==ids.length)
      throw new Error('每次請選取 1 至 50 位不重複的會員');
    if (!Array.isArray(requestedApps)||!requestedApps.every(x=>typeof x==='string'&&apps.includes(x)) ||
      new Set(requestedApps).size!==requestedApps.length) throw new Error('App 選擇不正確');
    if (!['grant','revoke','replace'].includes(mode)) throw new Error('操作類型不正確');
    if ((mode==='grant'||mode==='revoke')&&!requestedApps.length) throw new Error('請至少選取一個 App');
    members=await requireExistingMembers(db,ids);
    const targets=mode==='replace'?apps:requestedApps;
    if (ids.length*targets.length>MAX_CHANGES) throw new Error('本次操作過大，請分批設定');
    const current=await getDecisions(db, ids);
    for (const userId of ids as string[]) for (const appId of targets as string[]) {
      const before=currentDecision(current,userId,appId);
      const after:Decision = mode==='revoke' ? 'deny' : mode==='grant' ? 'allow' : requestedApps.includes(appId) ? 'allow' : 'deny';
      if (before!==after) changes.push({userId,appId,before,after});
    }
    kind=mode;
  }
  if (!changes.length) throw new Error('沒有需要變更的權限');
  if (changes.length>MAX_CHANGES) throw new Error('本次操作過大，請分批設定');
  const uniqueIds=[...new Set(changes.map(x=>x.userId))];
  if (!members.length) members=await requireExistingMembers(db,uniqueIds);
  const snapshot=await getDecisions(db,uniqueIds);
  for (const change of changes) if(currentDecision(snapshot,change.userId,change.appId)!==change.before)
    throw new Error('會員權限已被其他管理員修改，請重新預覽');
  const previewId=crypto.randomUUID();
  await db.prepare('INSERT INTO starry_app_access_previews (id,actorUserId,kind,sourceOperationId,changesJson,createdAt,expiresAt) VALUES (?,?,?,?,?,?,?)')
    .bind(previewId,actorUserId,kind,sourceOperationId,JSON.stringify(changes),now,now+PREVIEW_TTL).run();
  return { previewId,kind,expiresAt:now+PREVIEW_TTL, memberCount:uniqueIds.length,changeCount:changes.length,
    members:members.slice(0,15).map(r=>({id:r.id,name:r.name||'未填姓名'})),
    changes:changes.slice(0,30),truncated:changes.length>30 };
}
async function commitPreview(db: any, actorUserId: string, input: any) {
  if (input?.confirm !== true || input?.confirmationText !== '確認變更') throw new Error('請先確認預覽內容');
  const previewId=normalizeId(input.previewId);
  if (!ID_RE.test(previewId)) throw new Error('預覽已失效，請重新操作');
  const preview:any=await db.prepare('SELECT * FROM starry_app_access_previews WHERE id=? AND actorUserId=? LIMIT 1')
    .bind(previewId,actorUserId).first();
  if (!preview || preview.consumedAt || Number(preview.expiresAt)<=Date.now()) throw new Error('預覽已過期或已執行');
  const changes=parseChanges(preview.changesJson);
  const ids=[...new Set(changes.map(c=>c.userId))];
  const current=await getDecisions(db,ids);
  for(const c of changes) if(currentDecision(current,c.userId,c.appId)!==c.before) throw new Error('權限已變更，請重新預覽');
  if(preview.kind==='undo'){
    const original:any=await db.prepare('SELECT revertedBy FROM starry_app_access_operations WHERE id=?').bind(preview.sourceOperationId).first();
    if(!original||original.revertedBy) throw new Error('這項操作已被還原');
  }
  // Claim the preview atomically before applying it, making double clicks safe.
  const now=Date.now();
  const claim:any=await db.prepare('UPDATE starry_app_access_previews SET consumedAt=? WHERE id=? AND actorUserId=? AND consumedAt IS NULL AND expiresAt>?')
    .bind(now,previewId,actorUserId,now).run();
  if(Number(claim?.meta?.changes||0)!==1) throw new Error('預覽已執行，請勿重複送出');
  const operationId=crypto.randomUUID();
  const writes:any[]=[
    db.prepare('INSERT INTO starry_app_access_operations (id,actorUserId,kind,sourceOperationId,createdAt) VALUES (?,?,?,?,?)')
      .bind(operationId,actorUserId,preview.kind,preview.sourceOperationId||null,now)
  ];
  for(const c of changes){
    if(c.after===null){
      writes.push(db.prepare('DELETE FROM starry_app_access_decisions WHERE userId=? AND appId=?').bind(c.userId,c.appId));
    } else {
      writes.push(db.prepare('INSERT INTO starry_app_access_decisions (userId,appId,decision,updatedAt,updatedBy) VALUES (?,?,?,?,?) ON CONFLICT(userId,appId) DO UPDATE SET decision=excluded.decision,updatedAt=excluded.updatedAt,updatedBy=excluded.updatedBy')
        .bind(c.userId,c.appId,c.after,now,actorUserId));
    }
    writes.push(db.prepare('INSERT INTO starry_app_access_changes (operationId,userId,appId,beforeDecision,afterDecision) VALUES (?,?,?,?,?)')
      .bind(operationId,c.userId,c.appId,c.before,c.after));
  }
  if(preview.kind==='undo') writes.push(db.prepare('UPDATE starry_app_access_operations SET revertedBy=? WHERE id=? AND revertedBy IS NULL').bind(operationId,preview.sourceOperationId));
  await db.batch(writes);
  return { success:true, operationId,changed:changes.length };
}
export async function handleStarryAppAccessAdminRequest(request:Request, env:AccessEnv, actorUserId:string): Promise<Response> {
  const db=env.STARRY_ID_DB;
  if (!db) return fail('中央會員資料庫暫時無法使用',503);
  const url=new URL(request.url);
  // This module intentionally does not trust sibling subdomains for writes.
  if(request.method!=='GET' && request.headers.get('Origin')!=='https://id.starry.phd')
    return fail('管理操作只能從 Starry ID 官方網站進行',403);
  try {
    const apps=appList(env);
    const path=url.pathname;
    // The catalog is configured centrally and requires no D1 schema writes.
    // Keep the picker available even if an unrelated audit/history table fails.
    if(path==='/api/admin/app-access/catalog'&&request.method==='GET')
      return api({apps:apps.map(id=>({id,label:APP_LABELS[id]||id})),protectedApp:PROTECTED_APP,maxMembers:MEMBER_LIMIT});
    // Guest policies are deliberately NOT a fake member. They use separate
    // tables and cannot be included in member/bulk/grant or search APIs.
    if(path==='/api/admin/app-access/guest'||path.startsWith('/api/admin/app-access/guest/'))
      return handleGuestAppPolicyAdmin(request,env,actorUserId);
    await ensureAccessSchema(db);
    if(path.startsWith('/api/admin/app-access/bulk/'))
      return handleStarryAppAccessBulk(request,env,actorUserId,apps);
    const memberPath=path.match(/^\/api\/admin\/app-access\/member\/([A-Za-z0-9._:-]+)$/);
    if(memberPath && request.method==='GET'){
      const userId=memberPath[1];
      const members=await requireExistingMembers(db,[userId]);
      const decisions=await getDecisions(db,[userId]);
      const membership:any=await db.prepare('SELECT appId,status FROM app_memberships WHERE userId=?').bind(userId).all();
      const memberships=new Map((membership?.results||[]).map((x:any)=>[String(x.appId),String(x.status)]));
      return api({ member:{id:members[0].id,name:members[0].name||''},
        apps:apps.map(id=>({id,label:APP_LABELS[id]||id,decision:currentDecision(decisions,userId,id),
          legacyMembership:memberships.get(id)||null})) });
    }
    if(path==='/api/admin/app-access/preview'&&request.method==='POST'){
      const input=await request.json().catch(()=>({}));
      return api(await createPreview(db,actorUserId,input,apps));
    }
    if(path==='/api/admin/app-access/commit'&&request.method==='POST'){
      const input=await request.json().catch(()=>({}));
      return api(await commitPreview(db,actorUserId,input));
    }
    if(path==='/api/admin/app-access/history'&&request.method==='GET'){
      const rows:any=await db.prepare('SELECT id,actorUserId,kind,sourceOperationId,createdAt,revertedBy FROM starry_app_access_operations ORDER BY createdAt DESC LIMIT 30').all();
      return api({history:rows?.results||[]});
    }
    return fail('找不到此權限管理功能',404);
  } catch(error){
    const message=error instanceof Error?error.message:'權限設定無法完成';
    console.warn('Starry App access operation failed',message);
    const clientError=/請|已|無|不是|錯誤|不存在|過期|不正確|變更|失效|找不到|超過|重複|至少|還原/.test(message);
    return fail(clientError?message:'權限設定暫時無法完成，請稍後再試',clientError?409:503);
  }
}
