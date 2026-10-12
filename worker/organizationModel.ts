import { isPlatinumOrAboveRank, isPlatinumToolsEligible } from '../shared/stickers';

export type UplineKind = 'platinum' | 'diamond';

const schemaReady = new WeakMap<object, Promise<void>>();

export function normalizeDealerId(value: unknown): string {
  return String(value || '').trim();
}

export async function ensureOrganizationSchema(db: any) {
  if (!db) return;
  const key = db as object;
  if (!schemaReady.has(key)) {
    schemaReady.set(key, (async () => {
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS organization_groups (
          id TEXT PRIMARY KEY,
          dealerId TEXT NOT NULL UNIQUE,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS organization_members (
          groupId TEXT NOT NULL,
          userId TEXT NOT NULL UNIQUE,
          memberOrder INTEGER NOT NULL DEFAULT 0,
          joinedAt INTEGER NOT NULL,
          PRIMARY KEY(groupId,userId)
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS upline_bindings (
          memberId TEXT NOT NULL,
          kind TEXT NOT NULL,
          groupId TEXT NOT NULL,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL,
          PRIMARY KEY(memberId,kind)
        )`),
        db.prepare('CREATE INDEX IF NOT EXISTS organization_members_group ON organization_members(groupId, memberOrder)'),
        db.prepare('CREATE INDEX IF NOT EXISTS upline_bindings_group ON upline_bindings(groupId, kind)')
      ]);
    })());
  }
  return schemaReady.get(key);
}

export async function groupIdForUser(db: any, userId: string): Promise<string | null> {
  await ensureOrganizationSchema(db);
  const row: any = await db.prepare('SELECT groupId FROM organization_members WHERE userId = ? LIMIT 1').bind(userId).first();
  return row?.groupId || null;
}

export async function groupForDealerId(db: any, dealerId: string) {
  await ensureOrganizationSchema(db);
  const normalized = normalizeDealerId(dealerId);
  if (!normalized) return null;
  return db.prepare('SELECT * FROM organization_groups WHERE dealerId = ? LIMIT 1').bind(normalized).first();
}

export async function groupMembers(db: any, groupId: string) {
  await ensureOrganizationSchema(db);
  const { results } = await db.prepare(`
    SELECT u.id,u.name,u.email,u.amwayId,u.rank,u.approvedRank,u.rankApproved,u.rankAuditStatus,u.isBlocked,om.memberOrder
    FROM organization_members om
    JOIN users u ON u.id = om.userId
    WHERE om.groupId = ? AND COALESCE(u.isBlocked,0)=0
    ORDER BY om.memberOrder ASC, om.joinedAt ASC, u.id ASC
  `).bind(groupId).all();
  return results || [];
}

export async function organizationSummary(db: any, groupId: string) {
  const group: any = await db.prepare('SELECT * FROM organization_groups WHERE id = ? LIMIT 1').bind(groupId).first();
  if (!group) return null;
  const members = await groupMembers(db, groupId);
  const displayName = members.map((member: any) => String(member.name || '').trim()).filter(Boolean).join('&');
  return { ...group, members, displayName, kind: highestApprovedKind(members) };
}

export function highestApprovedKind(members: any[]): UplineKind | null {
  const eligible = members.filter(member => isPlatinumToolsEligible(member));
  if (eligible.some(member => /鑽石|皇冠|大使/.test(String(member.rankApproved ? (member.approvedRank || member.rank) : member.rank || member.approvedRank || '')))) return 'diamond';
  if (eligible.some(member => isPlatinumOrAboveRank(member.rankApproved ? (member.approvedRank || member.rank) : member.rank || member.approvedRank))) return 'platinum';
  return null;
}

export async function organizationForUser(db: any, userId: string) {
  const groupId = await groupIdForUser(db, userId);
  return groupId ? organizationSummary(db, groupId) : null;
}

export async function activeUsersByDealerId(db: any, dealerId: string) {
  const normalized = normalizeDealerId(dealerId);
  if (!normalized) return [];
  const { results } = await db.prepare(`
    SELECT id,name,email,amwayId,rank,approvedRank,rankApproved,isBlocked,registerDate
    FROM users
    WHERE COALESCE(isBlocked,0)=0 AND TRIM(COALESCE(amwayId,'')) = ?
    ORDER BY COALESCE(registerDate,''), id
  `).bind(normalized).all();
  return results || [];
}

export async function ensureSingleMemberOrganization(db: any, userId: string) {
  await ensureOrganizationSchema(db);
  const member: any = await db.prepare(`SELECT id,name,amwayId,rank,approvedRank,rankApproved,rankAuditStatus,isBlocked FROM users WHERE id=? LIMIT 1`).bind(userId).first();
  if (!member || member.isBlocked) return { error: '找不到有效會員', status: 404 } as const;
  const dealerId = normalizeDealerId(member.amwayId);
  if (!dealerId) return { error: '請先在基本資料填寫直銷商編號', status: 409, code: 'MISSING_DEALER_ID' } as const;

  const currentGroupId = await groupIdForUser(db, userId);
  if (currentGroupId) {
    const summary = await organizationSummary(db, currentGroupId);
    if (summary && summary.dealerId === dealerId) return { group: summary } as const;
    if (summary && summary.members.length > 1) return { error: '夫妻共同經營使用同一個直銷商編號，如需變更請聯絡管理員', status: 409 } as const;
    const collision: any = await db.prepare('SELECT id FROM organization_groups WHERE dealerId=? AND id<>? LIMIT 1').bind(dealerId,currentGroupId).first();
    if (collision) return { error: '此直銷商編號已屬於其他共同事業體', status: 409 } as const;
    await db.prepare('UPDATE organization_groups SET dealerId=?,updatedAt=? WHERE id=?').bind(dealerId,Date.now(),currentGroupId).run();
    return { group: await organizationSummary(db, currentGroupId) } as const;
  }

  const sameDealer = await activeUsersByDealerId(db, dealerId);
  if (sameDealer.length > 1) return { error: '此直銷商編號已有其他會員，請先確認夫妻關係', status: 409, code: 'COUPLE_CONFIRM_REQUIRED' } as const;

  const existing: any = await groupForDealerId(db, dealerId);
  const now = Date.now();
  const groupId = existing?.id || `org-${crypto.randomUUID()}`;
  if (!existing) await db.prepare('INSERT INTO organization_groups(id,dealerId,createdAt,updatedAt) VALUES (?,?,?,?)').bind(groupId,dealerId,now,now).run();
  await db.prepare('INSERT OR IGNORE INTO organization_members(groupId,userId,memberOrder,joinedAt) VALUES (?,?,0,?)').bind(groupId,userId,now).run();
  return { group: await organizationSummary(db, groupId) } as const;
}

async function tableExists(db: any, name: string) {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").bind(name).first();
  return Boolean(row);
}

async function bindLegacyNameIfSafe(db: any, groupId: string, ownerId: string, ownerName: string, excludedIds: string[]) {
  const name = String(ownerName || '').trim();
  if (!name) return;
  const count: any = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE COALESCE(isBlocked,0)=0 AND TRIM(name)=?").bind(name).first();
  const aliases: Array<{ kind: UplineKind; name: string }> = [];
  if (Number(count?.n || 0) === 1) {
    aliases.push({kind:'platinum',name},{kind:'diamond',name});
  }
  if (await tableExists(db,'upline_owners')) {
    const { results } = await db.prepare('SELECT kind,name FROM upline_owners WHERE userId=?').bind(ownerId).all();
    for (const row of results || []) {
      if ((row as any).kind === 'platinum' || (row as any).kind === 'diamond') aliases.push({kind:(row as any).kind,name:String((row as any).name || '').trim()});
    }
  }
  const now = Date.now();
  for (const alias of aliases) {
    const column = alias.kind === 'diamond' ? 'diamondUpline' : 'platinumUpline';
    const { results } = await db.prepare(`SELECT id FROM users WHERE COALESCE(isBlocked,0)=0 AND TRIM(COALESCE(${column},''))=?`).bind(alias.name).all();
    for (const row of results || []) {
      const memberId = String((row as any).id);
      if (excludedIds.includes(memberId)) continue;
      await db.prepare(`INSERT OR IGNORE INTO upline_bindings(memberId,kind,groupId,createdAt,updatedAt) VALUES (?,?,?,?,?)`).bind(memberId,alias.kind,groupId,now,now).run();
    }
  }
}

export async function syncLegacyLabelsForGroup(db: any, groupId: string) {
  const summary = await organizationSummary(db, groupId);
  if (!summary) return;
  const label = summary.displayName;
  const { results } = await db.prepare('SELECT memberId,kind FROM upline_bindings WHERE groupId=?').bind(groupId).all();
  const statements: any[] = [];
  for (const row of results || []) {
    if ((row as any).kind === 'diamond') statements.push(db.prepare('UPDATE users SET diamondUpline=? WHERE id=?').bind(label,(row as any).memberId));
    else statements.push(db.prepare('UPDATE users SET platinumUpline=? WHERE id=?').bind(label,(row as any).memberId));
  }
  if (statements.length) await db.batch(statements);
}

export async function bindCouple(db: any, actorId: string, partnerId: string, dealerIdInput: string) {
  await ensureOrganizationSchema(db);
  const dealerId = normalizeDealerId(dealerIdInput);
  if (!dealerId || !partnerId || partnerId === actorId) return { error: '夫妻綁定資料不完整', status: 400 } as const;
  const rows = await activeUsersByDealerId(db, dealerId);
  if (rows.length !== 2 || !rows.some((row:any)=>row.id===actorId) || !rows.some((row:any)=>row.id===partnerId)) {
    return { error: rows.length > 2 ? '此直銷商編號超過兩位會員，請聯絡管理員處理' : '對方會員或直銷商編號已變更，請重新輸入', status: 409 } as const;
  }
  const actorGroupId = await groupIdForUser(db, actorId);
  const partnerGroupId = await groupIdForUser(db, partnerId);
  if (actorGroupId && partnerGroupId && actorGroupId !== partnerGroupId) return { error: '其中一人已屬於其他共同事業體', status: 409 } as const;
  let groupId = actorGroupId || partnerGroupId;
  if (groupId) {
    const summary = await organizationSummary(db, groupId);
    if (summary && summary.dealerId !== dealerId) return { error: '既有共同事業體使用不同直銷商編號', status: 409 } as const;
    if (summary && summary.members.length >= 2) {
      const ids = summary.members.map((member:any)=>member.id);
      if (!(ids.includes(actorId) && ids.includes(partnerId))) return { error: '共同事業體已經有兩位成員', status: 409 } as const;
    }
  } else {
    const existing: any = await groupForDealerId(db,dealerId);
    groupId = existing?.id || `org-${crypto.randomUUID()}`;
    if (!existing) {
      const now=Date.now();
      await db.prepare('INSERT INTO organization_groups(id,dealerId,createdAt,updatedAt) VALUES (?,?,?,?)').bind(groupId,dealerId,now,now).run();
    }
  }
  const now = Date.now();
  const existingMembers = await groupMembers(db, groupId!);
  const existingIds = existingMembers.map((row:any)=>row.id);
  // Keep A&B stable: preserve an existing organization member first; otherwise use dealer-id registration order.
  const orderedIds = existingIds.length
    ? [...existingIds, actorId, partnerId].filter((id,index,array)=>array.indexOf(id)===index).slice(0,2)
    : rows.map((row:any)=>String(row.id)).slice(0,2);
  for (let index=0; index<orderedIds.length; index++) {
    await db.prepare('INSERT OR IGNORE INTO organization_members(groupId,userId,memberOrder,joinedAt) VALUES (?,?,?,?)').bind(groupId,orderedIds[index],index,now).run();
  }
  const members = await groupMembers(db, groupId!);
  if (members.length !== 2) return { error: '夫妻共同事業體建立失敗', status: 409 } as const;
  await bindLegacyNameIfSafe(db,groupId!,actorId,members.find((m:any)=>m.id===actorId)?.name || '',[actorId,partnerId]);
  await bindLegacyNameIfSafe(db,groupId!,partnerId,members.find((m:any)=>m.id===partnerId)?.name || '',[actorId,partnerId]);
  await syncLegacyLabelsForGroup(db,groupId!);
  return { group: await organizationSummary(db,groupId!) } as const;
}

export async function bindDownlineToGroup(db: any, memberId: string, groupId: string, kind: UplineKind) {
  await ensureOrganizationSchema(db);
  const summary = await organizationSummary(db,groupId);
  if (!summary) return { error: '找不到上手組織', status: 404 } as const;
  if (summary.members.some((member:any)=>member.id===memberId)) return { error: '不能把自己綁定成自己的下線', status: 400 } as const;
  const target: any = await db.prepare('SELECT id,rank,approvedRank FROM users WHERE id=? LIMIT 1').bind(memberId).first();
  if (!target) return { error: '找不到要綁定的會員', status: 404 } as const;
  if (isPlatinumOrAboveRank(target.rank) || isPlatinumOrAboveRank(target.approvedRank)) {
    return { error: '白金或白金以上會員不可綁定成為下線', status: 409 } as const;
  }
  const now=Date.now();
  await db.prepare(`INSERT INTO upline_bindings(memberId,kind,groupId,createdAt,updatedAt) VALUES (?,?,?,?,?)
    ON CONFLICT(memberId,kind) DO UPDATE SET groupId=excluded.groupId,updatedAt=excluded.updatedAt`).bind(memberId,kind,groupId,now,now).run();
  const column = kind === 'diamond' ? 'diamondUpline' : 'platinumUpline';
  await db.prepare(`UPDATE users SET ${column}=? WHERE id=?`).bind(summary.displayName,memberId).run();
  return { group: summary } as const;
}

export async function canonicalDownlineUserIds(db: any, actorUserId: string): Promise<string[]> {
  await ensureOrganizationSchema(db);
  const groupId = await groupIdForUser(db,actorUserId);
  if (!groupId) return [];
  const { results } = await db.prepare('SELECT DISTINCT memberId FROM upline_bindings WHERE groupId=?').bind(groupId).all();
  return (results || []).map((row:any)=>String(row.memberId));
}

export async function isCanonicalDownlineOf(db: any, targetUserId: string, actorUserId: string): Promise<boolean> {
  const ids = await canonicalDownlineUserIds(db,actorUserId);
  return ids.includes(targetUserId);
}

export async function deleteOrganizationStateForUser(db: any, userId: string) {
  await ensureOrganizationSchema(db);
  const groupId = await groupIdForUser(db,userId);
  if (!groupId) return;
  await db.prepare('DELETE FROM organization_members WHERE userId=?').bind(userId).run();
  const summary = await organizationSummary(db,groupId);
  if (summary && summary.members.length > 0) {
    await syncLegacyLabelsForGroup(db,groupId);
    return;
  }
  const { results } = await db.prepare('SELECT memberId,kind FROM upline_bindings WHERE groupId=?').bind(groupId).all();
  const statements:any[]=[];
  for (const row of results || []) {
    const column=(row as any).kind==='diamond'?'diamondUpline':'platinumUpline';
    statements.push(db.prepare(`UPDATE users SET ${column}='' WHERE id=?`).bind((row as any).memberId));
  }
  statements.push(db.prepare('DELETE FROM upline_bindings WHERE groupId=?').bind(groupId));
  statements.push(db.prepare('DELETE FROM organization_groups WHERE id=?').bind(groupId));
  await db.batch(statements);
}
