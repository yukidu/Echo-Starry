import appWorker from './sessionCookieRouter';
import type { Env } from './index';
import {
  INITIAL_STICKER_UNITS,
  formatStickerAmount,
  isPlatinumOrAboveRank,
  normalizeMemberName,
  stickersToUnits,
  unitsToStickers
} from '../shared/stickers';

const SUPER_ADMIN_EMAIL = 'yukidu@gmail.com';
const SESSION_COOKIE = 'echostars_session';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,}$/;
const schemaReady = new WeakMap<object, Promise<void>>();

const SETTING_DEFAULTS: Record<string, number> = {
  rating_reward_units: 1,
  like_reward_units: 1,
  keyword_reward_units: 1,
  keyword_reward_limit: 1,
  lucky_cost_units: 1,
  vip_upload_cost_units: 1
};

const RANK_ORDER = [
  '無', '3%', '6%', '9%', '12%', '12%初階', '15%', '15%銅章', '18%', '21%',
  '銀章', '金章', '白金', '紅寶石', '創辦人白金', '創辦人紅寶石', '藍寶石',
  '創辦人藍寶石', '明珠', '翡翠', '創辦人翡翠', '鑽石級以上'
] as const;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function bearerToken(request: Request) {
  const match = request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i);
  return match?.[1] || '';
}

function cookieToken(request: Request) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    const token = part.slice(separator + 1).trim();
    return TOKEN_PATTERN.test(token) ? token : '';
  }
  return '';
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function verifiedActor(request: Request, env: Env) {
  if (!env.DB) return null;
  const token = bearerToken(request) || cookieToken(request);
  if (!TOKEN_PATTERN.test(token)) return null;
  const tokenHash = await hashToken(token);
  const actor: any = await env.DB.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.rank, u.approvedRank, u.rankApproved,
           u.isAdminUser, u.isBlocked, u.canUpload, u.isContributor, u.platinumUpline, u.diamondUpline, s.expiresAt
    FROM auth_sessions s
    JOIN users u ON u.id = s.userId
    WHERE s.tokenHash = ?
    LIMIT 1
  `).bind(tokenHash).first();
  if (!actor || actor.isBlocked || Number(actor.expiresAt || 0) <= Date.now()) return null;
  return actor;
}

function isSuperAdmin(actor: any) {
  return String(actor?.email || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL || actor?.role === '超級管理員';
}

function effectiveRank(actor: any) {
  if (actor?.rankApproved) return String(actor.approvedRank || actor.rank || '').trim();
  return String(actor?.rank || '').trim();
}

function canGrantStickers(actor: any) {
  return isSuperAdmin(actor) || (Boolean(actor?.rankApproved) && isPlatinumOrAboveRank(effectiveRank(actor)));
}

function isDownlineOf(target: any, actor: any) {
  const owner = normalizeMemberName(actor?.name);
  if (!owner) return false;
  return [target?.platinumUpline, target?.diamondUpline]
    .map(normalizeMemberName)
    .some(name => Boolean(name) && name === owner);
}

function parseJson(value: any, fallback: any) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value ?? fallback;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeTrackRow(row: any) {
  if (!row) return row;
  const track = { ...row, isPrivateVip: Boolean(row.isPrivateVip) };
  for (const key of ['categories', 'keywords', 'externalVideos', 'externalPpts', 'externalFiles', 'likedBy']) {
    track[key] = parseJson(row[key], []);
  }
  track.ratings = parseJson(row.ratings, {});
  track.keywordMeta = parseJson(row.keywordMeta, {});
  track.stickerUnlockCost = Math.max(0, Number(row.stickerUnlockCost || 0));
  track.commentStickerReward = Math.max(0, Number(row.commentStickerReward || 0));
  return track;
}

async function ensureStickerSchema(db: any) {
  if (!db) return;
  const key = db as object;
  if (!schemaReady.has(key)) {
    const task = (async () => {
      const trackInfo = await db.prepare('PRAGMA table_info(tracks)').all();
      const trackColumns = new Set((trackInfo.results || []).map((row: any) => row.name));
      for (const [name, type] of Object.entries({
        stickerUnlockCost: 'INTEGER DEFAULT 0',
        commentStickerReward: 'INTEGER DEFAULT 0'
      })) {
        if (!trackColumns.has(name)) {
          try { await db.prepare(`ALTER TABLE tracks ADD COLUMN ${name} ${type}`).run(); }
          catch (error) {
            const check = await db.prepare('PRAGMA table_info(tracks)').all();
            if (!check.results?.some((row: any) => row.name === name)) throw error;
          }
        }
      }

      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS sticker_transactions (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          deltaUnits INTEGER NOT NULL,
          balanceAfterUnits INTEGER NOT NULL,
          type TEXT NOT NULL,
          sourceId TEXT,
          description TEXT NOT NULL,
          actorUserId TEXT,
          uniqueKey TEXT NOT NULL UNIQUE,
          createdAt INTEGER NOT NULL
        )`),
        db.prepare('CREATE INDEX IF NOT EXISTS sticker_transactions_user_created ON sticker_transactions(userId, createdAt DESC)'),
        db.prepare('CREATE INDEX IF NOT EXISTS sticker_transactions_source ON sticker_transactions(sourceId, type)'),
        db.prepare(`CREATE TRIGGER IF NOT EXISTS sticker_spend_balance_guard
          BEFORE INSERT ON sticker_transactions
          WHEN NEW.type IN ('vip_upload_cost', 'lucky_cost', 'track_unlock_cost')
            AND COALESCE((SELECT SUM(deltaUnits) FROM sticker_transactions WHERE userId = NEW.userId), 0) + NEW.deltaUnits < 0
          BEGIN SELECT RAISE(ABORT, 'sticker_insufficient'); END`),
        db.prepare(`CREATE TABLE IF NOT EXISTS sticker_unlocks (
          userId TEXT NOT NULL,
          trackId TEXT NOT NULL,
          costUnits INTEGER NOT NULL,
          transactionId TEXT,
          createdAt INTEGER NOT NULL,
          PRIMARY KEY(userId, trackId)
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS sticker_settings (
          key TEXT PRIMARY KEY,
          valueUnits INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL,
          updatedBy TEXT
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS member_notifications (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          createdAt INTEGER NOT NULL,
          readAt INTEGER,
          sourceId TEXT UNIQUE
        )`),
        db.prepare('CREATE INDEX IF NOT EXISTS member_notifications_user_created ON member_notifications(userId, createdAt DESC)')
      ]);

      const now = Date.now();
      await db.batch(Object.entries(SETTING_DEFAULTS).map(([settingKey, value]) =>
        db.prepare('INSERT OR IGNORE INTO sticker_settings(key, valueUnits, updatedAt, updatedBy) VALUES (?, ?, ?, ?)')
          .bind(settingKey, value, now, 'system')
      ));

      // Launch policy: every member present when v98 first reaches an installation
      // starts with 6 stickers. INSERT OR IGNORE keeps this permanently idempotent.
      await db.prepare(`
        INSERT OR IGNORE INTO sticker_transactions
          (id, userId, deltaUnits, balanceAfterUnits, type, sourceId, description, actorUserId, uniqueKey, createdAt)
        SELECT 'initial:' || id, id, ?, ?, 'initial', id, '會員初始貼紙', 'system', 'initial:' || id, ?
        FROM users
      `).bind(INITIAL_STICKER_UNITS, INITIAL_STICKER_UNITS, now).run();
    })();
    schemaReady.set(key, task);
    task.catch(() => schemaReady.delete(key));
  }
  await schemaReady.get(key);
}

async function ensureInitialStickers(db: any, userId: string) {
  if (!userId) return;
  const now = Date.now();
  await db.prepare(`
    INSERT OR IGNORE INTO sticker_transactions
      (id, userId, deltaUnits, balanceAfterUnits, type, sourceId, description, actorUserId, uniqueKey, createdAt)
    VALUES (?, ?, ?, ?, 'initial', ?, '會員初始貼紙', 'system', ?, ?)
  `).bind(`initial:${userId}`, userId, INITIAL_STICKER_UNITS, INITIAL_STICKER_UNITS, userId, `initial:${userId}`, now).run();
}

async function stickerBalanceUnits(db: any, userId: string) {
  await ensureInitialStickers(db, userId);
  const row: any = await db.prepare(
    'SELECT COALESCE(SUM(deltaUnits), 0) AS balanceUnits FROM sticker_transactions WHERE userId = ?'
  ).bind(userId).first();
  return Number(row?.balanceUnits || 0);
}

type TransactionResult = {
  inserted: boolean;
  balanceUnits: number;
  transaction?: any;
  insufficient?: boolean;
};

async function addStickerTransaction(
  db: any,
  input: {
    userId: string;
    deltaUnits: number;
    type: string;
    sourceId?: string;
    description: string;
    actorUserId?: string;
    uniqueKey: string;
    allowNegative?: boolean;
    rewardLimit?: number;
  }
): Promise<TransactionResult> {
  await ensureInitialStickers(db, input.userId);
  const existing: any = await db.prepare('SELECT * FROM sticker_transactions WHERE uniqueKey = ? LIMIT 1')
    .bind(input.uniqueKey).first();
  if (existing) {
    return { inserted: false, balanceUnits: await stickerBalanceUnits(db, input.userId), transaction: existing };
  }

  const id = `st-${crypto.randomUUID()}`;
  const now = Date.now();
  let result: any;
  if (input.deltaUnits < 0 && !input.allowNegative) {
    result = await db.prepare(`
      INSERT OR IGNORE INTO sticker_transactions
        (id, userId, deltaUnits, balanceAfterUnits, type, sourceId, description, actorUserId, uniqueKey, createdAt)
      SELECT ?, ?, ?,
        COALESCE((SELECT SUM(deltaUnits) FROM sticker_transactions WHERE userId = ?), 0) + ?,
        ?, ?, ?, ?, ?, ?
      WHERE COALESCE((SELECT SUM(deltaUnits) FROM sticker_transactions WHERE userId = ?), 0) + ? >= 0
    `).bind(
      id, input.userId, input.deltaUnits, input.userId, input.deltaUnits,
      input.type, input.sourceId || null, input.description, input.actorUserId || null, input.uniqueKey, now,
      input.userId, input.deltaUnits
    ).run();
  } else {
    result = await db.prepare(`
      INSERT OR IGNORE INTO sticker_transactions
        (id, userId, deltaUnits, balanceAfterUnits, type, sourceId, description, actorUserId, uniqueKey, createdAt)
      SELECT ?, ?, ?,
        COALESCE((SELECT SUM(deltaUnits) FROM sticker_transactions WHERE userId = ?), 0) + ?,
        ?, ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM sticker_transactions WHERE userId = ? AND type = ? AND sourceId = ?) < ?
    `).bind(
      id, input.userId, input.deltaUnits, input.userId, input.deltaUnits,
      input.type, input.sourceId || null, input.description, input.actorUserId || null, input.uniqueKey, now,
      input.userId, input.type, input.sourceId || null, input.rewardLimit ?? 2147483647
    ).run();
  }

  if (!result?.meta?.changes) {
    const duplicate: any = await db.prepare('SELECT * FROM sticker_transactions WHERE uniqueKey = ? LIMIT 1')
      .bind(input.uniqueKey).first();
    if (duplicate) {
      return { inserted: false, balanceUnits: await stickerBalanceUnits(db, input.userId), transaction: duplicate };
    }
    return { inserted: false, balanceUnits: await stickerBalanceUnits(db, input.userId), insufficient: true };
  }
  const transaction: any = await db.prepare('SELECT * FROM sticker_transactions WHERE id = ?').bind(id).first();
  return { inserted: true, balanceUnits: Number(transaction?.balanceAfterUnits || 0), transaction };
}

async function settingMap(db: any) {
  const { results } = await db.prepare('SELECT key, valueUnits FROM sticker_settings').all();
  const values: Record<string, number> = { ...SETTING_DEFAULTS };
  for (const row of results || []) values[String((row as any).key)] = Number((row as any).valueUnits || 0);
  return values;
}

function settingsForClient(values: Record<string, number>) {
  return {
    ratingReward: unitsToStickers(values.rating_reward_units),
    likeReward: unitsToStickers(values.like_reward_units),
    keywordReward: unitsToStickers(values.keyword_reward_units),
    keywordRewardLimit: Number(values.keyword_reward_limit || 1),
    luckyCost: unitsToStickers(values.lucky_cost_units),
    vipUploadCost: unitsToStickers(values.vip_upload_cost_units)
  };
}

function validTenth(value: unknown) {
  const units = stickersToUnits(value);
  return Number.isFinite(Number(value)) && units >= 1 && units <= 10 && Math.abs(Number(value) * 10 - units) < 1e-8;
}

function validWholeTrackSticker(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 20;
}

function hasRankAccess(actor: any, track: any) {
  if (isSuperAdmin(actor)) return true;
  const required = String(track?.requiredRank || '無').trim();
  if (!required || required === '無' || required === '公開') return true;
  if (!actor) return false;
  if (actor.isAdminUser || actor.role === '管理員' || actor.role === '獎銜審核員') return true;
  if (!actor.rankApproved) return false;
  const rank = String(actor.approvedRank || actor.rank || '無').trim();
  if (/鑽石|皇冠|大使/.test(rank)) return true;
  const need = (RANK_ORDER as readonly string[]).indexOf(required);
  const have = (RANK_ORDER as readonly string[]).indexOf(rank);
  return need >= 0 && have >= need;
}

async function hasVipAccess(db: any, actor: any, track: any, suppliedPassword: string) {
  if (!track?.isPrivateVip) return true;
  if (isSuperAdmin(actor)) return true;
  const actorEmail = String(actor?.email || '').trim().toLowerCase();
  const uploaderEmail = String(track?.uploaderEmail || '').trim().toLowerCase();
  if (actorEmail && actorEmail === uploaderEmail) return true;
  if (track.vipExpiresAt && Date.now() > Number(track.vipExpiresAt)) return false;
  if (!/^\d{4,12}$/.test(String(suppliedPassword || ''))) return false;
  const access: any = await db.prepare('SELECT password FROM vip_share_access WHERE trackId = ? LIMIT 1')
    .bind(track.id).first();
  return Boolean(access && String(access.password) === String(suppliedPassword));
}

async function canEarnFromTrack(db: any, actor: any, track: any, vipPassword = '') {
  if (!actor || !track || !hasRankAccess(actor, track)) return false;
  if (!await hasVipAccess(db, actor, track, vipPassword)) return false;
  const cost = Math.max(0, Number(track.stickerUnlockCost || 0));
  if (cost <= 0 || isSuperAdmin(actor)) return true;
  return Boolean(await db.prepare('SELECT trackId FROM sticker_unlocks WHERE userId = ? AND trackId = ?').bind(actor.id, track.id).first());
}

async function playbackCompleted(db: any, actor: any, trackId: string) {
  const email = String(actor?.email || '').trim().toLowerCase();
  const row: any = await db.prepare(`
    SELECT MAX(COALESCE(progressPercent, 0)) AS progress,
           MAX(COALESCE(completed, 0)) AS completed,
           MAX(CASE WHEN finishDate IS NOT NULL AND TRIM(finishDate) <> '' THEN 1 ELSE 0 END) AS hasFinish
    FROM playback_memories
    WHERE trackId = ? AND (
      memberId = ? OR ((memberId IS NULL OR TRIM(memberId) = '') AND (userIdentifier = ? OR userIdentifier = ? OR LOWER(TRIM(userIdentifier)) = ?))
    )
  `).bind(trackId, actor.id, actor.id, actor.email || '', email).first();
  return Number(row?.completed || 0) === 1 || Number(row?.hasFinish || 0) === 1 || Number(row?.progress || 0) >= 95;
}

async function awardInteraction(db: any, actor: any, type: string, sourceId: string, units: number, description: string, uniqueKey: string, rewardLimit?: number) {
  if (!actor || units <= 0) return null;
  return addStickerTransaction(db, {
    userId: actor.id,
    deltaUnits: units,
    type,
    sourceId,
    description,
    actorUserId: actor.id,
    uniqueKey,
    rewardLimit
  });
}

function makeJsonRequest(request: Request, body: any) {
  const headers = new Headers(request.headers);
  headers.set('Content-Type', 'application/json');
  headers.delete('Content-Length');
  return new Request(request, { headers, body: JSON.stringify(body) });
}

function jsonFromBase(data: unknown, base: Response) {
  const headers = new Headers(base.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  return new Response(JSON.stringify(data), { status: base.status, statusText: base.statusText, headers });
}

async function handleTrackWrite(request: Request, env: Env, actor: any) {
  const db = env.DB;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const isCreate = url.pathname === '/api/tracks' && method === 'POST';
  const trackId = isCreate ? '' : decodeURIComponent(url.pathname.slice('/api/tracks/'.length));
  const body: any = await request.clone().json().catch(() => ({}));
  const hasUnlockField = Object.prototype.hasOwnProperty.call(body, 'stickerUnlockCost');
  const hasRewardField = Object.prototype.hasOwnProperty.call(body, 'commentStickerReward');
  if (hasUnlockField && !validWholeTrackSticker(body.stickerUnlockCost)) return json({ error: '解鎖貼紙需為 0 至 20 張整數' }, 400);
  if (hasRewardField && !validWholeTrackSticker(body.commentStickerReward)) return json({ error: '心得獎勵貼紙需為 0 至 20 張整數' }, 400);

  const existing: any = isCreate ? null : await db.prepare('SELECT * FROM tracks WHERE id = ?').bind(trackId).first();
  if (!isCreate && !existing) return null;

  const changesStickerConfig = hasUnlockField || hasRewardField;
  if (changesStickerConfig) {
    if (!actor) return json({ error: '請先登入會員' }, 401);
    if (!isSuperAdmin(actor) && !actor.canUpload && !actor.isContributor) return json({ error: '沒有修改音檔權限' }, 403);
    const uploader = String(existing?.uploaderEmail || '').trim().toLowerCase();
    const actorEmail = String(actor.email || '').trim().toLowerCase();
    if (!isCreate && !isSuperAdmin(actor) && (!uploader || uploader !== actorEmail)) {
      return json({ error: '只有超級管理員或原上傳者可修改錄音貼紙設定' }, 403);
    }
  }

  const requestedVip = Boolean(Object.prototype.hasOwnProperty.call(body, 'isPrivateVip') ? body.isPrivateVip : existing?.isPrivateVip);
  const becomesVip = requestedVip && !Boolean(existing?.isPrivateVip);
  const savedId = isCreate ? `t-${crypto.randomUUID()}` : trackId;
  const statements: any[] = [];
  if (changesStickerConfig) {
    const unlockCost = hasUnlockField ? Number(body.stickerUnlockCost) : Number(existing?.stickerUnlockCost || 0);
    const commentReward = hasRewardField ? Number(body.commentStickerReward) : Number(existing?.commentStickerReward || 0);
    statements.push(db.prepare('UPDATE tracks SET stickerUnlockCost = ?, commentStickerReward = ? WHERE id = ?')
      .bind(unlockCost, commentReward, savedId));
  }
  let vipUniqueKey = '';
  let vipCostUnits = 0;
  if (becomesVip) {
    if (!actor) return json({ error: '請先登入會員才能建立私秘 VIP' }, 401);
    if (!isSuperAdmin(actor) && !actor.canUpload && !actor.isContributor) return json({ error: '沒有上傳音檔權限' }, 403);
    await ensureInitialStickers(db, actor.id);
    const settings = await settingMap(db);
    vipCostUnits = Number(settings.vip_upload_cost_units || 0);
    const operationId = String(body.stickerOperationId || '').trim() || crypto.randomUUID();
    vipUniqueKey = `vip-upload:${actor.id}:${operationId}`;
    const prior: any = await db.prepare('SELECT * FROM sticker_transactions WHERE uniqueKey = ?').bind(vipUniqueKey).first();
    if (prior) {
      // Retry returns the saved recording; the operation cannot create a second free VIP.
      const saved: any = await db.prepare('SELECT * FROM tracks WHERE id = ?').bind(prior.sourceId).first();
      if (!saved || (!isCreate && saved.id !== trackId)) return json({ error: '此上傳操作已完成，請重新整理' }, 409);
      return json(normalizeTrackRow(saved));
    }
    if (await stickerBalanceUnits(db, actor.id) < vipCostUnits) {
      return json({ error: `貼紙不足，需要 ${formatStickerAmount(unitsToStickers(vipCostUnits))} 張貼紙才能建立私秘VIP` }, 402);
    }
    // The balance trigger and unique key abort the entire D1 batch if a concurrent
    // spend or retry conflicts. A failed track save never commits this charge.
    statements.push(db.prepare(`INSERT INTO sticker_transactions
      (id, userId, deltaUnits, balanceAfterUnits, type, sourceId, description, actorUserId, uniqueKey, createdAt)
      SELECT ?, ?, ?, COALESCE((SELECT SUM(deltaUnits) FROM sticker_transactions WHERE userId = ?), 0) + ?,
        'vip_upload_cost', ?, ?, ?, ?, ?`)
      .bind(`st-${crypto.randomUUID()}`, actor.id, -vipCostUnits, actor.id, -vipCostUnits,
        savedId, isCreate ? '上傳私秘VIP錄音' : '將錄音改為私秘VIP', actor.id, vipUniqueKey, Date.now()));
  }

  const cleanBody = { ...body };
  delete cleanBody.stickerUnlockCost;
  delete cleanBody.commentStickerReward;
  delete cleanBody.stickerOperationId;
  const functionalKeys = Object.keys(cleanBody).filter(key => key !== 'userEmail');
  if (isCreate) cleanBody.id = savedId;

  let response: Response;
  if (!isCreate && functionalKeys.length === 0) {
    await db.batch(statements);
    response = json(normalizeTrackRow(existing));
  } else {
    response = await appWorker.fetch(makeJsonRequest(request, cleanBody), {
      ...env, stickerTrackWriteStatements: statements
    });
  }
  if (!response.ok) {
    if (vipUniqueKey) {
      const prior: any = await db.prepare('SELECT sourceId FROM sticker_transactions WHERE uniqueKey = ?').bind(vipUniqueKey).first();
      if (prior) {
        const saved: any = await db.prepare('SELECT * FROM tracks WHERE id = ?').bind(prior.sourceId).first();
        if (saved) return jsonFromBase(normalizeTrackRow(saved), json({}));
      }
      if (await stickerBalanceUnits(db, actor.id) < vipCostUnits) return json({ error: '貼紙不足，VIP 儲存與扣款均未完成' }, 402);
    }
    return response;
  }
  const data: any = await response.clone().json().catch(() => null);
  const fresh = normalizeTrackRow(await db.prepare('SELECT * FROM tracks WHERE id = ?').bind(savedId).first());
  if (fresh) return jsonFromBase(data?.track ? { ...data, track: fresh } : fresh, response);

  return response;
}

async function handleStickerApi(request: Request, env: Env, actor: any): Promise<Response | null> {
  const db = env.DB;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  if (!path.startsWith('/api/stickers')) return null;
  if (!actor) return json({ error: '貼紙為會員專屬，請先登入' }, 401);
  await ensureInitialStickers(db, actor.id);

  if (path === '/api/stickers/me' && method === 'GET') {
    const balanceUnits = await stickerBalanceUnits(db, actor.id);
    const { results: transactions } = await db.prepare(
      'SELECT * FROM sticker_transactions WHERE userId = ? ORDER BY createdAt DESC LIMIT 100'
    ).bind(actor.id).all();
    const { results: unlocks } = await db.prepare('SELECT trackId FROM sticker_unlocks WHERE userId = ?').bind(actor.id).all();
    const unread: any = await db.prepare('SELECT COUNT(*) AS count FROM member_notifications WHERE userId = ? AND readAt IS NULL')
      .bind(actor.id).first();
    return json({
      balanceUnits,
      balance: unitsToStickers(balanceUnits),
      unlockedTrackIds: (unlocks || []).map((row: any) => row.trackId),
      unreadNotifications: Number(unread?.count || 0),
      canGrant: canGrantStickers(actor),
      isSuperAdmin: isSuperAdmin(actor),
      transactions: (transactions || []).map((tx: any) => ({
        ...tx,
        delta: unitsToStickers(tx.deltaUnits),
        balanceAfter: unitsToStickers(tx.balanceAfterUnits)
      }))
    });
  }

  if (path === '/api/stickers/settings') {
    if (!isSuperAdmin(actor)) return json({ error: '只有超級管理員可管理貼紙規則' }, 403);
    if (method === 'GET') return json({ settings: settingsForClient(await settingMap(db)) });
    if (method === 'PUT') {
      const body: any = await request.json().catch(() => ({}));
      for (const key of ['ratingReward', 'likeReward', 'keywordReward', 'luckyCost', 'vipUploadCost']) {
        if (!validTenth(body[key])) return json({ error: `${key} 必須為 0.1 至 1.0，且以 0.1 為單位` }, 400);
      }
      if (!Number.isInteger(Number(body.keywordRewardLimit)) || Number(body.keywordRewardLimit) < 1 || Number(body.keywordRewardLimit) > 20) {
        return json({ error: '網友關鍵字獎勵上限需為 1 至 20 次' }, 400);
      }
      const now = Date.now();
      const updates: Record<string, number> = {
        rating_reward_units: stickersToUnits(body.ratingReward),
        like_reward_units: stickersToUnits(body.likeReward),
        keyword_reward_units: stickersToUnits(body.keywordReward),
        keyword_reward_limit: Number(body.keywordRewardLimit),
        lucky_cost_units: stickersToUnits(body.luckyCost),
        vip_upload_cost_units: stickersToUnits(body.vipUploadCost)
      };
      await db.batch(Object.entries(updates).map(([key, value]) =>
        db.prepare(`INSERT INTO sticker_settings(key, valueUnits, updatedAt, updatedBy)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET valueUnits = excluded.valueUnits, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy`)
          .bind(key, value, now, actor.id)
      ));
      return json({ success: true, settings: settingsForClient(await settingMap(db)) });
    }
    return json({ error: 'Method not allowed' }, 405);
  }

  if (path === '/api/stickers/lucky-spend' && method === 'POST') {
    const body: any = await request.json().catch(() => ({}));
    const operationId = String(body.operationId || '').trim();
    if (!operationId) return json({ error: '缺少抽選識別碼' }, 400);
    const track: any = await db.prepare('SELECT * FROM tracks WHERE id = ?').bind(String(body.trackId || '')).first();
    if (!track || track.isPrivateVip || !await canEarnFromTrack(db, actor, track)) return json({ error: '沒有可抽選的錄音' }, 403);
    const settings = await settingMap(db);
    const cost = Number(settings.lucky_cost_units || 0);
    const result = await addStickerTransaction(db, {
      userId: actor.id,
      deltaUnits: -cost,
      type: 'lucky_cost',
      sourceId: operationId,
      description: '使用好手氣',
      actorUserId: actor.id,
      uniqueKey: `lucky:${actor.id}:${operationId}`
    });
    if (result.insufficient) return json({ error: '貼紙不足，無法使用好手氣', balance: unitsToStickers(result.balanceUnits) }, 402);
    return json({ success: true, charged: unitsToStickers(cost), balance: unitsToStickers(result.balanceUnits), duplicate: !result.inserted });
  }

  if (path === '/api/stickers/vip-preflight' && method === 'POST') {
    const body: any = await request.json().catch(() => ({}));
    let shouldCharge = Boolean(body.isPrivateVip);
    if (body.trackId) {
      const existing: any = await db.prepare('SELECT isPrivateVip FROM tracks WHERE id = ?').bind(String(body.trackId)).first();
      if (existing?.isPrivateVip) shouldCharge = false;
    }
    const settings = await settingMap(db);
    const costUnits = shouldCharge ? Number(settings.vip_upload_cost_units || 0) : 0;
    const balanceUnits = await stickerBalanceUnits(db, actor.id);
    if (balanceUnits < costUnits) {
      return json({ error: `貼紙不足，需要 ${formatStickerAmount(unitsToStickers(costUnits))} 張貼紙才能建立私秘VIP`, balance: unitsToStickers(balanceUnits), required: unitsToStickers(costUnits) }, 402);
    }
    return json({ success: true, balance: unitsToStickers(balanceUnits), required: unitsToStickers(costUnits), willCharge: costUnits > 0 });
  }

  const unlockMatch = path.match(/^\/api\/stickers\/unlock\/([^/]+)$/);
  if (unlockMatch && method === 'POST') {
    const trackId = decodeURIComponent(unlockMatch[1]);
    const track: any = await db.prepare('SELECT * FROM tracks WHERE id = ?').bind(trackId).first();
    if (!track) return json({ error: '音檔不存在' }, 404);
    if (!hasRankAccess(actor, track)) return json({ error: '目前會員獎銜未達此錄音的播放權限' }, 403);
    const body: any = await request.json().catch(() => ({}));
    if (!await hasVipAccess(db, actor, track, String(body.vipPassword || ''))) {
      return json({ error: '此私秘VIP尚未取得有效專屬授權，不能用貼紙越過VIP權限' }, 403);
    }
    const costStickers = Math.max(0, Number(track.stickerUnlockCost || 0));
    if (isSuperAdmin(actor) || costStickers <= 0) {
      return json({ success: true, unlocked: true, charged: 0, balance: unitsToStickers(await stickerBalanceUnits(db, actor.id)) });
    }
    const existingUnlock = await db.prepare('SELECT trackId FROM sticker_unlocks WHERE userId = ? AND trackId = ?')
      .bind(actor.id, trackId).first();
    if (existingUnlock) return json({ success: true, unlocked: true, charged: 0, duplicate: true, balance: unitsToStickers(await stickerBalanceUnits(db, actor.id)) });

    const uniqueKey = `track-unlock:${actor.id}:${trackId}`;
    const priorTransaction: any = await db.prepare('SELECT * FROM sticker_transactions WHERE uniqueKey = ? LIMIT 1').bind(uniqueKey).first();
    let transaction = priorTransaction;
    let balanceUnits = await stickerBalanceUnits(db, actor.id);
    if (!transaction) {
      const result = await addStickerTransaction(db, {
        userId: actor.id,
        deltaUnits: -stickersToUnits(costStickers),
        type: 'track_unlock_cost',
        sourceId: trackId,
        description: `解鎖錄音：${track.title || trackId}`,
        actorUserId: actor.id,
        uniqueKey
      });
      if (result.insufficient) return json({ error: `貼紙不足，需要 ${costStickers} 張貼紙才能解鎖`, balance: unitsToStickers(result.balanceUnits) }, 402);
      transaction = result.transaction;
      balanceUnits = result.balanceUnits;
    }
    await db.prepare('INSERT OR IGNORE INTO sticker_unlocks(userId, trackId, costUnits, transactionId, createdAt) VALUES (?, ?, ?, ?, ?)')
      .bind(actor.id, trackId, stickersToUnits(costStickers), transaction?.id || null, Date.now()).run();
    return json({ success: true, unlocked: true, charged: costStickers, balance: unitsToStickers(balanceUnits) });
  }

  if (path === '/api/stickers/grant-targets' && method === 'GET') {
    if (!canGrantStickers(actor)) return json({ error: '目前獎銜沒有加貼紙權限' }, 403);
    const { results } = await db.prepare('SELECT id, name, email, rank, approvedRank, platinumUpline, diamondUpline FROM users WHERE COALESCE(isBlocked, 0) = 0 ORDER BY name').all();
    const targets = isSuperAdmin(actor)
      ? (results || [])
      : (results || []).filter((target: any) => target.id !== actor.id && isDownlineOf(target, actor));
    return json({ targets });
  }

  if (path === '/api/stickers/grant' && method === 'POST') {
    if (!canGrantStickers(actor)) return json({ error: '目前獎銜沒有加貼紙權限' }, 403);
    const body: any = await request.json().catch(() => ({}));
    const targetId = String(body.targetUserId || '').trim();
    const amount = Number(body.amount);
    const units = stickersToUnits(amount);
    const reason = String(body.reason || '').trim();
    const operationId = String(body.operationId || '').trim();
    if (!targetId || !operationId) return json({ error: '缺少會員或操作識別碼' }, 400);
    if (!reason) return json({ error: '人工加貼紙必須填寫原因' }, 400);
    if (!Number.isFinite(amount) || units < 1 || units > 200 || Math.abs(amount * 10 - units) > 1e-8) {
      return json({ error: '人工加貼紙需為 0.1 至 20 張，且以 0.1 為單位' }, 400);
    }
    const target: any = await db.prepare('SELECT * FROM users WHERE id = ? AND COALESCE(isBlocked,0)=0').bind(targetId).first();
    if (!target) return json({ error: '找不到可用會員' }, 404);
    if (!isSuperAdmin(actor)) {
      if (target.id === actor.id) return json({ error: '不可幫自己加貼紙' }, 403);
      if (!isDownlineOf(target, actor)) return json({ error: '白金以上會員只能幫自己的下線會員加貼紙' }, 403);
    }
    const uniqueKey = `manual-grant:${actor.id}:${operationId}`;
    const prior: any = await db.prepare('SELECT userId, deltaUnits FROM sticker_transactions WHERE uniqueKey = ?').bind(uniqueKey).first();
    if (prior && (prior.userId !== target.id || prior.deltaUnits !== units)) return json({ error: '操作識別碼已用於其他加貼紙紀錄' }, 409);
    const result = await addStickerTransaction(db, {
      userId: target.id,
      deltaUnits: units,
      type: 'manual_grant',
      sourceId: operationId,
      description: `${actor.name || '會員'}人工加貼紙：${reason}`,
      actorUserId: actor.id,
      uniqueKey
    });
    if (result.transaction?.id && result.transaction.userId === target.id) {
      const amountText = formatStickerAmount(amount);
      await db.prepare(`INSERT OR IGNORE INTO member_notifications
        (id, userId, type, title, message, createdAt, readAt, sourceId)
        VALUES (?, ?, 'sticker_grant', '收到貼紙', ?, ?, NULL, ?)`)
        .bind(`notice-${crypto.randomUUID()}`, target.id, `${actor.name || '會員'} 幫你加了 ${amountText} 張貼紙。原因：${reason}`, Date.now(), result.transaction.id).run();
    }
    return json({ success: true, added: amount, balance: unitsToStickers(result.balanceUnits), duplicate: !result.inserted });
  }

  if (path === '/api/stickers/tracks/batch' && method === 'PUT') {
    if (!isSuperAdmin(actor)) return json({ error: '只有超級管理員可批次修改錄音貼紙設定' }, 403);
    const body: any = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.trackIds) ? [...new Set(body.trackIds.map((id: any) => String(id || '').trim()).filter(Boolean))] : [];
    if (!ids.length) return json({ error: '請選擇至少一筆錄音' }, 400);
    const updates: string[] = [];
    const values: number[] = [];
    if (body.stickerUnlockCost !== undefined && body.stickerUnlockCost !== null && body.stickerUnlockCost !== '') {
      if (!validWholeTrackSticker(body.stickerUnlockCost)) return json({ error: '解鎖貼紙需為 0 至 20 張整數' }, 400);
      updates.push('stickerUnlockCost = ?'); values.push(Number(body.stickerUnlockCost));
    }
    if (body.commentStickerReward !== undefined && body.commentStickerReward !== null && body.commentStickerReward !== '') {
      if (!validWholeTrackSticker(body.commentStickerReward)) return json({ error: '心得獎勵貼紙需為 0 至 20 張整數' }, 400);
      updates.push('commentStickerReward = ?'); values.push(Number(body.commentStickerReward));
    }
    if (!updates.length) return json({ error: '沒有要修改的欄位' }, 400);
    const existing = await Promise.all(ids.map(id => db.prepare('SELECT id FROM tracks WHERE id = ?').bind(id).first()));
    if (existing.some(row => !row)) return json({ error: '部分錄音已不存在，請重新整理' }, 409);
    for (let offset = 0; offset < ids.length; offset += 50) {
      await db.batch(ids.slice(offset, offset + 50).map(id => db.prepare(`UPDATE tracks SET ${updates.join(', ')} WHERE id = ?`).bind(...values, id)));
    }
    const results = await Promise.all(ids.map(id => db.prepare('SELECT * FROM tracks WHERE id = ?').bind(id).first()));
    return json({ success: true, tracks: (results || []).map(normalizeTrackRow) });
  }

  if (path === '/api/stickers/notifications' && method === 'GET') {
    const { results } = await db.prepare('SELECT * FROM member_notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 100')
      .bind(actor.id).all();
    return json({ notifications: results || [] });
  }

  if (path === '/api/stickers/notifications/read' && method === 'POST') {
    await db.prepare('UPDATE member_notifications SET readAt = COALESCE(readAt, ?) WHERE userId = ? AND readAt IS NULL')
      .bind(Date.now(), actor.id).run();
    return json({ success: true });
  }

  return json({ error: '找不到貼紙功能' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();
    if (!env.DB) return appWorker.fetch(request, env);

    const relevant = path.startsWith('/api/stickers') || path.startsWith('/api/tracks') || path.startsWith('/api/comments') || path === '/api/users/google-sync';
    if (relevant) {
      try { await ensureStickerSchema(env.DB); }
      catch (error) {
        console.error('Sticker schema initialization failed:', error);
        if (path.startsWith('/api/stickers')) return json({ error: '貼紙服務暫時無法使用' }, 503);
      }
    }

    const actor = relevant ? await verifiedActor(request, env).catch(() => null) : null;
    const stickerResponse = await handleStickerApi(request, env, actor);
    if (stickerResponse) return stickerResponse;

    const isTrackWrite = (path === '/api/tracks' && method === 'POST') || (/^\/api\/tracks\/[^/]+$/.test(path) && method === 'PUT');
    if (isTrackWrite) {
      const handled = await handleTrackWrite(request, env, actor);
      if (handled) return handled;
    }

    const trackAction = path.match(/^\/api\/tracks\/([^/]+)\/(like|rate)$/);
    const keywordPost = path.match(/^\/api\/tracks\/([^/]+)\/keywords$/) && method === 'POST';
    const commentPost = path.match(/^\/api\/tracks\/([^/]+)\/comments$/) && method === 'POST';
    const commentDelete = method === 'DELETE' ? path.match(/^\/api\/comments\/([^/]+)$/) : null;

    let beforeTrack: any = null;
    let beforeCommentReward: any = null;
    let requestBody: any = null;
    if ((trackAction && method === 'POST') || keywordPost || commentPost) {
      requestBody = await request.clone().json().catch(() => ({}));
    }
    if (trackAction && method === 'POST' && actor) {
      beforeTrack = await env.DB.prepare('SELECT id, title, likedBy, ratings, requiredRank, isPrivateVip, uploaderEmail, vipExpiresAt, stickerUnlockCost FROM tracks WHERE id = ?').bind(decodeURIComponent(trackAction[1])).first();
    }
    if ((trackAction && method === 'POST') || keywordPost) {
      const id = decodeURIComponent(path.split('/')[3]);
      const track: any = beforeTrack || await env.DB.prepare('SELECT * FROM tracks WHERE id = ?').bind(id).first();
      if (Number(track?.stickerUnlockCost || 0) > 0 && !await canEarnFromTrack(env.DB, actor, track, String(requestBody?.vipPassword || ''))) {
        return json({ error: '請先取得錄音權限並使用貼紙解鎖' }, 403);
      }
    }
    if (commentDelete) {
      const commentId = decodeURIComponent((commentDelete as RegExpMatchArray)[1]);
      beforeCommentReward = await env.DB.prepare(
        "SELECT * FROM sticker_transactions WHERE type = 'comment_reward' AND sourceId = ? AND deltaUnits > 0 ORDER BY createdAt ASC LIMIT 1"
      ).bind(commentId).first();
    }

    let delegated = request;
    if (requestBody && actor) {
      delegated = makeJsonRequest(request, {
        ...requestBody, identifier: actor.id, userId: actor.id, userEmail: actor.email,
        ...(commentPost ? { authorEmail: actor.email, authorName: actor.name } : {})
      });
    }
    if (commentDelete) {
      const body: any = await request.clone().json().catch(() => ({}));
      delegated = makeJsonRequest(request, { ...body, userEmail: actor?.email || '' });
    }
    const response = await appWorker.fetch(delegated, env);
    if (!response.ok) return response;

    if (path === '/api/users/google-sync' && method === 'POST') {
      const data: any = await response.clone().json().catch(() => null);
      if (data?.user?.id) await ensureInitialStickers(env.DB, data.user.id);
      return response;
    }

    const settings = actor && (trackAction || keywordPost) ? await settingMap(env.DB) : null;

    if (trackAction && method === 'POST' && actor && beforeTrack && requestBody) {
      const action = trackAction[2];
      const trackId = decodeURIComponent(trackAction[1]);
      const data: any = await response.clone().json().catch(() => ({}));
      const actorKeys = [String(actor.id), String(actor.email || '').toLowerCase().trim()].filter(Boolean);
      const canEarn = await canEarnFromTrack(env.DB, actor, beforeTrack, String(requestBody.vipPassword || ''));
      if (action === 'rate' && Number(requestBody.score) > 0 && canEarn) {
        const ratings = parseJson(beforeTrack.ratings, {});
        const hadRating = actorKeys.some(key => Number(ratings[key] || 0) > 0);
        if (!hadRating) {
          await awardInteraction(env.DB, actor, 'rating_reward', trackId, Number(settings?.rating_reward_units || 0), `首次評價錄音：${beforeTrack.title || trackId}`, `rating:${actor.id}:${trackId}`);
        }
      } else if (action === 'like' && data?.hasLiked === true && canEarn) {
        const likedBy: string[] = parseJson(beforeTrack.likedBy, []);
        const hadLike = actorKeys.some(key => likedBy.includes(key));
        if (!hadLike) {
          await awardInteraction(env.DB, actor, 'like_reward', trackId, Number(settings?.like_reward_units || 0), `首次按讚錄音：${beforeTrack.title || trackId}`, `like:${actor.id}:${trackId}`);
        }
      }
      return response;
    }

    if (keywordPost && actor && requestBody) {
      const trackId = decodeURIComponent((path.match(/^\/api\/tracks\/([^/]+)/) as RegExpMatchArray)[1]);
      const keyword = String(requestBody.keyword || '').trim();
      const limit = Number(settings?.keyword_reward_limit || 1);
      const count: any = await env.DB.prepare("SELECT COUNT(*) AS count FROM sticker_transactions WHERE userId = ? AND type = 'keyword_reward' AND sourceId = ?")
        .bind(actor.id, trackId).first();
      if (Number(count?.count || 0) < limit) {
        const track: any = await env.DB.prepare('SELECT id, title, requiredRank, isPrivateVip, uploaderEmail, vipExpiresAt, stickerUnlockCost FROM tracks WHERE id = ?').bind(trackId).first();
        if (await canEarnFromTrack(env.DB, actor, track, String(requestBody.vipPassword || ''))) await awardInteraction(env.DB, actor, 'keyword_reward', trackId, Number(settings?.keyword_reward_units || 0), `新增網友關鍵字「${keyword}」：${track?.title || trackId}`, `keyword:${actor.id}:${trackId}:${keyword.toLocaleLowerCase('zh-Hant')}`, limit);
      }
      return response;
    }

    if (commentPost && actor && requestBody && !requestBody.replyToId) {
      const trackId = decodeURIComponent((path.match(/^\/api\/tracks\/([^/]+)/) as RegExpMatchArray)[1]);
      const track: any = await env.DB.prepare('SELECT id, title, commentStickerReward, requiredRank, isPrivateVip, uploaderEmail, vipExpiresAt, stickerUnlockCost FROM tracks WHERE id = ?').bind(trackId).first();
      const reward = Math.max(0, Number(track?.commentStickerReward || 0));
      if (reward > 0 && await canEarnFromTrack(env.DB, actor, track, String(requestBody.vipPassword || '')) && await playbackCompleted(env.DB, actor, trackId)) {
        const data: any = await response.clone().json().catch(() => null);
        const comment = data?.comment || data;
        if (comment?.id) {
          await awardInteraction(env.DB, actor, 'comment_reward', comment.id, stickersToUnits(reward), `聽完後分享心得：${track?.title || trackId}`, `comment-reward:${actor.id}:${trackId}`);
        }
      }
      return response;
    }

    if (commentDelete && beforeCommentReward) {
      const commentId = decodeURIComponent((commentDelete as RegExpMatchArray)[1]);
      await addStickerTransaction(env.DB, {
        userId: beforeCommentReward.userId,
        deltaUnits: -Number(beforeCommentReward.deltaUnits || 0),
        type: 'comment_reward_reversal',
        sourceId: commentId,
        description: `刪除原獎勵心得，扣回 ${formatStickerAmount(unitsToStickers(beforeCommentReward.deltaUnits))} 張貼紙`,
        actorUserId: actor?.id || undefined,
        uniqueKey: `comment-reversal:${beforeCommentReward.id}`,
        allowNegative: true
      });
      return response;
    }

    return response;
  }
};
