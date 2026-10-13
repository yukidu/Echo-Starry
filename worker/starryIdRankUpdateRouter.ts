import { handleStarryIdCentral } from './starryIdCentralRouter';
import { PROFILE_OPTIONS } from './starryIdProfileDirectoryRouter';
import type { Env } from './index';

const STAR_DOMAIN = 'id.starry.phd';

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

export async function handleStarryIdRankUpdate(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN || url.pathname !== '/api/profile-rank') return null;
  if (request.method.toUpperCase() !== 'PUT') return json({ error: 'Method not allowed' }, 405);

  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return json({ error: 'Origin not allowed' }, 403);
  const session = await sessionData(request, env);
  if (!session) return json({ error: '請先登入 Starry ID' }, 401);

  const input: any = await request.clone().json().catch(() => ({}));
  const value = text(input.value);
  if (!(PROFILE_OPTIONS.rank as readonly string[]).includes(value)) return json({ error: '請從中央獎銜選項中選擇' }, 400);
  const targetUserId = text(input.targetUserId) || text(session.user.id);
  if (targetUserId !== text(session.user.id) && !session.isSuperAdmin) return json({ error: '只有超級管理員可以修改其他會員' }, 403);
  const db = (env as any).STARRY_ID_DB;
  if (!db) return json({ error: 'Starry ID service unavailable' }, 503);

  const current: any = await db.prepare('SELECT rank,approvedRank,rankApproved FROM profiles WHERE userId=? LIMIT 1').bind(targetUserId).first();
  if (!current) return json({ error: '找不到會員資料' }, 404);
  const now = Date.now();
  const rankUpdatedAt = new Date(now).toISOString();
  const isAdminApproval = Boolean(session.isSuperAdmin);
  if (isAdminApproval) {
    await db.prepare(`UPDATE profiles SET rank=?,approvedRank=?,rankApproved=1,rankAuditStatus='approved',rankAuditType='super-admin',rankUpdatedAt=?,updatedAt=? WHERE userId=?`)
      .bind(value, value, rankUpdatedAt, now, targetUserId).run();
  } else {
    await db.prepare(`UPDATE profiles SET rank=?,rankApproved=0,rankAuditStatus='pending',rankAuditType='rank_change',rankUpdatedAt=?,updatedAt=? WHERE userId=?`)
      .bind(value, rankUpdatedAt, now, targetUserId).run();
  }
  await db.prepare(`INSERT INTO profile_audit_logs
    (id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt)
    VALUES (?,?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(), targetUserId, 'starry-id', text(session.user.id), 'rank', text(current.rank), value, now
    ).run().catch(() => undefined);

  if ((env as any).DB) {
    try {
      if (isAdminApproval) {
        await (env as any).DB.prepare(`UPDATE users SET rank=?,approvedRank=?,rankApproved=1,rankAuditStatus='approved',rankAuditType='super-admin',rankUpdatedAt=? WHERE id=?`)
          .bind(value, value, rankUpdatedAt, targetUserId).run();
      } else {
        await (env as any).DB.prepare(`UPDATE users SET rank=?,rankApproved=0,rankAuditStatus='pending',rankAuditType='rank_change',rankUpdatedAt=? WHERE id=?`)
          .bind(value, rankUpdatedAt, targetUserId).run();
      }
    } catch (error) {
      console.warn('Starry ID rank legacy dual-write skipped', {
        code: error instanceof Error ? error.message : 'unknown'
      });
    }
  }

  return json({
    success: true,
    rank: value,
    rankApproved: isAdminApproval,
    rankAuditStatus: isAdminApproval ? 'approved' : 'pending'
  });
}
