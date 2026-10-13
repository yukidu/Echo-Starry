import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from './index';

type StarryEnv = Env & {
  STARRY_ID_DB?: any;
  STARRY_ID_GOOGLE_CLIENT_ID?: string;
  STARRY_ID_ALLOWED_APPS?: string;
  STARRY_ID_SELF_ENROLL_APPS?: string;
};

const STAR_DOMAIN = 'id.starry.phd';
const DEFAULT_GOOGLE_CLIENT_ID = '661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com';
const DEFAULT_ALLOWED_APPS = 'starry-id';
const DEFAULT_SELF_ENROLL_APPS = 'starry-id';
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{30,}$/;
const APP_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const NOINDEX = 'noindex, nofollow, noarchive, nosnippet, noimageindex';
const sessionSchemaReady = new WeakMap<object, Promise<void>>();

const USER_EDITABLE_PROFILE_FIELDS = new Set([
  'name', 'avatar', 'amwayId', 'phone', 'residence', 'center', 'joinReason', 'stayReason',
  'birthday', 'motto', 'zodiac', 'talentNumber', 'lifeNumber'
]);

function text(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function integerOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const valueNumber = Number(value);
  return Number.isFinite(valueNumber) ? Math.trunc(valueNumber) : null;
}

function parseAppSet(raw: unknown, fallback: string) {
  return new Set(
    text(raw || fallback)
      .split(',')
      .map(item => item.trim().toLowerCase())
      .filter(item => APP_ID_RE.test(item))
  );
}

function requestedAppId(value: unknown) {
  const appId = lower(value || 'starry-id');
  if (!APP_ID_RE.test(appId)) throw new Error('unsupported_app');
  return appId;
}

function allowedApp(env: StarryEnv, appId: string) {
  return parseAppSet(env.STARRY_ID_ALLOWED_APPS, DEFAULT_ALLOWED_APPS).has(appId);
}

function selfEnrollApp(env: StarryEnv, appId: string) {
  return parseAppSet(env.STARRY_ID_SELF_ENROLL_APPS, DEFAULT_SELF_ENROLL_APPS).has(appId);
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function ensureSessionSchema(db: any) {
  const key = db as object;
  if (!sessionSchemaReady.has(key)) {
    const task = (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS auth_sessions (
        tokenHash TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        appId TEXT NOT NULL,
        expiresAt INTEGER NOT NULL,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      )`).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(userId)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expiresAt)').run();
    })();
    sessionSchemaReady.set(key, task);
    task.catch(() => sessionSchemaReady.delete(key));
  }
  await sessionSchemaReady.get(key);
}

function trustedOrigin(request: Request) {
  const origin = request.headers.get('Origin');
  if (!origin) return '';
  try {
    const parsed = new URL(origin);
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') return origin;
    if (parsed.protocol !== 'https:') return '';
    if (parsed.hostname === 'starry.phd' || parsed.hostname.endsWith('.starry.phd')) return origin;
  } catch {
    return '';
  }
  return '';
}

function apiHeaders(request: Request) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': NOINDEX,
    'Vary': 'Origin'
  });
  const origin = trustedOrigin(request);
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  return headers;
}

function json(request: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: apiHeaders(request) });
}

async function requestBody(request: Request) {
  return request.clone().json().catch(() => ({} as any)) as Promise<any>;
}

async function verifyGoogleCredential(env: StarryEnv, credential: string) {
  if (!credential || credential.split('.').length !== 3) throw new Error('missing_credential');
  const clientId = text(env.STARRY_ID_GOOGLE_CLIENT_ID) || DEFAULT_GOOGLE_CLIENT_ID;
  const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
    audience: clientId,
    issuer: ['https://accounts.google.com', 'accounts.google.com']
  });
  const email = lower(payload.email);
  const subject = text(payload.sub);
  if (!email || !subject || payload.email_verified !== true) throw new Error('unverified_google_email');
  return {
    email,
    subject,
    name: text(payload.name) || email.split('@')[0],
    avatar: text(payload.picture)
  };
}

async function readMember(db: any, userId: string) {
  return db.prepare(`SELECT
      u.id,u.primaryEmail,u.status,
      p.name,p.avatar,p.googleAvatar,p.amwayId,p.phone,p.residence,p.center,
      p.rank,p.approvedRank,p.rankApproved,p.rankAuditStatus,p.rankAuditType,p.rankUpdatedAt,
      p.joinReason,p.stayReason,p.birthday,p.motto,p.zodiac,p.talentNumber,p.lifeNumber,p.registerDate
    FROM users u
    LEFT JOIN profiles p ON p.userId=u.id
    WHERE u.id=? LIMIT 1`).bind(userId).first();
}

function publicMember(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.primaryEmail,
    status: row.status,
    name: row.name || '',
    avatar: row.avatar || '',
    googleAvatar: row.googleAvatar || '',
    amwayId: row.amwayId || '',
    phone: row.phone || '',
    residence: row.residence || '',
    center: row.center || '',
    rank: row.rank || '',
    approvedRank: row.approvedRank || '',
    rankApproved: Boolean(row.rankApproved),
    rankAuditStatus: row.rankAuditStatus || '',
    rankAuditType: row.rankAuditType || '',
    rankUpdatedAt: row.rankUpdatedAt || '',
    joinReason: row.joinReason || '',
    stayReason: row.stayReason || '',
    birthday: row.birthday || '',
    motto: row.motto || '',
    zodiac: row.zodiac || '',
    talentNumber: row.talentNumber ?? null,
    lifeNumber: row.lifeNumber ?? null,
    registerDate: row.registerDate || ''
  };
}

async function syncVerifiedIdentity(
  env: StarryEnv,
  identity: Awaited<ReturnType<typeof verifyGoogleCredential>>,
  rawAppId: unknown
) {
  const db = env.STARRY_ID_DB;
  const appId = requestedAppId(rawAppId);
  if (!allowedApp(env, appId)) throw new Error('unsupported_app');

  const now = Date.now();
  const bySubject: any = await db.prepare(
    "SELECT userId FROM identities WHERE provider='google' AND providerSubject=? LIMIT 1"
  ).bind(identity.subject).first();
  const byEmail: any = await db.prepare(
    'SELECT id FROM users WHERE LOWER(TRIM(primaryEmail))=? LIMIT 1'
  ).bind(identity.email).first();

  if (bySubject && byEmail && text(bySubject.userId) !== text(byEmail.id)) {
    throw new Error('identity_conflict');
  }

  const userId = text(bySubject?.userId || byEmail?.id) || `u-${crypto.randomUUID()}`;
  const existing: any = await readMember(db, userId);
  if (existing?.status && existing.status !== 'active') throw new Error('account_inactive');

  const membership: any = await db.prepare(
    'SELECT status FROM app_memberships WHERE userId=? AND appId=? LIMIT 1'
  ).bind(userId, appId).first();
  if (membership && membership.status !== 'active') throw new Error('app_membership_blocked');
  if (!membership && !selfEnrollApp(env, appId)) throw new Error('app_membership_required');

  const otherEmailOwner: any = await db.prepare(
    'SELECT id FROM users WHERE LOWER(TRIM(primaryEmail))=? AND id<>? LIMIT 1'
  ).bind(identity.email, userId).first();
  if (otherEmailOwner) throw new Error('email_conflict');

  const statements: any[] = [
    db.prepare(`INSERT INTO users (id,primaryEmail,status,createdAt,updatedAt)
      VALUES (?,?,'active',?,?)
      ON CONFLICT(id) DO UPDATE SET primaryEmail=excluded.primaryEmail,updatedAt=excluded.updatedAt`)
      .bind(userId, identity.email, now, now),
    db.prepare(`INSERT INTO identities
      (provider,providerSubject,userId,providerEmail,emailVerified,createdAt,lastSeenAt)
      VALUES ('google',?,?,?,1,?,?)
      ON CONFLICT(provider,providerSubject) DO UPDATE SET
        userId=excluded.userId,providerEmail=excluded.providerEmail,emailVerified=1,lastSeenAt=excluded.lastSeenAt`)
      .bind(identity.subject, userId, identity.email, now, now),
    db.prepare(`INSERT INTO profiles (userId,name,avatar,googleAvatar,createdAt,updatedAt)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(userId) DO UPDATE SET
        name=CASE WHEN TRIM(COALESCE(profiles.name,''))='' THEN excluded.name ELSE profiles.name END,
        avatar=CASE WHEN TRIM(COALESCE(profiles.avatar,''))='' THEN excluded.avatar ELSE profiles.avatar END,
        googleAvatar=excluded.googleAvatar,
        updatedAt=excluded.updatedAt`)
      .bind(userId, identity.name, identity.avatar, identity.avatar, now, now)
  ];

  if (!membership) {
    statements.push(
      db.prepare(`INSERT INTO app_memberships
        (userId,appId,status,role,isAdminUser,isContributor,canUpload,joinedAt,updatedAt)
        VALUES (?,?,'active','member',0,0,0,?,?)`)
        .bind(userId, appId, now, now)
    );
  }

  await db.batch(statements);
  return { user: publicMember(await readMember(db, userId)), appId };
}

async function createSession(db: any, userId: string, appId: string) {
  await ensureSessionSchema(db);
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const token = bytesToBase64Url(raw);
  const tokenHash = await hashToken(token);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  await db.batch([
    db.prepare('DELETE FROM auth_sessions WHERE expiresAt<=?').bind(now),
    db.prepare('INSERT INTO auth_sessions (tokenHash,userId,appId,expiresAt,createdAt) VALUES (?,?,?,?,?)')
      .bind(tokenHash, userId, appId, expiresAt, now)
  ]);
  return { token, expiresAt };
}

async function sessionUser(request: Request, db: any) {
  const match = request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i);
  if (!match || !TOKEN_RE.test(match[1])) return null;
  await ensureSessionSchema(db);
  const tokenHash = await hashToken(match[1]);
  const session: any = await db.prepare(
    'SELECT userId,appId,expiresAt FROM auth_sessions WHERE tokenHash=? LIMIT 1'
  ).bind(tokenHash).first();
  if (!session) return null;
  if (Number(session.expiresAt || 0) <= Date.now()) {
    await db.prepare('DELETE FROM auth_sessions WHERE tokenHash=?').bind(tokenHash).run().catch(() => undefined);
    return null;
  }

  const member: any = await readMember(db, session.userId);
  if (!member || member.status !== 'active') return null;
  const membership: any = await db.prepare(
    'SELECT status,role,isAdminUser,isContributor,canUpload FROM app_memberships WHERE userId=? AND appId=? LIMIT 1'
  ).bind(session.userId, session.appId).first();
  if (!membership || membership.status !== 'active') return null;

  return {
    member: publicMember(member),
    appId: session.appId,
    expiresAt: Number(session.expiresAt),
    membership: {
      status: membership.status,
      role: membership.role || 'member',
      isAdminUser: Boolean(membership.isAdminUser),
      isContributor: Boolean(membership.isContributor),
      canUpload: Boolean(membership.canUpload)
    }
  };
}

async function updateProfile(env: StarryEnv, userId: string, actorUserId: string, sourceAppId: string, changes: any) {
  const db = env.STARRY_ID_DB;
  const current: any = await db.prepare('SELECT * FROM profiles WHERE userId=? LIMIT 1').bind(userId).first();
  if (!current) throw new Error('profile_not_found');

  const allowed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes || {})) {
    if (!USER_EDITABLE_PROFILE_FIELDS.has(key)) continue;
    allowed[key] = key === 'talentNumber' || key === 'lifeNumber' ? integerOrNull(value) : text(value);
  }

  const now = Date.now();
  const statements: any[] = [];
  for (const [key, value] of Object.entries(allowed)) {
    const before = current[key] == null ? '' : String(current[key]);
    const after = value == null ? '' : String(value);
    if (before === after) continue;
    statements.push(db.prepare(`UPDATE profiles SET ${key}=?,updatedAt=? WHERE userId=?`).bind(value, now, userId));
    statements.push(db.prepare(`INSERT INTO profile_audit_logs
      (id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt)
      VALUES (?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), userId, sourceAppId, actorUserId, key, before, after, now));
  }
  if (statements.length) await db.batch(statements);

  if (env.DB && Object.keys(allowed).length) {
    try {
      const legacy: any = await env.DB.prepare('SELECT id FROM users WHERE id=? LIMIT 1').bind(userId).first();
      if (legacy) {
        const keys = Object.keys(allowed);
        await env.DB.prepare(`UPDATE users SET ${keys.map(key => `${key}=?`).join(',')} WHERE id=?`)
          .bind(...keys.map(key => allowed[key]), userId).run();
      }
    } catch (error) {
      console.warn('Starry ID legacy dual-write skipped', {
        code: error instanceof Error ? error.message : 'unknown'
      });
    }
  }

  return publicMember(await readMember(db, userId));
}

function servicePage() {
  return new Response(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Starry ID｜繁星會員中心</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0b1020;color:#f7f8fb}.card{width:min(520px,calc(100% - 40px));padding:36px;border:1px solid #27304a;border-radius:24px;background:#121a30;box-shadow:0 20px 60px #0008}.mark{font-size:42px}.muted{color:#aab4ca;line-height:1.7}.status{display:inline-flex;gap:8px;align-items:center;margin-top:18px;padding:8px 12px;border-radius:999px;background:#17223c}.dot{width:9px;height:9px;border-radius:50%;background:#5ee6a8}</style></head><body><main class="card"><div class="mark">✦</div><h1>Starry ID</h1><p class="muted">繁星會員中心中央身份服務已啟用。</p><div class="status"><span class="dot"></span><span>Central identity service</span></div></main></body></html>`, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': NOINDEX
    }
  });
}

async function handleApi(request: Request, env: StarryEnv, path: string) {
  const method = request.method.toUpperCase();
  const origin = request.headers.get('Origin');
  if (origin && !trustedOrigin(request)) return json(request, { error: 'Origin not allowed' }, 403);
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: apiHeaders(request) });
  if (!env.STARRY_ID_DB) return json(request, { error: 'Starry ID service unavailable' }, 503);
  const db = env.STARRY_ID_DB;

  if (path === '/api/health' && method === 'GET') {
    try {
      const row: any = await db.prepare('SELECT COUNT(*) AS count FROM users').first();
      return json(request, { ok: true, service: 'starry-id', members: Number(row?.count || 0) });
    } catch {
      return json(request, { ok: false, service: 'starry-id' }, 503);
    }
  }

  if (path === '/api/google-sync' && method === 'POST') {
    const requestId = crypto.randomUUID();
    try {
      const input = await requestBody(request);
      const identity = await verifyGoogleCredential(env, text(input.credential));
      const synced = await syncVerifiedIdentity(env, identity, input.appId || 'starry-id');
      const session = await createSession(db, synced.user.id, synced.appId);
      return json(request, {
        success: true,
        user: synced.user,
        appId: synced.appId,
        authToken: session.token,
        sessionExpiresAt: session.expiresAt
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'login_failed';
      const conflict = ['identity_conflict', 'email_conflict'].includes(code);
      const restricted = ['account_inactive', 'app_membership_blocked', 'app_membership_required'].includes(code);
      const unsupported = code === 'unsupported_app';
      console.warn('Starry ID login rejected', { requestId, code });
      return json(request, {
        requestId,
        code: conflict ? 'IDENTITY_CONFLICT' : unsupported ? 'APP_NOT_ALLOWED' : restricted ? 'ACCOUNT_RESTRICTED' : 'LOGIN_REJECTED',
        error: conflict
          ? '會員身份資料發生衝突，請聯絡管理員。'
          : unsupported
            ? '此應用尚未登記使用 Starry ID。'
            : restricted
              ? '此會員目前無法使用這個服務。'
              : 'Google 登入驗證失敗，請重新選擇 Google 帳號。'
      }, conflict ? 409 : unsupported || restricted ? 403 : 401);
    }
  }

  if (path === '/api/session' && method === 'GET') {
    const session = await sessionUser(request, db);
    if (!session) return json(request, { authenticated: false }, 401);
    return json(request, {
      authenticated: true,
      user: session.member,
      appId: session.appId,
      membership: session.membership,
      sessionExpiresAt: session.expiresAt
    });
  }

  if (path === '/api/profile' && method === 'GET') {
    const session = await sessionUser(request, db);
    if (!session) return json(request, { error: '請先登入 Starry ID' }, 401);
    return json(request, { user: session.member, appId: session.appId, membership: session.membership });
  }

  if (path === '/api/profile' && method === 'PUT') {
    const session = await sessionUser(request, db);
    if (!session) return json(request, { error: '請先登入 Starry ID' }, 401);
    try {
      const changes = await requestBody(request);
      const user = await updateProfile(env, session.member.id, session.member.id, session.appId, changes);
      return json(request, { success: true, user });
    } catch (error) {
      console.warn('Starry ID profile update failed', {
        code: error instanceof Error ? error.message : 'unknown'
      });
      return json(request, { error: '會員資料更新失敗，請稍後再試。' }, 503);
    }
  }

  if (path === '/api/logout' && method === 'POST') {
    const match = request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i);
    if (match) {
      await ensureSessionSchema(db);
      const tokenHash = await hashToken(match[1]);
      await db.prepare('DELETE FROM auth_sessions WHERE tokenHash=?').bind(tokenHash).run().catch(() => undefined);
    }
    return json(request, { success: true });
  }

  return json(request, { error: 'Not found' }, 404);
}

export async function handleStarryIdCentral(request: Request, env: StarryEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN) return null;

  if (url.pathname === '/' && request.method.toUpperCase() === 'GET') return servicePage();
  if (url.pathname === '/robots.txt' && request.method.toUpperCase() === 'GET') {
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': NOINDEX }
    });
  }
  if (url.pathname.startsWith('/api/')) return handleApi(request, env, url.pathname);
  return json(request, { error: 'Not found' }, 404);
}
