import type { Env } from './index';
import moderationWorker from './transcriptModerationRouter';
import { createStarryNotification } from './starryIdNotificationsRouter';

const SESSION_COOKIE = 'echostars_session';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,}$/;
const NOTICE_TYPE = 'transcript-correction-review';

type EchoActor = { id: string; email?: string; name?: string; role?: string; isBlocked?: number; expiresAt?: number };

function text(value: unknown) { return value == null ? '' : String(value).trim(); }
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function bearerToken(request: Request) {
  return request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i)?.[1] || '';
}
function cookieToken(request: Request) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== SESSION_COOKIE) continue;
    const token = part.slice(index + 1).trim();
    if (TOKEN_PATTERN.test(token)) return token;
  }
  return '';
}
async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}
async function verifiedActor(request: Request, env: Env): Promise<EchoActor | null> {
  const token = bearerToken(request) || cookieToken(request);
  if (!(env as any).DB || !TOKEN_PATTERN.test(token)) return null;
  const actor: any = await (env as any).DB.prepare(`SELECT u.id,u.email,u.name,u.role,u.isBlocked,s.expiresAt
    FROM auth_sessions s JOIN users u ON u.id=s.userId WHERE s.tokenHash=? LIMIT 1`)
    .bind(await hashToken(token)).first();
  if (!actor || actor.isBlocked || Number(actor.expiresAt || 0) <= Date.now()) return null;
  return actor as EchoActor;
}
async function centralUserId(env: Env, localUserId: string) {
  const db = (env as any).STARRY_ID_DB;
  const local = text(localUserId);
  if (!db || !local) return '';
  const linked: any = await db.prepare("SELECT userId FROM legacy_links WHERE sourceApp='echostars' AND sourceUserId=? LIMIT 1")
    .bind(local).first().catch(() => null);
  const candidate = text(linked?.userId || local);
  const exists = await db.prepare('SELECT id FROM users WHERE id=? LIMIT 1').bind(candidate).first().catch(() => null);
  return exists ? candidate : '';
}
function parseMetadata(value: unknown) {
  try { return JSON.parse(text(value) || '{}'); } catch { return {}; }
}

async function userNotificationApi(request: Request, env: Env) {
  const actor = await verifiedActor(request, env);
  if (!actor) return json({ error: '請先登入會員' }, 401);
  const userId = await centralUserId(env, actor.id);
  if (!userId) return json({ error: '找不到 Starry ID 會員資料' }, 403);
  const db = (env as any).STARRY_ID_DB;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (url.pathname === '/api/v281/transcript-user-notifications' && method === 'GET') {
    const rows: any = await db.prepare(`SELECT id,type,title,body,metadata,isRead,createdAt FROM starry_notifications
      WHERE userId=? AND type=? ORDER BY createdAt DESC LIMIT 100`).bind(userId, NOTICE_TYPE).all();
    const notifications = (rows?.results || []).map((row: any) => ({
      id: text(row.id),
      type: text(row.type),
      title: text(row.title),
      body: text(row.body),
      metadata: parseMetadata(row.metadata),
      isRead: Boolean(Number(row.isRead || 0)),
      createdAt: Number(row.createdAt || 0)
    }));
    return json({ unread: notifications.filter((item: any) => !item.isRead).length, notifications });
  }

  if (url.pathname === '/api/v281/transcript-user-notifications/read' && method === 'POST') {
    const input: any = await request.clone().json().catch(() => ({}));
    const id = text(input.id);
    if (id) {
      await db.prepare('UPDATE starry_notifications SET isRead=1 WHERE id=? AND userId=? AND type=?').bind(id, userId, NOTICE_TYPE).run();
    } else {
      await db.prepare('UPDATE starry_notifications SET isRead=1 WHERE userId=? AND type=?').bind(userId, NOTICE_TYPE).run();
    }
    return json({ success: true });
  }

  return json({ error: 'Not found' }, 404);
}

function reviewAction(pathname: string): { correctionId: string; action: 'accept' | 'revoke' | 'supplement' } | null {
  const match = pathname.match(/^\/api\/v281\/transcript-corrections\/([^/]+)\/(accept|revoke|supplement)$/);
  if (!match) return null;
  return { correctionId: decodeURIComponent(match[1]), action: match[2] as 'accept' | 'revoke' | 'supplement' };
}

async function notifyMemberAfterReview(env: Env, correctionId: string, action: 'accept' | 'revoke' | 'supplement') {
  const echoDb = (env as any).DB;
  if (!echoDb) return;
  const row: any = await echoDb.prepare(`SELECT c.*,t.title AS trackTitle FROM transcript_correction_events c
    LEFT JOIN tracks t ON t.id=c.trackId WHERE c.id=? LIMIT 1`).bind(correctionId).first().catch(() => null);
  if (!row?.userId) return;

  const title = action === 'accept'
    ? '你的逐字稿修正已接受'
    : action === 'revoke'
      ? '你的逐字稿修正已撤銷'
      : '你的逐字稿修正已由管理員補充';
  const body = action === 'accept'
    ? `你在「${text(row.trackTitle || row.trackId)}」提出的逐字稿修正已由管理員接受。`
    : action === 'revoke'
      ? `你在「${text(row.trackTitle || row.trackId)}」提出的逐字稿修正已撤銷，原修正獎勵已同步取消。`
      : `你在「${text(row.trackTitle || row.trackId)}」提出的逐字稿修正，管理員已補充調整；你的原修正獎勵維持不變。`;

  await createStarryNotification(env, text(row.userId), NOTICE_TYPE, title, body, {
    correctionId,
    action,
    trackId: text(row.trackId),
    trackTitle: text(row.trackTitle || row.trackId),
    segmentId: text(row.segmentId),
    start: Number(row.segmentStart || 0),
    end: Number(row.segmentEnd || 0),
    before: text(row.oldText),
    userCorrection: text(row.newText),
    finalText: text(row.adminText || row.newText),
    reviewedAt: Number(row.reviewedAt || Date.now())
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/v281/transcript-user-notifications' || url.pathname === '/api/v281/transcript-user-notifications/read') {
      return userNotificationApi(request, env);
    }

    const action = reviewAction(url.pathname);
    const response = await moderationWorker.fetch(request, env as any, ctx as any);
    if (action && response.ok) {
      const task = notifyMemberAfterReview(env, action.correctionId, action.action).catch(error => {
        console.warn('Transcript member notification failed:', error);
      });
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(task);
      else await task;
    }
    return response;
  }
};