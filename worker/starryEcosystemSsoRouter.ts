import type { Env } from './index';
import { checkStarryAppAccess } from './starryAppAccess';
import { echoCentralV2CanaryPage, exchangeCentralV2CanaryTicket } from './echoCentralV2Canary';

const ID_HOST = 'id.starry.phd';
const ECHO_HOST = 'echo.starry.phd';
const CENTRAL_COOKIE = 'starry_id_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TICKET_TTL_MS = 5 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{30,}$/;

const ECOSYSTEM_ORIGINS = new Set([
  'https://starry.phd',
  'https://id.starry.phd',
  'https://echo.starry.phd',
  'https://go.starry.phd',
  'https://download.starry.phd',
  'https://eye.starry.phd',
  'https://ai.starry.phd',
  'https://sync.starry.phd',
  'https://mirror.starry.phd',
  'https://gratitude.starry.phd'
]);

const TICKET_APPS = {
  echostars: { origin: 'https://echo.starry.phd', label: '繁星回聲' },
  gostarry: { origin: 'https://go.starry.phd', label: '繁星任意門' },
  downloadstarry: { origin: 'https://download.starry.phd', label: '繁星捕手' },
  boxstarry: { origin: 'https://eye.starry.phd', label: '繁星視界' },
  'starry-sync': { origin: 'https://sync.starry.phd', label: '繁星共振' },
  'starry-ai': { origin: 'https://ai.starry.phd', label: '繁星副官' },
  'gratitude-starry': { origin: 'https://gratitude.starry.phd', label: '繁星感恩日記' }
} as const;

type TicketAppId = keyof typeof TICKET_APPS;
type NextHandler = (request: Request) => Promise<Response>;

type CentralIdentity = {
  userId: string;
  email: string;
  name: string;
  avatar: string;
  googleAvatar: string;
  rank: string;
  rankApproved: boolean;
  sourceAppId: string;
};

function cookieValue(request: Request, name: string) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
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

function corsHeaders(request: Request, methods = 'GET, POST, OPTIONS') {
  const origin = request.headers.get('Origin') || '';
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Vary': 'Origin'
  });
  if (ECOSYSTEM_ORIGINS.has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Allow-Methods', methods);
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    headers.set('Access-Control-Max-Age', '600');
  }
  return headers;
}

function json(request: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders(request) });
}

function withCors(request: Request, response: Response) {
  const origin = request.headers.get('Origin') || '';
  if (!ECOSYSTEM_ORIGINS.has(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  headers.set('Access-Control-Max-Age', '600');
  headers.set('Vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function preflight(request: Request) {
  const origin = request.headers.get('Origin') || '';
  if (!ECOSYSTEM_ORIGINS.has(origin)) return json(request, { error: 'Origin not allowed' }, 403);
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

async function centralIdentityFromRequest(request: Request, env: Env): Promise<CentralIdentity | null> {
  const db = (env as any).STARRY_ID_DB;
  const token = cookieValue(request, CENTRAL_COOKIE);
  if (!db || !TOKEN_RE.test(token)) return null;
  const tokenHash = await hashToken(token);
  const row: any = await db.prepare(`SELECT
      s.userId,s.appId,s.expiresAt,u.primaryEmail,u.status,
      p.name,p.avatar,p.googleAvatar,p.rank,p.approvedRank,p.rankApproved
    FROM auth_sessions s
    JOIN users u ON u.id=s.userId
    LEFT JOIN profiles p ON p.userId=u.id
    WHERE s.tokenHash=? LIMIT 1`).bind(tokenHash).first().catch(() => null);
  if (!row || row.status !== 'active' || Number(row.expiresAt || 0) <= Date.now()) return null;
  return {
    userId: String(row.userId || ''),
    email: String(row.primaryEmail || '').trim().toLowerCase(),
    name: String(row.name || '').trim() || String(row.primaryEmail || '').split('@')[0] || 'Starry Member',
    avatar: String(row.avatar || row.googleAvatar || ''),
    googleAvatar: String(row.googleAvatar || row.avatar || ''),
    rank: String(row.approvedRank || row.rank || '3%'),
    rankApproved: Boolean(row.rankApproved),
    sourceAppId: String(row.appId || '')
  };
}

async function centralIdentityByUserId(env: Env, userId: string): Promise<CentralIdentity | null> {
  const db = (env as any).STARRY_ID_DB;
  if (!db || !userId) return null;
  const row: any = await db.prepare(`SELECT
      u.id AS userId,u.primaryEmail,u.status,
      p.name,p.avatar,p.googleAvatar,p.rank,p.approvedRank,p.rankApproved
    FROM users u
    LEFT JOIN profiles p ON p.userId=u.id
    WHERE u.id=? LIMIT 1`).bind(userId).first().catch(() => null);
  if (!row || row.status !== 'active') return null;
  return {
    userId: String(row.userId || ''),
    email: String(row.primaryEmail || '').trim().toLowerCase(),
    name: String(row.name || '').trim() || String(row.primaryEmail || '').split('@')[0] || 'Starry Member',
    avatar: String(row.avatar || row.googleAvatar || ''),
    googleAvatar: String(row.googleAvatar || row.avatar || ''),
    rank: String(row.approvedRank || row.rank || '3%'),
    rankApproved: Boolean(row.rankApproved),
    sourceAppId: ''
  };
}

async function ensureTargetMembership(env: Env, userId: string, appId: TicketAppId) {
  const db = (env as any).STARRY_ID_DB;
  if (!db) return false;
  const existing: any = await db.prepare(
    'SELECT status FROM app_memberships WHERE userId=? AND appId=? LIMIT 1'
  ).bind(userId, appId).first().catch(() => null);
  if (existing) return existing.status === 'active';
  const now = Date.now();
  await db.prepare(`INSERT INTO app_memberships
    (userId,appId,status,role,isAdminUser,isContributor,canUpload,joinedAt,updatedAt)
    VALUES (?,?,'active','member',0,0,0,?,?)`)
    .bind(userId, appId, now, now).run();
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

function ticketAppId(pathname: string): TicketAppId | null {
  const match = pathname.match(/^\/api\/apps\/(echostars|gostarry|downloadstarry|boxstarry|starry-sync|starry-ai|gratitude-starry)\/ticket$/);
  return match ? match[1] as TicketAppId : null;
}

function ticketOriginAllowed(request: Request, appId: TicketAppId) {
  const origin = request.headers.get('Origin') || '';
  return !origin || origin === `https://${ID_HOST}` || origin === TICKET_APPS[appId].origin;
}

async function issueTicket(request: Request, env: Env, appId: TicketAppId) {
  if (!ticketOriginAllowed(request, appId)) return json(request, { error: 'Origin not allowed' }, 403);
  const identity = await centralIdentityFromRequest(request, env);
  if (!identity) return json(request, { authenticated: false, error: '請先登入繁星通行證' }, 401);
  // Gratitude is a new private-data App: central grant/revocation policy is mandatory.
  if (appId === 'gratitude-starry') {
    const access = await checkStarryAppAccess((env as any).STARRY_ID_DB, identity.userId, appId);
    if (!access.allowed) return json(request, { authenticated: false, error: '尚未取得繁星感恩日記的使用權限' }, 403);
  }
  if (!await ensureTargetMembership(env, identity.userId, appId)) {
    return json(request, { authenticated: false, error: `${TICKET_APPS[appId].label}會員資格不可用` }, 403);
  }
  await ensureTicketSchema(env);
  const db = (env as any).STARRY_ID_DB;
  const code = randomToken();
  const codeHash = await hashToken(code);
  const now = Date.now();
  await db.batch([
    db.prepare('DELETE FROM starry_app_auth_codes WHERE expiresAt<=?').bind(now),
    db.prepare('INSERT INTO starry_app_auth_codes(codeHash,appId,userId,expiresAt,createdAt) VALUES(?,?,?,?,?)')
      .bind(codeHash, appId, identity.userId, now + TICKET_TTL_MS, now)
  ]);
  return json(request, {
    authenticated: true,
    code,
    redirect: `${TICKET_APPS[appId].origin}/auth/callback?code=${encodeURIComponent(code)}`,
    user: { id: identity.userId, email: identity.email, name: identity.name, avatar: identity.avatar, rank: identity.rank }
  });
}

async function consumeEchoTicket(request: Request, env: Env) {
  const input: any = await request.clone().json().catch(() => ({}));
  const code = String(input?.code || '').trim();
  if (!TOKEN_RE.test(code)) return null;
  await ensureTicketSchema(env);
  const db = (env as any).STARRY_ID_DB;
  const codeHash = await hashToken(code);
  const row: any = await db.prepare(`DELETE FROM starry_app_auth_codes
    WHERE codeHash=? AND appId='echostars' AND expiresAt>?
    RETURNING userId`).bind(codeHash, Date.now()).first().catch(() => null);
  return row?.userId ? String(row.userId) : null;
}

async function ensureEchoUser(env: Env, identity: CentralIdentity) {
  if (!env.DB) return null;
  const centralDb = (env as any).STARRY_ID_DB;
  let legacyId = '';
  if (centralDb) {
    const legacy: any = await centralDb.prepare(`SELECT sourceUserId FROM legacy_links
      WHERE userId=? AND sourceApp IN ('echostars','Echo-Starry')
      ORDER BY importedAt DESC LIMIT 1`).bind(identity.userId).first().catch(() => null);
    legacyId = String(legacy?.sourceUserId || '').trim();
  }

  let local: any = null;
  if (legacyId) local = await env.DB.prepare('SELECT * FROM users WHERE id=? LIMIT 1').bind(legacyId).first().catch(() => null);
  if (!local) local = await env.DB.prepare('SELECT * FROM users WHERE id=? LIMIT 1').bind(identity.userId).first().catch(() => null);
  if (!local && identity.email) local = await env.DB.prepare('SELECT * FROM users WHERE LOWER(TRIM(email))=? LIMIT 1').bind(identity.email).first().catch(() => null);

  if (!local) {
    const nowIso = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO users
      (id,name,email,rank,avatar,googleAvatar,rankApproved,approvedRank,registerDate,lastActive,isBlocked)
      VALUES (?,?,?,?,?,?,?,?,?,?,0)`)
      .bind(
        identity.userId,
        identity.name,
        identity.email || null,
        identity.rank || '3%',
        identity.avatar || null,
        identity.googleAvatar || null,
        identity.rankApproved ? 1 : 0,
        identity.rankApproved ? identity.rank : null,
        nowIso.slice(0, 10),
        nowIso
      ).run();
    local = await env.DB.prepare('SELECT * FROM users WHERE id=? LIMIT 1').bind(identity.userId).first();
  }

  if (!local || Number(local.isBlocked || 0) === 1) return null;
  return local;
}

async function createEchoSession(env: Env, userId: string) {
  if (!env.DB) return null;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_sessions (
    tokenHash TEXT PRIMARY KEY,userId TEXT NOT NULL,expiresAt INTEGER NOT NULL,createdAt INTEGER NOT NULL
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(userId)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expiresAt)').run();
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_sessions WHERE expiresAt<=?').bind(now),
    env.DB.prepare('INSERT INTO auth_sessions(tokenHash,userId,expiresAt,createdAt) VALUES(?,?,?,?)')
      .bind(tokenHash, userId, expiresAt, now)
  ]);
  return { token, expiresAt };
}

async function exchangeEchoTicket(request: Request, env: Env, next: NextHandler) {
  const centralUserId = await consumeEchoTicket(request, env);
  if (!centralUserId) return json(request, { authenticated: false, error: '登入憑證已失效，請重新登入' }, 401);
  const identity = await centralIdentityByUserId(env, centralUserId);
  if (!identity) return json(request, { authenticated: false, error: '繁星通行證會員狀態不可用' }, 403);
  const local = await ensureEchoUser(env, identity);
  if (!local) return json(request, { authenticated: false, error: '繁星回聲會員狀態不可用' }, 403);
  const session = await createEchoSession(env, String(local.id));
  if (!session) return json(request, { authenticated: false, error: '無法建立登入狀態' }, 503);

  const url = new URL(request.url);
  url.pathname = '/api/auth/session';
  url.search = '';
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${session.token}`);
  headers.delete('Content-Length');
  const delegated = new Request(url.toString(), { method: 'GET', headers });
  const response = await next(delegated);
  const data: any = await response.clone().json().catch(() => ({}));
  if (!response.ok || data?.authenticated !== true || !data?.user) {
    return json(request, { authenticated: false, error: '繁星回聲登入同步失敗' }, 503);
  }
  return json(request, {
    ...data,
    authenticated: true,
    authToken: session.token,
    sessionExpiresAt: session.expiresAt,
    starryUserId: identity.userId
  });
}

async function ecosystemSession(request: Request, env: Env) {
  const origin = request.headers.get('Origin') || '';
  if (!ECOSYSTEM_ORIGINS.has(origin)) return json(request, { error: 'Origin not allowed' }, 403);
  const identity = await centralIdentityFromRequest(request, env);
  if (!identity) return json(request, { authenticated: false });
  return json(request, {
    authenticated: true,
    user: {
      id: identity.userId,
      email: identity.email,
      name: identity.name,
      avatar: identity.avatar,
      rank: identity.rank
    }
  });
}

export async function handleStarryEcosystemSso(
  request: Request,
  env: Env,
  _ctx: any,
  next: NextHandler
): Promise<Response | null> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  // Opt-in Echo-only testing. Does not touch old id.starry.phd or business APIs.
  const v2CanaryPage = await echoCentralV2CanaryPage(request, env);
  if (v2CanaryPage) return v2CanaryPage;

  if (url.hostname === ID_HOST) {
    const origin = request.headers.get('Origin') || '';
    const appId = ticketAppId(url.pathname);

    if (appId && method === 'OPTIONS') {
      return ticketOriginAllowed(request, appId) ? new Response(null, { status: 204, headers: corsHeaders(request) }) : json(request, { error: 'Origin not allowed' }, 403);
    }
    if (appId && method === 'POST') return issueTicket(request, env, appId);

    if (url.pathname === '/api/ecosystem/session') {
      if (method === 'OPTIONS') return preflight(request);
      if (method !== 'GET') return json(request, { error: 'Method not allowed' }, 405);
      return ecosystemSession(request, env);
    }

    if (url.pathname.startsWith('/api/') && ECOSYSTEM_ORIGINS.has(origin)) {
      if (method === 'OPTIONS') return preflight(request);
      return withCors(request, await next(request));
    }
  }

  if (url.hostname === ECHO_HOST && url.pathname === '/api/auth/ecosystem-exchange' && method === 'POST') {
    const exchangeInput: any = await request.clone().json().catch(() => null);
    if (exchangeInput && Object.prototype.hasOwnProperty.call(exchangeInput, 'source')) {
      if (exchangeInput.source !== 'central_v2') {
        return json(request, { authenticated: false, error: 'unsupported_ticket_source' }, 400);
      }
      // A new central v2 code is NEVER sent to old starry_app_auth_codes.
      return exchangeCentralV2CanaryTicket(request, env, next, createEchoSession);
    }
    return exchangeEchoTicket(request, env, next);
  }

  return null;
}
