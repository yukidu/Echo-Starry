import type { Env } from './index';

const ID_HOST = 'id.starry.phd';
const EYE_ORIGIN = 'https://eye.starry.phd';
const APP_ID = 'starry-eye';
const CENTRAL_COOKIE = 'starry_id_session';
const TOKEN_RE = /^[A-Za-z0-9_-]{30,}$/;
const TICKET_TTL_MS = 5 * 60 * 1000;

function cookieValue(request: Request, name: string) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); }
    catch { return part.slice(separator + 1).trim(); }
  }
  return '';
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function headers(request: Request) {
  const origin = request.headers.get('Origin') || '';
  const result = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Vary': 'Origin'
  });
  if (origin === EYE_ORIGIN) {
    result.set('Access-Control-Allow-Origin', EYE_ORIGIN);
    result.set('Access-Control-Allow-Credentials', 'true');
    result.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    result.set('Access-Control-Allow-Headers', 'Content-Type, Accept');
    result.set('Access-Control-Max-Age', '600');
  }
  return result;
}

function json(request: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: headers(request) });
}

async function currentUserId(request: Request, env: Env) {
  const db = (env as any).STARRY_ID_DB;
  const token = cookieValue(request, CENTRAL_COOKIE);
  if (!db || !TOKEN_RE.test(token)) return '';
  const tokenHash = await hashToken(token);
  const row: any = await db.prepare(`SELECT s.userId,u.status,s.expiresAt
    FROM auth_sessions s JOIN users u ON u.id=s.userId
    WHERE s.tokenHash=? LIMIT 1`).bind(tokenHash).first().catch(() => null);
  if (!row || row.status !== 'active' || Number(row.expiresAt || 0) <= Date.now()) return '';
  return String(row.userId || '');
}

async function ensureMembership(env: Env, userId: string) {
  const db = (env as any).STARRY_ID_DB;
  const existing: any = await db.prepare(
    'SELECT status FROM app_memberships WHERE userId=? AND appId=? LIMIT 1'
  ).bind(userId, APP_ID).first().catch(() => null);
  if (existing) return existing.status === 'active';
  const now = Date.now();
  await db.prepare(`INSERT INTO app_memberships
    (userId,appId,status,role,isAdminUser,isContributor,canUpload,joinedAt,updatedAt)
    VALUES (?,?,'active','member',0,0,0,?,?)`)
    .bind(userId, APP_ID, now, now).run();
  return true;
}

async function ensureSchema(env: Env) {
  const db = (env as any).STARRY_ID_DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS starry_app_auth_codes (
    codeHash TEXT PRIMARY KEY,
    appId TEXT NOT NULL,
    userId TEXT NOT NULL,
    expiresAt INTEGER NOT NULL,
    createdAt INTEGER NOT NULL
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS starry_app_auth_codes_expiry ON starry_app_auth_codes(expiresAt)').run();
}

export async function handleStarryEyeSso(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.hostname !== ID_HOST || url.pathname !== '/api/apps/starry-eye/ticket') return null;

  const method = request.method.toUpperCase();
  const origin = request.headers.get('Origin') || '';
  if (origin !== EYE_ORIGIN) return json(request, { error: 'Origin not allowed' }, 403);
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(request) });
  if (method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);

  const userId = await currentUserId(request, env);
  if (!userId) return json(request, { authenticated: false, error: '請先登入繁星通行證' }, 401);
  if (!await ensureMembership(env, userId)) {
    return json(request, { authenticated: false, error: '繁星視界會員資格不可用' }, 403);
  }

  await ensureSchema(env);
  const db = (env as any).STARRY_ID_DB;
  const code = randomToken();
  const codeHash = await hashToken(code);
  const now = Date.now();
  await db.batch([
    db.prepare('DELETE FROM starry_app_auth_codes WHERE expiresAt<=?').bind(now),
    db.prepare('INSERT INTO starry_app_auth_codes(codeHash,appId,userId,expiresAt,createdAt) VALUES(?,?,?,?,?)')
      .bind(codeHash, APP_ID, userId, now + TICKET_TTL_MS, now)
  ]);

  return json(request, {
    authenticated: true,
    code,
    redirect: `${EYE_ORIGIN}/auth/callback?code=${encodeURIComponent(code)}`,
    user: { id: userId }
  });
}
