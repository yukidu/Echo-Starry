import type { Env } from './index';
import { sessionContext } from './starryIdProfileDirectoryRouter';
import { recordAiActivity } from './starryAiManagement';
import { calculateNumerology } from '../src/utils/numerology';

const PUBLIC_HOST = 'id.starry.phd';
const INTERNAL_HOST = 'starry-id.internal';
const APP_ID = 'starry-mirror';
const APP_ORIGINS = new Set(['https://quotes.starry.phd', 'https://mirror.starry.phd']);
const TOKEN_RE = /^[A-Za-z0-9_-]{30,}$/;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const schemaReady = new WeakMap<object, Promise<void>>();

function text(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function json(data: unknown, status = 200, extraHeaders?: HeadersInit) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive'
  });
  if (extraHeaders) for (const [key, value] of new Headers(extraHeaders)) headers.set(key, value);
  return new Response(JSON.stringify(data), { status, headers });
}

function publicCors(request: Request) {
  const origin = request.headers.get('Origin') || '';
  if (!APP_ORIGINS.has(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function bearer(request: Request) {
  const match = request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i);
  return match?.[1] || '';
}

function configuredSuperAdminEmails(env: Env) {
  const raw = text((env as any).STARRY_ID_SUPER_ADMIN_EMAILS);
  return new Set((raw ? raw.split(',') : ['yukidu@gmail.com']).map(value => value.trim().toLowerCase()).filter(Boolean));
}

function reduceNumerologyNumber(value: number) {
  let current = Math.abs(Math.trunc(value));
  while (current > 9 && ![11, 22, 33].includes(current)) {
    current = String(current).split('').reduce((sum, digit) => sum + Number(digit || 0), 0);
  }
  return current || null;
}

function numerologyFromBirthday(birthday: unknown, storedTalent: unknown, storedLife: unknown) {
  const compact = text(birthday).replace(/\D/g, '');
  const digits = compact.length >= 8
    ? compact.slice(0, 8).split('').map(Number).filter(value => value >= 1 && value <= 9)
    : [];
  const counts: Record<string, number> = {};
  for (let value = 1; value <= 9; value++) counts[String(value)] = digits.filter(digit => digit === value).length;
  const missingNumbers = Object.entries(counts).filter(([, count]) => count === 0).map(([value]) => Number(value));
  const lineDefs = [
    [1, 2, 3], [4, 5, 6], [7, 8, 9],
    [1, 4, 7], [2, 5, 8], [3, 6, 9],
    [1, 5, 9], [3, 5, 7]
  ];
  const connections = lineDefs
    .filter(line => line.every(value => counts[String(value)] > 0))
    .map(line => line.join('-'));
  const calculatedLife = digits.length ? reduceNumerologyNumber(digits.reduce((sum, digit) => sum + digit, 0)) : null;
  const talentNumber = text(storedTalent) || null;
  const lifeNumber = text(storedLife) || (calculatedLife == null ? null : String(calculatedLife));
  const hasData = Boolean(digits.length || talentNumber || lifeNumber);
  return hasData ? {
    lifeNumber,
    destinyNumber: lifeNumber,
    talentNumber,
    missingNumbers,
    numberCounts: counts,
    connections
  } : null;
}

async function ensureSchema(env: Env) {
  const db = (env as any).STARRY_ID_DB;
  if (!db) throw new Error('STARRY_ID_DB not bound');
  const key = db as object;
  if (!schemaReady.has(key)) {
    const task = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS app_access_tokens (
        tokenHash TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        appId TEXT NOT NULL,
        expiresAt INTEGER NOT NULL,
        createdAt INTEGER NOT NULL
      )`),
      db.prepare('CREATE INDEX IF NOT EXISTS app_access_tokens_user_app ON app_access_tokens(userId,appId,expiresAt)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS battery_transactions (
        id TEXT PRIMARY KEY,userId TEXT NOT NULL,deltaUnits INTEGER NOT NULL,balanceAfterUnits INTEGER NOT NULL,
        type TEXT NOT NULL,sourceApp TEXT NOT NULL DEFAULT 'echostars',sourceId TEXT,description TEXT NOT NULL,
        actorUserId TEXT,uniqueKey TEXT NOT NULL UNIQUE,createdAt INTEGER NOT NULL,trackId TEXT,commentId TEXT,relatedUserId TEXT,sourceLabel TEXT
      )`),
      db.prepare('CREATE TABLE IF NOT EXISTS battery_accounts (userId TEXT PRIMARY KEY,balanceUnits INTEGER NOT NULL DEFAULT 0,updatedAt INTEGER NOT NULL)')
    ]).then(() => undefined);
    schemaReady.set(key, task);
    task.catch(() => schemaReady.delete(key));
  }
  await schemaReady.get(key);
}

async function batteryBalance(db: any, userId: string) {
  const account: any = await db.prepare('SELECT balanceUnits FROM battery_accounts WHERE userId=? LIMIT 1').bind(userId).first().catch(() => null);
  if (account) return Number(account.balanceUnits || 0);
  const sum: any = await db.prepare('SELECT COALESCE(SUM(deltaUnits),0) AS balanceUnits FROM battery_transactions WHERE userId=?').bind(userId).first();
  const balance = Number(sum?.balanceUnits || 0);
  await db.prepare('INSERT OR REPLACE INTO battery_accounts(userId,balanceUnits,updatedAt) VALUES(?,?,?)').bind(userId,balance,Date.now()).run();
  return balance;
}

async function identityForUser(env: Env, userId: string) {
  const db = (env as any).STARRY_ID_DB;
  const row: any = await db.prepare(`SELECT u.id,u.primaryEmail,u.status,p.name,p.rank,p.approvedRank,p.rankApproved,p.residence,p.center,
      p.joinReason,p.stayReason,p.motto,p.zodiac,p.talentNumber,p.lifeNumber,p.birthday
    FROM users u LEFT JOIN profiles p ON p.userId=u.id WHERE u.id=? LIMIT 1`).bind(userId).first();
  if (!row || text(row.status) !== 'active') return null;
  const adminMembership: any = await db.prepare(`SELECT 1 AS yes FROM app_memberships
    WHERE userId=? AND status='active' AND role='super-admin' LIMIT 1`).bind(userId).first().catch(() => null);
  const isSuperAdmin = Boolean(adminMembership?.yes) || configuredSuperAdminEmails(env).has(text(row.primaryEmail).toLowerCase());
  const balanceUnits = await batteryBalance(db, userId);
  const numerology = numerologyFromBirthday(row.birthday, row.talentNumber, row.lifeNumber);
  return {
    userId: text(row.id),
    birthday: text(row.birthday),
    name: text(row.name),
    rank: text(row.rank),
    approvedRank: text(row.approvedRank),
    rankApproved: Boolean(row.rankApproved),
    isSuperAdmin,
    balanceUnits,
    numerology,
    profile: {
      name: text(row.name),
      rank: text(row.approvedRank || row.rank),
      residence: text(row.residence),
      center: text(row.center),
      joinReason: text(row.joinReason),
      stayReason: text(row.stayReason),
      motto: text(row.motto),
      zodiac: text(row.zodiac),
      talentNumber: row.talentNumber ?? null,
      lifeNumber: row.lifeNumber ?? null
    }
  };
}

async function issueSession(request: Request, env: Env) {
  const cors = publicCors(request);
  if (!cors) return json({ error: 'origin_not_allowed' }, 403);
  const session = await sessionContext(request, env);
  if (!session) return json({ authenticated: false }, 401, cors);
  await ensureSchema(env);
  const identity = await identityForUser(env, session.userId);
  if (!identity) return json({ authenticated: false }, 401, cors);
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const now = Date.now();
  const expiresAt = now + TOKEN_TTL_MS;
  const db = (env as any).STARRY_ID_DB;
  await db.batch([
    db.prepare('DELETE FROM app_access_tokens WHERE expiresAt<=? OR (userId=? AND appId=?)').bind(now, session.userId, APP_ID),
    db.prepare('INSERT INTO app_access_tokens(tokenHash,userId,appId,expiresAt,createdAt) VALUES(?,?,?,?,?)')
      .bind(tokenHash, session.userId, APP_ID, expiresAt, now)
  ]);
  return json({ authenticated: true, token, expiresAt, identity }, 200, cors);
}

async function verifyToken(request: Request, env: Env) {
  await ensureSchema(env);
  const token = bearer(request);
  if (!TOKEN_RE.test(token)) return null;
  const tokenHash = await hashToken(token);
  const db = (env as any).STARRY_ID_DB;
  const row: any = await db.prepare(`SELECT userId,expiresAt FROM app_access_tokens
    WHERE tokenHash=? AND appId=? LIMIT 1`).bind(tokenHash, APP_ID).first();
  if (!row || Number(row.expiresAt || 0) <= Date.now()) return null;
  return identityForUser(env, text(row.userId));
}

// A member may fill a missing birthday inside Mirror without exposing central profile writes
// to the client. Only the bearer token's own profile is editable through this route.
async function saveMirrorBirthday(request: Request, env: Env) {
  const identity: any = await verifyToken(request, env);
  if (!identity) return json({ error: '請先登入 Starry ID' }, 401);
  if (identity.birthday) return json({ success: true, birthday: identity.birthday, alreadySaved: true, numerology: identity.numerology });
  const body = await request.json().catch(() => ({}));
  const birthday = text(body.birthday);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday);
  if (!match) return json({ error: '請選擇有效的出生年月日' }, 400);
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  const now = new Date();
  if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day || date.getTime() > Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())) {
    return json({ error: '出生日期不能是未來日期，請重新選擇' }, 400);
  }
  const n = calculateNumerology(birthday);
  if (!n) return json({ error: '請選擇有效的出生年月日' }, 400);
  const db = (env as any).STARRY_ID_DB;
  const stamp = Date.now();
  const result: any = await db.prepare(`UPDATE profiles
    SET birthday=?,zodiac=?,talentNumber=?,lifeNumber=?,updatedAt=?
    WHERE userId=? AND (birthday IS NULL OR TRIM(birthday)='')`)
    .bind(birthday,n.zodiac,n.talentNumber,n.lifeNumber,stamp,identity.userId).run();
  if (Number(result?.meta?.changes || 0) === 1) {
    await db.prepare(`INSERT INTO profile_audit_logs
      (id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt)
      VALUES (?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),identity.userId,APP_ID,identity.userId,'birthday','',birthday,stamp).run();
  }
  const latest: any = await identityForUser(env, identity.userId);
  return latest?.birthday
    ? json({ success: true, birthday: latest.birthday, numerology: latest.numerology })
    : json({ error: '生日儲存失敗，請稍後再試' }, 503);
}

async function aiContext(request: Request, env: Env) {
  const identity: any = await verifyToken(request, env);
  if (!identity) return json({ error: 'invalid_app_session' }, 401);
  const centralDb = (env as any).STARRY_ID_DB;
  const echoDb = (env as any).DB;
  if (!echoDb) return json({ identity, profile: identity.profile, numerology: identity.numerology, comments: [], listenedTitles: [] });

  const userRow: any = await centralDb.prepare('SELECT primaryEmail FROM users WHERE id=? LIMIT 1').bind(identity.userId).first();
  const legacy: any = await centralDb.prepare(`SELECT sourceUserId FROM legacy_links
    WHERE userId=? AND sourceApp IN ('echostars','Echo-Starry') ORDER BY importedAt DESC LIMIT 1`).bind(identity.userId).first().catch(() => null);
  const email = text(userRow?.primaryEmail);
  const legacyId = text(legacy?.sourceUserId);

  const commentsPromise = email
    ? echoDb.prepare(`SELECT content FROM comments WHERE LOWER(TRIM(authorEmail))=LOWER(TRIM(?))
        AND TRIM(content)<>'' ORDER BY COALESCE(createdAt,0) DESC LIMIT 30`).bind(email).all().catch(() => ({ results: [] }))
    : Promise.resolve({ results: [] });
  const listenedPromise = echoDb.prepare(`SELECT DISTINCT COALESCE(NULLIF(TRIM(pm.trackTitle),''),NULLIF(TRIM(t.title),'')) AS title,
        COALESCE(pm.lastPlayedAt,0) AS playedAt
      FROM playback_memories pm LEFT JOIN tracks t ON t.id=pm.trackId
      WHERE (pm.memberId=? OR pm.memberId=? OR LOWER(TRIM(pm.userIdentifier))=LOWER(TRIM(?)))
        AND COALESCE(NULLIF(TRIM(pm.trackTitle),''),NULLIF(TRIM(t.title),'')) IS NOT NULL
      ORDER BY playedAt DESC LIMIT 30`).bind(identity.userId, legacyId || identity.userId, email || '__none__').all().catch(() => ({ results: [] }));

  const [comments, listened] = await Promise.all([commentsPromise, listenedPromise]);
  return json({
    identity: {
      userId: identity.userId,
      name: identity.name,
      rank: identity.approvedRank || identity.rank,
      isSuperAdmin: identity.isSuperAdmin,
      balanceUnits: identity.balanceUnits
    },
    profile: identity.profile,
    numerology: identity.numerology,
    comments: (comments?.results || []).map((row: any) => text(row.content)).filter(Boolean),
    listenedTitles: (listened?.results || []).map((row: any) => text(row.title)).filter(Boolean)
  });
}

async function adjustBattery(request: Request, env: Env) {
  const identity: any = await verifyToken(request, env);
  if (!identity) return json({ error: 'invalid_app_session' }, 401);
  const input: any = await request.json().catch(() => ({}));
  const deltaUnits = Number(input.deltaUnits);
  const type = text(input.type).slice(0, 80) || 'starry_mirror';
  const sourceId = text(input.sourceId).slice(0, 180);
  const description = text(input.description).slice(0, 180) || '繁星心鏡電池異動';
  const uniqueKey = text(input.uniqueKey).slice(0, 220);
  if (!Number.isSafeInteger(deltaUnits) || Math.abs(deltaUnits) > 100000 || !uniqueKey) return json({ error: 'invalid_battery_request' }, 400);

  await ensureSchema(env);
  const db = (env as any).STARRY_ID_DB;
  const existing: any = await db.prepare(`SELECT deltaUnits,balanceAfterUnits FROM battery_transactions
    WHERE uniqueKey=? LIMIT 1`).bind(uniqueKey).first();
  if (existing) return json({
    success: true,
    duplicate: true,
    deltaUnits: Number(existing.deltaUnits || 0),
    balanceUnits: Number(existing.balanceAfterUnits || 0)
  });

  // Ensure the member account exists, then conditionally insert a transaction
  // and adjust its balance in one atomic D1 batch. This prevents other app
  // requests from overwriting a concurrent balance update.
  await batteryBalance(db, identity.userId);
  const now = Date.now();
  const id = `mirror-${crypto.randomUUID()}`;
  try {
    const results: any[] = await db.batch([
      db.prepare(`INSERT INTO battery_transactions
        (id,userId,deltaUnits,balanceAfterUnits,type,sourceApp,sourceId,description,actorUserId,uniqueKey,createdAt,sourceLabel)
        SELECT ?,a.userId,?,a.balanceUnits+?,?,'starry-mirror',?,?,?,?,?,'繁星心鏡'
        FROM battery_accounts a
        WHERE a.userId=? AND a.balanceUnits+?>=0`)
        .bind(id,deltaUnits,deltaUnits,type,sourceId||null,description,identity.userId,uniqueKey,now,identity.userId,deltaUnits),
      db.prepare(`UPDATE battery_accounts SET balanceUnits=balanceUnits+?,updatedAt=?
        WHERE userId=? AND EXISTS (SELECT 1 FROM battery_transactions WHERE uniqueKey=?)`)
        .bind(deltaUnits,now,identity.userId,uniqueKey)
    ]);
    if(Number(results?.[0]?.meta?.changes||0)!==1){
      const balance = await batteryBalance(db, identity.userId);
      return json({error:'insufficient_battery',balanceUnits:balance},402);
    }
  } catch (error: any) {
    const raced: any = await db.prepare('SELECT deltaUnits,balanceAfterUnits FROM battery_transactions WHERE uniqueKey=? LIMIT 1').bind(uniqueKey).first().catch(() => null);
    if (raced) return json({ success: true, duplicate: true, deltaUnits: Number(raced.deltaUnits || 0), balanceUnits: Number(raced.balanceAfterUnits || 0) });
    throw error;
  }
  const after = await batteryBalance(db, identity.userId);
  return json({ success: true, duplicate: false, deltaUnits, balanceUnits: after });
}

export async function handleStarryMirrorBridge(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (url.hostname === PUBLIC_HOST && url.pathname === '/api/apps/starry-mirror/session') {
    const cors = publicCors(request);
    if (!cors) return json({ error: 'origin_not_allowed' }, 403);
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);
    return issueSession(request, env);
  }

  if (url.hostname !== INTERNAL_HOST) return null;
  if (method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (url.pathname === '/internal/starry-mirror/verify') {
    const identity = await verifyToken(request, env);
    return identity ? json({ authenticated: true, identity }) : json({ authenticated: false }, 401);
  }
  if (url.pathname === '/internal/starry-mirror/context') return aiContext(request, env);
  if (url.pathname === '/internal/starry-mirror/birthday') return saveMirrorBirthday(request, env);
  if (url.pathname === '/internal/starry-mirror/ai-activity') {
    const identity=await verifyToken(request,env);
    if(!identity)return json({error:'invalid_app_session'},401);
    await recordAiActivity(env as any,'mirror.reading');
    return json({ok:true});
  }
  if (url.pathname === '/internal/starry-mirror/battery') return adjustBattery(request, env);
  return json({ error: 'not_found' }, 404);
}
