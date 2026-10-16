import type { Env } from './index';

const ID_HOST = 'id.starry.phd';
const SYNC_ORIGIN = 'https://sync.starry.phd';
const CENTRAL_COOKIE = 'starry_id_session';
const APP_ID = 'starry-sync';
const TICKET_TTL_MS = 2 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{30,}$/;

function text(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function cookieValue(request: Request, name: string) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); }
    catch { return part.slice(separator + 1).trim(); }
  }
  return '';
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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
  if (origin === SYNC_ORIGIN) {
    result.set('Access-Control-Allow-Origin', SYNC_ORIGIN);
    result.set('Access-Control-Allow-Credentials', 'true');
    result.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    result.set('Access-Control-Allow-Headers', 'Content-Type, Accept');
  }
  return result;
}

function json(request: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: headers(request) });
}

function originAllowed(request: Request) {
  const origin = request.headers.get('Origin') || '';
  return !origin || origin === SYNC_ORIGIN;
}

function configuredSuperAdmin(env: Env, email: string) {
  const raw = text((env as any).STARRY_ID_SUPER_ADMIN_EMAILS) || 'yukidu@gmail.com';
  const admins = new Set(raw.split(',').map(item => item.trim().toLowerCase()).filter(Boolean));
  return admins.has(email.trim().toLowerCase());
}

async function centralIdentityFromRequest(request: Request, env: Env) {
  const db = (env as any).STARRY_ID_DB;
  const token = cookieValue(request, CENTRAL_COOKIE);
  if (!db || !TOKEN_RE.test(token)) return null;
  const tokenHash = await hashToken(token);
  const row: any = await db.prepare(`SELECT
      s.userId,s.expiresAt,u.primaryEmail,u.status,
      p.name,p.avatar,p.googleAvatar,p.rank,p.approvedRank,p.rankApproved
    FROM auth_sessions s
    JOIN users u ON u.id=s.userId
    LEFT JOIN profiles p ON p.userId=u.id
    WHERE s.tokenHash=? LIMIT 1`).bind(tokenHash).first().catch(() => null);
  if (!row || row.status !== 'active' || Number(row.expiresAt || 0) <= Date.now()) return null;
  return {
    userId: text(row.userId),
    email: text(row.primaryEmail).toLowerCase(),
    name: text(row.name) || text(row.primaryEmail).split('@')[0] || 'Starry Member',
    avatar: text(row.avatar || row.googleAvatar),
    rank: text(row.approvedRank || row.rank || '3%'),
    rankApproved: Boolean(row.rankApproved)
  };
}

async function centralIdentityByUserId(env: Env, userId: string) {
  const db = (env as any).STARRY_ID_DB;
  if (!db || !userId) return null;
  const row: any = await db.prepare(`SELECT
      u.id AS userId,u.primaryEmail,u.status,
      p.name,p.avatar,p.googleAvatar,p.rank,p.approvedRank,p.rankApproved
    FROM users u LEFT JOIN profiles p ON p.userId=u.id
    WHERE u.id=? LIMIT 1`).bind(userId).first().catch(() => null);
  if (!row || row.status !== 'active') return null;
  return {
    userId: text(row.userId),
    email: text(row.primaryEmail).toLowerCase(),
    name: text(row.name) || text(row.primaryEmail).split('@')[0] || 'Starry Member',
    avatar: text(row.avatar || row.googleAvatar),
    rank: text(row.approvedRank || row.rank || '3%'),
    rankApproved: Boolean(row.rankApproved)
  };
}

async function isAuthorizedAdmin(env: Env, userId: string, email: string) {
  const db = (env as any).STARRY_ID_DB;
  if (!db) return false;
  if (configuredSuperAdmin(env, email)) return true;
  const row: any = await db.prepare(`SELECT status,role,isAdminUser FROM app_memberships
    WHERE userId=? AND appId='starry-id' LIMIT 1`).bind(userId).first().catch(() => null);
  return Boolean(row && row.status === 'active' && (Number(row.isAdminUser || 0) === 1 || row.role === 'super-admin'));
}

async function ensureSyncMembership(env: Env, userId: string) {
  const db = (env as any).STARRY_ID_DB;
  const existing: any = await db.prepare(`SELECT status FROM app_memberships
    WHERE userId=? AND appId=? LIMIT 1`).bind(userId, APP_ID).first().catch(() => null);
  if (existing && existing.status !== 'active') return false;
  const now = Date.now();
  if (!existing) {
    await db.prepare(`INSERT INTO app_memberships
      (userId,appId,status,role,isAdminUser,isContributor,canUpload,joinedAt,updatedAt)
      VALUES (?,?,'active','admin',1,1,1,?,?)`).bind(userId, APP_ID, now, now).run();
  } else {
    await db.prepare(`UPDATE app_memberships SET role='admin',isAdminUser=1,isContributor=1,canUpload=1,updatedAt=?
      WHERE userId=? AND appId=?`).bind(now, userId, APP_ID).run();
  }
  return true;
}

async function ensureTicketSchema(env: Env) {
  const db = (env as any).STARRY_ID_DB;
  if (!db) throw new Error('STARRY_ID_DB not bound');
  await db.prepare(`CREATE TABLE IF NOT EXISTS starry_app_auth_codes (
    codeHash TEXT PRIMARY KEY,
    appId TEXT NOT NULL,
    userId TEXT NOT NULL,
    expiresAt INTEGER NOT NULL,
    createdAt INTEGER NOT NULL
  )`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS starry_app_auth_codes_expiry ON starry_app_auth_codes(expiresAt)').run();
}

async function issueTicket(request: Request, env: Env) {
  if (!originAllowed(request)) return json(request, { error: 'Origin not allowed' }, 403);
  const identity = await centralIdentityFromRequest(request, env);
  if (!identity) return json(request, { authenticated: false, error: '請先登入繁星通行證' }, 401);
  if (!await isAuthorizedAdmin(env, identity.userId, identity.email)) {
    return json(request, { authenticated: false, error: '此帳號沒有繁星同步管理權限' }, 403);
  }
  if (!await ensureSyncMembership(env, identity.userId)) {
    return json(request, { authenticated: false, error: '繁星同步會員資格已停用' }, 403);
  }
  await ensureTicketSchema(env);
  const db = (env as any).STARRY_ID_DB;
  const code = randomToken();
  const codeHash = await hashToken(code);
  const now = Date.now();
  await db.batch([
    db.prepare('DELETE FROM starry_app_auth_codes WHERE expiresAt<=?').bind(now),
    db.prepare('INSERT INTO starry_app_auth_codes(codeHash,appId,userId,expiresAt,createdAt) VALUES(?,?,?,?,?)')
      .bind(codeHash, APP_ID, identity.userId, now + TICKET_TTL_MS, now)
  ]);
  return json(request, {
    authenticated: true,
    code,
    user: { id: identity.userId, email: identity.email, name: identity.name, avatar: identity.avatar, rank: identity.rank }
  });
}

async function exchangeTicket(request: Request, env: Env) {
  if (!originAllowed(request)) return json(request, { error: 'Origin not allowed' }, 403);
  const input: any = await request.clone().json().catch(() => ({}));
  const code = text(input?.code);
  if (!TOKEN_RE.test(code)) return json(request, { authenticated: false, error: '登入票證格式不正確' }, 400);
  await ensureTicketSchema(env);
  const db = (env as any).STARRY_ID_DB;
  const row: any = await db.prepare(`DELETE FROM starry_app_auth_codes
    WHERE codeHash=? AND appId=? AND expiresAt>?
    RETURNING userId`).bind(await hashToken(code), APP_ID, Date.now()).first().catch(() => null);
  if (!row?.userId) return json(request, { authenticated: false, error: '登入票證已失效，請重新登入' }, 401);
  const identity = await centralIdentityByUserId(env, text(row.userId));
  if (!identity || !await isAuthorizedAdmin(env, identity.userId, identity.email)) {
    return json(request, { authenticated: false, error: '此帳號沒有繁星同步管理權限' }, 403);
  }
  return json(request, {
    authenticated: true,
    user: { id: identity.userId, email: identity.email, name: identity.name, avatar: identity.avatar, rank: identity.rank }
  });
}

export async function handleStarrySyncCentralSso(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.hostname !== ID_HOST) return null;
  const method = request.method.toUpperCase();
  if (url.pathname === '/api/apps/starry-sync/ticket') {
    if (method === 'OPTIONS') {
      if (!originAllowed(request)) return json(request, { error: 'Origin not allowed' }, 403);
      return new Response(null, { status: 204, headers: headers(request) });
    }
    if (method === 'POST') return issueTicket(request, env);
    return json(request, { error: 'Method not allowed' }, 405);
  }
  if (url.pathname === '/api/apps/starry-sync/exchange') {
    if (method === 'POST') return exchangeTicket(request, env);
    return json(request, { error: 'Method not allowed' }, 405);
  }
  return null;
}
