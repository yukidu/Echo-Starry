import appWorker from './playbackOwnerRouter';
import type { Env } from './index';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,}$/;
const SESSION_COOKIE = 'echostars_session';
const SUPER_ADMIN_EMAIL = 'yukidu@gmail.com';
const DEFAULT_VISITOR_ROLE_TEXT = '訪客';
const VISITOR_ROLE_MAX_LENGTH = 12;
const ALLOWED_QUICK_ACTIONS = new Set([
  'font', 'theme', 'stats', 'notifications', 'stickers', 'upload', 'profile', 'install', 'admin', 'palette'
]);
const DEVICE_LIMITS = { mobile: 3, tablet: 5, desktop: 100 } as const;
const tableReady = new WeakMap<object, Promise<void>>();
const siteSettingsReady = new WeakMap<object, Promise<void>>();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function publicJson(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300'
    }
  });
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function cookieToken(request: Request) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    const token = part.slice(separator + 1).trim();
    return TOKEN_PATTERN.test(token) ? token : '';
  }
  return '';
}

async function authenticatedActor(request: Request, env: Env) {
  if (!env.DB) return null;
  const bearer = request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i)?.[1] || '';
  const token = TOKEN_PATTERN.test(bearer) ? bearer : cookieToken(request);
  if (!TOKEN_PATTERN.test(token)) return null;
  const tokenHash = await hashToken(token);
  const row: any = await env.DB.prepare(`
    SELECT s.userId, s.expiresAt, u.email, u.role, u.isAdminUser, u.isBlocked
    FROM auth_sessions s
    JOIN users u ON u.id = s.userId
    WHERE s.tokenHash = ?
    LIMIT 1
  `).bind(tokenHash).first();
  if (!row || row.isBlocked || Number(row.expiresAt || 0) <= Date.now()) return null;
  return row;
}

async function authenticatedUserId(request: Request, env: Env) {
  const actor = await authenticatedActor(request, env);
  return actor ? String(actor.userId || '') : '';
}

function canManageSiteUi(actor: any) {
  const email = String(actor?.email || '').trim().toLowerCase();
  return email === SUPER_ADMIN_EMAIL || actor?.role === '超級管理員' || actor?.role === '管理員' || actor?.isAdminUser === true;
}

function normalizeVisitorRoleText(value: unknown) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return DEFAULT_VISITOR_ROLE_TEXT;
  return Array.from(text).slice(0, VISITOR_ROLE_MAX_LENGTH).join('');
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

async function ensureSiteSettingsTable(db: any) {
  if (!db) return;
  const key = db as object;
  if (!siteSettingsReady.has(key)) {
    const task = db.prepare(`
      CREATE TABLE IF NOT EXISTS site_ui_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updatedAt INTEGER NOT NULL,
        updatedBy TEXT
      )
    `).run().then(() => undefined);
    siteSettingsReady.set(key, task);
    task.catch(() => siteSettingsReady.delete(key));
  }
  await siteSettingsReady.get(key);
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

async function handleVisitorRoleGet(env: Env) {
  if (!env.DB) return publicJson({ visitorRoleText: DEFAULT_VISITOR_ROLE_TEXT });
  try {
    const row: any = await env.DB.prepare(
      "SELECT value FROM site_ui_settings WHERE key = 'visitor_role_text' LIMIT 1"
    ).first();
    return publicJson({ visitorRoleText: normalizeVisitorRoleText(row?.value) });
  } catch {
    // The table is intentionally created only when an administrator first saves a
    // custom label, so ordinary visitors do not cause D1 writes.
    return publicJson({ visitorRoleText: DEFAULT_VISITOR_ROLE_TEXT });
  }
}

async function handleVisitorRolePut(request: Request, env: Env) {
  const actor = await authenticatedActor(request, env);
  if (!actor) return json({ error: '尚未登入' }, 401);
  if (!canManageSiteUi(actor)) return json({ error: '沒有權限修改訪客顯示文字' }, 403);

  const body: any = await request.clone().json().catch(() => ({}));
  const rawText = String(body.visitorRoleText ?? '').trim();
  if (!rawText) return json({ error: '訪客顯示文字不可空白' }, 400);
  if (Array.from(rawText).length > VISITOR_ROLE_MAX_LENGTH) {
    return json({ error: `訪客顯示文字最多 ${VISITOR_ROLE_MAX_LENGTH} 個字` }, 400);
  }
  const visitorRoleText = normalizeVisitorRoleText(rawText);
  const updatedAt = Date.now();
  await ensureSiteSettingsTable(env.DB);
  await env.DB.prepare(`
    INSERT INTO site_ui_settings (key, value, updatedAt, updatedBy)
    VALUES ('visitor_role_text', ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updatedAt = excluded.updatedAt,
      updatedBy = excluded.updatedBy
  `).bind(visitorRoleText, updatedAt, String(actor.userId || '')).run();
  return json({ visitorRoleText, updatedAt });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/site-ui/visitor-role') {
      const method = request.method.toUpperCase();
      if (method === 'GET') return handleVisitorRoleGet(env);
      if (method === 'PUT') return handleVisitorRolePut(request, env);
      return json({ error: 'Method not allowed' }, 405);
    }
    if (url.pathname === '/api/user-ui-preferences') {
      const method = request.method.toUpperCase();
      if (method === 'GET') return handleGet(request, env);
      if (method === 'PUT') return handlePut(request, env);
      return json({ error: 'Method not allowed' }, 405);
    }
    return appWorker.fetch(request, env);
  }
};
