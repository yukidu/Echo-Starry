import { createRemoteJWKSet, jwtVerify } from 'jose';
import appWorker from './shareRouter';
import { syncVerifiedMember, MemberIdentityError, normalizeMember } from './memberRepository';
import type { Env } from './index';

const GOOGLE_CLIENT_IDS = [
  '661055525630-633btocuq7hs6pu7v5gkg3n2fouupubp.apps.googleusercontent.com',
  '400699489182-lb412nhvj4s6t1qr5ovkg40hc646dq79.apps.googleusercontent.com'
] as const;
const SUPER_ADMIN_EMAIL = 'yukidu@gmail.com';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

const authSchemaReady = new WeakMap<object, Promise<void>>();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function isSuperAdmin(user: any) {
  return normalizeEmail(user?.email) === SUPER_ADMIN_EMAIL;
}

function canUpload(user: any) {
  return isSuperAdmin(user) || Boolean(user?.canUpload) || Boolean(user?.isContributor);
}

async function ensureAuthSchema(db: any) {
  if (!db) return;
  const key = db as object;
  if (!authSchemaReady.has(key)) {
    const promise = (async () => {
      const { results } = await db.prepare('PRAGMA table_info(users)').all();
      if (!results?.length) throw new Error('Missing database table: users');
      if (!results.some((row: any) => row.name === 'googleSubject')) {
        try {
          await db.prepare('ALTER TABLE users ADD COLUMN googleSubject TEXT').run();
        } catch (error) {
          const check = await db.prepare('PRAGMA table_info(users)').all();
          if (!check.results.some((row: any) => row.name === 'googleSubject')) throw error;
        }
      }
      await db.prepare(`
        CREATE UNIQUE INDEX IF NOT EXISTS users_google_subject_unique
        ON users(googleSubject)
        WHERE googleSubject IS NOT NULL AND googleSubject <> ''
      `).run();
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS auth_sessions (
          tokenHash TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          expiresAt INTEGER NOT NULL,
          createdAt INTEGER NOT NULL
        )
      `).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(userId)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expiresAt)').run();
    })();
    authSchemaReady.set(key, promise);
    promise.catch(() => authSchemaReady.delete(key));
  }
  await authSchemaReady.get(key);
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function createSession(db: any, userId: string) {
  await ensureAuthSchema(db);
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const token = bytesToBase64Url(raw);
  const tokenHash = await hashToken(token);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  await db.batch([
    db.prepare('DELETE FROM auth_sessions WHERE expiresAt <= ?').bind(now),
    db.prepare('INSERT INTO auth_sessions (tokenHash, userId, expiresAt, createdAt) VALUES (?, ?, ?, ?)')
      .bind(tokenHash, userId, expiresAt, now)
  ]);
  return { token, expiresAt };
}

async function sessionUser(request: Request, env: Env) {
  if (!env.DB) return null;
  const match = request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i);
  if (!match) return null;
  await ensureAuthSchema(env.DB);
  const tokenHash = await hashToken(match[1]);
  const row: any = await env.DB.prepare(`
    SELECT u.*, s.expiresAt AS __sessionExpiresAt
    FROM auth_sessions s
    JOIN users u ON u.id = s.userId
    WHERE s.tokenHash = ?
    LIMIT 1
  `).bind(tokenHash).first();
  if (!row) return null;
  if (Number(row.__sessionExpiresAt || 0) <= Date.now()) {
    await env.DB.prepare('DELETE FROM auth_sessions WHERE tokenHash = ?').bind(tokenHash).run().catch(() => undefined);
    return null;
  }
  if (row.isBlocked) return null;
  return row;
}

async function verifyGoogleCredential(credential: string) {
  if (!credential || credential.split('.').length !== 3) throw new Error('缺少 Google 身分憑證');
  const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
    audience: [...GOOGLE_CLIENT_IDS],
    issuer: ['https://accounts.google.com', 'accounts.google.com']
  });
  const email = normalizeEmail(payload.email);
  const subject = String(payload.sub || '').trim();
  if (!email || !subject || payload.email_verified !== true) {
    throw new Error('Google 帳號尚未完成 Email 驗證');
  }
  return {
    email,
    subject,
    name: String(payload.name || email.split('@')[0]),
    avatar: String(payload.picture || '')
  };
}

function jsonRequest(request: Request, body: unknown, urlOverride?: URL) {
  const headers = new Headers(request.headers);
  headers.set('Content-Type', 'application/json');
  headers.delete('Content-Length');
  return new Request(urlOverride || request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(body)
  });
}

async function requestBody(request: Request) {
  return request.clone().json().catch(() => ({} as any)) as Promise<any>;
}

async function handleGoogleLogin(request: Request, env: Env) {
  if (!env.DB) return json({ error: '資料庫尚未連線' }, 503);
  const requestId = crypto.randomUUID();
  let stage = 'credential';
  const startedAt = Date.now();
  try {
    const body = await requestBody(request);
    const identity = await verifyGoogleCredential(String(body.credential || ''));
    stage = 'member';
    await ensureAuthSchema(env.DB);

    const data = await syncVerifiedMember(env.DB, identity);

    stage = 'session';
    const session = await createSession(env.DB, data.user.id);
    return json({
      ...data,
      authToken: session.token,
      sessionExpiresAt: session.expiresAt
    });
  } catch (error) {
    const code = String((error as any)?.code || '');
    const temporary = stage !== 'credential' || code === 'ERR_JWKS_TIMEOUT' || error instanceof TypeError;
    const status = error instanceof MemberIdentityError ? error.status : temporary ? 503 : 401;
    // Never log credentials, profiles or session tokens.
    console.warn('Google login failed', { requestId, stage, status, code, elapsedMs: Date.now() - startedAt });
    return json({ requestId, code: status === 503 ? 'LOGIN_SERVICE_UNAVAILABLE' : 'LOGIN_REJECTED',
      error: error instanceof MemberIdentityError ? error.message : status === 503
        ? '登入服務暫時忙碌，請稍後重試。' : 'Google 登入驗證失敗，請重新選擇 Google 帳號。' }, status);
  }
}

function protectedRoute(path: string, method: string) {
  if (method === 'POST' && path === '/api/r2/upload') return true;
  if (path === '/api/tracks' && method === 'POST') return true;
  if (/^\/api\/tracks\/[^/]+$/.test(path) && (method === 'PUT' || method === 'DELETE')) return true;
  if (/^\/api\/tracks\/[^/]+\/(?:vip-share(?:\/reset)?|reset-vip-token)$/.test(path) && method === 'POST') return true;
  if (/^\/api\/users\/[^/]+$/.test(path) && method === 'PUT') return true;
  if (/^\/api\/users\/[^/]+\/(?:contributor|admin-role|block|audit-rank)$/.test(path) && method === 'PUT') return true;
  if (path === '/api/admin/users/batch' && method === 'PUT') return true;
  if (/^\/api\/keywords(?:\/|$)/.test(path) && method !== 'GET') return true;
  if (path === '/api/categories' && method === 'POST') return true;
  if (/^\/api\/categories\/.+/.test(path) && (method === 'PUT' || method === 'DELETE')) return true;
  if (path === '/api/categories/order' && method === 'PUT') return true;
  return false;
}

async function authorizeAndRewrite(request: Request, env: Env, user: any) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  const categoryMutation =
    (path === '/api/categories' && method === 'POST') ||
    (/^\/api\/categories\/.+/.test(path) && (method === 'PUT' || method === 'DELETE'));

  if (
    path === '/api/admin/users/batch' ||
    /^\/api\/users\/[^/]+\/(?:contributor|admin-role|block)$/.test(path) ||
    /^\/api\/keywords\/(?:rename|delete)$/.test(path) ||
    categoryMutation
  ) {
    if (!isSuperAdmin(user)) return json({ error: '只有超級管理員可執行此操作' }, 403);
  }

  if (/^\/api\/users\/[^/]+\/audit-rank$/.test(path)) {
    const mayAudit = isSuperAdmin(user) || Boolean(user.isAdminUser) || user.role === '獎銜審核員' || user.role === '管理員';
    if (!mayAudit) return json({ error: '沒有獎銜審核權限' }, 403);
  }

  if (path === '/api/r2/upload' && method === 'POST') {
    if (!canUpload(user)) return json({ error: '沒有上傳音檔權限' }, 403);
    return request;
  }

  if (path === '/api/tracks' && method === 'POST') {
    if (!canUpload(user)) return json({ error: '沒有上傳音檔權限' }, 403);
    const body = await requestBody(request);
    return jsonRequest(request, {
      ...body,
      userEmail: user.email,
      userId: user.id,
      uploaderEmail: user.email,
      uploaderId: user.id
    });
  }

  const trackWrite = path.match(/^\/api\/tracks\/([^/]+)$/);
  if (trackWrite && (method === 'PUT' || method === 'DELETE')) {
    if (!canUpload(user)) return json({ error: '沒有修改音檔權限' }, 403);
    if (!isSuperAdmin(user) && env.DB) {
      const track: any = await env.DB.prepare('SELECT uploaderEmail FROM tracks WHERE id = ?')
        .bind(decodeURIComponent(trackWrite[1])).first();
      if (!track || normalizeEmail(track.uploaderEmail) !== normalizeEmail(user.email)) {
        return json({ error: '只能修改自己上傳的音檔' }, 403);
      }
    }
    if (method === 'DELETE') return request;
    const body = await requestBody(request);
    return jsonRequest(request, { ...body, userEmail: user.email, userId: user.id, uploaderEmail: user.email, uploaderId: user.id });
  }

  const userWrite = path.match(/^\/api\/users\/([^/]+)$/);
  if (userWrite && method === 'PUT') {
    const targetId = decodeURIComponent(userWrite[1]);
    if (!isSuperAdmin(user) && targetId !== String(user.id)) return json({ error: '只能修改自己的基本資料' }, 403);
    const body = await requestBody(request);
    if (isSuperAdmin(user)) return jsonRequest(request, body);

    const safeKeys = new Set([
      'name', 'avatar', 'phone', 'amwayId', 'center', 'rank', 'joinReason', 'stayReason',
      'sponsor', 'platinumUpline', 'diamondUpline', 'birthDate', 'birthday', 'notes',
      'residence', 'zodiac', 'talentNumber', 'lifeNumber', 'profileEditCount', 'profileEditMonth',
      'avatarUploadCount', 'avatarUploadMonth', 'rankUpdatedAt'
    ]);
    const safe: any = {};
    for (const [key, value] of Object.entries(body || {})) if (safeKeys.has(key)) safe[key] = value;

    if (safe.rank !== undefined && String(safe.rank) !== String(user.rank || '')) {
      safe.rankAuditStatus = 'pending';
      safe.rankApproved = false;
      safe.rankAuditType = user.rank ? 'rank_change' : 'new_register';
      safe.rankUpdatedAt = new Date().toISOString().replace('T', ' ').substring(0, 16);
    }
    return jsonRequest(request, safe);
  }

  if (/^\/api\/tracks\/[^/]+\/(?:vip-share(?:\/reset)?|reset-vip-token)$/.test(path) && method === 'POST') {
    const body = await requestBody(request);
    return jsonRequest(request, { ...body, userEmail: user.email });
  }

  if (/^\/api\/users\/[^/]+\/(?:contributor|admin-role|block|audit-rank)$/.test(path) && method === 'PUT') {
    const body = await requestBody(request);
    return jsonRequest(request, { ...body, actorEmail: user.email, userEmail: user.email });
  }

  if (path === '/api/admin/users/batch' && method === 'PUT') {
    const body = await requestBody(request);
    return jsonRequest(request, { ...body, actorEmail: user.email });
  }

  if (/^\/api\/keywords(?:\/|$)/.test(path) && method !== 'GET') {
    if (method === 'DELETE') {
      url.searchParams.set('userEmail', user.email);
      url.searchParams.set('userId', user.id);
      const body = await requestBody(request);
      return jsonRequest(request, { ...body, userEmail: user.email, userId: user.id }, url);
    }
    const body = await requestBody(request);
    return jsonRequest(request, { ...body, userEmail: user.email, userId: user.id });
  }

  return request;
}

async function sanitizeCommentIdentity(request: Request, env: Env) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const commentPost = (url.pathname === '/api/comments' || /^\/api\/tracks\/[^/]+\/comments$/.test(url.pathname)) && method === 'POST';
  const commentWrite = /^\/api\/comments\/[^/]+$/.test(url.pathname) && ['PUT', 'DELETE'].includes(method);
  if (!commentPost && !commentWrite) return request;

  const body = await requestBody(request);
  const user = await sessionUser(request, env);
  if (commentPost) {
    if (user) {
      return jsonRequest(request, {
        ...body,
        authorEmail: user.email,
        authorName: user.name || body.authorName || '會員',
        authorAvatar: user.avatar || body.authorAvatar || '👤',
        isAdmin: isSuperAdmin(user) || Boolean(user.isAdminUser) || user.role === '管理員'
      });
    }
    return jsonRequest(request, { ...body, authorEmail: '', isAdmin: false });
  }

  if (String(body.userEmail || '').trim()) {
    if (!user) return json({ error: '登入已過期，請重新使用 Google 登入' }, 401);
    return jsonRequest(request, { ...body, userEmail: user.email });
  }
  return request;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (path === '/api/users/google-sync' && method === 'POST') {
      return handleGoogleLogin(request, env);
    }

    if ((path === '/api/users' || path === '/api/users/profile') && method === 'POST') {
      return json({ error: '會員註冊請使用 Google 官方登入' }, 403);
    }

    if (path === '/api/auth/session' && method === 'GET') {
      const user = await sessionUser(request, env);
      if (!user) return json({ authenticated: false }, 401);
      const { __sessionExpiresAt, googleSubject, ...publicUser } = user;
      return json({ authenticated: true, user: normalizeMember(publicUser), sessionExpiresAt: __sessionExpiresAt });
    }

    // Private member fields are available only to the owner or authorized staff.
    if (method === 'GET' && ['/api/users', '/api/users/profile', '/api/users/activity-logs'].includes(path)) {
      const user = await sessionUser(request, env);
      if (!user) return json({ error: '請先登入會員' }, 401);
      const staff = isSuperAdmin(user) || Boolean(user.isAdminUser) || user.role === '獎銜審核員' || user.role === '管理員';
      if (path === '/api/users/activity-logs' && !staff) return json({ error: '沒有會員管理權限' }, 403);
      if (path === '/api/users/profile' && !staff) {
        const id = url.searchParams.get('id');
        const email = url.searchParams.get('email');
        if ((email && normalizeEmail(email) !== normalizeEmail(user.email)) ||
            (!email && id !== String(user.id))) return json({ error: '只能讀取自己的完整資料' }, 403);
      }
      if (path === '/api/users' && !staff) {
        const { results } = await env.DB.prepare(
          'SELECT id, name, avatar, rank, approvedRank, rankApproved, center FROM users WHERE COALESCE(isBlocked,0) = 0'
        ).all();
        return json((results || []).map((member: any) => member.id === user.id ? normalizeMember(user) : member));
      }
    }

    let nextRequest = request;
    if (protectedRoute(path, method)) {
      const user = await sessionUser(request, env);
      if (!user) return json({ error: '登入已過期，請重新使用 Google 登入' }, 401);
      const authorized = await authorizeAndRewrite(request, env, user);
      if (authorized instanceof Response) return authorized;
      nextRequest = authorized;
    } else {
      const sanitized = await sanitizeCommentIdentity(request, env);
      if (sanitized instanceof Response) return sanitized;
      nextRequest = sanitized;
    }

    return appWorker.fetch(nextRequest, env);
  }
};