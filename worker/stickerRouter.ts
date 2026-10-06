import { missingProfileFields } from '../shared/profileCompletion';
import appWorker from './sessionCookieRouter';
import type { Env } from './index';
import { canonicalProgressPercent } from '../shared/learningProgress';
import { canonicalDownlineUserIds, isCanonicalDownlineOf } from './organizationModel';
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
  keyword_reward_cap_units: 10,
  comment_thread_cap_units: 200,
  reply_reward_units: 1,
  lucky_cost_units: 1,
  profile_reward_units: 10,
  lucky_complete_units: 10,
  lucky_daily_limit_units: 30,
  toast_seconds_units: 10,
  profile_hint_seconds_units: 10,
  vip_upload_cost_units: 1,
  platinum_rank_reward_units: 1000,
  platinum_rank_multiplier_tenths: 20,
  emerald_rank_reward_units: 3000,
  diamond_rank_reward_units: 5000
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
    .some(name => Boolean(name) && (name === owner || (actor.uplineAliases || []).includes(name)));
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
        db.prepare(`CREATE TRIGGER IF NOT EXISTS sticker_manual_grant_debit_guard
          BEFORE INSERT ON sticker_transactions
          WHEN NEW.type = 'manual_grant_debit'
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

      const transactionColumns = new Set((await db.prepare('PRAGMA table_info(sticker_transactions)').all()).results.map((row: any) => row.name));
      for (const column of ['trackId', 'commentId', 'relatedUserId', 'sourceLabel']) {
        if (!transactionColumns.has(column)) {
          try { await db.prepare(`ALTER TABLE sticker_transactions ADD COLUMN ${column} TEXT`).run(); }
          catch (error) {
            const check = await db.prepare('PRAGMA table_info(sticker_transactions)').all();
            if (!check.results.some((row: any) => row.name === column)) throw error;
          }
        }
      }
      await db.prepare(`CREATE TABLE IF NOT EXISTS sticker_comment_rewards (
        commentId TEXT PRIMARY KEY, userId TEXT NOT NULL, trackId TEXT NOT NULL,
        rewardUnits INTEGER NOT NULL, kind TEXT NOT NULL, createdAt INTEGER NOT NULL
      )`).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS sticker_pending_member_track ON sticker_comment_rewards(userId, trackId)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS sticker_transactions_member_track ON sticker_transactions(userId, trackId, type)').run();
      await db.prepare('CREATE TABLE IF NOT EXISTS sticker_text_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
      await db.prepare('CREATE TABLE IF NOT EXISTS sticker_lucky_draws (operationId TEXT PRIMARY KEY, userId TEXT NOT NULL, trackId TEXT NOT NULL, rewardUnits INTEGER NOT NULL, day TEXT NOT NULL, createdAt INTEGER NOT NULL)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS sticker_lucky_member ON sticker_lucky_draws(userId,day)').run();
      await db.prepare('CREATE TABLE IF NOT EXISTS upline_owners (kind TEXT NOT NULL,name TEXT NOT NULL,userId TEXT NOT NULL,PRIMARY KEY(kind,name))').run();
      await db.prepare('CREATE TABLE IF NOT EXISTS upline_names (kind TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY(kind,name))').run();
      const now = Date.now();
      // v98 stored this setting as a count. The configured number now means stickers.
      await db.prepare(`INSERT OR IGNORE INTO sticker_settings(key,valueUnits,updatedAt,updatedBy)
        SELECT 'keyword_reward_cap_units', valueUnits * 10, ?, 'system' FROM sticker_settings WHERE key = 'keyword_reward_limit'`).bind(now).run();
      await db.prepare(`INSERT OR IGNORE INTO sticker_settings VALUES ('comment_rewards_v99_started_at', ?, ?, 'system')`).bind(now, now).run();
      await db.prepare(`UPDATE sticker_transactions SET trackId = COALESCE(
        (SELECT id FROM tracks WHERE id = sticker_transactions.sourceId),
        (SELECT trackId FROM comments WHERE id = sticker_transactions.sourceId),
        CASE WHEN type = 'comment_reward' THEN SUBSTR(uniqueKey, LENGTH('comment-reward:' || userId || ':') + 1) END)
        WHERE trackId IS NULL AND type IN ('rating_reward','like_reward','keyword_reward','track_unlock_cost','comment_reward','comment_reward_reversal','vip_upload_cost')`).run();
      await db.prepare(`UPDATE sticker_transactions SET commentId = sourceId WHERE commentId IS NULL AND type IN ('comment_reward','comment_reward_reversal')`).run();
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
      await backfillExistingRankApprovalRewards(db);
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

function earningMultiplierTenths(actor: any, values: Record<string, number>) {
  if (!actor?.rankApproved || !isPlatinumOrAboveRank(effectiveRank(actor))) return 10;
  const configured = Number(values.platinum_rank_multiplier_tenths);
  return Number.isFinite(configured) ? Math.max(0, Math.round(configured)) : 10;
}

function multiplyStickerUnits(units: number, multiplierTenths: number) {
  if (units <= 0) return units;
  return Math.max(0, Math.round(units * multiplierTenths / 10));
}

async function earningMultiplierTenthsForUser(db: any, userId: string) {
  const row: any = await db.prepare(`SELECT rank,approvedRank,rankApproved,
    COALESCE((SELECT valueUnits FROM sticker_settings WHERE key='platinum_rank_multiplier_tenths'),20) AS multiplierTenths
    FROM users WHERE id=? LIMIT 1`).bind(userId).first();
  if (!row?.rankApproved || !isPlatinumOrAboveRank(String(row.approvedRank || row.rank || '').trim())) return 10;
  const configured = Number(row.multiplierTenths);
  return Number.isFinite(configured) ? Math.max(0, Math.round(configured)) : 10;
}

type TransactionResult = {
  inserted: boolean;
  balanceUnits: number;
  transaction?: any;
  insufficient?: boolean;
};

async function addStickerTransaction(db: any, input: {
  userId: string; deltaUnits: number; type: string; sourceId?: string; description: string;
  actorUserId?: string; uniqueKey: string; allowNegative?: boolean;
  trackId?: string; commentId?: string; relatedUserId?: string;
  capUnits?: number; capTypes?: string[]; dailyLimit?: number; dayStart?: number;
  earningMultiplierTenths?: number; skipEarningMultiplier?: boolean;
}): Promise<TransactionResult> {
  await ensureInitialStickers(db, input.userId);
  const existing: any = await db.prepare('SELECT * FROM sticker_transactions WHERE uniqueKey = ? LIMIT 1').bind(input.uniqueKey).first();
  if (existing) return { inserted: false, balanceUnits: await stickerBalanceUnits(db, input.userId), transaction: existing };
  const track: any = await db.prepare('SELECT id,title,speaker,speakerRank FROM tracks WHERE id = ?').bind(input.trackId || input.sourceId || '').first();
  const id = `st-${crypto.randomUUID()}`;
  const shouldMultiply = input.deltaUnits > 0 && !input.skipEarningMultiplier && !['rank_approval_reward','manual_grant'].includes(input.type);
  const multiplierTenths = shouldMultiply
    ? (input.earningMultiplierTenths ?? await earningMultiplierTenthsForUser(db, input.userId))
    : 10;
  const deltaUnits = shouldMultiply ? multiplyStickerUnits(input.deltaUnits, multiplierTenths) : input.deltaUnits;
  const capUnits = input.capUnits !== undefined && shouldMultiply ? multiplyStickerUnits(input.capUnits, multiplierTenths) : input.capUnits;
  const capTypes = input.capTypes || [input.type];
  const capped = capUnits !== undefined && deltaUnits > 0;
  const amountSql = capped ? `MIN(?, MAX(0, ? - COALESCE((SELECT SUM(deltaUnits) FROM sticker_transactions
    WHERE userId = ? AND trackId = ? AND deltaUnits > 0 AND type IN (${capTypes.map(() => '?').join(',')})), 0)))` : '?';
  const amountArgs = capped ? [deltaUnits, capUnits, input.userId, input.trackId || track?.id || '', ...capTypes] : [deltaUnits];
  // The cap and balance are computed within the same INSERT, including concurrent requests.
  const result: any = await db.prepare(`WITH award(amount) AS (SELECT ${amountSql})
    INSERT OR IGNORE INTO sticker_transactions
      (id,userId,deltaUnits,balanceAfterUnits,type,sourceId,description,actorUserId,uniqueKey,createdAt,trackId,commentId,relatedUserId,sourceLabel)
    SELECT ?, ?, amount, COALESCE((SELECT SUM(deltaUnits) FROM sticker_transactions WHERE userId = ?),0) + amount,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM award
    WHERE (? = 1 OR COALESCE((SELECT SUM(deltaUnits) FROM sticker_transactions WHERE userId = ?),0) + amount >= 0)
      AND (? = 0 OR amount > 0)
      AND (? < 0 OR (SELECT COUNT(*) FROM sticker_transactions WHERE userId = ? AND type = ? AND deltaUnits > 0 AND createdAt >= ? AND createdAt < ?) < ?)
  `).bind(...amountArgs, id, input.userId, input.userId, input.type, input.sourceId || null,
    input.description, input.actorUserId || null, input.uniqueKey, Date.now(), input.trackId || track?.id || null,
    input.commentId || null, input.relatedUserId || null, track ? trackLabel(track) : null,
    input.allowNegative || deltaUnits >= 0 ? 1 : 0, input.userId, capped ? 1 : 0, input.dailyLimit ?? -1, input.userId, input.type, input.dayStart || 0, (input.dayStart || 0) + 86400000, input.dailyLimit ?? -1).run();
  const transaction: any = await db.prepare('SELECT * FROM sticker_transactions WHERE uniqueKey = ?').bind(input.uniqueKey).first();
  return { inserted: Boolean(result?.meta?.changes), balanceUnits: await stickerBalanceUnits(db, input.userId),
    transaction, insufficient: !transaction && input.deltaUnits < 0 };
}

function trackLabel(track: any) {
  return `${track.speaker || ''}${track.speakerRank && track.speakerRank !== '無' ? track.speakerRank : ''}-${track.title || track.id}`;
}

async function transactionHistory(db: any, actor: any, outgoing = false) {
  const { results } = await db.prepare(`SELECT tx.*, t.id AS liveTrackId, t.title AS trackTitle,
    t.speaker AS trackSpeaker, t.speakerRank AS trackSpeakerRank, c.id AS liveCommentId,
    u.id AS liveUserId, u.name AS sourceUserName
    FROM sticker_transactions tx
    LEFT JOIN tracks t ON t.id = tx.trackId
    LEFT JOIN comments c ON c.id = tx.commentId
    LEFT JOIN users u ON u.id = CASE WHEN ? = 1 THEN tx.userId
      WHEN tx.type = 'initial' THEN tx.userId ELSE COALESCE(tx.relatedUserId, tx.actorUserId) END
    WHERE ${outgoing ? "tx.actorUserId = ? AND tx.type = 'manual_grant'" : 'tx.userId = ?'}
    ORDER BY tx.createdAt DESC, tx.rowid DESC`).bind(outgoing ? 1 : 0, actor.id).all();
  return (results || []).map((tx: any) => ({
    id: tx.id, type: tx.type, description: tx.description, createdAt: tx.createdAt,
    delta: unitsToStickers(tx.deltaUnits), balanceAfter: unitsToStickers(tx.balanceAfterUnits),
    source: tx.trackId ? {
      kind: 'track', trackId: tx.trackId, commentId: tx.liveCommentId || undefined,
      label: tx.liveTrackId ? trackLabel({id:tx.trackId,title:tx.trackTitle,speaker:tx.trackSpeaker,speakerRank:tx.trackSpeakerRank}) : tx.sourceLabel || tx.description,
      available: Boolean(tx.liveTrackId)
    } : tx.type === 'lucky_cost' ? {kind:'feature', label:'好手氣', available:true} : tx.liveUserId ? {kind:'member', userId:tx.liveUserId, label:tx.sourceUserName, available:true} : null
  }));
}

async function settingMap(db: any) {
  const { results } = await db.prepare('SELECT key, valueUnits FROM sticker_settings').all();
  const values: Record<string, number> = { ...SETTING_DEFAULTS };
  for (const row of results || []) values[String((row as any).key)] = Number((row as any).valueUnits || 0);
  const texts = await db.prepare('SELECT key,value FROM sticker_text_settings').all();
  for (const row of texts.results || []) (values as any)[row.key] = row.value;
  return values;
}

function settingsForClient(values: Record<string, number>, includeRankRewards = false) {
  return {
    profileReward: unitsToStickers(values.profile_reward_units),
    luckyCompleteReward: unitsToStickers(values.lucky_complete_units),
    luckyDailyLimit: unitsToStickers(values.lucky_daily_limit_units),
    toastSeconds: unitsToStickers(values.toast_seconds_units),
    profileHintSeconds: unitsToStickers(values.profile_hint_seconds_units),
    profileHintText: (values as any).profileHintText || '尚有欄位未填，完整填寫可+{x}張貼紙',
    luckyHintText: (values as any).luckyHintText || '這是宇宙給你的答案\n聽完貼紙額外+{x}張',
    ratingReward: unitsToStickers(values.rating_reward_units),
    likeReward: unitsToStickers(values.like_reward_units),
    keywordReward: unitsToStickers(values.keyword_reward_units),
    keywordRewardLimit: unitsToStickers(values.keyword_reward_cap_units),
    commentThreadLimit: unitsToStickers(values.comment_thread_cap_units),
    replyReward: unitsToStickers(values.reply_reward_units),
    luckyCost: unitsToStickers(values.lucky_cost_units),
    vipUploadCost: unitsToStickers(values.vip_upload_cost_units),
    ...(includeRankRewards ? {
      platinumRankReward: unitsToStickers(values.platinum_rank_reward_units),
      platinumEarningMultiplier: Number(values.platinum_rank_multiplier_tenths || 0) / 10,
      emeraldRankReward: unitsToStickers(values.emerald_rank_reward_units),
      diamondRankReward: unitsToStickers(values.diamond_rank_reward_units)
    } : {})
  };
}

type RankRewardTier = 'platinum' | 'emerald' | 'diamond';

function rankRewardTier(value: unknown): RankRewardTier | null {
  const rank = String(value || '').trim();
  if (!rank) return null;
  if (/鑽石|皇冠|大使/.test(rank)) return 'diamond';
  if (/翡翠/.test(rank)) return 'emerald';
  return isPlatinumOrAboveRank(rank) ? 'platinum' : null;
}

function rankRewardUnits(values: Record<string, number>, tier: RankRewardTier) {
  if (tier === 'diamond') return Number(values.diamond_rank_reward_units || 0);
  if (tier === 'emerald') return Number(values.emerald_rank_reward_units || 0);
  return Number(values.platinum_rank_reward_units || 0);
}

function rankRewardLabel(tier: RankRewardTier) {
  return tier === 'diamond' ? '鑽石以上' : tier === 'emerald' ? '翡翠以上' : '白金以上';
}

const RANK_TIER_PRIORITY: Record<RankRewardTier, number> = { platinum: 1, emerald: 2, diamond: 3 };

async function awardRankApprovalReward(db: any, user: any, actorUserId = 'system') {
  if (!user?.id || !user.rankApproved) return null;
  const tier = rankRewardTier(user.approvedRank || user.rank);
  if (!tier) return null;
  const prior = (await db.prepare("SELECT sourceId FROM sticker_transactions WHERE userId = ? AND type = 'rank_approval_reward'").bind(user.id).all()).results || [];
  if (prior.some((row: any) => RANK_TIER_PRIORITY[String(row.sourceId) as RankRewardTier] >= RANK_TIER_PRIORITY[tier])) return null;
  const settings = await settingMap(db);
  const units = rankRewardUnits(settings, tier);
  if (units <= 0) return null;
  return addStickerTransaction(db, {
    userId: user.id,
    deltaUnits: units,
    type: 'rank_approval_reward',
    sourceId: tier,
    description: `${rankRewardLabel(tier)}獎銜審核通過獎勵`,
    actorUserId,
    uniqueKey: `rank-approval:${user.id}:${tier}`,
    skipEarningMultiplier: true
  });
}

async function backfillExistingRankApprovalRewards(db: any) {
  await db.prepare('CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY)').run();
  const migration = 'rank-approval-reward-v101';
  if (await db.prepare('SELECT name FROM app_migrations WHERE name = ?').bind(migration).first()) return;
  const settings = await settingMap(db);
  const users = (await db.prepare('SELECT id,name,rank,approvedRank,rankApproved FROM users WHERE COALESCE(rankApproved,0)=1').all()).results || [];
  const statements: any[] = [];
  const now = Date.now();
  for (const user of users as any[]) {
    const tier = rankRewardTier(user.approvedRank || user.rank);
    if (!tier) continue;
    const units = rankRewardUnits(settings, tier);
    if (units <= 0) continue;
    const uniqueKey = `rank-approval:${user.id}:${tier}`;
    statements.push(db.prepare(`INSERT OR IGNORE INTO sticker_transactions
      (id,userId,deltaUnits,balanceAfterUnits,type,sourceId,description,actorUserId,uniqueKey,createdAt)
      SELECT ?, ?, ?, COALESCE((SELECT SUM(deltaUnits) FROM sticker_transactions WHERE userId = ?),0) + ?,
        'rank_approval_reward', ?, ?, 'system', ?, ?`)
      .bind(uniqueKey, user.id, units, user.id, units, tier, `${rankRewardLabel(tier)}獎銜審核通過獎勵（既有會員補發）`, uniqueKey, now));
  }
  for (let offset = 0; offset < statements.length; offset += 50) {
    await db.batch(statements.slice(offset, offset + 50));
  }
  await db.prepare('INSERT OR IGNORE INTO app_migrations(name) VALUES (?)').bind(migration).run();
}

function validTenth(value: unknown) {
  if (value === null || typeof value === "boolean" || value === "" || value === undefined) return false;
  const units = stickersToUnits(value);
  return Number.isFinite(Number(value)) && units >= 0 && units <= 10000 && Math.abs(Number(value) * 10 - units) < 1e-8;
}

function validWholeTrackSticker(value: unknown, maximum = 20) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= maximum;
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
  const { results } = await db.prepare(`SELECT * FROM playback_memories WHERE trackId = ? AND (
    memberId = ? OR ((memberId IS NULL OR TRIM(memberId) = '') AND
    (userIdentifier = ? OR LOWER(TRIM(userIdentifier)) = ?)))`)
    .bind(trackId, actor.id, actor.id, String(actor.email || '').trim().toLowerCase()).all();
  return (results || []).some((row: any) => canonicalProgressPercent(row) >= 100);
}

async function awardInteraction(db: any, actor: any, type: string, sourceId: string, units: number, description: string, uniqueKey: string, trackId?: string, commentId?: string, capUnits?: number) {
  if (!actor || units <= 0) return null;
  return addStickerTransaction(db, { userId:actor.id, deltaUnits:units, type, sourceId, description,
    actorUserId:actor.id, uniqueKey, trackId, commentId, capUnits });
}

async function queueCommentReward(db: any, actor: any, comment: any, track: any, settings: Record<string, number>, vipPassword = '') {
  if (!comment || !await canEarnFromTrack(db, actor, track, vipPassword)) return;
  const reply = Boolean(comment.replyToId);
  let eligible = true;
  if (reply) {
    const parent: any = await db.prepare('SELECT authorEmail FROM comments WHERE id = ?').bind(comment.replyToId).first();
    if (!parent || String(parent.authorEmail || '').trim().toLowerCase() === String(actor.email).trim().toLowerCase()) eligible = false;
  }
  const units = eligible ? (reply ? settings.reply_reward_units : stickersToUnits(track.commentStickerReward || 0)) : 0;
  await db.prepare(`INSERT OR IGNORE INTO sticker_comment_rewards(commentId,userId,trackId,rewardUnits,kind,createdAt)
    VALUES (?,?,?,?,?,?)`).bind(comment.id,actor.id,track.id,units,reply?'reply_reward':'comment_reward',comment.createdAt || Date.now()).run();
}

async function reconcileCommentRewards(db: any, actor: any, trackId?: string, vipPassword = '') {
  if (!actor) return;
  const settings = await settingMap(db);
  // Recover missed v98 roots, but never reward pre-launch history or retrospectively reward old replies.
  const { results: comments } = await db.prepare(`SELECT c.* FROM comments c
    WHERE LOWER(TRIM(c.authorEmail)) = ? AND (? = '' OR c.trackId = ?)
      AND c.createdAt >= COALESCE((SELECT createdAt FROM sticker_transactions WHERE uniqueKey = ?), ?)
      AND NOT EXISTS (SELECT 1 FROM sticker_comment_rewards p WHERE p.commentId = c.id)
    ORDER BY c.createdAt, c.id`).bind(String(actor.email || '').trim().toLowerCase(),trackId || '',trackId || '',`initial:${actor.id}`,Date.now()).all();
  for (const comment of comments || []) {
    if (comment.replyToId && comment.createdAt < settings.comment_rewards_v99_started_at) continue;
    const track = await db.prepare('SELECT * FROM tracks WHERE id = ?').bind(comment.trackId).first();
    await queueCommentReward(db,actor,comment,track,settings,vipPassword);
  }
  const { results: pending } = await db.prepare(`SELECT p.* FROM sticker_comment_rewards p
    JOIN comments c ON c.id = p.commentId
    WHERE p.userId = ? AND (? = '' OR p.trackId = ?) AND p.rewardUnits > 0
      AND NOT EXISTS (SELECT 1 FROM sticker_transactions tx WHERE tx.uniqueKey =
        CASE WHEN p.kind = 'reply_reward' THEN 'reply-reward:' || p.userId || ':' || p.commentId ELSE 'comment-reward:' || p.userId || ':' || p.trackId END)
      ORDER BY p.createdAt, p.commentId`)
    .bind(actor.id,trackId || '',trackId || '').all();
  const completed = new Map<string, boolean>();
  for (const item of pending || []) {
    if (item.rewardUnits <= 0) continue;
    if (!completed.has(item.trackId)) completed.set(item.trackId,await playbackCompleted(db,actor,item.trackId));
    if (!completed.get(item.trackId)) continue;
    const track: any = await db.prepare('SELECT * FROM tracks WHERE id = ?').bind(item.trackId).first();
    if (!track || !hasRankAccess(actor,track)) continue;
    // VIP eligibility was verified when queued; permanent sticker access is still required.
    if (Number(track.stickerUnlockCost || 0) > 0 && !isSuperAdmin(actor) && !await db.prepare('SELECT trackId FROM sticker_unlocks WHERE userId = ? AND trackId = ?').bind(actor.id,item.trackId).first()) continue;
    await addStickerTransaction(db, {
      userId:actor.id,deltaUnits:item.rewardUnits,type:item.kind,sourceId:item.commentId,trackId:item.trackId,commentId:item.commentId,
      description:item.kind === 'reply_reward' ? '回覆他人心得' : '聽完後分享心得',actorUserId:actor.id,
      uniqueKey:item.kind === 'reply_reward' ? `reply-reward:${actor.id}:${item.commentId}` : `comment-reward:${actor.id}:${item.trackId}`,
      capUnits:settings.comment_thread_cap_units,capTypes:['comment_reward','reply_reward']
    });
  }
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
  if (hasUnlockField && !validWholeTrackSticker(body.stickerUnlockCost, 50)) return json({ error: '解鎖貼紙需為 0 至 50 張整數' }, 400);
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

  if (vipUniqueKey) statements.push(db.prepare('UPDATE sticker_transactions SET trackId = ?, sourceLabel = ? WHERE uniqueKey = ?').bind(savedId, trackLabel({ ...existing, ...body, id:savedId }), vipUniqueKey));

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
  if (path === '/api/stickers/public-settings' && method === 'GET') return json({settings:settingsForClient(await settingMap(db))});
  if (!actor) return json({ error: '貼紙為會員專屬，請先登入' }, 401);
  if (path === '/api/stickers/guide' && method === 'GET') {
    const values = await settingMap(db);
    const tier = actor.rankApproved ? rankRewardTier(actor.approvedRank || actor.rank) : null;
    const rankUnits = tier ? rankRewardUnits(values, tier) : 0;
    return json({ guide: {
      initialReward: unitsToStickers(INITIAL_STICKER_UNITS),
      settings: settingsForClient(values),
      earningMultiplier: earningMultiplierTenths(actor, values) / 10,
      rankReward: tier && rankUnits > 0 ? { tier, label: rankRewardLabel(tier), amount: unitsToStickers(rankUnits) } : null,
      canGrant: canGrantStickers(actor),
      isSuperAdmin: isSuperAdmin(actor),
      canUploadVip: isSuperAdmin(actor) || Boolean(actor.canUpload) || Boolean(actor.isContributor)
    } });
  }
  await ensureInitialStickers(db, actor.id);

  if (path === '/api/stickers/reconcile' && method === 'POST') {
    await reconcileCommentRewards(db,actor); await reconcileLuckyRewards(db,actor);
    return json({success:true});
  }

  if ((path === '/api/stickers/me' || path === '/api/stickers/summary') && method === 'GET') {
    const quick = path.endsWith('/summary');
    if (!quick) { await reconcileCommentRewards(db, actor); await reconcileLuckyRewards(db,actor); }
    const after = Math.max(0, Number(url.searchParams.get('after')) || 0);
    // One query returns a consistent balance/cursor/changes snapshot.
    const snapshot:any=await db.prepare(`SELECT COALESCE(SUM(deltaUnits),0) AS balanceUnits,COALESCE(MAX(rowid),0) AS cursor,
      (SELECT json_group_array(json_object('id',id,'delta',deltaUnits/10.0)) FROM
        (SELECT id,deltaUnits FROM sticker_transactions WHERE userId=? AND rowid>? AND ?>0 AND type<>'initial' ORDER BY rowid)) AS changes,
      (SELECT json_group_array(DISTINCT trackId) FROM sticker_transactions WHERE userId=? AND type='comment_reward' AND deltaUnits>0 AND trackId IS NOT NULL) AS commentRewardTrackIds
      FROM sticker_transactions WHERE userId=?`).bind(actor.id,after,after,actor.id,actor.id).first();
    const balanceUnits=Number(snapshot.balanceUnits);const cursor=Number(snapshot.cursor);const changes=parseJson(snapshot.changes,[]);
    const commentRewardTrackIds=parseJson(snapshot.commentRewardTrackIds,[]);
    const [unlocks, unread] = await Promise.all([
      db.prepare('SELECT trackId FROM sticker_unlocks WHERE userId = ? AND transactionId IS NOT NULL').bind(actor.id).all(),
      db.prepare('SELECT COUNT(*) AS count FROM member_notifications WHERE userId = ? AND readAt IS NULL').bind(actor.id).first()
    ]);
    return json({balanceUnits,balance:unitsToStickers(balanceUnits),cursor,changes,
      unlockedTrackIds:(unlocks.results || []).map((row:any)=>row.trackId),commentRewardTrackIds,unreadNotifications:Number((unread as any)?.count || 0),
      canGrant:canGrantStickers(actor),isSuperAdmin:isSuperAdmin(actor),canManageRules:canManageRules(actor),
      ...(quick ? {} : {transactions:await transactionHistory(db,actor)})});
  }
  if (path === '/api/stickers/history' && method === 'GET') return json({transactions:await transactionHistory(db,actor)});

  if (path === '/api/stickers/settings') {
    if (!canManageRules(actor)) return json({ error: '只有超級管理員可管理貼紙規則，或授權管理員可修改' }, 403);
    if (method === 'GET') return json({ settings: settingsForClient(await settingMap(db), isSuperAdmin(actor)) });
    if (method === 'PUT') {
      const body: any = await request.json().catch(() => ({}));
      for (const key of ['ratingReward', 'likeReward', 'keywordReward', 'keywordRewardLimit', 'commentThreadLimit', 'replyReward', 'luckyCost', 'vipUploadCost']) {
        if (!validTenth(body[key])) return json({ error: `${key} 必須為 0 至 1000 張，且以 0.1 為單位` }, 400);
      }
      const extraFields: Record<string,string> = {profileReward:'profile_reward_units',luckyCompleteReward:'lucky_complete_units',luckyDailyLimit:'lucky_daily_limit_units',toastSeconds:'toast_seconds_units',profileHintSeconds:'profile_hint_seconds_units'};
      for (const key of Object.keys(extraFields)) if (body[key] !== undefined && (!validTenth(body[key]) || (key.endsWith('Seconds') && (body[key]<0.1 || body[key]>60)) || (key==='luckyDailyLimit' && !Number.isInteger(body[key])))) return json({error:'時間需為0.1–60秒，每日次數為整數，張數為0–1000'},400);
      const rankFields: Record<string,string> = {platinumRankReward:'platinum_rank_reward_units',emeraldRankReward:'emerald_rank_reward_units',diamondRankReward:'diamond_rank_reward_units'};
      const hasRankFields = [...Object.keys(rankFields),'platinumEarningMultiplier','platinumRankMultiplier'].some(key => body[key] !== undefined);
      if (hasRankFields && !isSuperAdmin(actor)) return json({error:'只有超級管理員可修改獎銜貼紙獎勵'},403);
      for (const key of Object.keys(rankFields)) if (body[key] !== undefined && !validTenth(body[key])) return json({error:'獎銜貼紙張數需為0至1000張'},400);
      const earningMultiplierInput = body.platinumEarningMultiplier ?? body.platinumRankMultiplier;
      if (earningMultiplierInput !== undefined && (!Number.isFinite(Number(earningMultiplierInput)) || Number(earningMultiplierInput)<0 || Number(earningMultiplierInput)>100 || Math.abs(Number(earningMultiplierInput)*10-Math.round(Number(earningMultiplierInput)*10))>1e-8)) return json({error:'白金級以上獲取貼紙倍數需為0至100倍，且以0.1為單位'},400);
      for (const key of ['profileHintText','luckyHintText']) if (body[key] !== undefined && (typeof body[key]!=='string' || !body[key].trim() || body[key].length>500)) return json({error:'提示文字需為1–500字'},400);
      const now = Date.now();
      const updates: Record<string, number> = {
        rating_reward_units: stickersToUnits(body.ratingReward),
        like_reward_units: stickersToUnits(body.likeReward),
        keyword_reward_units: stickersToUnits(body.keywordReward),
        keyword_reward_cap_units: stickersToUnits(body.keywordRewardLimit),
        comment_thread_cap_units: stickersToUnits(body.commentThreadLimit),
        reply_reward_units: stickersToUnits(body.replyReward),
        lucky_cost_units: stickersToUnits(body.luckyCost),
        vip_upload_cost_units: stickersToUnits(body.vipUploadCost)
      };
      for (const [key,setting] of Object.entries(extraFields)) if (body[key]!==undefined) updates[setting]=stickersToUnits(body[key]);
      for (const [key,setting] of Object.entries(rankFields)) if (body[key]!==undefined) updates[setting]=stickersToUnits(body[key]);
      if (earningMultiplierInput!==undefined) updates.platinum_rank_multiplier_tenths=Math.round(Number(earningMultiplierInput)*10);
      const textUpdates=['profileHintText','luckyHintText'].filter(key=>body[key]!==undefined).map(key=>db.prepare('INSERT OR REPLACE INTO sticker_text_settings VALUES (?,?)').bind(key,body[key].trim()));
      await db.batch([...textUpdates,...Object.entries(updates).map(([key, value]) =>
        db.prepare(`INSERT INTO sticker_settings(key, valueUnits, updatedAt, updatedBy)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET valueUnits = excluded.valueUnits, updatedAt = excluded.updatedAt, updatedBy = excluded.updatedBy`)
          .bind(key, value, now, actor.id)
      )]);
      return json({ success: true, settings: settingsForClient(await settingMap(db), isSuperAdmin(actor)) });
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
    const previousDraw:any=await db.prepare('SELECT trackId FROM sticker_lucky_draws WHERE operationId=?').bind(`${actor.id}:${operationId}`).first();
    if(previousDraw && previousDraw.trackId!==track.id)return json({error:'此抽選識別碼已使用於另一錄音'},409);
    const result = await addStickerTransaction(db, {
      userId: actor.id,
      deltaUnits: -cost,
      type: 'lucky_cost',
      sourceId: operationId, trackId: track.id,
      description: '使用好手氣',
      actorUserId: actor.id,
      uniqueKey: `lucky:${actor.id}:${operationId}`
    });
    if (result.insufficient) return json({ error: '貼紙不足，無法使用好手氣', balance: unitsToStickers(result.balanceUnits) }, 402);
    const day = taipeiDay();
    const alreadyCompleted = await playbackCompleted(db,actor,track.id);
    const claimed = await db.prepare('SELECT id FROM sticker_transactions WHERE uniqueKey = ?').bind(`lucky-complete:${actor.id}:${track.id}`).first();
    const earnedToday:any = await db.prepare("SELECT COUNT(*) AS n FROM sticker_transactions WHERE userId = ? AND type = 'lucky_complete_reward' AND createdAt >= ?").bind(actor.id,dayStart()).first();
    const eligible = !alreadyCompleted && !claimed && Number(earnedToday?.n || 0)<unitsToStickers(settings.lucky_daily_limit_units);
    await db.prepare('INSERT OR IGNORE INTO sticker_lucky_draws VALUES (?,?,?,?,?,?)').bind(`${actor.id}:${operationId}`,actor.id,track.id,eligible?settings.lucky_complete_units:0,day,Date.now()).run();
    const draw:any = await db.prepare('SELECT rewardUnits FROM sticker_lucky_draws WHERE operationId = ?').bind(`${actor.id}:${operationId}`).first();
    return json({ success:true,charged:unitsToStickers(cost),balance:unitsToStickers(result.balanceUnits),duplicate:!result.inserted,bonus:unitsToStickers(draw.rewardUnits),settings:settingsForClient(settings) });
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
        description: '解鎖錄音', trackId,
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

  if (path === '/api/stickers/grant-history' && method === 'GET') {
    if (!canGrantStickers(actor)) return json({ error: '目前獎銜沒有加貼紙權限' }, 403);
    return json({ transactions: await transactionHistory(db, actor, true) });
  }

  if (path === '/api/stickers/grant-targets' && method === 'GET') {
    if (!canGrantStickers(actor)) return json({ error: '目前獎銜沒有加貼紙權限' }, 403);
    const { results } = await db.prepare('SELECT id, name, email, rank, approvedRank, platinumUpline, diamondUpline FROM users WHERE COALESCE(isBlocked, 0) = 0 ORDER BY name').all();
    const canonicalIds = isSuperAdmin(actor) ? new Set<string>() : new Set(await canonicalDownlineUserIds(db, actor.id));
    const targets = isSuperAdmin(actor)
      ? (results || [])
      : (results || []).filter((target: any) => target.id !== actor.id && (canonicalIds.has(target.id) || isDownlineOf(target, actor)));
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
    if (!reason || reason.length > 500) return json({ error: '人工加貼紙原因需為 1 至 500 字' }, 400);
    if (!Number.isInteger(amount) || amount < 1 || amount > 5) {
      return json({ error: '人工加貼紙需為 1 至 5 張整數' }, 400);
    }
    const target: any = await db.prepare('SELECT * FROM users WHERE id = ? AND COALESCE(isBlocked,0)=0').bind(targetId).first();
    if (!target) return json({ error: '找不到可用會員' }, 404);
    if (!isSuperAdmin(actor)) {
      if (target.id === actor.id) return json({ error: '不可幫自己加貼紙' }, 403);
      const canonicalDownline = await isCanonicalDownlineOf(db, target.id, actor.id);
      if (!canonicalDownline && !isDownlineOf(target, actor)) return json({ error: '白金以上會員只能幫自己的下線會員加貼紙' }, 403);
    }
    const uniqueKey = `manual-grant:${actor.id}:${operationId}`;
    const debitKey = `manual-grant-debit:${actor.id}:${operationId}`;
    const prior: any = await db.prepare('SELECT userId, deltaUnits FROM sticker_transactions WHERE uniqueKey = ?').bind(uniqueKey).first();
    if (prior && (prior.userId !== target.id || prior.deltaUnits !== units)) return json({ error: '操作識別碼已用於其他加貼紙紀錄' }, 409);
    if (!prior) {
      await ensureInitialStickers(db, target.id);
      if (!isSuperAdmin(actor)) await ensureInitialStickers(db, actor.id);
      const now = Date.now();
      const grantId = `st-${crypto.randomUUID()}`;
      if (isSuperAdmin(actor)) {
        await db.prepare(`INSERT OR IGNORE INTO sticker_transactions
          (id,userId,deltaUnits,balanceAfterUnits,type,sourceId,description,actorUserId,uniqueKey,createdAt,relatedUserId)
          SELECT ?, ?, ?, COALESCE((SELECT SUM(deltaUnits) FROM sticker_transactions WHERE userId = ?),0)+?,
            'manual_grant', ?, ?, ?, ?, ?, ?`)
          .bind(grantId,target.id,units,target.id,units,operationId,`${actor.name || '會員'}人工加貼紙：${reason}`,actor.id,uniqueKey,now,actor.id).run();
      } else {
        const debitId = `st-${crypto.randomUUID()}`;
        await db.batch([
          db.prepare(`INSERT OR IGNORE INTO sticker_transactions
            (id,userId,deltaUnits,balanceAfterUnits,type,sourceId,description,actorUserId,uniqueKey,createdAt,relatedUserId)
            SELECT ?, ?, ?, COALESCE((SELECT SUM(deltaUnits) FROM sticker_transactions WHERE userId = ?),0)-?,
              'manual_grant_debit', ?, ?, ?, ?, ?, ?
            WHERE COALESCE((SELECT SUM(deltaUnits) FROM sticker_transactions WHERE userId = ?),0) >= ?`)
            .bind(debitId,actor.id,-units,actor.id,units,operationId,`加發 ${formatStickerAmount(amount)} 張貼紙給${target.name || '下線會員'}：${reason}`,actor.id,debitKey,now,target.id,actor.id,units),
          db.prepare(`INSERT OR IGNORE INTO sticker_transactions
            (id,userId,deltaUnits,balanceAfterUnits,type,sourceId,description,actorUserId,uniqueKey,createdAt,relatedUserId)
            SELECT ?, ?, ?, COALESCE((SELECT SUM(deltaUnits) FROM sticker_transactions WHERE userId = ?),0)+?,
              'manual_grant', ?, ?, ?, ?, ?, ?
            WHERE EXISTS(SELECT 1 FROM sticker_transactions WHERE uniqueKey = ?)`)
            .bind(grantId,target.id,units,target.id,units,operationId,`${actor.name || '會員'}人工加貼紙：${reason}`,actor.id,uniqueKey,now,actor.id,debitKey)
        ]);
      }
    }
    const transaction: any = await db.prepare('SELECT * FROM sticker_transactions WHERE uniqueKey = ?').bind(uniqueKey).first();
    if (!transaction) return json({ error: '自己的貼紙不足，無法加發給下線會員' }, 402);
    if (!prior) {
      const amountText = formatStickerAmount(amount);
      await db.prepare(`INSERT OR IGNORE INTO member_notifications
        (id, userId, type, title, message, createdAt, readAt, sourceId)
        VALUES (?, ?, 'sticker_grant', '收到貼紙', ?, ?, NULL, ?)`)
        .bind(`notice-${crypto.randomUUID()}`, target.id, `${actor.name || '會員'} 幫你加了 ${amountText} 張貼紙。原因：${reason}`, Date.now(), transaction.id).run();
    }
    return json({ success: true, added: amount, balance: unitsToStickers(await stickerBalanceUnits(db,target.id)), duplicate: Boolean(prior), issuerBalance: isSuperAdmin(actor) ? undefined : unitsToStickers(await stickerBalanceUnits(db,actor.id)) });
  }

  if (path === '/api/stickers/tracks/batch' && method === 'PUT') {
    if (!isSuperAdmin(actor)) return json({ error: '只有超級管理員可批次修改錄音貼紙設定' }, 403);
    const body: any = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.trackIds) ? [...new Set(body.trackIds.map((id: any) => String(id || '').trim()).filter(Boolean))] : [];
    if (!ids.length) return json({ error: '請選擇至少一筆錄音' }, 400);
    const updates: string[] = [];
    const values: number[] = [];
    if (body.stickerUnlockCost !== undefined && body.stickerUnlockCost !== null && body.stickerUnlockCost !== '') {
      if (!validWholeTrackSticker(body.stickerUnlockCost, 50)) return json({ error: '解鎖貼紙需為 0 至 50 張整數' }, 400);
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

    const relevant = path.startsWith('/api/stickers') || path.startsWith('/api/tracks') || path.startsWith('/api/comments') || path.startsWith('/api/users/') || path.startsWith('/api/admin/uplines') || path === '/api/playback/record' || path === '/api/playback/claim-local';
    if (relevant) {
      try { await ensureStickerSchema(env.DB); }
      catch (error) {
        console.error('Sticker schema initialization failed:', error);
        if (path.startsWith('/api/stickers')) return json({ error: '貼紙服務暫時無法使用' }, 503);
      }
    }

    const actor = relevant ? await verifiedActor(request, env).catch(() => null) : null;
    if(actor && path.startsWith('/api/stickers/grant')) actor.uplineAliases=((await env.DB.prepare('SELECT name FROM upline_owners WHERE userId=?').bind(actor.id).all()).results || []).map((r:any)=>normalizeMemberName(r.name));
    if (path.startsWith('/api/admin/uplines')) return handleUplines(request,env.DB,actor);
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
    const commentLike = method === 'POST' ? path.match(/^\/api\/comments\/([^/]+)\/like$/) : null;
    const playbackWrite = method === 'POST' && (path === '/api/playback/record' || path === '/api/playback/claim-local');
    const commentDelete = method === 'DELETE' ? path.match(/^\/api\/comments\/([^/]+)$/) : null;

    let beforeTrack: any = null;
    let beforeCommentReward: any = null;
    const likedComment: any = commentLike ? await env.DB.prepare('SELECT * FROM comments WHERE id = ?').bind(commentLike[1]).first() : null;
    let requestBody: any = null;
    if ((trackAction && method === 'POST') || keywordPost || commentPost || commentLike || playbackWrite) {
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
        "SELECT * FROM sticker_transactions WHERE type IN ('comment_reward','reply_reward') AND sourceId = ? AND deltaUnits > 0 ORDER BY createdAt ASC LIMIT 1"
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

    const rankAudit = method === 'PUT' ? path.match(/^\/api\/users\/([^/]+)\/audit-rank$/) : null;
    if (rankAudit) {
      const targetId = decodeURIComponent(rankAudit[1]);
      const target: any = await env.DB.prepare('SELECT id,name,rank,approvedRank,rankApproved FROM users WHERE id = ?').bind(targetId).first();
      if (target) await awardRankApprovalReward(env.DB, target, actor?.id || 'system');
      return response;
    }

    if (method === 'PUT' && actor && path === `/api/users/${encodeURIComponent(actor.id)}`) {
      const saved:any=await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(actor.id).first();
      const rules=await settingMap(env.DB);
      const missing=missingProfileFields(saved || {});
      if (!missing.length && rules.profile_reward_units>0) await addStickerTransaction(env.DB,{userId:actor.id,deltaUnits:rules.profile_reward_units,type:'profile_reward',sourceId:actor.id,relatedUserId:actor.id,description:'完整填寫個人資料',actorUserId:actor.id,uniqueKey:`profile-complete:${actor.id}`});
      const data:any=await response.clone().json();
      return jsonFromBase({...data,profileCompletion:{complete:!missing.length,missing,settings:settingsForClient(rules)}},response);
    }
    const settings = actor && (trackAction || keywordPost || commentLike || commentPost) ? await settingMap(env.DB) : null;
    if (playbackWrite && actor) {
      await reconcileLuckyRewards(env.DB,actor,requestBody?.trackId);
      await reconcileCommentRewards(env.DB,actor,requestBody?.trackId,String(requestBody?.vipPassword || ''));
      return response;
    }

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
      const track: any = await env.DB.prepare('SELECT * FROM tracks WHERE id = ?').bind(trackId).first();
      if (await canEarnFromTrack(env.DB, actor, track, String(requestBody.vipPassword || ''))) {
        await awardInteraction(env.DB, actor, 'keyword_reward', trackId, Number(settings?.keyword_reward_units || 0),
          `新增網友關鍵字「${keyword}」`, `keyword:${actor.id}:${trackId}:${keyword.toLocaleLowerCase('zh-Hant')}`,trackId,undefined,settings?.keyword_reward_cap_units);
      }
      return response;
    }

    if (commentLike && actor && likedComment && requestBody) {
      const data: any = await response.clone().json().catch(() => ({}));
      const ownerEmail = String(likedComment.authorEmail || '').trim().toLowerCase();
      const actorEmail = String(actor.email || '').trim().toLowerCase();
      const previous = parseJson(likedComment.likedBy, []);
      const track: any = await env.DB.prepare('SELECT * FROM tracks WHERE id = ?').bind(likedComment.trackId).first();
      if (data.hasLiked && ownerEmail !== actorEmail && !previous.includes(actor.id) && !previous.includes(actorEmail)
        && await canEarnFromTrack(env.DB,actor,track,String(requestBody.vipPassword || ''))) {
        await awardInteraction(env.DB,actor,'comment_like_reward',likedComment.id,settings?.like_reward_units || 0,
          '按讚他人心得',`comment-like:${actor.id}:${likedComment.id}`,track.id,likedComment.id);
      }
      return response;
    }
    if (commentPost && actor && requestBody) {
      const trackId = decodeURIComponent(path.split('/')[3]);
      const track: any = await env.DB.prepare('SELECT * FROM tracks WHERE id = ?').bind(trackId).first();
      const data: any = await response.clone().json().catch(() => null);
      await queueCommentReward(env.DB,actor,data?.comment || data,track,settings!,String(requestBody.vipPassword || ''));
      await reconcileCommentRewards(env.DB,actor,trackId,String(requestBody.vipPassword || ''));
      return response;
    }

    if (commentDelete && beforeCommentReward) {
      const commentId = decodeURIComponent((commentDelete as RegExpMatchArray)[1]);
      await addStickerTransaction(env.DB, {
        userId: beforeCommentReward.userId,
        deltaUnits: -Number(beforeCommentReward.deltaUnits || 0),
        type: 'comment_reward_reversal',
        sourceId: commentId, trackId: beforeCommentReward.trackId, commentId,
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

function canManageRules(actor:any) { return isSuperAdmin(actor) || Boolean(actor?.isAdminUser) || actor?.role==='管理員'; }
function taipeiDay() { return new Date(Date.now()+8*3600000).toISOString().slice(0,10); }
function dayStart() { return Date.parse(taipeiDay()+'T00:00:00+08:00'); }
async function reconcileLuckyRewards(db:any,actor:any,trackId?:string) {
  const settings=await settingMap(db);
  const rows=(await db.prepare(`SELECT * FROM sticker_lucky_draws d WHERE userId=? AND day=? AND rewardUnits>0 AND (?='' OR trackId=?)
    AND NOT EXISTS(SELECT 1 FROM sticker_transactions t WHERE t.uniqueKey='lucky-complete:' || d.userId || ':' || d.trackId) ORDER BY createdAt`).bind(actor.id,taipeiDay(),trackId || '',trackId || '').all()).results || [];
  for (const row of rows) {
    if (!await playbackCompleted(db,actor,row.trackId)) continue;
    const track=await db.prepare('SELECT * FROM tracks WHERE id=?').bind(row.trackId).first();
    if (!await canEarnFromTrack(db,actor,track)) continue;
    await addStickerTransaction(db,{userId:actor.id,deltaUnits:row.rewardUnits,type:'lucky_complete_reward',sourceId:row.trackId,trackId:row.trackId,description:'好手氣完聽額外獎勵',actorUserId:actor.id,uniqueKey:`lucky-complete:${actor.id}:${row.trackId}`,dailyLimit:unitsToStickers(settings.lucky_daily_limit_units),dayStart:dayStart()});
  }
}
async function handleUplines(request:Request,db:any,actor:any) {
  if (!canManageRules(actor)) return json({error:'需要管理員權限'},403);
  const columns={platinum:'platinumUpline',diamond:'diamondUpline'} as const;
  if (request.method==='GET') {
    const results=[];
    for (const [kind,column] of Object.entries(columns)) {
      const rows=(await db.prepare(`SELECT n.name,COUNT(u.id) AS members FROM (
        SELECT TRIM(${column}) AS name FROM users WHERE TRIM(COALESCE(${column},''))<>'' UNION SELECT name FROM upline_names WHERE kind=?) n
        LEFT JOIN users u ON TRIM(u.${column})=n.name GROUP BY n.name ORDER BY n.name`).bind(kind).all()).results || [];
      results.push(...rows.map((row:any)=>({...row,kind})));
    }
    return json({uplines:results});
  }
  if (request.method!=='POST') return json({error:'不支援此操作'},405);
  const body:any=await request.json().catch(()=>({}));const column=columns[body.kind as keyof typeof columns];
  const names=Array.isArray(body.names)?[...new Set(body.names.map((x:any)=>String(x).trim()).filter(Boolean))] as string[]:[];
  const target=String(body.target || '').trim();
  if (!column || !['save','merge','delete'].includes(body.action) || names.length>200 || target.length>100 || names.some(x=>x.length>100) || (body.action!=='delete'&&!target) || (body.action!=='save'&&!names.length)) return json({error:'請選擇名單與有效名稱'},400);
  const statements=[];
  if(body.action!=='delete') {
    const targetOwner:any=await db.prepare('SELECT id FROM users WHERE TRIM(name)=?').bind(target).first();
    const owners=new Set<string>();
    for(const name of names) {
      const existing:any=await db.prepare('SELECT userId AS id FROM upline_owners WHERE kind=? AND name=? UNION SELECT id FROM users WHERE TRIM(name)=?').bind(body.kind,name,name).all();
      for(const row of existing.results || []) owners.add(row.id);
    }
    if(!targetOwner && owners.size>1)return json({error:'所選姓名屬於不同會員，請以正確上手會員姓名作為合併目標'},409);
    const ownerId=targetOwner?.id || [...owners][0];
    if(ownerId)statements.push(db.prepare('INSERT OR REPLACE INTO upline_owners VALUES (?,?,?)').bind(body.kind,target,ownerId));
  }
  if (body.action!=='delete') statements.push(db.prepare('INSERT OR IGNORE INTO upline_names VALUES (?,?)').bind(body.kind,target));
  for (const name of names) {
    statements.push(db.prepare(`UPDATE users SET ${column}=? WHERE TRIM(${column})=?`).bind(body.action==='delete'?'':target,name));
    if (name!==target || body.action==='delete') {statements.push(db.prepare('DELETE FROM upline_names WHERE kind=? AND name=?').bind(body.kind,name));statements.push(db.prepare('DELETE FROM upline_owners WHERE kind=? AND name=?').bind(body.kind,name));}
  }
  if (statements.length) await db.batch(statements);
  return json({success:true});
}
