import type { Env } from './index';
import { PROFILE_OPTIONS, sessionContext } from './starryIdProfileDirectoryRouter';

const STAR_DOMAIN = 'id.starry.phd';
const schemaReady = new WeakMap<object, Promise<void>>();
const PLATINUM_PLUS = new Set([
  '白金','紅寶石','創辦人白金','創辦人紅寶石','藍寶石','創辦人藍寶石','明珠','翡翠','創辦人翡翠',
  '鑽石級以上','鑽石','創辦人鑽石','執行專才鑽石','創辦人執行專才鑽石','雙鑽石','創辦人雙鑽石',
  '參鑽石','創辦人參鑽石','皇冠','創辦人皇冠','皇冠大使','創辦人皇冠大使'
]);
const RESERVED = new Set(['','api','robots.txt','login','logout','admin','my-card','notifications','starry-id-v230.js','starry-id-sw.js','manifest.webmanifest','favicon.ico','assets']);

function text(value: unknown) { return value == null ? '' : String(value).trim(); }
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive'
    }
  });
}
function html(source: string, status = 200) {
  return new Response(source, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow, noarchive'
    }
  });
}
function script(source: string, contentType = 'text/javascript; charset=utf-8') {
  return new Response(source, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive'
    }
  });
}
function b64url(bytes: Uint8Array) {
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function b64urlDecode(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, ch => ch.charCodeAt(0));
}
function effectiveRank(row: any) {
  const approved = text(row?.approvedRank);
  if (approved) return approved;
  return Number(row?.rankApproved || 0) === 1 ? text(row?.rank) : '';
}
function safeMetadata(value: unknown) {
  try { return JSON.stringify(value ?? {}); } catch { return '{}'; }
}
function parseMetadata(value: unknown) {
  try { return JSON.parse(text(value) || '{}'); } catch { return {}; }
}

async function ensureSchema(env: Env) {
  const db = (env as any).STARRY_ID_DB;
  if (!db) throw new Error('STARRY_ID_DB not bound');
  const key = db as object;
  if (!schemaReady.has(key)) {
    const task = (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS starry_notifications (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        metadata TEXT NOT NULL DEFAULT '{}',
        isRead INTEGER NOT NULL DEFAULT 0,
        createdAt INTEGER NOT NULL
      )`).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS starry_notifications_user_time ON starry_notifications(userId,createdAt DESC)').run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS card_visit_events (
        id TEXT PRIMARY KEY,
        ownerUserId TEXT NOT NULL,
        viewerUserId TEXT,
        viewerName TEXT NOT NULL DEFAULT '',
        viewerRank TEXT NOT NULL DEFAULT '',
        ip TEXT NOT NULL DEFAULT '',
        region TEXT NOT NULL DEFAULT '',
        deviceOs TEXT NOT NULL DEFAULT '',
        userAgent TEXT NOT NULL DEFAULT '',
        createdAt INTEGER NOT NULL
      )`).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS card_visit_events_owner_time ON card_visit_events(ownerUserId,createdAt DESC)').run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS starry_push_subscriptions (
        endpoint TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        p256dh TEXT NOT NULL DEFAULT '',
        auth TEXT NOT NULL DEFAULT '',
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )`).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS starry_push_subscriptions_user ON starry_push_subscriptions(userId)').run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS starry_push_vapid (
        id INTEGER PRIMARY KEY CHECK(id=1),
        publicJwk TEXT NOT NULL,
        privateJwk TEXT NOT NULL,
        publicKey TEXT NOT NULL,
        createdAt INTEGER NOT NULL
      )`).run();
    })();
    schemaReady.set(key, task);
    task.catch(() => schemaReady.delete(key));
  }
  await schemaReady.get(key);
}

async function profile(db: any, userId: string) {
  return db.prepare(`SELECT u.id,u.primaryEmail,u.status,p.name,p.rank,p.approvedRank,p.rankApproved,p.rankAuditStatus,p.rankAuditType,p.rankUpdatedAt
    FROM users u LEFT JOIN profiles p ON p.userId=u.id WHERE u.id=? LIMIT 1`).bind(userId).first();
}

async function vapidConfig(env: Env) {
  await ensureSchema(env);
  const db = (env as any).STARRY_ID_DB;
  let row: any = await db.prepare('SELECT publicJwk,privateJwk,publicKey FROM starry_push_vapid WHERE id=1').first();
  if (row) return row;
  const pair: CryptoKeyPair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const publicJwk: any = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privateJwk: any = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const x = b64urlDecode(publicJwk.x || '');
  const y = b64urlDecode(publicJwk.y || '');
  const bytes = new Uint8Array(65); bytes[0] = 4; bytes.set(x, 1); bytes.set(y, 33);
  const publicKey = b64url(bytes);
  await db.prepare(`INSERT OR IGNORE INTO starry_push_vapid(id,publicJwk,privateJwk,publicKey,createdAt) VALUES(1,?,?,?,?)`)
    .bind(JSON.stringify(publicJwk), JSON.stringify(privateJwk), publicKey, Date.now()).run();
  row = await db.prepare('SELECT publicJwk,privateJwk,publicKey FROM starry_push_vapid WHERE id=1').first();
  if (!row) throw new Error('vapid_config_unavailable');
  return row;
}

async function vapidAuthorization(endpoint: string, config: any) {
  const audience = new URL(endpoint).origin;
  const header = b64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 10, sub: 'mailto:starry@starry.phd' })));
  const unsigned = `${header}.${payload}`;
  const privateKey = await crypto.subtle.importKey('jwk', JSON.parse(config.privateJwk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signed = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(unsigned)));
  return `vapid t=${unsigned}.${b64url(signed)}, k=${config.publicKey}`;
}

async function pushUser(env: Env, userId: string) {
  try {
    await ensureSchema(env);
    const db = (env as any).STARRY_ID_DB;
    const config = await vapidConfig(env);
    const rows: any = await db.prepare('SELECT endpoint FROM starry_push_subscriptions WHERE userId=?').bind(userId).all();
    for (const row of rows?.results || []) {
      const endpoint = text(row.endpoint);
      if (!endpoint) continue;
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            TTL: '120',
            Urgency: 'normal',
            Authorization: await vapidAuthorization(endpoint, config)
          },
          signal: AbortSignal.timeout(2500)
        });
        if (response.status === 404 || response.status === 410) {
          await db.prepare('DELETE FROM starry_push_subscriptions WHERE endpoint=?').bind(endpoint).run();
        }
      } catch { /* best effort */ }
    }
  } catch { /* push must never break profile actions */ }
}

export async function createStarryNotification(env: Env, userId: string, type: string, title: string, body = '', metadata: unknown = {}) {
  if (!userId) return;
  await ensureSchema(env);
  const db = (env as any).STARRY_ID_DB;
  await db.prepare(`INSERT INTO starry_notifications(id,userId,type,title,body,metadata,isRead,createdAt) VALUES(?,?,?,?,?,?,0,?)`)
    .bind(crypto.randomUUID(), userId, type, title, body, safeMetadata(metadata), Date.now()).run();
  await pushUser(env, userId);
}

function configuredSuperAdminEmails(env: Env) {
  const raw = text((env as any).STARRY_ID_SUPER_ADMIN_EMAILS);
  return new Set((raw ? raw.split(',') : ['yukidu@gmail.com']).map(v => v.trim().toLowerCase()).filter(Boolean));
}
async function superAdminIds(env: Env) {
  const db = (env as any).STARRY_ID_DB;
  const emails = configuredSuperAdminEmails(env);
  const rows: any = await db.prepare(`SELECT DISTINCT u.id,u.primaryEmail,m.role
    FROM users u LEFT JOIN app_memberships m ON m.userId=u.id AND m.appId='starry-id'
    WHERE u.status='active'`).all();
  return (rows?.results || []).filter((r: any) => r.role === 'super-admin' || emails.has(text(r.primaryEmail).toLowerCase())).map((r: any) => text(r.id)).filter(Boolean);
}
async function activeSpouseId(db: any, userId: string) {
  const row: any = await db.prepare(`SELECT CASE WHEN userA=? THEN userB ELSE userA END AS partnerId
    FROM spouse_links WHERE status='active' AND (userA=? OR userB=?) LIMIT 1`).bind(userId, userId, userId).first().catch(() => null);
  return text(row?.partnerId);
}
async function leadershipUser(db: any, userId: string) {
  const row: any = await db.prepare('SELECT rank,approvedRank,rankApproved FROM profiles WHERE userId=? LIMIT 1').bind(userId).first();
  return PLATINUM_PLUS.has(effectiveRank(row));
}
async function directUplineIds(db: any, targetUserId: string) {
  const rows: any = await db.prepare(`SELECT DISTINCT relatedUserId FROM member_relationships
    WHERE userId=? AND relationType IN ('platinum_upline','diamond_upline') AND relatedUserId IS NOT NULL`).bind(targetUserId).all();
  const ids = new Set<string>();
  for (const row of rows?.results || []) {
    const id = text(row.relatedUserId); if (!id) continue;
    ids.add(id); const spouse = await activeSpouseId(db, id); if (spouse) ids.add(spouse);
  }
  return [...ids];
}
async function reviewerIds(env: Env, targetUserId: string) {
  const db = (env as any).STARRY_ID_DB;
  const ids = new Set<string>(await superAdminIds(env));
  for (const id of await directUplineIds(db, targetUserId)) if (await leadershipUser(db, id)) ids.add(id);
  ids.delete(targetUserId);
  return [...ids];
}
async function canReview(env: Env, session: any, targetUserId: string) {
  if (session?.isSuperAdmin) return true;
  const db = (env as any).STARRY_ID_DB;
  if (!await leadershipUser(db, session.userId)) return false;
  const own = new Set([session.userId]);
  const spouse = await activeSpouseId(db, session.userId); if (spouse) own.add(spouse);
  const uplines = await directUplineIds(db, targetUserId);
  return uplines.some(id => own.has(id));
}

export async function captureSpouseNotificationContext(request: Request, env: Env) {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN || !['/api/spouse-action','/api/distributor-number'].includes(url.pathname) || !['POST','PUT'].includes(request.method.toUpperCase())) return null;
  const session = await sessionContext(request, env); if (!session) return null;
  const db = (env as any).STARRY_ID_DB; if (!db) return null;
  const input: any = await request.clone().json().catch(() => ({}));
  let partnerId = '';
  const current: any = await db.prepare(`SELECT CASE WHEN userA=? THEN userB ELSE userA END AS partnerId
    FROM spouse_links WHERE (userA=? OR userB=?) AND status IN ('pending','active','unlink_pending') LIMIT 1`).bind(session.userId, session.userId, session.userId).first().catch(() => null);
  partnerId = text(current?.partnerId);
  if (!partnerId && url.pathname === '/api/distributor-number' && input.confirmSpouse === true) {
    const number = text(input.number);
    const other: any = number ? await db.prepare('SELECT userId FROM profiles WHERE amwayId=? AND userId<>? LIMIT 1').bind(number, session.userId).first() : null;
    partnerId = text(other?.userId);
  }
  return { actorId: session.userId, partnerId, action: text(input.action), path: url.pathname };
}

export async function notifySpouseMutation(env: Env, context: any, response: Response) {
  if (!context || !response.ok) return;
  const data: any = await response.clone().json().catch(() => null);
  if (!data || (!data.success && !data.spouseLinked)) return;
  const db = (env as any).STARRY_ID_DB;
  let partnerId = text(context.partnerId);
  if (!partnerId) {
    const current: any = await db.prepare(`SELECT CASE WHEN userA=? THEN userB ELSE userA END AS partnerId
      FROM spouse_links WHERE (userA=? OR userB=?) AND status IN ('pending','active','unlink_pending') LIMIT 1`).bind(context.actorId, context.actorId, context.actorId).first().catch(() => null);
    partnerId = text(current?.partnerId);
  }
  const unlinked = data.status === 'unlinked' || context.action === 'unlink' || context.action === 'request-unlink' || context.action === 'admin-unlink';
  const title = unlinked ? '夫妻關係已解除' : '夫妻關係通知';
  const body = unlinked ? '夫妻綁定已解除，會員編號已依最新設定更新。' : (data.spouseLinked || data.status === 'active' ? '夫妻關係已建立。' : '夫妻關係有新的處理進度。');
  await createStarryNotification(env, context.actorId, 'spouse', title, body, { status: data.status || (data.spouseLinked ? 'active' : '') });
  if (partnerId && partnerId !== context.actorId) await createStarryNotification(env, partnerId, 'spouse', title, body, { status: data.status || (data.spouseLinked ? 'active' : '') });
}

export async function notifyRankMutation(request: Request, env: Env, response: Response) {
  const url = new URL(request.url);
  if (!response.ok || request.method.toUpperCase() !== 'PUT' || !['/api/profile-rank','/api/profile'].includes(url.pathname)) return;
  const input: any = await request.clone().json().catch(() => ({}));
  if (url.pathname === '/api/profile' && !(input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).length === 1 && Object.prototype.hasOwnProperty.call(input, 'rank'))) return;
  const session = await sessionContext(request, env); if (!session) return;
  const result: any = await response.clone().json().catch(() => null); if (!result?.success) return;
  const targetUserId = text(input.targetUserId) || session.userId;
  const rank = text(result.rank || input.value || input.rank);
  if (result.rankAuditStatus === 'pending') {
    await createStarryNotification(env, targetUserId, 'rank', '獎銜變更已送出', `你已提交獎銜變更 ${rank}，等待人工審核中。`, { rank, status: 'pending' });
    for (const reviewer of await reviewerIds(env, targetUserId)) await createStarryNotification(env, reviewer, 'rank-review', '有新的獎銜審核', '你的下線有新的獎銜變更等待審核。', { targetUserId, rank });
  } else if (result.rankAuditStatus === 'approved' && targetUserId !== session.userId) {
    await createStarryNotification(env, targetUserId, 'rank', '獎銜審核完成', `你的獎銜已更新為 ${rank}。`, { rank, status: 'approved' });
  }
}

function deviceOs(userAgent: string) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/Windows/i.test(userAgent)) return 'Windows';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'macOS';
  if (/CrOS/i.test(userAgent)) return 'ChromeOS';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return '其他';
}
function regionOf(request: Request) {
  const cf: any = (request as any).cf || {};
  return [text(cf.city), text(cf.region), text(cf.country || request.headers.get('CF-IPCountry'))].filter(Boolean).join(' / ') || '未知地區';
}

export async function observeStarryIdPublicCardVisit(request: Request, env: Env) {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN || request.method.toUpperCase() !== 'GET') return;
  const accept = request.headers.get('Accept') || '';
  if (accept && !accept.includes('text/html') && !accept.includes('*/*')) return;
  const ua = text(request.headers.get('User-Agent')).slice(0, 350);
  if (/bot|spider|crawler|headless|preview/i.test(ua)) return;
  const slug = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ''));
  if (!slug || RESERVED.has(slug) || slug.includes('/')) return;
  const db = (env as any).STARRY_ID_DB; if (!db) return;
  await ensureSchema(env);
  const owner: any = await db.prepare('SELECT userId FROM public_cards WHERE slug=? LIMIT 1').bind(slug).first().catch(() => null);
  const ownerUserId = text(owner?.userId); if (!ownerUserId) return;
  const session = await sessionContext(request, env).catch(() => null);
  const viewerUserId = text(session?.userId);
  if (viewerUserId && viewerUserId === ownerUserId) return;
  let viewerName = '', viewerRank = '';
  if (viewerUserId) { const viewer: any = await profile(db, viewerUserId); viewerName = text(viewer?.name); viewerRank = effectiveRank(viewer); }
  const ip = text(request.headers.get('CF-Connecting-IP')) || '未知';
  const now = Date.now();
  const duplicate: any = await db.prepare(`SELECT id FROM card_visit_events WHERE ownerUserId=? AND COALESCE(viewerUserId,'')=? AND ip=? AND createdAt>? LIMIT 1`)
    .bind(ownerUserId, viewerUserId, ip, now - 60_000).first().catch(() => null);
  if (duplicate) return;
  const region = regionOf(request), os = deviceOs(ua);
  await db.prepare(`INSERT INTO card_visit_events(id,ownerUserId,viewerUserId,viewerName,viewerRank,ip,region,deviceOs,userAgent,createdAt)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), ownerUserId, viewerUserId || null, viewerName, viewerRank, ip, region, os, ua, now).run();
  const who = viewerName ? `${viewerName}${viewerRank ? ` ${viewerRank}` : ''}` : '一位訪客';
  await createStarryNotification(env, ownerUserId, 'card-view', '你的電子名片有人瀏覽', `${who} 瀏覽了你的電子名片。`, { ip, region, deviceOs: os, viewerName, viewerRank, createdAt: now });
  await db.prepare('DELETE FROM card_visit_events WHERE createdAt<?').bind(now - 90 * 24 * 60 * 60 * 1000).run().catch(() => undefined);
}

async function notificationFeed(request: Request, env: Env) {
  const session = await sessionContext(request, env); if (!session) return json({ error: '請先登入 Starry ID' }, 401);
  await ensureSchema(env);
  const db = (env as any).STARRY_ID_DB;
  const me: any = await profile(db, session.userId);
  const notices: any = await db.prepare(`SELECT id,type,title,body,metadata,isRead,createdAt FROM starry_notifications
    WHERE userId=? ORDER BY createdAt DESC LIMIT 120`).bind(session.userId).all();
  const visits: any = await db.prepare(`SELECT id,viewerUserId,viewerName,viewerRank,ip,region,deviceOs,createdAt FROM card_visit_events
    WHERE ownerUserId=? ORDER BY createdAt DESC LIMIT 120`).bind(session.userId).all();
  const reviews: any[] = [];
  const pending: any = await db.prepare(`SELECT u.id,p.name,p.rank,p.approvedRank,p.rankApproved,p.rankAuditStatus,p.center,p.amwayId,p.rankUpdatedAt
    FROM users u JOIN profiles p ON p.userId=u.id WHERE u.status='active' AND p.rankAuditStatus='pending' ORDER BY p.rankUpdatedAt DESC`).all();
  for (const row of pending?.results || []) {
    if (await canReview(env, session, text(row.id))) reviews.push({
      id: text(row.id), name: text(row.name), center: text(row.center), amwayId: text(row.amwayId),
      approvedRank: effectiveRank(row), pendingRank: text(row.rank), rankUpdatedAt: text(row.rankUpdatedAt)
    });
  }
  const unread = (notices?.results || []).filter((n: any) => !Number(n.isRead || 0)).length;
  return json({
    unread,
    isSuperAdmin: Boolean(session.isSuperAdmin),
    rankStatus: {
      approvedRank: effectiveRank(me),
      pendingRank: text(me?.rankAuditStatus) === 'pending' ? text(me?.rank) : '',
      status: text(me?.rankAuditStatus) || (Number(me?.rankApproved || 0) === 1 ? 'approved' : '')
    },
    notifications: (notices?.results || []).map((n: any) => ({ ...n, metadata: parseMetadata(n.metadata) })),
    visits: visits?.results || [],
    reviews,
    rankOptions: [...PROFILE_OPTIONS.rank]
  });
}

async function markRead(request: Request, env: Env) {
  const session = await sessionContext(request, env); if (!session) return json({ error: '請先登入 Starry ID' }, 401);
  await ensureSchema(env);
  const db = (env as any).STARRY_ID_DB;
  const input: any = await request.clone().json().catch(() => ({}));
  if (text(input.id)) await db.prepare('UPDATE starry_notifications SET isRead=1 WHERE id=? AND userId=?').bind(text(input.id), session.userId).run();
  else await db.prepare('UPDATE starry_notifications SET isRead=1 WHERE userId=?').bind(session.userId).run();
  return json({ success: true });
}

async function reviewRank(request: Request, env: Env) {
  const session = await sessionContext(request, env); if (!session) return json({ error: '請先登入 Starry ID' }, 401);
  const origin = request.headers.get('Origin'); if (origin && origin !== new URL(request.url).origin) return json({ error: 'Origin not allowed' }, 403);
  const input: any = await request.clone().json().catch(() => ({}));
  const targetUserId = text(input.targetUserId), rank = text(input.rank);
  if (!targetUserId || !(PROFILE_OPTIONS.rank as readonly string[]).includes(rank)) return json({ error: '請選擇有效的獎銜' }, 400);
  if (!await canReview(env, session, targetUserId)) return json({ error: '你沒有審核這位會員的權限' }, 403);
  const db = (env as any).STARRY_ID_DB;
  const current: any = await profile(db, targetUserId); if (!current) return json({ error: '找不到會員' }, 404);
  const now = Date.now(), iso = new Date(now).toISOString();
  await db.prepare(`UPDATE profiles SET rank=?,approvedRank=?,rankApproved=1,rankAuditStatus='approved',rankAuditType=?,rankUpdatedAt=?,updatedAt=? WHERE userId=?`)
    .bind(rank, rank, session.isSuperAdmin ? 'super-admin-review' : 'upline-review', iso, now, targetUserId).run();
  if ((env as any).DB) {
    await (env as any).DB.prepare(`UPDATE users SET rank=?,approvedRank=?,rankApproved=1,rankAuditStatus='approved',rankAuditType=?,rankUpdatedAt=? WHERE id=?`)
      .bind(rank, rank, session.isSuperAdmin ? 'super-admin-review' : 'upline-review', iso, targetUserId).run().catch(() => undefined);
  }
  await db.prepare(`INSERT INTO profile_audit_logs(id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(crypto.randomUUID(), targetUserId, 'starry-id', session.userId, 'rank', text(current.rank), rank, now).run().catch(() => undefined);
  await createStarryNotification(env, targetUserId, 'rank', '獎銜審核完成', `你的獎銜已核准為 ${rank}。`, { rank, reviewerUserId: session.userId, status: 'approved' });
  return json({ success: true, rank });
}

async function pushKey(request: Request, env: Env) {
  const session = await sessionContext(request, env); if (!session) return json({ error: '請先登入 Starry ID' }, 401);
  const config = await vapidConfig(env);
  return json({ publicKey: config.publicKey });
}
async function savePushSubscription(request: Request, env: Env) {
  const session = await sessionContext(request, env); if (!session) return json({ error: '請先登入 Starry ID' }, 401);
  await ensureSchema(env);
  const input: any = await request.clone().json().catch(() => ({}));
  const endpoint = text(input.endpoint), p256dh = text(input.keys?.p256dh), auth = text(input.keys?.auth);
  if (!endpoint.startsWith('https://') || endpoint.length > 1800) return json({ error: '通知訂閱資料不正確' }, 400);
  const now = Date.now(), db = (env as any).STARRY_ID_DB;
  await db.prepare(`INSERT INTO starry_push_subscriptions(endpoint,userId,p256dh,auth,createdAt,updatedAt) VALUES(?,?,?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET userId=excluded.userId,p256dh=excluded.p256dh,auth=excluded.auth,updatedAt=excluded.updatedAt`)
    .bind(endpoint, session.userId, p256dh, auth, now, now).run();
  return json({ success: true });
}
async function deletePushSubscription(request: Request, env: Env) {
  const session = await sessionContext(request, env); if (!session) return json({ error: '請先登入 Starry ID' }, 401);
  const input: any = await request.clone().json().catch(() => ({})); const endpoint = text(input.endpoint);
  if (endpoint) await (env as any).STARRY_ID_DB.prepare('DELETE FROM starry_push_subscriptions WHERE endpoint=? AND userId=?').bind(endpoint, session.userId).run();
  return json({ success: true });
}

function notificationPage() {
  return `<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#09101f"><title>通知｜Starry ID</title><style>
  :root{color-scheme:dark;--bg:#07101f;--panel:#111e35;--line:#31486c;--text:#f7f9ff;--muted:#a9bad4;--accent:#78a9ff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 15% 0,#203e73 0,transparent 30%),var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif}.shell{width:min(980px,100%);margin:auto;padding:18px 14px 60px}.top{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 4px 16px;background:linear-gradient(#07101ff7,#07101fd9,transparent)}.brand{font-size:22px;font-weight:900}.back,.push,.review-btn{border:1px solid #4a6791;background:#172a48;color:#fff;border-radius:14px;min-height:46px;padding:10px 15px;font-weight:850;text-decoration:none;cursor:pointer}.push{width:100%;font-size:18px;background:linear-gradient(135deg,#356fba,#7055c6);margin:5px 0 18px}.section{margin:15px 0 24px}.section h2{font-size:20px;margin:0 0 10px}.card{border:1px solid var(--line);background:rgba(15,28,51,.94);border-radius:18px;padding:14px;margin:9px 0}.title{font-size:16px;font-weight:850}.meta,.body{color:var(--muted);line-height:1.65;margin-top:5px}.visit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 12px;margin-top:8px;font-size:14px}.review-row{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-top:10px}.review-row select{flex:1;min-width:180px;background:#0b172b;color:#fff;border:1px solid #526e98;border-radius:12px;padding:11px}.empty{color:var(--muted);padding:18px 0}.status{border-left:4px solid #efbd62}.pending{color:#ffd887;font-weight:800}.ok{color:#78e0b2;font-weight:800}@media(max-width:620px){.visit-grid{grid-template-columns:1fr}.brand{font-size:19px}.back{padding:9px 11px}.card{padding:13px}.push{font-size:17px}}
  </style></head><body><main class="shell"><header class="top"><div class="brand">🔔 Starry ID 通知</div><a class="back" href="/">返回會員中心</a></header><button id="pushBtn" class="push">新訊息通知我</button><section class="section"><h2>獎銜進度</h2><div id="rankStatus" class="card status">讀取中…</div></section><section class="section" id="reviewSection" hidden><h2>等待我審核的獎銜</h2><div id="reviews"></div></section><section class="section"><h2>通知訊息</h2><div id="notices"></div></section><section class="section"><h2>電子名片瀏覽紀錄</h2><div id="visits"></div></section></main><script>
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dt=v=>{const n=Number(v);if(!n)return '';return new Date(n).toLocaleString('zh-TW')};
  async function api(path,opt={}){const r=await fetch(path,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'操作失敗');return d}
  let data=null;
  async function load(){data=await api('/api/notifications');const s=data.rankStatus||{};document.getElementById('rankStatus').innerHTML=s.status==='pending'?'<div class="pending">你已提交獎銜變更 '+esc(s.pendingRank)+' 等待人工審核中</div><div class="meta">目前對外仍顯示已通過獎銜：'+esc(s.approvedRank||'尚未核准')+'</div>':'<div class="ok">目前已通過獎銜：'+esc(s.approvedRank||'尚未核准')+'</div>';const notices=document.getElementById('notices');notices.innerHTML=(data.notifications||[]).map(n=>'<article class="card"><div class="title">'+esc(n.title)+'</div><div class="body">'+esc(n.body)+'</div><div class="meta">'+dt(n.createdAt)+'</div></article>').join('')||'<div class="empty">目前沒有通知。</div>';const visits=document.getElementById('visits');visits.innerHTML=(data.visits||[]).map(v=>'<article class="card"><div class="title">'+esc(v.viewerName?(v.viewerName+(v.viewerRank?' '+v.viewerRank:'')):'訪客')+'</div><div class="visit-grid"><div>IP：'+esc(v.ip||'未知')+'</div><div>時間：'+dt(v.createdAt)+'</div><div>地區：'+esc(v.region||'未知')+'</div><div>裝置：'+esc(v.deviceOs||'未知')+'</div></div></article>').join('')||'<div class="empty">尚無瀏覽紀錄。</div>';renderReviews();api('/api/notifications/read',{method:'POST',body:'{}'}).catch(()=>{});}
  function renderReviews(){const box=document.getElementById('reviews'),section=document.getElementById('reviewSection'),rows=data?.reviews||[];section.hidden=!rows.length;box.innerHTML='';for(const r of rows){const card=document.createElement('article');card.className='card';const title=document.createElement('div');title.className='title';title.textContent=(r.name||'會員')+'｜'+(r.center||'未設定會場');const meta=document.createElement('div');meta.className='meta';meta.textContent='目前核准：'+(r.approvedRank||'無')+'｜申請：'+(r.pendingRank||'無');const row=document.createElement('div');row.className='review-row';const select=document.createElement('select');for(const rank of data.rankOptions||[]){const o=document.createElement('option');o.value=rank;o.textContent=rank;if(rank===r.pendingRank)o.selected=true;select.appendChild(o)}const btn=document.createElement('button');btn.className='review-btn';btn.textContent='核准 / 修改獎銜';btn.onclick=async()=>{btn.disabled=true;try{await api('/api/notifications/rank-review',{method:'POST',body:JSON.stringify({targetUserId:r.id,rank:select.value})});await load()}catch(e){alert(e.message)}finally{btn.disabled=false}};row.append(select,btn);card.append(title,meta,row);box.append(card)}}
  function keyBytes(s){const p=s.replace(/-/g,'+').replace(/_/g,'/');const raw=atob(p+'='.repeat((4-p.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0))}
  document.getElementById('pushBtn').onclick=async()=>{const btn=document.getElementById('pushBtn');btn.disabled=true;try{if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw Error('這台裝置或瀏覽器目前不支援網站通知');if(Notification.permission==='denied')throw Error('通知已被瀏覽器封鎖，請到瀏覽器網站設定重新開啟通知');const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('你尚未允許通知');const reg=await navigator.serviceWorker.register('/starry-id-sw.js',{scope:'/'});await navigator.serviceWorker.ready;const key=await api('/api/notifications/push-key');let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(key.publicKey)});await api('/api/notifications/push-subscription',{method:'POST',body:JSON.stringify(sub.toJSON())});btn.textContent='✓ 已開啟新訊息通知';}catch(e){alert(e.message||'通知設定失敗')}finally{btn.disabled=false}};
  load().catch(e=>{document.getElementById('notices').innerHTML='<div class="empty">'+esc(e.message)+'</div>'});
  </script></body></html>`;
}

function serviceWorkerSource() {
  return `self.addEventListener('push',event=>{event.waitUntil((async()=>{let title='Starry ID｜新訊息',body='你有新的繁星訊息';try{const r=await fetch('/api/notifications?latest=1',{credentials:'include',cache:'no-store'});const d=await r.json();const n=d.notifications?.[0];if(n){title=n.title||title;body=n.body||body}}catch{}await self.registration.showNotification(title,{body,tag:'starry-id-message',renotify:true,data:{url:'/notifications'}})})())});self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const all=await clients.matchAll({type:'window',includeUncontrolled:true});for(const client of all){if('focus'in client){client.navigate('/notifications');return client.focus()}}return clients.openWindow('/notifications')})())});`;
}

function v230ClientSource() {
  return `(()=>{if(window.__starryV230)return;window.__starryV230=true;const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>Array.from(r.querySelectorAll(s));const style=document.createElement('style');style.id='v230-profile-ux';style.textContent=\`
  .field{padding-top:15px!important;min-height:84px!important}.field-label{font-size:14px!important;font-weight:750!important;margin-bottom:9px!important}.field-value{font-size:18px!important;line-height:1.55!important;padding-right:148px!important}.field-editor,.v222-editor,.v222-current{font-size:17px!important;min-height:48px!important}.v230-field-actions{position:absolute;right:9px;top:9px;z-index:8;display:flex;justify-content:flex-end;gap:7px}.v230-field-actions .edit,.v230-field-actions .field-eye,.v230-cancel{position:static!important;width:41px!important;height:41px!important;min-width:41px!important;border-radius:12px!important;font-size:19px!important;border:1px solid #47648b;background:#172a47;color:#f2f7ff;display:grid;place-items:center;padding:0;cursor:pointer}.v230-cancel{font-size:25px!important;font-weight:900}.v230-cancel[hidden]{display:none!important}.v230-rank-status{font-size:14px;line-height:1.55;color:#ffd27b;margin:9px 0 0;font-weight:750}.v222-random{font-size:16px!important;min-height:46px!important;padding:10px 15px!important}.v230-bell{position:relative!important;min-width:45px!important;font-size:22px!important;padding:8px 11px!important}.v230-badge{position:absolute;right:-5px;top:-6px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#e9556f;color:#fff;font:800 12px/20px system-ui;text-align:center}.v230-modal-overlay{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:18px;background:#020816d9;backdrop-filter:blur(8px)}.v230-modal{width:min(92vw,520px);border:1px solid #6888b4;border-radius:26px;background:linear-gradient(160deg,#1b3557,#0b192e);box-shadow:0 30px 90px #000a;padding:28px}.v230-modal h2{font-size:29px;margin:0 0 12px}.v230-modal p{font-size:20px;line-height:1.6;color:#c8d7eb}.v230-modal-actions{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:24px}.v230-modal-actions button{min-height:62px;border-radius:16px;border:1px solid #6483ac;background:#203d62;color:#fff;font-size:22px;font-weight:900;cursor:pointer}.v230-modal-actions .save{background:linear-gradient(135deg,#4c8ee0,#6858ca)}.v230-dice-overlay{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;background:radial-gradient(circle,#173b70ee,#030817f5);overflow:hidden}.v230-dice{font-size:min(43vw,270px);filter:drop-shadow(0 22px 35px #0008);animation:v230Dice 1.25s cubic-bezier(.2,.8,.2,1) both}.v230-dice-copy{position:absolute;bottom:13vh;font-size:clamp(24px,5vw,42px);font-weight:950;text-shadow:0 4px 18px #000}.v230-stars{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 20% 20%,#fff 0 2px,transparent 3px),radial-gradient(circle at 72% 28%,#ffe07a 0 3px,transparent 4px),radial-gradient(circle at 35% 72%,#a8d5ff 0 3px,transparent 4px),radial-gradient(circle at 84% 75%,#fff 0 2px,transparent 3px);animation:v230Stars 1.25s ease-out both}@keyframes v230Dice{0%{transform:scale(.18) rotate(-420deg);opacity:.2}55%{transform:scale(1.2) rotate(260deg);opacity:1}80%{transform:scale(.92) rotate(350deg)}100%{transform:scale(1) rotate(360deg);opacity:1}}@keyframes v230Stars{0%{transform:scale(.7);opacity:0}45%{opacity:1}100%{transform:scale(1.55) rotate(18deg);opacity:.15}}html[data-starry-theme="light"] .v230-field-actions .edit,html[data-starry-theme="light"] .v230-field-actions .field-eye,html[data-starry-theme="light"] .v230-cancel{background:#fff;color:#18304f;border-color:#afc4df}html[data-starry-theme="light"] .v230-modal{background:linear-gradient(160deg,#fff,#eaf3ff);color:#14243d}html[data-starry-theme="light"] .v230-modal p{color:#4a607e}@media(max-width:620px){.field-value{font-size:18px!important;padding-right:140px!important}.v230-field-actions{gap:6px}.v230-field-actions .edit,.v230-field-actions .field-eye,.v230-cancel{width:40px!important;height:40px!important;min-width:40px!important}.v230-modal h2{font-size:27px}.v230-modal p{font-size:19px}.v230-modal-actions button{font-size:20px;min-height:58px}}
  \`;document.head.append(style);
  async function api(path,opt={}){const r=await fetch(path,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'操作失敗');return d}
  function cancelCard(card){const editor=q('.v222-editor,.field-editor,.v222-current,.v222-relation input,.v220-relation-input',card);if(editor){editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))}else{const save=q('button.edit.v216-save',card);if(save){const input=q('input,textarea,select,button.v222-current',card);input?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))}}}
  function syncActions(){for(const card of qa('.field')){let rail=q('.v230-field-actions',card);if(!rail){rail=document.createElement('div');rail.className='v230-field-actions';card.append(rail)}let cancel=q('.v230-cancel',rail);if(!cancel){cancel=document.createElement('button');cancel.type='button';cancel.className='v230-cancel';cancel.textContent='×';cancel.title='取消修改';cancel.setAttribute('aria-label','取消修改');cancel.onclick=e=>{e.preventDefault();e.stopPropagation();cancelCard(card)};rail.append(cancel)}const edit=q('button.edit',card),eye=q('button.field-eye',card);if(edit&&edit.parentElement!==rail)rail.append(edit);if(eye&&eye.parentElement!==rail)rail.append(eye);if(edit&&edit.parentElement===rail&&eye&&eye.parentElement===rail){rail.append(cancel,edit,eye)}else if(edit&&edit.parentElement===rail){rail.append(cancel,edit)}cancel.hidden=!Boolean(edit?.classList.contains('v216-save'))}}
  function unsavedPrompt(){return new Promise(resolve=>{const over=document.createElement('div');over.className='v230-modal-overlay';const box=document.createElement('section');box.className='v230-modal';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');const h=document.createElement('h2');h.textContent='這個欄位還沒儲存';const p=document.createElement('p');p.textContent='要先儲存剛才的修改嗎？';const acts=document.createElement('div');acts.className='v230-modal-actions';const no=document.createElement('button');no.textContent='不儲存';const yes=document.createElement('button');yes.className='save';yes.textContent='儲存';const done=v=>{over.remove();resolve(v)};no.onclick=()=>done(false);yes.onclick=()=>done(true);acts.append(no,yes);box.append(h,p,acts);over.append(box);document.body.append(over);yes.focus()})}
  function waitEditDone(card,timeout=3500){return new Promise(resolve=>{const start=Date.now();const tick=()=>{if(!q('button.edit.v216-save',card))return resolve(true);if(Date.now()-start>timeout)return resolve(false);setTimeout(tick,70)};tick()})}
  window.addEventListener('click',async e=>{const target=e.target?.closest?.('button.edit');if(!target)return;const targetCard=target.closest('.field');const current=qa('button.edit.v216-save').find(b=>b.closest('.field')!==targetCard);if(!current)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();const currentCard=current.closest('.field');const save=await unsavedPrompt();if(save){current.click();if(!await waitEditDone(currentCard))return}else{cancelCard(currentCard);await waitEditDone(currentCard,700)}setTimeout(()=>target.click(),40)},true);
  function playTone(){try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;const c=new A();const now=c.currentTime;[420,620,840,1080].forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.type=i%2?'square':'sine';o.frequency.setValueAtTime(f,now+i*.12);g.gain.setValueAtTime(.0001,now+i*.12);g.gain.exponentialRampToValueAtTime(.08,now+i*.12+.025);g.gain.exponentialRampToValueAtTime(.0001,now+i*.12+.13);o.connect(g);g.connect(c.destination);o.start(now+i*.12);o.stop(now+i*.12+.15)});setTimeout(()=>c.close(),1000)}catch{}}
  function diceFx(){if(q('.v230-dice-overlay'))return;playTone();const over=document.createElement('div');over.className='v230-dice-overlay';const stars=document.createElement('div');stars.className='v230-stars';const die=document.createElement('div');die.className='v230-dice';die.textContent='🎲';const copy=document.createElement('div');copy.className='v230-dice-copy';copy.textContent='繁星正在給你靈感…';over.append(stars,die,copy);document.body.append(over);setTimeout(()=>over.remove(),1350)}
  function syncDice(){for(const b of qa('.v222-random')){if((b.textContent||'').includes('隨機')||(b.textContent||'').includes('招喚繁星')){b.textContent='🎲 招喚繁星給我靈感';if(!b.dataset.v230Dice){b.dataset.v230Dice='1';b.addEventListener('click',diceFx,true)}}}}
  async function syncRank(){try{const d=await api('/api/notifications?summary=1');const card=q('.field[data-field="rank"]');if(!card)return;let note=q('.v230-rank-status',card);if(d.rankStatus?.status==='pending'&&d.rankStatus.pendingRank){if(!note){note=document.createElement('div');note.className='v230-rank-status';card.append(note)}note.textContent='你已提交獎銜變更 '+d.rankStatus.pendingRank+' 等待人工審核中';const display=q('.field-value',card);if(display&&!q('button.edit.v216-save',card)){display.textContent=d.rankStatus.approvedRank||'尚未核准';display.classList.toggle('empty',!d.rankStatus.approvedRank)}}else note?.remove()}catch{}}
  let rankTimer=0;function scheduleRank(){clearTimeout(rankTimer);rankTimer=setTimeout(syncRank,240)}
  async function syncBell(){const actions=document.getElementById('topActions');if(!actions||actions.hidden)return;let b=document.getElementById('v230NotificationsBtn');if(!b){b=document.createElement('button');b.type='button';b.id='v230NotificationsBtn';b.className='btn v230-bell';b.textContent='🔔';b.title='通知';b.setAttribute('aria-label','通知');b.onclick=()=>location.href='/notifications';actions.insertBefore(b,document.getElementById('myCardBtn')||actions.firstChild)}try{const d=await api('/api/notifications?summary=1');let badge=q('.v230-badge',b);if(d.unread>0){if(!badge){badge=document.createElement('span');badge.className='v230-badge';b.append(badge)}badge.textContent=String(Math.min(99,d.unread))}else badge?.remove()}catch{}}
  const observer=new MutationObserver(()=>{syncActions();syncDice();scheduleRank();syncBell()});observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});syncActions();syncDice();syncBell();syncRank();setInterval(syncBell,45000);
})();`;
}

export async function handleStarryIdNotifications(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN) return null;
  const method = request.method.toUpperCase();
  if (url.pathname === '/starry-id-v230.js' && method === 'GET') return script(v230ClientSource());
  if (url.pathname === '/starry-id-sw.js' && method === 'GET') return script(serviceWorkerSource());
  if (url.pathname === '/notifications' && method === 'GET') {
    const session = await sessionContext(request, env);
    if (!session) return html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Starry ID</title><body style="background:#07101f;color:#fff;font-family:system-ui;padding:40px;text-align:center"><h1>請先登入 Starry ID</h1><p><a style="color:#9fc2ff" href="/">返回會員中心登入</a></p></body>`, 401);
    return html(notificationPage());
  }
  if (url.pathname === '/api/notifications' && method === 'GET') return notificationFeed(request, env);
  if (url.pathname === '/api/notifications/read' && method === 'POST') return markRead(request, env);
  if (url.pathname === '/api/notifications/rank-review' && method === 'POST') return reviewRank(request, env);
  if (url.pathname === '/api/notifications/push-key' && method === 'GET') return pushKey(request, env);
  if (url.pathname === '/api/notifications/push-subscription' && method === 'POST') return savePushSubscription(request, env);
  if (url.pathname === '/api/notifications/push-subscription' && method === 'DELETE') return deletePushSubscription(request, env);
  return null;
}
