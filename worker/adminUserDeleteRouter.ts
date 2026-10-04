import appWorker from './categoryIntegrityRouter';
import type { Env } from './index';

const SUPER_ADMIN_EMAIL = 'yukidu@gmail.com';
const SESSION_COOKIE = 'echostars_session';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,}$/;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function bearerToken(request: Request) {
  const match = request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i);
  return match?.[1] || '';
}

function cookieToken(request: Request) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    const token = part.slice(separator + 1).trim();
    return TOKEN_PATTERN.test(token) ? token : '';
  }
  return '';
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function verifiedActor(request: Request, env: Env) {
  if (!env.DB) return null;
  const token = bearerToken(request) || cookieToken(request);
  if (!TOKEN_PATTERN.test(token)) return null;

  const tokenHash = await hashToken(token);
  const row: any = await env.DB.prepare(`
    SELECT u.id, u.email, u.role, u.isBlocked, s.expiresAt
    FROM auth_sessions s
    JOIN users u ON u.id = s.userId
    WHERE s.tokenHash = ?
    LIMIT 1
  `).bind(tokenHash).first();

  if (!row || row.isBlocked || Number(row.expiresAt || 0) <= Date.now()) return null;
  return row;
}

async function tableExists(db: any, name: string) {
  const row = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).bind(name).first();
  return Boolean(row);
}

async function deleteMember(request: Request, env: Env, targetKey: string) {
  if (!env.DB) return json({ error: '資料庫尚未連線' }, 503);

  const actor = await verifiedActor(request, env);
  if (!actor || normalizeEmail(actor.email) !== SUPER_ADMIN_EMAIL) {
    return json({ error: '只有超級管理員可刪除會員' }, 403);
  }

  const normalizedKey = normalizeEmail(targetKey);
  const target: any = await env.DB.prepare(`
    SELECT id, email, name
    FROM users
    WHERE id = ? OR LOWER(TRIM(email)) = ?
    LIMIT 1
  `).bind(targetKey, normalizedKey).first();
  if (!target) return json({ error: '找不到此會員' }, 404);

  const targetEmail = normalizeEmail(target.email);
  if (targetEmail === SUPER_ADMIN_EMAIL || String(target.id) === String(actor.id)) {
    return json({ error: '超級管理員帳號不可刪除' }, 403);
  }

  const statements: any[] = [];
  if (await tableExists(env.DB, 'auth_sessions')) {
    statements.push(env.DB.prepare('DELETE FROM auth_sessions WHERE userId = ?').bind(target.id));
  }
  if (await tableExists(env.DB, 'playback_identity_aliases')) {
    statements.push(env.DB.prepare('DELETE FROM playback_identity_aliases WHERE memberId = ?').bind(target.id));
  }
  if (await tableExists(env.DB, 'playback_memories')) {
    statements.push(
      env.DB.prepare(`
        DELETE FROM playback_memories
        WHERE memberId = ? OR userIdentifier = ? OR LOWER(TRIM(userIdentifier)) = ?
      `).bind(target.id, target.id, targetEmail)
    );
  }
  if (await tableExists(env.DB, 'share_events')) {
    statements.push(
      env.DB.prepare('DELETE FROM share_events WHERE userId = ? OR LOWER(TRIM(userEmail)) = ?')
        .bind(target.id, targetEmail)
    );
  }
  if (await tableExists(env.DB, 'user_activity_logs')) {
    statements.push(
      env.DB.prepare('DELETE FROM user_activity_logs WHERE userId = ? OR LOWER(TRIM(userEmail)) = ?')
        .bind(target.id, targetEmail)
    );
  }

  statements.push(env.DB.prepare('DELETE FROM users WHERE id = ?').bind(target.id));
  await env.DB.batch(statements);

  return json({
    success: true,
    deletedUser: {
      id: target.id,
      email: target.email,
      name: target.name
    }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const match = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);

    if (match && method === 'DELETE') {
      try {
        return await deleteMember(request, env, decodeURIComponent(match[1]));
      } catch (error) {
        console.error('Admin member deletion failed:', error);
        return json({ error: '刪除會員失敗，請稍後再試' }, 500);
      }
    }

    return appWorker.fetch(request, env);
  }
};