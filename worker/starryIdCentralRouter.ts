import { createRemoteJWKSet, jwtVerify } from 'jose';
import { handleStarryAppAccessAdminRequest, checkStarryAppAccess, readAppAccessDecision } from './starryAppAccess';
import type { Env } from './index';
import { calculateNumerology } from '../src/utils/numerology';
import { ensureSpouseSchema } from './starryIdSpouseSchema';
import { renderStarryIdMemberCenterPage } from './starryIdMemberCenterPage';
import { memberDirectoryFilter } from './starryMemberDirectoryFilter';
import { renderStarryAiManagementPage } from './starryAiManagementPage';
import { renderStarryAiModelRegistryPage } from './starryAiModelRegistryPage';
import { readCentralAiModels } from './starryAiModelRegistry';
import { renderStarryAiModelAdminPage } from './starryAiModelAdminPage';
import { renderStarryAiTaskRoutingPage } from './starryAiTaskRoutingPage';
import { readAiRoutingControl, previewAiRouting, saveAiRouting, RoutingInputError } from './starryAiTaskRouting';
import { modelAdminHistory, modelAdminSecretStatus, dryRunModelDraft, applyModelAdminAction, AdminInputError } from './starryAiModelAdmin';
import { loadAiPriorities, saveAiPriorities, collectAiCatalog, recentAiChanges, DEFAULT_AI_ORDER } from './starryAiManagement';

type StarryEnv = Env & {
  STARRY_ID_DB?: any;
  STARRY_ID_GOOGLE_CLIENT_ID?: string;
  STARRY_ID_ALLOWED_APPS?: string;
  STARRY_ID_SELF_ENROLL_APPS?: string;
  STARRY_ID_SUPER_ADMIN_EMAILS?: string;
  STARRY_APP_ACCESS_REQUIRE_GRANT?: string;
};

const STAR_DOMAIN = 'id.starry.phd';
const DEFAULT_GOOGLE_CLIENT_ID = '661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com';
const DEFAULT_ALLOWED_APPS = 'starry-id';
const DEFAULT_SELF_ENROLL_APPS = 'starry-id';
const DEFAULT_SUPER_ADMIN_EMAILS = ['yukidu@gmail.com'];
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TOKEN_RE = /^[A-Za-z0-9_-]{30,}$/;
const APP_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const NOINDEX = 'noindex, nofollow, noarchive, nosnippet, noimageindex';
const SESSION_COOKIE = 'starry_id_session';
const IOS_HANDOFF_TTL_MS = 90 * 1000;
const IOS_HANDOFF_ORIGIN = 'https://echo.starry.phd';
const sessionSchemaReady = new WeakMap<object, Promise<void>>();

const USER_EDITABLE_PROFILE_FIELDS = new Set([
  'name', 'avatar', 'amwayId', 'phone', 'residence', 'center', 'joinReason', 'stayReason',
  'birthday', 'motto'
]);
const ADMIN_EDITABLE_PROFILE_FIELDS = new Set([
  ...USER_EDITABLE_PROFILE_FIELDS,
  'rank'
]);
const RELATIONSHIP_FIELDS: Record<string, string> = {
  sponsor: 'sponsor',
  platinumUpline: 'platinum_upline',
  diamondUpline: 'diamond_upline'
};

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

function configuredSuperAdminEmails(env: StarryEnv) {
  const raw = text(env.STARRY_ID_SUPER_ADMIN_EMAILS);
  const values = raw ? raw.split(',') : DEFAULT_SUPER_ADMIN_EMAILS;
  return new Set(values.map(item => lower(item)).filter(Boolean));
}

function configuredSuperAdmin(env: StarryEnv, email: unknown) {
  return configuredSuperAdminEmails(env).has(lower(email));
}

/**
 * Central Starry ID membership (or its server-side administrator allowlist) is
 * the only source of ecosystem administrator authority. An App-specific role,
 * including a role called "super-admin", cannot grant central management.
 *
 * For Starry ID sessions reuse the already-verified membership row. A session
 * issued through another App needs one central membership lookup, which stays
 * live so revoked central roles lose access without waiting for cache expiry.
 */
export async function resolveCentralStarryAdmin(
  db: any,
  userId: string,
  sessionAppId: string,
  currentMembership: { role?: unknown; status?: unknown } | null,
  centrallyConfiguredAdmin: boolean
): Promise<boolean> {
  if (!userId || !db || !currentMembership || currentMembership.status !== 'active') return false;
  if (centrallyConfiguredAdmin) return true;
  if (sessionAppId === 'starry-id') return currentMembership.role === 'super-admin';
  const central: any = await db.prepare(
    "SELECT status,role FROM app_memberships WHERE userId=? AND appId='starry-id' LIMIT 1"
  ).bind(userId).first();
  return central?.status === 'active' && central?.role === 'super-admin';
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

function json(request: Request, data: unknown, status = 200, extraHeaders?: HeadersInit) {
  const headers = apiHeaders(request);
  if (extraHeaders) {
    const extras = new Headers(extraHeaders);
    extras.forEach((value, key) => headers.set(key, value));
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function requestBody(request: Request) {
  return request.clone().json().catch(() => ({} as any)) as Promise<any>;
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get('Cookie') || '';
  for (const part of cookie.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function requestSessionToken(request: Request) {
  const bearer = request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i)?.[1] || '';
  if (bearer && TOKEN_RE.test(bearer)) return bearer;
  const cookie = cookieValue(request, SESSION_COOKIE);
  return TOKEN_RE.test(cookie) ? cookie : '';
}

function sessionCookie(token: string, expiresAt: number) {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
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

const memberSelect = `SELECT
  u.id,u.primaryEmail,u.status,
  p.name,p.avatar,p.googleAvatar,p.amwayId,p.phone,p.residence,p.center,
  p.rank,p.approvedRank,p.rankApproved,p.rankAuditStatus,p.rankAuditType,p.rankUpdatedAt,
  p.joinReason,p.stayReason,p.birthday,p.motto,p.zodiac,p.talentNumber,p.lifeNumber,p.registerDate,
  COALESCE((SELECT NULLIF(TRIM(rp.name),'') FROM member_relationships mr LEFT JOIN profiles rp ON rp.userId=mr.relatedUserId WHERE mr.userId=u.id AND mr.relationType='sponsor' LIMIT 1),
           (SELECT mr.legacyLabel FROM member_relationships mr WHERE mr.userId=u.id AND mr.relationType='sponsor' LIMIT 1),'') AS sponsor,
  COALESCE((SELECT NULLIF(TRIM(rp.name),'')||COALESCE((SELECT '&'||TRIM(sp.name) FROM spouse_links sl JOIN profiles sp ON sp.userId=CASE WHEN sl.userA=rp.userId THEN sl.userB ELSE sl.userA END WHERE sl.status='active' AND (sl.userA=rp.userId OR sl.userB=rp.userId) LIMIT 1),'') FROM member_relationships mr LEFT JOIN profiles rp ON rp.userId=mr.relatedUserId WHERE mr.userId=u.id AND mr.relationType='platinum_upline' LIMIT 1),
           (SELECT mr.legacyLabel FROM member_relationships mr WHERE mr.userId=u.id AND mr.relationType='platinum_upline' LIMIT 1),'') AS platinumUpline,
  COALESCE((SELECT NULLIF(TRIM(rp.name),'')||COALESCE((SELECT '&'||TRIM(sp.name) FROM spouse_links sl JOIN profiles sp ON sp.userId=CASE WHEN sl.userA=rp.userId THEN sl.userB ELSE sl.userA END WHERE sl.status='active' AND (sl.userA=rp.userId OR sl.userB=rp.userId) LIMIT 1),'') FROM member_relationships mr LEFT JOIN profiles rp ON rp.userId=mr.relatedUserId WHERE mr.userId=u.id AND mr.relationType='diamond_upline' LIMIT 1),
           (SELECT mr.legacyLabel FROM member_relationships mr WHERE mr.userId=u.id AND mr.relationType='diamond_upline' LIMIT 1),'') AS diamondUpline,
  COALESCE((SELECT NULLIF(TRIM(sp.name),'') FROM spouse_links sl JOIN profiles sp ON sp.userId=CASE WHEN sl.userA=u.id THEN sl.userB ELSE sl.userA END WHERE sl.status='active' AND (sl.userA=u.id OR sl.userB=u.id) LIMIT 1),'') AS spouseName
  FROM users u
  LEFT JOIN profiles p ON p.userId=u.id`;

async function readMember(db: any, userId: string) {
  await ensureSpouseSchema(db);
  return db.prepare(`${memberSelect} WHERE u.id=? LIMIT 1`).bind(userId).first();
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
    registerDate: row.registerDate || '',
    sponsor: row.sponsor || '',
    platinumUpline: row.platinumUpline || '',
    diamondUpline: row.diamondUpline || '',
    spouseName: row.spouseName || ''
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
  // Registration at id.starry.phd is always available. New identities must first
  // register there, then obtain explicit grants before using other Apps.
  if (appId !== 'starry-id') {
    if (!existing) throw new Error('app_access_denied');
    const access = await checkStarryAppAccess(db,userId,appId);
    if (!access.allowed) throw new Error('app_access_denied');
  }
  const explicitAppDecision = appId === 'starry-id' ? null : await readAppAccessDecision(db,userId,appId);

  const membership: any = await db.prepare(
    'SELECT status,role,isAdminUser FROM app_memberships WHERE userId=? AND appId=? LIMIT 1'
  ).bind(userId, appId).first();
  if (membership && membership.status !== 'active') throw new Error('app_membership_blocked');
  if (!membership && !selfEnrollApp(env, appId) && explicitAppDecision !== 'allow') throw new Error('app_membership_required');

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

  const shouldBeSuperAdmin = appId === 'starry-id' && configuredSuperAdmin(env, identity.email);
  if (!membership) {
    statements.push(
      db.prepare(`INSERT INTO app_memberships
        (userId,appId,status,role,isAdminUser,isContributor,canUpload,joinedAt,updatedAt)
        VALUES (?,?,'active',?,?,0,0,?,?)`)
        .bind(userId, appId, shouldBeSuperAdmin ? 'super-admin' : 'member', shouldBeSuperAdmin ? 1 : 0, now, now)
    );
  } else if (shouldBeSuperAdmin) {
    statements.push(
      db.prepare(`UPDATE app_memberships SET role='super-admin',isAdminUser=1,updatedAt=? WHERE userId=? AND appId=?`)
        .bind(now, userId, appId)
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


// Google credentials are verified on the server, then exchanged for a short,
// single-use handoff. Never print a Google ID token into the returned HTML.
export async function issueEchoIosLoginHandoff(env: StarryEnv, credential: string) {
  const db = env.STARRY_ID_DB;
  if (!db) throw new Error('starry_id_unavailable');
  const identity = await verifyGoogleCredential(env, credential);
  const synced = await syncVerifiedIdentity(env, identity, 'echostars');
  if (!synced.user?.id) throw new Error('member_sync_failed');
  await db.prepare(`CREATE TABLE IF NOT EXISTS ios_login_handoffs (
    codeHash TEXT PRIMARY KEY,
    userId TEXT NOT NULL,
    expiresAt INTEGER NOT NULL
  )`).run();
  const code = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const codeHash = await hashToken(code);
  const now = Date.now();
  await db.batch([
    db.prepare('DELETE FROM ios_login_handoffs WHERE expiresAt<=?').bind(now),
    db.prepare('INSERT INTO ios_login_handoffs (codeHash,userId,expiresAt) VALUES (?,?,?)')
      .bind(codeHash, String(synced.user.id), now + IOS_HANDOFF_TTL_MS)
  ]);
  return { code, email: identity.email };
}

async function completeEchoIosLogin(request: Request, env: StarryEnv) {
  if (request.headers.get('Origin') !== IOS_HANDOFF_ORIGIN) {
    return json(request, { error: 'Origin not allowed' }, 403);
  }
  const db = env.STARRY_ID_DB;
  if (!db) return json(request, { error: '登入服務暫時無法使用' }, 503);
  const body: any = await requestBody(request);
  const code = text(body?.ticket);
  if (!TOKEN_RE.test(code)) return json(request, { error: '登入驗證碼無效' }, 401);
  const codeHash = await hashToken(code);
  // Atomic consumption prevents replay even with two simultaneous requests.
  const record: any = await db.prepare(`DELETE FROM ios_login_handoffs
    WHERE codeHash=? AND expiresAt>? RETURNING userId`)
    .bind(codeHash, Date.now()).first();
  if (!record?.userId) return json(request, { error: '登入驗證碼已使用或過期' }, 401);
  const member = await readMember(db, String(record.userId));
  if (!member || member.status !== 'active') return json(request, { error: '會員狀態不可用' }, 403);
  const session = await createSession(db, String(member.id), 'echostars');
  return json(request, { success: true, user: { id: member.id, email: member.primaryEmail } },
    200, { 'Set-Cookie': sessionCookie(session.token, session.expiresAt) });
}

async function sessionUser(request: Request, env: StarryEnv) {
  const db = env.STARRY_ID_DB;
  const token = requestSessionToken(request);
  if (!token) return null;
  await ensureSessionSchema(db);
  const tokenHash = await hashToken(token);
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
  if (session.appId !== 'starry-id' && !(await checkStarryAppAccess(db,session.userId,session.appId)).allowed) return null;
  const publicUser = publicMember(member);
  if (!publicUser) return null;
  const isSuperAdmin = await resolveCentralStarryAdmin(
    db, session.userId, session.appId, membership, configuredSuperAdmin(env, publicUser.email)
  );

  return {
    member: publicUser,
    appId: session.appId,
    expiresAt: Number(session.expiresAt),
    isSuperAdmin,
    membership: {
      status: membership.status,
      role: membership.role || 'member',
      isAdminUser: Boolean(membership.isAdminUser),
      isContributor: Boolean(membership.isContributor),
      canUpload: Boolean(membership.canUpload)
    }
  };
}

async function writeAudit(db: any, userId: string, sourceAppId: string, actorUserId: string, fieldName: string, oldValue: unknown, newValue: unknown, now: number) {
  await db.prepare(`INSERT INTO profile_audit_logs
    (id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt)
    VALUES (?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), userId, sourceAppId, actorUserId, fieldName,
      oldValue == null ? '' : String(oldValue), newValue == null ? '' : String(newValue), now).run();
}

async function updateProfile(
  env: StarryEnv,
  userId: string,
  actorUserId: string,
  sourceAppId: string,
  changes: any,
  isSuperAdmin = false
) {
  const db = env.STARRY_ID_DB;
  const current: any = await readMember(db, userId);
  if (!current) throw new Error('profile_not_found');

  // Distributor identifiers must pass the central uniqueness/spouse approval workflow.
  if (Object.prototype.hasOwnProperty.call(changes || {}, 'amwayId')) throw new Error('distributor_number_requires_dedicated_endpoint');
  const editableFields = isSuperAdmin ? ADMIN_EDITABLE_PROFILE_FIELDS : USER_EDITABLE_PROFILE_FIELDS;
  const allowed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes || {})) {
    if (!editableFields.has(key)) continue;
    allowed[key] = text(value);
  }

  // Numerology and zodiac are derived, not independently editable.
  if (Object.prototype.hasOwnProperty.call(allowed, 'birthday')) {
    const raw = text(allowed.birthday);
    if (raw) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
      const year = Number(match?.[1]), month = Number(match?.[2]), day = Number(match?.[3]);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (!match || year < 1900 || year > new Date().getUTCFullYear() ||
          date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        throw new Error('生日格式不正確，請從日曆選擇有效日期');
      }
    }
    const result = raw ? calculateNumerology(raw) : null;
    allowed.zodiac = result?.zodiac || '';
    allowed.talentNumber = result?.talentNumber ?? null;
    allowed.lifeNumber = result?.lifeNumber ?? null;
  }

  const relationshipChanges: Record<string, string> = {};
  for (const [fieldName] of Object.entries(RELATIONSHIP_FIELDS)) {
    if (Object.prototype.hasOwnProperty.call(changes || {}, fieldName)) {
      relationshipChanges[fieldName] = text(changes[fieldName]);
    }
  }

  const now = Date.now();
  const statements: any[] = [];
  const legacyChanges: Record<string, unknown> = { ...allowed };
  for (const [key, value] of Object.entries(allowed)) {
    const before = current[key] == null ? '' : String(current[key]);
    const after = value == null ? '' : String(value);
    if (before === after) continue;
    statements.push(db.prepare(`UPDATE profiles SET ${key}=?,updatedAt=? WHERE userId=?`).bind(value, now, userId));
    statements.push(db.prepare(`INSERT INTO profile_audit_logs
      (id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt)
      VALUES (?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), userId, sourceAppId, actorUserId, key, before, after, now));

    if (key === 'rank' && isSuperAdmin) {
      const rankText = text(value);
      const rankUpdatedAt = new Date(now).toISOString();
      statements.push(db.prepare(`UPDATE profiles SET approvedRank=?,rankApproved=1,rankAuditStatus='approved',rankAuditType='super-admin',rankUpdatedAt=?,updatedAt=? WHERE userId=?`)
        .bind(rankText, rankUpdatedAt, now, userId));
      legacyChanges.approvedRank = rankText;
      legacyChanges.rankApproved = 1;
      legacyChanges.rankAuditStatus = 'approved';
      legacyChanges.rankAuditType = 'super-admin';
      legacyChanges.rankUpdatedAt = rankUpdatedAt;
    }
  }

  for (const [fieldName, relationType] of Object.entries(RELATIONSHIP_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(relationshipChanges, fieldName)) continue;
    const before = text(current[fieldName]);
    const after = relationshipChanges[fieldName];
    if (before === after) continue;
    if (after) {
      statements.push(db.prepare(`INSERT INTO member_relationships
        (userId,relationType,relatedUserId,legacyLabel,resolutionStatus,updatedAt)
        VALUES (?,?,NULL,?,'unresolved',?)
        ON CONFLICT(userId,relationType) DO UPDATE SET relatedUserId=NULL,legacyLabel=excluded.legacyLabel,resolutionStatus='unresolved',updatedAt=excluded.updatedAt`)
        .bind(userId, relationType, after, now));
    } else {
      statements.push(db.prepare('DELETE FROM member_relationships WHERE userId=? AND relationType=?').bind(userId, relationType));
    }
    statements.push(db.prepare(`INSERT INTO profile_audit_logs
      (id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt)
      VALUES (?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), userId, sourceAppId, actorUserId, fieldName, before, after, now));
    legacyChanges[fieldName] = after;
  }

  if (statements.length) await db.batch(statements);

  if (env.DB && Object.keys(legacyChanges).length) {
    try {
      const legacy: any = await env.DB.prepare('SELECT id FROM users WHERE id=? LIMIT 1').bind(userId).first();
      if (legacy) {
        const keys = Object.keys(legacyChanges);
        await env.DB.prepare(`UPDATE users SET ${keys.map(key => `${key}=?`).join(',')} WHERE id=?`)
          .bind(...keys.map(key => legacyChanges[key]), userId).run();
      }
    } catch (error) {
      console.warn('Starry ID legacy dual-write skipped', {
        code: error instanceof Error ? error.message : 'unknown'
      });
    }
  }

  return publicMember(await readMember(db, userId));
}

const MEMBER_BATCH_SIZE = 80;
const MEMBER_SELECTION_LIMIT = 5000;

/** Progressive scrolling, matching the same filter used for select-all and bulk jobs. */
async function listMembers(db: any, search: string, offset = 0, rank = '') {
  const {where, params} = memberDirectoryFilter(search, rank);
  const rows: any = await db.prepare(`SELECT
      u.id,u.primaryEmail,u.status,p.name,p.rank,p.approvedRank,p.rankApproved,p.amwayId,p.center
    FROM users u LEFT JOIN profiles p ON p.userId=u.id
    ${where}
    ORDER BY LOWER(COALESCE(p.name,'')),LOWER(u.primaryEmail),u.id
    LIMIT ? OFFSET ?`).bind(...params,MEMBER_BATCH_SIZE,offset).all();
  const countRow: any = await db.prepare(`SELECT COUNT(*) AS count
    FROM users u LEFT JOIN profiles p ON p.userId=u.id ${where}`).bind(...params).first();
  const total = Number(countRow?.count || 0);
  const members=(rows?.results || []).map((row: any) => ({
    id: row.id,
    email: row.primaryEmail,
    status: row.status,
    name: row.name || '',
    amwayId: row.amwayId || '',
    rank: Number(row.rankApproved||0)===1 ? (row.approvedRank || '') : '',
    approvedRank: Number(row.rankApproved||0)===1 ? (row.approvedRank || '') : '',
    center: row.center || ''
  }));
  return { total, members, nextOffset: offset + members.length, hasMore: offset + members.length < total };
}

/** Only centrally verified super-admins may resolve an exact selection snapshot. */
export async function listFilteredMemberIds(db: any, search: string, rank: string) {
  const {where, params} = memberDirectoryFilter(search,rank);
  const found: any = await db.prepare(`SELECT u.id
    FROM users u LEFT JOIN profiles p ON p.userId=u.id
    ${where}
    ORDER BY u.id LIMIT ?`).bind(...params,MEMBER_SELECTION_LIMIT+1).all();
  const rows: any[] = found?.results || [];
  if(rows.length>MEMBER_SELECTION_LIMIT)
    return { error:'符合條件的會員超過 5,000 位，請先縮小篩選條件', status:413, ids:[] };
  return { ids: rows.map(row => String(row.id)), count: rows.length };
}

async function listMemberApprovedRanks(db:any) {
  const rows:any=await db.prepare(`SELECT TRIM(p.approvedRank) AS rank, COUNT(*) AS members
    FROM profiles p JOIN users u ON u.id=p.userId
    WHERE p.rankApproved=1 AND TRIM(COALESCE(p.approvedRank,''))<>''
    GROUP BY TRIM(p.approvedRank) ORDER BY members DESC,rank COLLATE NOCASE`).all();
  return {ranks: rows?.results || []};
}

function servicePage(env: StarryEnv) {
  const clientId = text(env.STARRY_ID_GOOGLE_CLIENT_ID) || DEFAULT_GOOGLE_CLIENT_ID;
  return renderStarryIdMemberCenterPage(clientId);
}

/** A verified central session must authorize every App-access admin request. */
export function canManageStarryAppAccess(session: { isSuperAdmin: boolean; appId?: string } | null): boolean {
  return session?.isSuperAdmin === true;
}

async function handleApi(request: Request, env: StarryEnv, path: string) {
  const method = request.method.toUpperCase();
  const origin = request.headers.get('Origin');
  if (origin && !trustedOrigin(request)) return json(request, { error: 'Origin not allowed' }, 403);
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: apiHeaders(request) });
  if (!env.STARRY_ID_DB) return json(request, { error: 'Starry ID service unavailable' }, 503);
  const db = env.STARRY_ID_DB;

  if (path.startsWith('/api/admin/app-access/')) {
    // Keep the manager-only API on the ID website even though authentication
    // may originate from an App-issued cookie. Sibling Apps cannot use CORS to
    // read member access decisions or submit administrative mutations.
    if (origin && origin !== 'https://id.starry.phd')
      return json(request,{error:'請從 Starry ID 官網操作 App 權限'},403);
    const session = await sessionUser(request,env);
    if (!session) return json(request,{error:'請先登入 Starry ID'},401);
    // Trust only centrally verified Starry ID administrator authority.
    // The cookie may have been issued for another App, so do not require
    // session.appId === 'starry-id' once sessionUser has authenticated it.
    if (!canManageStarryAppAccess(session))
      return json(request,{error:'只有 Starry ID 超級管理員可以設定 App 權限'},403);
    return handleStarryAppAccessAdminRequest(request,env,session.member.id);
  }

  if (path === '/api/ai-routing' || path === '/api/ai-routing/preview') {
    // A04-01: central administrative staging ONLY, never routes paid/active AI calls.
    if (origin && origin !== 'https://id.starry.phd')
      return json(request, {error:'請從 Starry ID 官方管理頁操作'}, 403);
    const session=await sessionUser(request,env);
    if(!session)return json(request,{error:'請先登入 Starry ID'},401);
    if(!session.isSuperAdmin)return json(request,{error:'只有中央超級管理員可以設定 AI 選型'},403);
    const url=new URL(request.url);
    try {
      if (method==='GET' && path==='/api/ai-routing') {
        const appId=url.searchParams.get('appId')||undefined;
        const taskId=url.searchParams.get('taskId')||undefined;
        return json(request,await readAiRoutingControl(env,appId,taskId));
      }
      if(method!=='POST')return json(request,{error:'Method not allowed'},405);
      if(origin!=='https://id.starry.phd' ||
        !(request.headers.get('Content-Type')||'').toLowerCase().startsWith('application/json'))
        return json(request,{error:'請從 Starry ID 管理頁重新操作'},403);
      const raw=await request.text();
      if(raw.length>8192)return json(request,{error:'資料超過安全限制'},413);
      let input:any;
      try{input=JSON.parse(raw)}catch{return json(request,{error:'JSON 格式錯誤'},400)}
      if(path==='/api/ai-routing/preview')return json(request,await previewAiRouting(env,input));
      return json(request,await saveAiRouting(env,session.member.id,input));
    }catch(e){
      if(e instanceof RoutingInputError)return json(request,{error:e.code},e.httpStatus);
      return json(request,{error:'中央 AI 選型暫時無法存取，請稍後再試'},503);
    }
  }

  if (path === '/api/ai-model-admin' || path === '/api/ai-model-admin/dry-run') {
    // Central manager-only, same-origin JSON API. Does not invoke model providers.
    if (origin && origin !== 'https://id.starry.phd')
      return json(request, { error: '請從 Starry ID 官網操作' }, 403);
    const session = await sessionUser(request, env);
    if (!session) return json(request, { error: '請先登入 Starry ID' }, 401);
    if (!session.isSuperAdmin) return json(request, { error: '只有中央超級管理員可以管理模型' }, 403);
    const url = new URL(request.url);
    if (method === 'GET' && path === '/api/ai-model-admin') {
      try {
        if (url.searchParams.has('secretFor'))
          return json(request, await modelAdminSecretStatus(env, url.searchParams.get('secretFor') || ''));
        return json(request, await modelAdminHistory(env, url.searchParams.get('modelId')));
      } catch (e) {
        if (e instanceof AdminInputError) return json(request, { error: e.code }, e.status);
        return json(request, { error: '管理紀錄暫時無法讀取' }, 503);
      }
    }
    if (method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);
    // Browser mutations need same-origin Origin and JSON to prevent CSRF.
    if (origin !== 'https://id.starry.phd' ||
        !(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json'))
      return json(request, { error: '請從中央管理頁重新操作' }, 403);
    try {
      const raw = await request.text();
      if (raw.length > 8192) return json(request, { error: '資料過大' }, 413);
      let body: any;
      try { body = JSON.parse(raw); } catch { return json(request, { error: 'JSON 格式不正確' }, 400); }
      if (path === '/api/ai-model-admin/dry-run') return json(request, dryRunModelDraft(body));
      return json(request, await applyModelAdminAction(env, session.member.id, body));
    } catch (e) {
      if (e instanceof AdminInputError) return json(request, { error: e.code }, e.status);
      return json(request, { error: '模型儲存失敗，請重新整理後再試' }, 503);
    }
  }

  if (path === '/api/ai-models') {
    // Private Starry ID inventory: never expose model pricing or route status to sibling Apps.
    if (origin && origin !== 'https://id.starry.phd')
      return json(request, { error: '請從 Starry ID 管理頁操作' }, 403);
    const session = await sessionUser(request, env);
    if (!session) return json(request, { error: '請先登入 Starry ID' }, 401);
    if (!session.isSuperAdmin) return json(request, { error: '只有中央超級管理員可以查看模型資料庫' }, 403);
    if (method !== 'GET') return json(request, { error: 'Method not allowed' }, 405);
    try {
      return json(request, await readCentralAiModels(env));
    } catch {
      return json(request, { error: '模型資料庫尚未準備完成，請確認安全資料庫遷移' }, 503);
    }
  }

  if (path === '/api/ai-management') {
    const session=await sessionUser(request,env);
    if(!session)return json(request,{error:'請先登入 Starry ID'},401);
    if(!session.isSuperAdmin)return json(request,{error:'只有超級管理員可以管理 AI'},403);
    if(method==='GET'){
      const [priorities,tasks,audit]=await Promise.all([loadAiPriorities(env),collectAiCatalog(env),recentAiChanges(env)]);
      return json(request,{...priorities,tasks,audit,defaults:DEFAULT_AI_ORDER});
    }
    if(method==='PUT'){
      try{
        const input=await requestBody(request);
        return json(request,{success:true,...await saveAiPriorities(env,session.member.id,input.entries)});
      }catch(error){
        const message=error instanceof Error?error.message:'invalid_ai_task_order';
        return json(request,{error:/^invalid_ai_/.test(message)?'AI 排序內容不正確，請重新整理': '設定暫時無法儲存'},/^invalid_ai_/.test(message)?400:503);
      }
    }
    return json(request,{error:'Method not allowed'},405);
  }

  if (path === '/api/health' && method === 'GET') {
    try {
      const row: any = await db.prepare('SELECT COUNT(*) AS count FROM users').first();
      return json(request, { ok: true, service: 'starry-id', members: Number(row?.count || 0) });
    } catch {
      return json(request, { ok: false, service: 'starry-id' }, 503);
    }
  }

  if (path === '/api/mobile-login/complete' && method === 'POST') {
    try {
      return await completeEchoIosLogin(request, env);
    } catch (error) {
      console.warn('iOS handoff completion failed', { code: error instanceof Error ? error.message : 'unknown' });
      return json(request, { error: '登入服務暫時忙碌，請重試。' }, 503);
    }
  }

  if (path === '/api/google-sync' && method === 'POST') {
    const requestId = crypto.randomUUID();
    let stage = 'credential';
    try {
      const input = await requestBody(request);
      const identity = await verifyGoogleCredential(env, text(input.credential));
      stage = 'member';
      const synced = await syncVerifiedIdentity(env, identity, input.appId || 'starry-id');
      if (!synced.user) throw new Error('member_sync_failed');
      stage = 'session';
      const session = await createSession(db, synced.user.id, synced.appId);
      return json(request, {
        success: true,
        user: synced.user,
        appId: synced.appId,
        sessionExpiresAt: session.expiresAt,
        isSuperAdmin: configuredSuperAdmin(env, synced.user.email)
      }, 200, { 'Set-Cookie': sessionCookie(session.token, session.expiresAt) });
    } catch (error) {
      const code = error instanceof Error ? error.message : 'login_failed';
      const conflict = ['identity_conflict', 'email_conflict'].includes(code);
      const restricted = ['account_inactive', 'app_membership_blocked', 'app_membership_required', 'app_access_denied'].includes(code);
      const unsupported = code === 'unsupported_app';
      // A temporary database/network failure after credential verification
      // must not be presented as an invalid Google account.
      const temporary = !conflict && !restricted && !unsupported &&
        (stage !== 'credential' || code === 'ERR_JWKS_TIMEOUT' || error instanceof TypeError);
      const status = conflict ? 409 : unsupported || restricted ? 403 : temporary ? 503 : 401;
      console.warn('Starry ID login rejected', { requestId, code, stage, status });
      return json(request, {
        requestId,
        code: conflict ? 'IDENTITY_CONFLICT' : unsupported ? 'APP_NOT_ALLOWED' : restricted ? 'ACCOUNT_RESTRICTED' : temporary ? 'LOGIN_SERVICE_UNAVAILABLE' : 'LOGIN_REJECTED',
        error: conflict
          ? '會員身份資料發生衝突，請聯絡管理員。'
          : unsupported
            ? '此應用尚未登記使用 Starry ID。'
            : restricted
              ? (code === 'app_access_denied' ? '您沒有使用權限' : '此會員目前無法使用這個服務。')
              : temporary
                ? '登入服務暫時忙碌，請稍後再試。'
                : 'Google 登入驗證失敗，請重新選擇 Google 帳號。'
      }, status);
    }
  }

  if (path === '/api/session' && method === 'GET') {
    const session = await sessionUser(request, env);
    if (!session) return json(request, { authenticated: false }, 401);
    return json(request, {
      authenticated: true,
      user: session.member,
      appId: session.appId,
      membership: session.membership,
      isSuperAdmin: session.isSuperAdmin,
      sessionExpiresAt: session.expiresAt
    });
  }

  if (path === '/api/profile' && method === 'GET') {
    const session = await sessionUser(request, env);
    if (!session) return json(request, { error: '請先登入 Starry ID' }, 401);
    return json(request, {
      user: session.member,
      appId: session.appId,
      membership: session.membership,
      isSuperAdmin: session.isSuperAdmin
    });
  }

  if (path === '/api/profile' && method === 'PUT') {
    const session = await sessionUser(request, env);
    if (!session) return json(request, { error: '請先登入 Starry ID' }, 401);
    try {
      const changes = await requestBody(request);
      const user = await updateProfile(env, session.member.id, session.member.id, session.appId, changes, session.isSuperAdmin);
      return json(request, { success: true, user });
    } catch (error) {
      if (error instanceof Error && error.message === 'distributor_number_requires_dedicated_endpoint') return json(request, { error: '請使用非直銷商／夫妻綁定專用欄位修改直銷商編號' }, 409);
      console.warn('Starry ID profile update failed', {
        code: error instanceof Error ? error.message : 'unknown'
      });
      return json(request, { error: '會員資料更新失敗，請稍後再試。' }, 503);
    }
  }

  if (path === '/api/admin/member-ranks' && method === 'GET') {
    const session = await sessionUser(request, env);
    if (!session) return json(request, { error: '請先登入 Starry ID' }, 401);
    if (!session.isSuperAdmin) return json(request, { error: '只有超級管理員可以管理全部會員。' }, 403);
    return json(request, await listMemberApprovedRanks(db));
  }

  if (path === '/api/admin/member-selection' && method === 'GET') {
    // Sensitive member-ID snapshots are readable only from the ID console.
    if (origin && origin !== 'https://id.starry.phd')
      return json(request,{error:'請從 Starry ID 官網選取會員'},403);
    // Identical central-super-admin gate to the normal member directory.
    const session = await sessionUser(request, env);
    if (!session) return json(request, { error: '請先登入 Starry ID' }, 401);
    if (!session.isSuperAdmin) return json(request, { error: '只有超級管理員可以管理全部會員。' }, 403);
    const url = new URL(request.url);
    const selection = await listFilteredMemberIds(
      db,url.searchParams.get('search')||'',url.searchParams.get('rank')||''
    );
    if ('error' in selection) return json(request,{error:selection.error},selection.status);
    return json(request,selection,200,{'Cache-Control':'no-store'});
  }

  if (path === '/api/admin/members' && method === 'GET') {
    const session = await sessionUser(request, env);
    if (!session) return json(request, { error: '請先登入 Starry ID' }, 401);
    if (!session.isSuperAdmin) return json(request, { error: '只有超級管理員可以管理全部會員。' }, 403);
    const url = new URL(request.url);
    const search = url.searchParams.get('search') || '';
    const rank = url.searchParams.get('rank') || '';
    const rawOffset = Number(url.searchParams.get('offset') || 0);
    const offset = Number.isSafeInteger(rawOffset) && rawOffset >= 0 ? Math.min(rawOffset, 100000) : 0;
    return json(request, await listMembers(db, search, offset, rank));
  }

  const adminMemberMatch = path.match(/^\/api\/admin\/members\/([^/]+)$/);
  if (adminMemberMatch && (method === 'GET' || method === 'PUT')) {
    const session = await sessionUser(request, env);
    if (!session) return json(request, { error: '請先登入 Starry ID' }, 401);
    if (!session.isSuperAdmin) return json(request, { error: '只有超級管理員可以管理全部會員。' }, 403);
    const targetUserId = decodeURIComponent(adminMemberMatch[1]);
    if (method === 'GET') {
      const member = publicMember(await readMember(db, targetUserId));
      if (!member) return json(request, { error: '找不到會員。' }, 404);
      return json(request, { user: member });
    }
    try {
      const changes = await requestBody(request);
      const user = await updateProfile(env, targetUserId, session.member.id, 'starry-id', changes, true);
      return json(request, { success: true, user });
    } catch (error) {
      if (error instanceof Error && error.message === 'distributor_number_requires_dedicated_endpoint') return json(request, { error: '請使用非直銷商／夫妻綁定專用欄位修改直銷商編號' }, 409);
      console.warn('Starry ID admin profile update failed', {
        code: error instanceof Error ? error.message : 'unknown'
      });
      return json(request, { error: '會員資料更新失敗，請稍後再試。' }, 503);
    }
  }

  if (path === '/api/logout' && method === 'POST') {
    const token = requestSessionToken(request);
    if (token) {
      await ensureSessionSchema(db);
      const tokenHash = await hashToken(token);
      await db.prepare('DELETE FROM auth_sessions WHERE tokenHash=?').bind(tokenHash).run().catch(() => undefined);
    }
    return json(request, { success: true }, 200, { 'Set-Cookie': clearSessionCookie() });
  }

  return json(request, { error: 'Not found' }, 404);
}

export async function handleStarryIdCentral(request: Request, env: StarryEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN) return null;

  if (url.pathname === '/' && request.method.toUpperCase() === 'GET') return servicePage(env);
  if (url.pathname === '/ai-management' && request.method.toUpperCase() === 'GET') return renderStarryAiManagementPage();
  if (url.pathname === '/ai-routing' && request.method.toUpperCase() === 'GET') {
    const session=await sessionUser(request,env);
    if(!session)return new Response('請先登入 Starry ID',{status:401,headers:{'Cache-Control':'no-store'}});
    if(!session.isSuperAdmin)return new Response('只有中央超級管理員可管理 AI',{status:403,headers:{'Cache-Control':'no-store'}});
    return renderStarryAiTaskRoutingPage();
  }
  if (url.pathname === '/ai-model-setup' && request.method.toUpperCase() === 'GET') {
    const session = await sessionUser(request, env);
    if (!session) return new Response('請先登入 Starry ID', { status: 401, headers: { 'Cache-Control':'no-store' } });
    if (!session.isSuperAdmin) return new Response('只有中央超級管理員可查看', { status: 403, headers: { 'Cache-Control':'no-store' } });
    return renderStarryAiModelAdminPage();
  }
  if (url.pathname === '/ai-models' && request.method.toUpperCase() === 'GET') {
    const session = await sessionUser(request, env);
    if (!session) return new Response('請先登入 Starry ID', { status: 401, headers: { 'Cache-Control':'no-store' } });
    if (!session.isSuperAdmin) return new Response('只有中央超級管理員可查看', { status: 403, headers: { 'Cache-Control':'no-store' } });
    return renderStarryAiModelRegistryPage();
  }
  if (url.pathname === '/robots.txt' && request.method.toUpperCase() === 'GET') {
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': NOINDEX }
    });
  }
  if (url.pathname.startsWith('/api/')) return handleApi(request, env, url.pathname);
  return json(request, { error: 'Not found' }, 404);
}
