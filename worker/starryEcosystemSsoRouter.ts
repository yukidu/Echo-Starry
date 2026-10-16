import appWorker from './starryMainInlineLoginRouter';
import type { Env } from './index';

const ID_HOST = 'id.starry.phd';
const ECHO_HOST = 'echo.starry.phd';
const CENTRAL_COOKIE = 'starry_id_session';
const CENTRAL_COOKIE_DOMAIN = '.starry.phd';
const CENTRAL_SESSION_MAX_AGE = 30 * 24 * 60 * 60;
const LOCAL_SESSION_EXPIRES_AT = 253402300799999;
const TOKEN_RE = /^[A-Za-z0-9_-]{30,}$/;
const ECOSYSTEM_ORIGINS = new Set([
  'https://starry.phd',
  'https://id.starry.phd',
  'https://echo.starry.phd',
  'https://go.starry.phd',
  'https://download.starry.phd',
  'https://mirror.starry.phd'
]);

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

function centralDomainCookie(token: string, maxAge = CENTRAL_SESSION_MAX_AGE) {
  return `${CENTRAL_COOKIE}=${encodeURIComponent(token)}; Domain=${CENTRAL_COOKIE_DOMAIN}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax; Priority=High`;
}

function clearCentralHostCookie() {
  return `${CENTRAL_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Priority=High`;
}

function clearCentralDomainCookie() {
  return `${CENTRAL_COOKIE}=; Domain=${CENTRAL_COOKIE_DOMAIN}; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Priority=High`;
}

function extractSetCookieToken(response: Response) {
  const raw = response.headers.get('Set-Cookie') || '';
  const match = raw.match(/(?:^|,\s*)starry_id_session=([^;,]+)/i) || raw.match(/starry_id_session=([^;]+)/i);
  if (!match) return '';
  try { return decodeURIComponent(match[1]); }
  catch { return match[1]; }
}

function withCookies(response: Response, cookies: string[]) {
  const headers = new Headers(response.headers);
  headers.delete('Set-Cookie');
  for (const cookie of cookies.filter(Boolean)) headers.append('Set-Cookie', cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function withCentralCors(request: Request, response: Response) {
  const origin = request.headers.get('Origin') || '';
  if (!ECOSYSTEM_ORIGINS.has(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
  if (!ECOSYSTEM_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '600',
      'Cache-Control': 'no-store',
      'Vary': 'Origin'
    }
  });
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function centralIdentity(env: Env, token: string) {
  const db = (env as any).STARRY_ID_DB;
  if (!db || !TOKEN_RE.test(token)) return null;
  const tokenHash = await hashToken(token);
  const row: any = await db.prepare(`SELECT s.userId,s.appId,s.expiresAt,u.primaryEmail,u.status,
      p.name,p.avatar,p.googleAvatar,p.rank,p.approvedRank,p.rankApproved
    FROM auth_sessions s
    JOIN users u ON u.id=s.userId
    LEFT JOIN profiles p ON p.userId=u.id
    JOIN app_memberships m ON m.userId=s.userId AND m.appId=s.appId AND m.status='active'
    WHERE s.tokenHash=? LIMIT 1`).bind(tokenHash).first().catch(() => null);
  if (!row || row.status !== 'active' || Number(row.expiresAt || 0) <= Date.now()) return null;
  return {
    userId: String(row.userId || ''),
    email: String(row.primaryEmail || '').trim().toLowerCase(),
    name: String(row.name || '').trim() || String(row.primaryEmail || '').split('@')[0] || 'Starry Member',
    avatar: String(row.avatar || row.googleAvatar || ''),
    googleAvatar: String(row.googleAvatar || row.avatar || ''),
    rank: String(row.approvedRank || row.rank || '3%'),
    rankApproved: Boolean(row.rankApproved)
  };
}

async function ensureEchoUser(env: Env, identity: Awaited<ReturnType<typeof centralIdentity>>) {
  if (!identity || !env.DB) return null;
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
  if (!env.DB) return '';
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_sessions (
    tokenHash TEXT PRIMARY KEY,userId TEXT NOT NULL,expiresAt INTEGER NOT NULL,createdAt INTEGER NOT NULL
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(userId)').run();
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_sessions WHERE expiresAt<=?').bind(now),
    env.DB.prepare('INSERT INTO auth_sessions(tokenHash,userId,expiresAt,createdAt) VALUES(?,?,?,?)')
      .bind(tokenHash, userId, LOCAL_SESSION_EXPIRES_AT, now)
  ]);
  return token;
}

async function echoSessionFromCentral(request: Request, env: Env, ctx?: any) {
  const centralToken = cookieValue(request, CENTRAL_COOKIE);
  const identity = await centralIdentity(env, centralToken);
  if (!identity) return null;
  const local = await ensureEchoUser(env, identity);
  if (!local) return null;
  const localToken = await createEchoSession(env, String(local.id));
  if (!localToken) return null;
  const url = new URL(request.url);
  url.pathname = '/api/auth/session';
  url.search = '';
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${localToken}`);
  headers.delete('Content-Length');
  const delegated = new Request(url.toString(), { method: 'GET', headers });
  return appWorker.fetch(delegated, env, ctx);
}

async function deleteCurrentCentralSession(request: Request, env: Env) {
  const token = cookieValue(request, CENTRAL_COOKIE);
  const db = (env as any).STARRY_ID_DB;
  if (!db || !TOKEN_RE.test(token)) return;
  const tokenHash = await hashToken(token);
  await db.prepare('DELETE FROM auth_sessions WHERE tokenHash=?').bind(tokenHash).run().catch(() => undefined);
}

async function handleCentralHost(request: Request, env: Env, ctx?: any) {
  const origin = request.headers.get('Origin') || '';
  if (request.method.toUpperCase() === 'OPTIONS' && origin) return preflight(request);

  let response = await appWorker.fetch(request, env, ctx);
  response = withCentralCors(request, response);
  const url = new URL(request.url);

  if (url.pathname === '/api/logout' && request.method.toUpperCase() === 'POST') {
    return withCookies(response, [clearCentralHostCookie(), clearCentralDomainCookie()]);
  }

  if (url.pathname === '/api/google-sync' && request.method.toUpperCase() === 'POST' && response.ok) {
    const issued = extractSetCookieToken(response);
    if (TOKEN_RE.test(issued)) {
      return withCookies(response, [clearCentralHostCookie(), centralDomainCookie(issued)]);
    }
  }

  // Upgrade an existing id.starry.phd-only session into the ecosystem cookie the
  // next time any Starry app talks to the central service.
  const existing = cookieValue(request, CENTRAL_COOKIE);
  if (response.ok && TOKEN_RE.test(existing) && ECOSYSTEM_ORIGINS.has(origin)) {
    return withCookies(response, [clearCentralHostCookie(), centralDomainCookie(existing)]);
  }
  return response;
}

export default {
  async fetch(request: Request, env: Env, ctx?: any): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (url.hostname === ID_HOST && url.pathname.startsWith('/api/')) {
      return handleCentralHost(request, env, ctx);
    }

    if (url.hostname === ECHO_HOST && url.pathname === '/api/users/google-sync' && method === 'POST') {
      // The browser has already exchanged the Google credential with Starry ID.
      // Reuse the shared HttpOnly ecosystem session to provision the Echo-local
      // compatibility session without verifying Google a second time.
      const bridged = await echoSessionFromCentral(request, env, ctx);
      if (bridged) return bridged;
      return appWorker.fetch(request, env, ctx);
    }

    if (url.hostname === ECHO_HOST && url.pathname === '/api/auth/session' && method === 'GET') {
      const response = await appWorker.fetch(request, env, ctx);
      if (response.ok) {
        const data: any = await response.clone().json().catch(() => null);
        if (data?.authenticated === true && data?.user) return response;
      }
      const bridged = await echoSessionFromCentral(request, env, ctx);
      return bridged || response;
    }

    if (url.hostname === ECHO_HOST && url.pathname === '/api/auth/logout' && method === 'POST') {
      await deleteCurrentCentralSession(request, env);
      const response = await appWorker.fetch(request, env, ctx);
      const headers = new Headers(response.headers);
      headers.append('Set-Cookie', clearCentralDomainCookie());
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }

    return appWorker.fetch(request, env, ctx);
  }
};
