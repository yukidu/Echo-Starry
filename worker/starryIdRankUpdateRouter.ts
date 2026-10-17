import { handleStarryIdCentral } from './starryIdCentralRouter';
import { PROFILE_OPTIONS } from './starryIdProfileDirectoryRouter';
import type { Env } from './index';

const STAR_DOMAIN = 'id.starry.phd';
const RANK_AUDIT_FIELDS = ['rank','approvedRank','rankApproved','rankAuditStatus','rankAuditType','rankUpdatedAt'] as const;

function text(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow'
    }
  });
}

async function sessionData(request: Request, env: Env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const probe = new Request(url.toString(), { method: 'GET', headers: request.headers, redirect: 'manual' });
  const response = await handleStarryIdCentral(probe, env as any);
  if (!response?.ok) return null;
  const data: any = await response.json().catch(() => null);
  return data?.authenticated && data?.user?.id ? data : null;
}

function rankAuditStatement(db: any, targetUserId: string, actorUserId: string, fieldName: string, oldValue: unknown, newValue: unknown, now: number) {
  return db.prepare(`INSERT INTO profile_audit_logs
    (id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt)
    VALUES (?,?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(), targetUserId, 'starry-id', actorUserId,
      fieldName, oldValue == null ? '' : String(oldValue), newValue == null ? '' : String(newValue), now
    );
}

export async function handleStarryIdRankUpdate(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN) return null;
  if (request.method.toUpperCase() !== 'PUT') return url.pathname === '/api/profile-rank' ? json({ error: 'Method not allowed' }, 405) : null;

  const rawInput: any = await request.clone().json().catch(() => ({}));
  const isDedicatedRoute = url.pathname === '/api/profile-rank';
  const isOwnProfileRankOnly = url.pathname === '/api/profile' && rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)
    && Object.keys(rawInput).length === 1 && Object.prototype.hasOwnProperty.call(rawInput, 'rank');
  if (!isDedicatedRoute && !isOwnProfileRankOnly) return null;

  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return json({ error: 'Origin not allowed' }, 403);
  const session = await sessionData(request, env);
  if (!session) return json({ error: '請先登入 Starry ID' }, 401);

  const value = text(isDedicatedRoute ? rawInput.value : rawInput.rank);
  if (!(PROFILE_OPTIONS.rank as readonly string[]).includes(value)) return json({ error: '請從中央獎銜選項中選擇' }, 400);
  const targetUserId = isDedicatedRoute ? (text(rawInput.targetUserId) || text(session.user.id)) : text(session.user.id);
  if (targetUserId !== text(session.user.id) && !session.isSuperAdmin) return json({ error: '只有超級管理員可以修改其他會員' }, 403);
  const db = (env as any).STARRY_ID_DB;
  if (!db) return json({ error: 'Starry ID service unavailable' }, 503);

  const current: any = await db.prepare(`SELECT rank,approvedRank,rankApproved,rankAuditStatus,rankAuditType,rankUpdatedAt
    FROM profiles WHERE userId=? LIMIT 1`).bind(targetUserId).first();
  if (!current) return json({ error: '找不到會員資料' }, 404);

  const now = Date.now();
  const rankUpdatedAt = new Date(now).toISOString();
  const isAdminApproval = Boolean(session.isSuperAdmin);
  const preservedApprovedRank = text(current.approvedRank) || (Number(current.rankApproved || 0) === 1 ? text(current.rank) : '');
  const next: Record<(typeof RANK_AUDIT_FIELDS)[number], unknown> = isAdminApproval ? {
    rank: value,
    approvedRank: value,
    rankApproved: 1,
    rankAuditStatus: 'approved',
    rankAuditType: 'super-admin',
    rankUpdatedAt
  } : {
    rank: value,
    approvedRank: preservedApprovedRank,
    rankApproved: 0,
    rankAuditStatus: 'pending',
    rankAuditType: 'rank_change',
    rankUpdatedAt
  };

  const update = isAdminApproval
    ? db.prepare(`UPDATE profiles SET rank=?,approvedRank=?,rankApproved=1,rankAuditStatus='approved',rankAuditType='super-admin',rankUpdatedAt=?,updatedAt=? WHERE userId=?`)
      .bind(value, value, rankUpdatedAt, now, targetUserId)
    : db.prepare(`UPDATE profiles SET approvedRank=?,rank=?,rankApproved=0,rankAuditStatus='pending',rankAuditType='rank_change',rankUpdatedAt=?,updatedAt=? WHERE userId=?`)
      .bind(preservedApprovedRank, value, rankUpdatedAt, now, targetUserId);

  // v306：獎銜審核是單一交易。正式資料與六個工作流欄位的審計紀錄必須一起成功，避免未來只能看到 rank、無法還原審核狀態。
  const auditStatements = RANK_AUDIT_FIELDS
    .filter(field => String(current[field] ?? '') !== String(next[field] ?? ''))
    .map(field => rankAuditStatement(db, targetUserId, text(session.user.id), field, current[field], next[field], now));
  await db.batch([update, ...auditStatements]);

  if ((env as any).DB) {
    try {
      if (isAdminApproval) {
        await (env as any).DB.prepare(`UPDATE users SET rank=?,approvedRank=?,rankApproved=1,rankAuditStatus='approved',rankAuditType='super-admin',rankUpdatedAt=? WHERE id=?`)
          .bind(value, value, rankUpdatedAt, targetUserId).run();
      } else {
        await (env as any).DB.prepare(`UPDATE users SET approvedRank=?,rank=?,rankApproved=0,rankAuditStatus='pending',rankAuditType='rank_change',rankUpdatedAt=? WHERE id=?`)
          .bind(preservedApprovedRank, value, rankUpdatedAt, targetUserId).run();
      }
    } catch (error) {
      console.warn('Starry ID rank legacy dual-write skipped', {
        code: error instanceof Error ? error.message : 'unknown'
      });
    }
  }

  return json({
    success: true,
    rank: text(next.rank),
    approvedRank: text(next.approvedRank),
    rankApproved: Boolean(next.rankApproved),
    rankAuditStatus: text(next.rankAuditStatus)
  });
}
