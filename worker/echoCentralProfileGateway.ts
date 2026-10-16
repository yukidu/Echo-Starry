import type { Env } from './index';
import { ensureSpouseSchema } from './starryIdSpouseSchema';

const SOURCE_APP = 'echostars';
const SUPER_ADMIN_EMAIL = 'yukidu@gmail.com';
const CENTRAL_PROFILE_FIELDS = [
  'name','avatar','googleAvatar','amwayId','phone','residence','center','rank','approvedRank',
  'rankApproved','rankAuditStatus','rankAuditType','rankUpdatedAt','joinReason','stayReason','birthday',
  'motto','zodiac','talentNumber','lifeNumber','registerDate','auditedBy','auditedAt'
] as const;
const DIRECT_EDIT_FIELDS = new Set([
  'name','avatar','phone','residence','center','joinReason','stayReason','birthday','motto',
  'zodiac','talentNumber','lifeNumber'
]);
const RELATIONS: Record<string,string> = {
  sponsor:'sponsor', platinumUpline:'platinum_upline', diamondUpline:'diamond_upline'
};

export class CentralProfileError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string,unknown> = {}) {
    super(message);
  }
}

function clean(value: unknown) { return value == null ? '' : String(value).trim(); }
function normalizeEmail(value: unknown) { return clean(value).toLowerCase(); }
function isSuperAdmin(user: any) { return normalizeEmail(user?.email) === SUPER_ADMIN_EMAIL; }
function centralDb(env: Env) { return (env as any).STARRY_ID_DB as any; }
function localDb(env: Env) { return (env as any).DB as any; }

async function audit(db: any, userId: string, actorUserId: string, fieldName: string, before: unknown, after: unknown) {
  const oldValue = before == null ? '' : String(before);
  const newValue = after == null ? '' : String(after);
  if (oldValue === newValue) return;
  await db.prepare(`INSERT INTO profile_audit_logs
    (id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt)
    VALUES (?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), userId, SOURCE_APP, actorUserId || userId, fieldName, oldValue, newValue, Date.now()).run();
}

async function centralUserIdForEcho(env: Env, echoUser: any): Promise<string | null> {
  const db = centralDb(env);
  if (!db || !echoUser) return null;
  const echoId = clean(echoUser.id);
  if (echoId) {
    const link: any = await db.prepare(`SELECT userId FROM legacy_links
      WHERE sourceApp=? AND sourceUserId=? LIMIT 1`).bind(SOURCE_APP,echoId).first();
    if (link?.userId) return clean(link.userId);
    const same: any = await db.prepare('SELECT id FROM users WHERE id=? LIMIT 1').bind(echoId).first();
    if (same?.id) return clean(same.id);
  }
  const subject = clean(echoUser.googleSubject);
  if (subject) {
    const identity: any = await db.prepare(`SELECT userId FROM identities
      WHERE provider='google' AND providerSubject=? LIMIT 1`).bind(subject).first();
    if (identity?.userId) return clean(identity.userId);
  }
  const email = normalizeEmail(echoUser.email);
  if (email) {
    const matches: any = await db.prepare(`SELECT id FROM users WHERE LOWER(TRIM(primaryEmail))=? LIMIT 2`).bind(email).all();
    const rows = matches?.results || [];
    if (rows.length === 1) return clean(rows[0].id);
    if (rows.length > 1) throw new CentralProfileError(409,'CENTRAL_IDENTITY_CONFLICT','中央會員 Email 發生重複，請聯絡管理員');
  }
  return null;
}

async function relationshipLabels(db: any, userId: string) {
  const rows: any = await db.prepare(`SELECT mr.relationType,mr.legacyLabel,rp.name AS relatedName
    FROM member_relationships mr
    LEFT JOIN profiles rp ON rp.userId=mr.relatedUserId
    WHERE mr.userId=?`).bind(userId).all();
  const labels: any = { sponsor:'', platinumUpline:'', diamondUpline:'' };
  for (const row of rows?.results || []) {
    const value = clean(row.relatedName || row.legacyLabel);
    if (row.relationType === 'sponsor') labels.sponsor=value;
    else if (row.relationType === 'platinum_upline') labels.platinumUpline=value;
    else if (row.relationType === 'diamond_upline') labels.diamondUpline=value;
  }
  return labels;
}

async function centralProfileById(env: Env, centralUserId: string) {
  const db = centralDb(env);
  if (!db || !centralUserId) return null;
  const row: any = await db.prepare(`SELECT u.id AS centralUserId,u.primaryEmail,u.status,p.*
    FROM users u JOIN profiles p ON p.userId=u.id WHERE u.id=? LIMIT 1`).bind(centralUserId).first();
  if (!row || row.status !== 'active') return null;
  const relations = await relationshipLabels(db,centralUserId);
  const spouse: any = await db.prepare(`SELECT p.name FROM spouse_links s
    JOIN profiles p ON p.userId=CASE WHEN s.userA=? THEN s.userB ELSE s.userA END
    WHERE s.status='active' AND (s.userA=? OR s.userB=?) LIMIT 1`)
    .bind(centralUserId,centralUserId,centralUserId).first().catch(()=>null);
  return { ...row, ...relations, spouseName:clean(spouse?.name) };
}

export async function ensureCentralEchoMember(env: Env, echoUser: any) {
  const db = centralDb(env);
  if (!db) throw new CentralProfileError(503,'CENTRAL_PROFILE_UNAVAILABLE','Starry ID 中央會員服務暫時無法使用，請稍後再試');
  const echoId = clean(echoUser?.id);
  const email = normalizeEmail(echoUser?.email);
  if (!echoId || !email) throw new CentralProfileError(409,'CENTRAL_PROFILE_IDENTITY_MISSING','會員身分資料不完整');

  let userId = await centralUserIdForEcho(env,echoUser);
  const now = Date.now();
  if (!userId) {
    userId = echoId;
    const profileValues: any = {};
    for (const key of CENTRAL_PROFILE_FIELDS) profileValues[key] = echoUser?.[key] ?? '';
    profileValues.birthday = echoUser?.birthday ?? echoUser?.birthDate ?? '';
    const owner = email === SUPER_ADMIN_EMAIL;
    const columns = CENTRAL_PROFILE_FIELDS.join(',');
    const placeholders = CENTRAL_PROFILE_FIELDS.map(()=>'?').join(',');
    try {
      await db.batch([
        db.prepare(`INSERT INTO users(id,primaryEmail,status,createdAt,updatedAt) VALUES(?,?,'active',?,?)`).bind(userId,email,now,now),
        db.prepare(`INSERT INTO profiles(userId,${columns},createdAt,updatedAt) VALUES(?,${placeholders},?,?)`)
          .bind(userId,...CENTRAL_PROFILE_FIELDS.map(key=>profileValues[key]),now,now),
        db.prepare(`INSERT INTO legacy_links(sourceApp,sourceUserId,userId,sourceEmail,importedAt) VALUES(?,?,?,?,?)`)
          .bind(SOURCE_APP,echoId,userId,email,now),
        db.prepare(`INSERT INTO app_memberships(userId,appId,status,role,isAdminUser,isContributor,canUpload,joinedAt,updatedAt)
          VALUES(?,?,'active',?,?,?,?,?,?)`)
          .bind(userId,SOURCE_APP,clean(echoUser.role),owner||echoUser.isAdminUser?1:0,echoUser.isContributor?1:0,echoUser.canUpload?1:0,now,now)
      ]);
    } catch (error) {
      userId = await centralUserIdForEcho(env,echoUser);
      if (!userId) throw error;
    }
  }

  await db.prepare(`INSERT INTO legacy_links(sourceApp,sourceUserId,userId,sourceEmail,importedAt)
    VALUES(?,?,?,?,?) ON CONFLICT(sourceApp,sourceUserId) DO UPDATE SET userId=excluded.userId,sourceEmail=excluded.sourceEmail`)
    .bind(SOURCE_APP,echoId,userId,email,now).run();
  await db.prepare(`INSERT INTO app_memberships(userId,appId,status,role,isAdminUser,isContributor,canUpload,joinedAt,updatedAt)
    VALUES(?,?,'active',?,?,?,?,?,?) ON CONFLICT(userId,appId) DO UPDATE SET
    status='active',role=excluded.role,isAdminUser=excluded.isAdminUser,isContributor=excluded.isContributor,
    canUpload=excluded.canUpload,updatedAt=excluded.updatedAt`)
    .bind(userId,SOURCE_APP,clean(echoUser.role),echoUser.isAdminUser?1:0,echoUser.isContributor?1:0,echoUser.canUpload?1:0,now,now).run();

  const subject = clean(echoUser.googleSubject);
  if (subject) {
    const existing: any = await db.prepare(`SELECT userId FROM identities WHERE provider='google' AND providerSubject=? LIMIT 1`).bind(subject).first();
    if (existing && clean(existing.userId) !== userId) throw new CentralProfileError(409,'CENTRAL_GOOGLE_IDENTITY_CONFLICT','Google 身分已綁定其他中央會員，請聯絡管理員');
    await db.prepare(`INSERT INTO identities(provider,providerSubject,userId,providerEmail,emailVerified,createdAt,lastSeenAt)
      VALUES('google',?,?,?,?,?,?) ON CONFLICT(provider,providerSubject) DO UPDATE SET
      providerEmail=excluded.providerEmail,emailVerified=1,lastSeenAt=excluded.lastSeenAt`)
      .bind(subject,userId,email,1,now,now).run();
  }
  return userId;
}

export async function overlayEchoMemberWithCentral(env: Env, echoUser: any) {
  if (!echoUser || !centralDb(env)) return echoUser;
  const centralId = await centralUserIdForEcho(env,echoUser).catch(()=>null);
  if (!centralId) return echoUser;
  const central = await centralProfileById(env,centralId).catch(()=>null);
  if (!central) return echoUser;
  const merged: any = { ...echoUser };
  for (const key of CENTRAL_PROFILE_FIELDS) if (central[key] !== undefined && central[key] !== null) merged[key]=central[key];
  merged.email = central.primaryEmail || echoUser.email;
  merged.birthday = central.birthday || '';
  merged.birthDate = central.birthday || '';
  merged.sponsor = central.sponsor || '';
  merged.platinumUpline = central.platinumUpline || '';
  merged.diamondUpline = central.diamondUpline || '';
  merged.spouseName = central.spouseName || '';
  // Echo keeps its own stable app user id, roles, permissions and activity data.
  merged.id = echoUser.id;
  return merged;
}

export async function overlayEchoMembersWithCentral(env: Env, members: any[]) {
  if (!Array.isArray(members) || !centralDb(env)) return members;
  return Promise.all(members.map(member=>overlayEchoMemberWithCentral(env,member)));
}

async function confirmSpouseFromEchoOrganization(env: Env, centralUserId: string, otherCentralId: string, dealerId: string) {
  const app = localDb(env); const db=centralDb(env);
  if (!app || !db) return false;
  const selfLink: any = await db.prepare(`SELECT id FROM spouse_links WHERE status='active' AND
    ((userA=? AND userB=?) OR (userA=? AND userB=?)) LIMIT 1`)
    .bind(centralUserId,otherCentralId,otherCentralId,centralUserId).first().catch(()=>null);
  if (selfLink) return true;

  const selfLegacy: any = await db.prepare(`SELECT sourceUserId FROM legacy_links WHERE sourceApp=? AND userId=? LIMIT 1`).bind(SOURCE_APP,centralUserId).first();
  const otherLegacy: any = await db.prepare(`SELECT sourceUserId FROM legacy_links WHERE sourceApp=? AND userId=? LIMIT 1`).bind(SOURCE_APP,otherCentralId).first();
  const a=clean(selfLegacy?.sourceUserId), b=clean(otherLegacy?.sourceUserId);
  if (!a || !b) return false;
  const confirmed: any = await app.prepare(`SELECT g.id FROM organization_groups g
    JOIN organization_members ma ON ma.groupId=g.id AND ma.userId=?
    JOIN organization_members mb ON mb.groupId=g.id AND mb.userId=?
    WHERE g.dealerId=? LIMIT 1`).bind(a,b,dealerId).first().catch(()=>null);
  if (!confirmed) return false;

  await ensureSpouseSchema(db);
  const existingA: any = await db.prepare(`SELECT id FROM spouse_links WHERE (userA=? OR userB=?) AND status IN ('active','pending','unlink_pending') LIMIT 1`).bind(centralUserId,centralUserId).first();
  const existingB: any = await db.prepare(`SELECT id FROM spouse_links WHERE (userA=? OR userB=?) AND status IN ('active','pending','unlink_pending') LIMIT 1`).bind(otherCentralId,otherCentralId).first();
  if (existingA || existingB) return false;
  const users=[centralUserId,otherCentralId].sort(); const linkId=crypto.randomUUID(); const now=Date.now();
  await db.batch([
    db.prepare(`INSERT INTO spouse_links(id,userA,userB,status,requestedBy,createdAt,updatedAt) VALUES(?,?,?,'active',?,?,?)`).bind(linkId,users[0],users[1],centralUserId,now,now),
    db.prepare('INSERT INTO spouse_slots(userId,linkId) VALUES(?,?)').bind(users[0],linkId),
    db.prepare('INSERT INTO spouse_slots(userId,linkId) VALUES(?,?)').bind(users[1],linkId)
  ]);
  return true;
}

async function updateDistributorNumber(env: Env, centralUserId: string, actorUserId: string, requestedValue: unknown) {
  const db=centralDb(env); await ensureSpouseSchema(db);
  const current: any = await db.prepare('SELECT amwayId FROM profiles WHERE userId=? LIMIT 1').bind(centralUserId).first();
  const before=clean(current?.amwayId), requested=clean(requestedValue);
  if (before===requested) return;
  const activeLink: any = await db.prepare(`SELECT id,userA,userB FROM spouse_links WHERE status='active' AND (userA=? OR userB=?) LIMIT 1`).bind(centralUserId,centralUserId).first();
  if (!requested && activeLink) throw new CentralProfileError(409,'SPOUSE_DISTRIBUTOR_LOCKED','夫妻共同經營使用同一個直銷商編號，如需變更請先解除夫妻關係');
  if (requested && !/^[0-9]+$/.test(requested) && !/^n[0-9]{7}$/.test(requested)) throw new CentralProfileError(400,'INVALID_DISTRIBUTOR_NUMBER','會員編號格式不正確');

  const found: any = requested ? await db.prepare(`SELECT userId FROM profiles WHERE amwayId=? AND userId<>? LIMIT 3`).bind(requested,centralUserId).all() : {results:[]};
  const others=(found?.results||[]).map((row:any)=>clean(row.userId)).filter(Boolean);
  if (others.length>1) throw new CentralProfileError(409,'DISTRIBUTOR_NUMBER_CONFLICT','此直銷商編號已有超過一位其他會員使用，請聯絡管理員');
  if (others.length===1) {
    const other=others[0];
    let linked: any = await db.prepare(`SELECT id FROM spouse_links WHERE status='active' AND
      ((userA=? AND userB=?) OR (userA=? AND userB=?)) LIMIT 1`).bind(centralUserId,other,other,centralUserId).first();
    if (!linked) {
      const confirmed=await confirmSpouseFromEchoOrganization(env,centralUserId,other,requested);
      if (confirmed) linked={id:'confirmed'};
    }
    if (!linked) {
      const partner:any=await db.prepare('SELECT name FROM profiles WHERE userId=? LIMIT 1').bind(other).first();
      throw new CentralProfileError(409,'COUPLE_CONFIRM_REQUIRED',`此直銷商編號已由 ${clean(partner?.name)||'另一位會員'} 使用，請先確認夫妻關係`,{candidate:{centralUserId:other,name:clean(partner?.name)}});
    }
  }
  await db.prepare('UPDATE profiles SET amwayId=?,updatedAt=? WHERE userId=?').bind(requested,Date.now(),centralUserId).run();
  await audit(db,centralUserId,actorUserId,'amwayId',before,requested);
}

async function updateRelationship(db:any,userId:string,actorUserId:string,field:string,value:unknown) {
  const relationType=RELATIONS[field]; if(!relationType)return;
  const before:any=await db.prepare('SELECT legacyLabel FROM member_relationships WHERE userId=? AND relationType=? LIMIT 1').bind(userId,relationType).first();
  const label=clean(value);
  if(!label){
    await db.prepare('DELETE FROM member_relationships WHERE userId=? AND relationType=?').bind(userId,relationType).run();
  } else {
    await db.prepare(`INSERT INTO member_relationships(userId,relationType,relatedUserId,legacyLabel,resolutionStatus,updatedAt)
      VALUES(?,?,NULL,?,'unresolved',?) ON CONFLICT(userId,relationType) DO UPDATE SET
      relatedUserId=NULL,legacyLabel=excluded.legacyLabel,resolutionStatus='unresolved',updatedAt=excluded.updatedAt`)
      .bind(userId,relationType,label,Date.now()).run();
  }
  await audit(db,userId,actorUserId,field,clean(before?.legacyLabel),label);
}

export async function writeEchoProfileToCentral(env: Env, echoActor: any, echoTarget: any, patch: any) {
  const db=centralDb(env);
  if(!db) throw new CentralProfileError(503,'CENTRAL_PROFILE_UNAVAILABLE','Starry ID 中央會員服務暫時無法使用，資料未儲存');
  const targetCentralId=await ensureCentralEchoMember(env,echoTarget);
  const actorCentralId=await ensureCentralEchoMember(env,echoActor);
  if (!isSuperAdmin(echoActor) && clean(echoActor.id)!==clean(echoTarget.id)) throw new CentralProfileError(403,'PROFILE_FORBIDDEN','只能修改自己的基本資料');
  const before=await centralProfileById(env,targetCentralId);
  if(!before) throw new CentralProfileError(404,'CENTRAL_PROFILE_NOT_FOUND','找不到中央會員資料');
  const next:any={...patch};
  if(next.birthDate!==undefined && next.birthday===undefined) next.birthday=next.birthDate;

  if(Object.prototype.hasOwnProperty.call(next,'amwayId')) await updateDistributorNumber(env,targetCentralId,actorCentralId,next.amwayId);

  const updates:string[]=[]; const values:any[]=[]; const changed: Array<[string,unknown,unknown]>=[];
  for(const key of DIRECT_EDIT_FIELDS){
    if(!Object.prototype.hasOwnProperty.call(next,key))continue;
    const value=next[key] == null ? '' : next[key];
    if(String((before as any)[key] ?? '')===String(value ?? ''))continue;
    updates.push(`${key}=?`); values.push(value); changed.push([key,(before as any)[key],value]);
  }
  if(Object.prototype.hasOwnProperty.call(next,'rank') && String(next.rank)!==String(before.rank||'')){
    const requested=clean(next.rank);
    updates.push('rank=?'); values.push(requested); changed.push(['rank',before.rank,requested]);
    if(isSuperAdmin(echoActor)){
      updates.push('approvedRank=?','rankApproved=1',"rankAuditStatus='approved'",'auditedBy=?','auditedAt=?');
      values.push(requested,clean(echoActor.email),new Date().toISOString());
    }else{
      updates.push('rankApproved=0',"rankAuditStatus='pending'",'rankAuditType=?','rankUpdatedAt=?');
      values.push(clean(next.rankAuditType)|| (before.rank?'rank_change':'new_register'), clean(next.rankUpdatedAt)||new Date().toISOString().replace('T',' ').substring(0,16));
    }
  }
  if(updates.length){
    updates.push('updatedAt=?');values.push(Date.now(),targetCentralId);
    await db.prepare(`UPDATE profiles SET ${updates.join(',')} WHERE userId=?`).bind(...values).run();
    for(const [field,oldValue,newValue] of changed) await audit(db,targetCentralId,actorCentralId,field,oldValue,newValue);
  }
  for(const field of Object.keys(RELATIONS)) if(Object.prototype.hasOwnProperty.call(next,field)) await updateRelationship(db,targetCentralId,actorCentralId,field,next[field]);
  await db.prepare('UPDATE users SET updatedAt=? WHERE id=?').bind(Date.now(),targetCentralId).run();
  const fresh=await centralProfileById(env,targetCentralId);
  return overlayEchoMemberWithCentral(env,{...echoTarget,...fresh,id:echoTarget.id});
}

export async function overlayEchoJsonResponse(env: Env, response: Response) {
  if(!response.ok || !centralDb(env)) return response;
  const type=response.headers.get('Content-Type')||'';
  if(!type.includes('application/json'))return response;
  let data:any; try{data=await response.clone().json();}catch{return response;}
  let changed=false;
  if(Array.isArray(data)) { data=await overlayEchoMembersWithCentral(env,data); changed=true; }
  else if(data && Array.isArray(data.users)) { data={...data,users:await overlayEchoMembersWithCentral(env,data.users)}; changed=true; }
  else if(data?.user?.id) { data={...data,user:await overlayEchoMemberWithCentral(env,data.user)}; changed=true; }
  else if(data?.id) { data=await overlayEchoMemberWithCentral(env,data); changed=true; }
  if(!changed)return response;
  const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=utf-8');headers.set('Cache-Control','no-store');headers.delete('Content-Length');
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}
