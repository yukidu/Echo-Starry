import appWorker from './playbackOwnerRouter';
import type { Env } from './index';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,}$/;
const ALLOWED_QUICK_ACTIONS = new Set([
  'font', 'theme', 'stats', 'notifications', 'stickers', 'upload', 'profile', 'install', 'admin', 'palette'
]);
const DEVICE_LIMITS = { mobile: 3, tablet: 5, desktop: 100 } as const;
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

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function authenticatedUserId(request: Request, env: Env) {
  if (!env.DB) return '';
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i)?.[1] || '';
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

function normalizeIds(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [] as string[];
  const ids: string[] = [];
  for (const raw of value) {
    const id = String(raw || '');
    if (!ALLOWED_QUICK_ACTIONS.has(id) || ids.includes(id)) continue;
    ids.push(id);
    if (ids.length >= limit) break;
  }
  return ids;
}

function normalizePreferences(value: unknown) {
  if (Array.isArray(value)) {
    const legacy = value.map(item => String(item || '')).filter(item => item !== 'home');
    const merged = ['font', 'theme', ...legacy];
    return {
      mobile: normalizeIds(merged, DEVICE_LIMITS.mobile),
      tablet: normalizeIds(merged, DEVICE_LIMITS.tablet),
      desktop: normalizeIds(merged, DEVICE_LIMITS.desktop)
    };
  }
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    mobile: normalizeIds(raw.mobile, DEVICE_LIMITS.mobile),
    tablet: normalizeIds(raw.tablet, DEVICE_LIMITS.tablet),
    desktop: normalizeIds(raw.desktop, DEVICE_LIMITS.desktop)
  };
}

async function ensureTable(db: any) {
  if (!db) return;
  const key = db as object;
  if (!tableReady.has(key)) {
    const task = db.prepare(`
      CREATE TABLE IF NOT EXISTS user_ui_preferences (
        userId TEXT PRIMARY KEY,
        quickActionIds TEXT NOT NULL DEFAULT '[]',
        quickLabelMode TEXT NOT NULL DEFAULT 'icons',
        updatedAt INTEGER NOT NULL
      )
    `).run().then(() => undefined);
    tableReady.set(key, task);
    task.catch(() => tableReady.delete(key));
  }
  await tableReady.get(key);
}

async function tableExists(db: any) {
  if (!db) return false;
  const row = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='user_ui_preferences' LIMIT 1"
  ).first();
  return Boolean(row);
}

async function handleGet(request: Request, env: Env) {
  const userId = await authenticatedUserId(request, env);
  if (!userId) return json({ error: '尚未登入' }, 401);
  if (!(await tableExists(env.DB))) return json({ preferences: null });
  const row: any = await env.DB.prepare(
    'SELECT quickActionIds, updatedAt FROM user_ui_preferences WHERE userId = ? LIMIT 1'
  ).bind(userId).first();
  if (!row) return json({ preferences: null });
  let parsed: unknown = [];
  try { parsed = JSON.parse(String(row.quickActionIds || '[]')); } catch {}
  return json({
    preferences: {
      quickActionIds: normalizePreferences(parsed),
      updatedAt: Number(row.updatedAt || 0)
    }
  });
}

async function handlePut(request: Request, env: Env) {
  const userId = await authenticatedUserId(request, env);
  if (!userId) return json({ error: '尚未登入' }, 401);
  const body: any = await request.clone().json().catch(() => ({}));
  const quickActionIds = normalizePreferences(body.quickActionIds);
  const updatedAt = Date.now();
  await ensureTable(env.DB);
  await env.DB.prepare(`
    INSERT INTO user_ui_preferences (userId, quickActionIds, quickLabelMode, updatedAt)
    VALUES (?, ?, 'icons', ?)
    ON CONFLICT(userId) DO UPDATE SET
      quickActionIds = excluded.quickActionIds,
      quickLabelMode = 'icons',
      updatedAt = excluded.updatedAt
  `).bind(userId, JSON.stringify(quickActionIds), updatedAt).run();
  return json({ preferences: { quickActionIds, updatedAt } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/user-ui-preferences') {
      const method = request.method.toUpperCase();
      if (method === 'GET') return handleGet(request, env);
      if (method === 'PUT') return handlePut(request, env);
      return json({ error: 'Method not allowed' }, 405);
    }
    return appWorker.fetch(request, env);
  }
};
