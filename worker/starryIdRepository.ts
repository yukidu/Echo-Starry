import type { Env } from './index';
import type { VerifiedGoogleIdentity } from './memberRepository';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const STAR_APP_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const authReady = new WeakMap<object, Promise<void>>();

const sharedProfileFields = [
  'name', 'avatar', 'googleAvatar', 'amwayId', 'phone', 'residence', 'center',
  'rank', 'approvedRank', 'rankApproved', 'rankAuditStatus', 'rankAuditType', 'rankUpdatedAt',
  'joinReason', 'stayReason', 'birthday', 'motto', 'zodiac', 'talentNumber', 'lifeNumber',
  'registerDate', 'auditedBy', 'auditedAt'
] as const;

const userEditableFields = new Set([
  'name', 'avatar', 'amwayId', 'phone', 'residence', 'center', 'joinReason', 'stayReason',
  'birthday', 'motto', 'zodiac', 'talentNumber', 'lifeNumber'
]);

function text(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function lower(value: unknown) {
  return text(value).toLowerCase();
}

function asInt(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function appId(value: unknown) {
  const normalized = text(value || 'starry');
  return STAR_APP_RE.test(normalized) ? normalized : 'starry';
}

async function ensureCentralAuthSchema(db: any) {
  if (!db) throw new Error('Starry ID database is unavailable');
  const key = db as object;
  if (!authReady.has(key)) {
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
    authReady.set(key, task);
    task.catch(() => authReady.delete(key));
  }
  await authReady.get(key);
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

function profileValues(row: any, now: number) {
  return {
    userId: text(row.id),
    name: text(row.name),
    avatar: text(row.avatar),
    googleAvatar: text(row.googleAvatar),
    amwayId: text(row.amwayId),
    phone: text(row.phone),
    residence: text(row.residence),
    center: text(row.center),
    rank: text(row.rank),
    approvedRank: text(row.approvedRank),
    rankApproved: row.rankApproved ? 1 : 0,
    rankAuditStatus: text(row.rankAuditStatus),
    rankAuditType: text(row.rankAuditType),
    rankUpdatedAt: text(row.rankUpdatedAt),
    joinReason: text(row.joinReason),
    stayReason: text(row.stayReason),
    birthday: text(row.birthday ?? row.birthDate),
    motto: text(row.motto),
    zodiac: text(row.zodiac),
    talentNumber: asInt(row.talentNumber),
    lifeNumber: asInt(row.lifeNumber),
    registerDate: text(row.registerDate),
    auditedBy: text(row.auditedBy),
    auditedAt: text(row.auditedAt),
    createdAt: now,
    updatedAt: now
  };
}

function publicCentralMember(row: any) {
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

async function readCentralMember(db: any, userId: string) {
  return db.prepare(`SELECT u.id,u.primaryEmail,u.status,
      p.name,p.avatar,p.googleAvatar,p.amwayId,p.phone,p.residence,p.center,
      p.rank,p.approvedRank,p.rankApproved,p.rankAuditStatus,p.rankAuditType,p.rankUpdatedAt,
      p.joinReason,p.stayReason,p.birthday,p.motto,p.zodiac,p.talentNumber,p.lifeNumber,p.registerDate
    FROM users u LEFT JOIN profiles p ON p.userId=u.id WHERE u.id=? LIMIT 1`).bind(userId).first();
}

export async function syncEchoMemberToStarry(
  env: Env,
  userId: string,
  actorUserId = 'system',
  verifiedIdentity?: VerifiedGoogleIdentity
) {
  if (!env.DB || !env.STARRY_ID_DB) return false;
  const source: any = await env.DB.prepare('SELECT * FROM users WHERE id=? LIMIT 1').bind(userId).first();
  if (!source) return false;

  const central = env.STARRY_ID_DB;
  const now = Date.now();
  const email = lower(source.email || verifiedIdentity?.email);
  if (!email) throw new Error('Starry ID sync requires an email');
  const subject = text(verifiedIdentity?.subject || source.googleSubject);

  const emailOwner: any = await central.prepare('SELECT id FROM users WHERE LOWER(TRIM(primaryEmail))=? LIMIT 1').bind(email).first();
  if (emailOwner && text(emailOwner.id) !== text(source.id)) throw new Error('Starry ID email belongs to another user');
  if (subject) {
    const subjectOwner: any = await central.prepare("SELECT userId FROM identities WHERE provider='google' AND providerSubject=? LIMIT 1")
      .bind(subject).first();
    if (subjectOwner && text(subjectOwner.userId) !== text(source.id)) throw new Error('Starry ID Google identity belongs to another user');
  }

  const oldProfile: any = await central.prepare('SELECT * FROM profiles WHERE userId=? LIMIT 1').bind(source.id).first();
  const p = profileValues(source, now);
  const profileColumns = ['userId', ...sharedProfileFields, 'createdAt', 'updatedAt'];
  const profileParams = profileColumns.map(key => (p as any)[key]);
  const profileUpdates = [...sharedProfileFields, 'updatedAt'].map(key => `${key}=excluded.${key}`).join(',');

  const statements: any[] = [
    central.prepare(`INSERT INTO users (id,primaryEmail,status,createdAt,updatedAt)
      VALUES (?,?,'active',?,?) ON CONFLICT(id) DO UPDATE SET primaryEmail=excluded.primaryEmail,updatedAt=excluded.updatedAt`)
      .bind(source.id, email, now, now),
    central.prepare(`INSERT INTO profiles (${profileColumns.join(',')}) VALUES (${profileColumns.map(() => '?').join(',')})
      ON CONFLICT(userId) DO UPDATE SET ${profileUpdates}`).bind(...profileParams),
    central.prepare(`INSERT INTO app_memberships
      (userId,appId,status,role,isAdminUser,isContributor,canUpload,joinedAt,updatedAt)
      VALUES (?,'echostars',?,?,?,?,?,?,?)
      ON CONFLICT(userId,appId) DO UPDATE SET status=excluded.status,role=excluded.role,isAdminUser=excluded.isAdminUser,
        isContributor=excluded.isContributor,canUpload=excluded.canUpload,updatedAt=excluded.updatedAt`)
      .bind(source.id, source.isBlocked ? 'blocked' : 'active', text(source.role), source.isAdminUser ? 1 : 0,
        source.isContributor ? 1 : 0, (source.canUpload || source.isContributor) ? 1 : 0,
        Number.isFinite(Date.parse(source.registerDate || '')) ? Date.parse(source.registerDate) : now, now),
    central.prepare(`INSERT INTO legacy_links (sourceApp,sourceUserId,userId,sourceEmail,importedAt)
      VALUES ('echostars',?,?,?,?) ON CONFLICT(sourceApp,sourceUserId) DO UPDATE SET
      userId=excluded.userId,sourceEmail=excluded.sourceEmail,importedAt=excluded.importedAt`)
      .bind(source.id, source.id, email, now)
  ];

  if (subject) {
    statements.splice(1, 0, central.prepare(`INSERT INTO identities
      (provider,providerSubject,userId,providerEmail,emailVerified,createdAt,lastSeenAt)
      VALUES ('google',?,?,?,1,?,?) ON CONFLICT(provider,providerSubject) DO UPDATE SET
      userId=excluded.userId,providerEmail=excluded.providerEmail,emailVerified=1,lastSeenAt=excluded.lastSeenAt`)
      .bind(subject, source.id, email, now, now));
  }

  if (oldProfile) {
    for (const field of sharedProfileFields) {
      const before = oldProfile[field] == null ? '' : String(oldProfile[field]);
      const afterValue = (p as any)[field];
      const after = afterValue == null ? '' : String(afterValue);
      if (before === after) continue;
      statements.push(central.prepare(`INSERT INTO profile_audit_logs
        (id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt) VALUES (?,?,?,?,?,?,?,?)`)
        .bind(crypto.randomUUID(), source.id, 'echostars', actorUserId || source.id, field, before, after, now));
    }
  }

  await central.batch(statements);
  return true;
}

export async function syncVerifiedStarryIdentity(env: Env, identity: VerifiedGoogleIdentity, requestedAppId: string) {
  if (!env.STARRY_ID_DB) throw new Error('Starry ID database is unavailable');
  const db = env.STARRY_ID_DB;
  const now = Date.now();
  const app = appId(requestedAppId);
  const email = lower(identity.email);

  const bySubject: any = await db.prepare("SELECT userId FROM identities WHERE provider='google' AND providerSubject=? LIMIT 1")
    .bind(identity.subject).first();
  const byEmail: any = await db.prepare('SELECT id FROM users WHERE LOWER(TRIM(primaryEmail))=? LIMIT 1').bind(email).first();
  if (bySubject && byEmail && text(bySubject.userId) !== text(byEmail.id)) throw new Error('Starry ID identity conflict');

  const userId = text(bySubject?.userId || byEmail?.id) || `u-${crypto.randomUUID()}`;
  const existing: any = await readCentralMember(db, userId);
  if (existing?.status && existing.status !== 'active') throw new Error('Starry ID account is not active');

  const otherEmailOwner: any = await db.prepare('SELECT id FROM users WHERE LOWER(TRIM(primaryEmail))=? AND id<>? LIMIT 1')
    .bind(email, userId).first();
  if (otherEmailOwner) throw new Error('Starry ID email conflict');

  const statements: any[] = [
    db.prepare(`INSERT INTO users (id,primaryEmail,status,createdAt,updatedAt) VALUES (?,?,'active',?,?)
      ON CONFLICT(id) DO UPDATE SET primaryEmail=excluded.primaryEmail,updatedAt=excluded.updatedAt`)
      .bind(userId, email, now, now),
    db.prepare(`INSERT INTO identities (provider,providerSubject,userId,providerEmail,emailVerified,createdAt,lastSeenAt)
      VALUES ('google',?,?,?,1,?,?) ON CONFLICT(provider,providerSubject) DO UPDATE SET
      userId=excluded.userId,providerEmail=excluded.providerEmail,emailVerified=1,lastSeenAt=excluded.lastSeenAt`)
      .bind(identity.subject, userId, email, now, now),
    db.prepare(`INSERT INTO profiles (userId,name,avatar,googleAvatar,createdAt,updatedAt)
      VALUES (?,?,?,?,?,?) ON CONFLICT(userId) DO UPDATE SET
      name=CASE WHEN TRIM(COALESCE(profiles.name,''))='' THEN excluded.name ELSE profiles.name END,
      avatar=CASE WHEN TRIM(COALESCE(profiles.avatar,''))='' THEN excluded.avatar ELSE profiles.avatar END,
      googleAvatar=excluded.googleAvatar,updatedAt=excluded.updatedAt`)
      .bind(userId, identity.name, identity.avatar, identity.avatar, now, now),
    db.prepare(`INSERT INTO app_memberships (userId,appId,status,role,isAdminUser,isContributor,canUpload,joinedAt,updatedAt)
      VALUES (?,?,'active','member',0,0,0,?,?) ON CONFLICT(userId,appId) DO UPDATE SET
      status=CASE WHEN app_memberships.status='blocked' THEN app_memberships.status ELSE 'active' END,updatedAt=excluded.updatedAt`)
      .bind(userId, app, now, now)
  ];
  await db.batch(statements);
  return publicCentralMember(await readCentralMember(db, userId));
}

export async function createStarrySession(env: Env, userId: string, requestedAppId: string) {
  if (!env.STARRY_ID_DB) throw new Error('Starry ID database is unavailable');
  const db = env.STARRY_ID_DB;
  await ensureCentralAuthSchema(db);
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const token = bytesToBase64Url(raw);
  const tokenHash = await hashToken(token);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;
  await db.batch([
    db.prepare('DELETE FROM auth_sessions WHERE expiresAt<=?').bind(now),
    db.prepare('INSERT INTO auth_sessions (tokenHash,userId,appId,expiresAt,createdAt) VALUES (?,?,?,?,?)')
      .bind(tokenHash, userId, appId(requestedAppId), expiresAt, now)
  ]);
  return { token, expiresAt };
}

export async function starrySessionUser(request: Request, env: Env) {
  if (!env.STARRY_ID_DB) return null;
  const match = request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i);
  if (!match) return null;
  const db = env.STARRY_ID_DB;
  await ensureCentralAuthSchema(db);
  const tokenHash = await hashToken(match[1]);
  const session: any = await db.prepare(`SELECT userId,appId,expiresAt FROM auth_sessions WHERE tokenHash=? LIMIT 1`)
    .bind(tokenHash).first();
  if (!session) return null;
  if (Number(session.expiresAt || 0) <= Date.now()) {
    await db.prepare('DELETE FROM auth_sessions WHERE tokenHash=?').bind(tokenHash).run().catch(() => undefined);
    return null;
  }
  const member: any = await readCentralMember(db, session.userId);
  if (!member || member.status !== 'active') return null;
  return { member: publicCentralMember(member), appId: session.appId, expiresAt: Number(session.expiresAt), tokenHash };
}

export async function logoutStarrySession(request: Request, env: Env) {
  if (!env.STARRY_ID_DB) return;
  const match = request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i);
  if (!match) return;
  await ensureCentralAuthSchema(env.STARRY_ID_DB);
  const tokenHash = await hashToken(match[1]);
  await env.STARRY_ID_DB.prepare('DELETE FROM auth_sessions WHERE tokenHash=?').bind(tokenHash).run();
}

export async function updateStarryProfile(env: Env, userId: string, actorUserId: string, sourceAppId: string, changes: any) {
  if (!env.STARRY_ID_DB) throw new Error('Starry ID database is unavailable');
  const db = env.STARRY_ID_DB;
  const current: any = await db.prepare('SELECT * FROM profiles WHERE userId=? LIMIT 1').bind(userId).first();
  if (!current) throw new Error('Starry ID profile not found');

  const allowed: Record<string, any> = {};
  for (const [key, value] of Object.entries(changes || {})) {
    if (!userEditableFields.has(key)) continue;
    allowed[key] = key === 'talentNumber' || key === 'lifeNumber' ? asInt(value) : text(value);
  }
  const keys = Object.keys(allowed);
  if (!keys.length) return publicCentralMember(await readCentralMember(db, userId));

  const now = Date.now();
  const statements: any[] = [];
  for (const key of keys) {
    const before = current[key] == null ? '' : String(current[key]);
    const after = allowed[key] == null ? '' : String(allowed[key]);
    if (before === after) continue;
    statements.push(db.prepare(`UPDATE profiles SET ${key}=?,updatedAt=? WHERE userId=?`).bind(allowed[key], now, userId));
    statements.push(db.prepare(`INSERT INTO profile_audit_logs
      (id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt) VALUES (?,?,?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), userId, appId(sourceAppId), actorUserId || userId, key, before, after, now));
  }
  if (statements.length) await db.batch(statements);

  // Transition-period dual write: existing EchoStars members keep their legacy profile synchronized.
  if (env.DB) {
    const legacy: any = await env.DB.prepare('SELECT id FROM users WHERE id=? LIMIT 1').bind(userId).first();
    if (legacy) {
      const legacyKeys = keys.filter(key => key !== 'googleAvatar');
      if (legacyKeys.length) {
        const sql = `UPDATE users SET ${legacyKeys.map(key => `${key}=?`).join(',')} WHERE id=?`;
        await env.DB.prepare(sql).bind(...legacyKeys.map(key => allowed[key]), userId).run();
      }
    }
  }

  return publicCentralMember(await readCentralMember(db, userId));
}
