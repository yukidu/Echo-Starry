import appWorker from './adminUserDeleteRouter';
import type { Env } from './index';

const SESSION_COOKIE = 'echostars_session';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,}$/;
const tableReady = new WeakMap<object, Promise<void>>();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function bearerToken(request: Request) {
  return request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i)?.[1] || '';
}

function cookieToken(request: Request) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(separator + 1).trim();
    return TOKEN_PATTERN.test(value) ? value : '';
  }
  return '';
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function authenticatedUserId(request: Request, env: Env) {
  if (!env.DB) return '';
  const token = bearerToken(request) || cookieToken(request);
  if (!TOKEN_PATTERN.test(token)) return '';
  const tokenHash = await hashToken(token);
  const row: any = await env.DB.prepare(`
    SELECT s.userId, s.expiresAt, u.isBlocked
    FROM auth_sessions s
    JOIN users u ON u.id = s.userId
    WHERE s.tokenHash = ?
    LIMIT 1
  `).bind(tokenHash).first();
  if (!row || row.isBlocked || Number(row.expiresAt || 0) <= Date.now()) return '';
  return String(row.userId || '');
}

async function ensureTable(db: any) {
  const key = db as object;
  if (!tableReady.has(key)) {
    const task = db.prepare(`
      CREATE TABLE IF NOT EXISTS user_hidden_speakers (
        userId TEXT NOT NULL,
        speakerName TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        PRIMARY KEY (userId, speakerName)
      )
    `).run().then(() => undefined);
    tableReady.set(key, task);
    task.catch(() => tableReady.delete(key));
  }
  await tableReady.get(key);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const listRoute = url.pathname === '/api/member-hidden-speakers';
    const itemRoute = url.pathname.match(/^\/api\/member-hidden-speakers\/([^/]+)$/);

    if (!listRoute && !itemRoute) return appWorker.fetch(request, env);
    if (!env.DB) return json({ error: '會員偏好資料庫尚未連線' }, 503);

    const userId = await authenticatedUserId(request, env);
    if (!userId) return json({ error: '尚未登入會員' }, 401);

    await ensureTable(env.DB);

    if (listRoute && method === 'GET') {
      const result = await env.DB.prepare(
        'SELECT speakerName FROM user_hidden_speakers WHERE userId = ? ORDER BY createdAt ASC'
      ).bind(userId).all();
      return json({ speakers: (result.results || []).map((row: any) => String(row.speakerName || '').trim()).filter(Boolean) });
    }

    if (itemRoute && method === 'POST') {
      const speakerName = decodeURIComponent(itemRoute[1]).trim();
      if (!speakerName) return json({ error: '缺少演講人資料' }, 400);
      const speaker = await env.DB.prepare('SELECT speaker FROM tracks WHERE TRIM(speaker) = ? LIMIT 1').bind(speakerName).first();
      if (!speaker) return json({ error: '找不到此演講人' }, 404);
      await env.DB.prepare(
        'INSERT OR IGNORE INTO user_hidden_speakers (userId, speakerName, createdAt) VALUES (?, ?, ?)'
      ).bind(userId, speakerName, Date.now()).run();
      return json({ success: true, speakerName });
    }

    if (itemRoute && method === 'DELETE') {
      const speakerName = decodeURIComponent(itemRoute[1]).trim();
      if (!speakerName) return json({ error: '缺少演講人資料' }, 400);
      await env.DB.prepare(
        'DELETE FROM user_hidden_speakers WHERE userId = ? AND speakerName = ?'
      ).bind(userId, speakerName).run();
      return json({ success: true, speakerName });
    }

    return json({ error: 'Method not allowed' }, 405);
  }
};
