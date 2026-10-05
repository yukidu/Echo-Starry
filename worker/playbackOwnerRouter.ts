import learningWorker from './learningCardRouter';
import type { Env } from './index';
import {
  mergePlaybackRows,
  summarizePlaybackRecords,
  type CanonicalPlaybackRecord,
  type TrackProgressMeta
} from '../shared/learningProgress';

const ownershipSchemaReady = new WeakMap<object, Promise<void>>();
const PLAYBACK_UPSERT_SQL = `
  INSERT INTO playback_memories (
    key, trackId, userIdentifier, memberId, currentTime, duration, progressPercent,
    lastPlayedAt, completed, trackTitle, trackSpeaker, trackSpeakerRank,
    firstListenDate, lastListenDate, finishDate
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    memberId = COALESCE(NULLIF(excluded.memberId, ''), playback_memories.memberId),
    currentTime = MAX(COALESCE(playback_memories.currentTime, 0), excluded.currentTime),
    duration = MAX(COALESCE(playback_memories.duration, 0), excluded.duration),
    progressPercent = MAX(COALESCE(playback_memories.progressPercent, 0), excluded.progressPercent),
    lastPlayedAt = MAX(COALESCE(playback_memories.lastPlayedAt, 0), excluded.lastPlayedAt),
    completed = CASE WHEN playback_memories.completed = 1 OR excluded.completed = 1 THEN 1 ELSE 0 END,
    trackTitle = COALESCE(NULLIF(excluded.trackTitle, ''), playback_memories.trackTitle),
    trackSpeaker = COALESCE(NULLIF(excluded.trackSpeaker, ''), playback_memories.trackSpeaker),
    trackSpeakerRank = COALESCE(NULLIF(excluded.trackSpeakerRank, ''), playback_memories.trackSpeakerRank),
    firstListenDate = COALESCE(NULLIF(playback_memories.firstListenDate, ''), excluded.firstListenDate),
    lastListenDate = CASE
      WHEN COALESCE(playback_memories.lastPlayedAt, 0) > excluded.lastPlayedAt THEN playback_memories.lastListenDate
      ELSE excluded.lastListenDate
    END,
    finishDate = CASE
      WHEN playback_memories.finishDate IS NOT NULL AND TRIM(playback_memories.finishDate) <> '' THEN playback_memories.finishDate
      WHEN excluded.completed = 1 THEN excluded.finishDate
      ELSE playback_memories.finishDate
    END
`;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function normalize(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function dateString() {
  const now = new Date();
  return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
}

async function ensureOwnershipSchema(db: any) {
  if (!db) return;
  const key = db as object;
  if (!ownershipSchemaReady.has(key)) {
    const task = (async () => {
      const table = await db.prepare('PRAGMA table_info(playback_memories)').all();
      const columns = table.results || [];
      if (!columns.some((row: any) => row.name === 'memberId')) {
        try {
          await db.prepare('ALTER TABLE playback_memories ADD COLUMN memberId TEXT').run();
        } catch (error) {
          const check = await db.prepare('PRAGMA table_info(playback_memories)').all();
          if (!check.results?.some((row: any) => row.name === 'memberId')) throw error;
        }
      }

      await db.prepare(`
        CREATE TABLE IF NOT EXISTS playback_identity_aliases (
          alias TEXT PRIMARY KEY,
          memberId TEXT NOT NULL,
          aliasType TEXT NOT NULL,
          source TEXT NOT NULL,
          updatedAt INTEGER NOT NULL
        )
      `).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS playback_memories_member ON playback_memories(memberId)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS playback_alias_member ON playback_identity_aliases(memberId)').run();

      const now = Date.now();
      await db.batch([
        db.prepare(`
          INSERT OR IGNORE INTO playback_identity_aliases(alias, memberId, aliasType, source, updatedAt)
          SELECT LOWER(TRIM(email)), id, 'email', 'users', ?
          FROM users
          WHERE email IS NOT NULL AND TRIM(email) <> ''
        `).bind(now),
        db.prepare(`
          INSERT OR IGNORE INTO playback_identity_aliases(alias, memberId, aliasType, source, updatedAt)
          SELECT LOWER(TRIM(id)), id, 'userId', 'users', ?
          FROM users
          WHERE id IS NOT NULL AND TRIM(id) <> ''
        `).bind(now),
        // A device id is historical identity evidence only when every named
        // member comment made from that device belongs to one registered user.
        db.prepare(`
          INSERT OR IGNORE INTO playback_identity_aliases(alias, memberId, aliasType, source, updatedAt)
          SELECT LOWER(TRIM(c.deviceId)), MIN(u.id), 'device', 'comment', ?
          FROM comments c
          JOIN users u ON LOWER(TRIM(c.authorEmail)) = LOWER(TRIM(u.email))
          WHERE c.deviceId IS NOT NULL AND TRIM(c.deviceId) <> ''
            AND c.authorEmail IS NOT NULL AND TRIM(c.authorEmail) <> ''
            AND NOT EXISTS (
              SELECT 1
              FROM comments other
              WHERE LOWER(TRIM(other.deviceId)) = LOWER(TRIM(c.deviceId))
                AND other.authorEmail IS NOT NULL AND TRIM(other.authorEmail) <> ''
                AND LOWER(TRIM(other.authorEmail)) <> LOWER(TRIM(c.authorEmail))
            )
          GROUP BY LOWER(TRIM(c.deviceId))
          HAVING COUNT(DISTINCT u.id) = 1
        `).bind(now)
      ]);

      // Non-destructive migration: only fill the new owner column when an old
      // identifier can be proved to belong to one canonical member.
      await db.prepare(`
        UPDATE playback_memories
        SET memberId = (
          SELECT a.memberId
          FROM playback_identity_aliases a
          WHERE LOWER(TRIM(playback_memories.userIdentifier)) = a.alias
             OR LOWER(SUBSTR(TRIM(playback_memories.key), 1, LENGTH(a.alias) + 1)) = a.alias || '_'
          LIMIT 1
        )
        WHERE (memberId IS NULL OR TRIM(memberId) = '')
          AND EXISTS (
            SELECT 1
            FROM playback_identity_aliases a
            WHERE LOWER(TRIM(playback_memories.userIdentifier)) = a.alias
               OR LOWER(SUBSTR(TRIM(playback_memories.key), 1, LENGTH(a.alias) + 1)) = a.alias || '_'
          )
      `).run();
    })();
    ownershipSchemaReady.set(key, task);
    task.catch(() => ownershipSchemaReady.delete(key));
  }
  await ownershipSchemaReady.get(key);
}

async function authenticatedUser(request: Request, env: Env) {
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization) return null;
  const response = await learningWorker.fetch(new Request(new URL('/api/auth/session', request.url), {
    method: 'GET',
    headers: { Authorization: authorization }
  }), env);
  if (!response.ok) return null;
  const data: any = await response.json().catch(() => ({}));
  return data?.user || null;
}

async function resolveMember(db: any, requestedId: string) {
  const requested = normalize(requestedId);
  if (!requested) return null;
  return db.prepare(`
    SELECT id, email, name
    FROM users
    WHERE LOWER(TRIM(id)) = ? OR LOWER(TRIM(email)) = ?
    LIMIT 1
  `).bind(requested, requested).first();
}

async function aliasesForMember(db: any, member: any) {
  const aliases = new Set<string>();
  const id = normalize(member?.id);
  const email = normalize(member?.email);
  if (id) aliases.add(id);
  if (email) aliases.add(email);

  const stored = await db.prepare('SELECT alias FROM playback_identity_aliases WHERE memberId = ?')
    .bind(String(member.id || '')).all();
  for (const row of stored.results || []) {
    const alias = normalize((row as any).alias);
    if (alias) aliases.add(alias);
  }

  // Read-time recovery for old device rows. A shared browser/device is excluded.
  if (email) {
    const commentDevices = await db.prepare(`
      SELECT DISTINCT LOWER(TRIM(c.deviceId)) AS alias
      FROM comments c
      WHERE LOWER(TRIM(c.authorEmail)) = ?
        AND c.deviceId IS NOT NULL AND TRIM(c.deviceId) <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM comments other
          WHERE LOWER(TRIM(other.deviceId)) = LOWER(TRIM(c.deviceId))
            AND other.authorEmail IS NOT NULL AND TRIM(other.authorEmail) <> ''
            AND LOWER(TRIM(other.authorEmail)) <> ?
        )
    `).bind(email, email).all();
    for (const row of commentDevices.results || []) {
      const alias = normalize((row as any).alias);
      if (alias) aliases.add(alias);
    }
  }
  return [...aliases];
}

function legacyIdentityFilter(aliases: string[]) {
  const clauses: string[] = [];
  const bindings: string[] = [];
  for (const alias of aliases) {
    clauses.push(`(LOWER(TRIM(userIdentifier)) = ? OR LOWER(SUBSTR(TRIM(key), 1, LENGTH(?) + 1)) = ?)`);
    bindings.push(alias, alias, `${alias}_`);
  }
  return { where: clauses.length ? clauses.join(' OR ') : '0', bindings };
}

async function trackMetaMap(db: any, trackIds: string[]) {
  const ids = [...new Set(trackIds.filter(Boolean))];
  if (!ids.length) return {} as Record<string, TrackProgressMeta>;
  const placeholders = ids.map(() => '?').join(',');
  const result = await db.prepare(`
    SELECT id, title, speaker, speakerRank, durationSeconds
    FROM tracks
    WHERE id IN (${placeholders})
  `).bind(...ids).all();
  const map: Record<string, TrackProgressMeta> = {};
  for (const row of result.results || []) map[String((row as any).id)] = row as TrackProgressMeta;
  return map;
}

async function canonicalRecordsForMember(env: Env, member: any): Promise<Record<string, CanonicalPlaybackRecord>> {
  if (!env.DB || !member?.id) return {};
  await ensureOwnershipSchema(env.DB);
  const aliases = await aliasesForMember(env.DB, member);
  const legacy = legacyIdentityFilter(aliases);
  const result = await env.DB.prepare(`
    SELECT *
    FROM playback_memories
    WHERE memberId = ? OR ${legacy.where}
    ORDER BY COALESCE(lastPlayedAt, 0) ASC
  `).bind(String(member.id), ...legacy.bindings).all();

  const rows = result.results || [];
  const meta = await trackMetaMap(env.DB, rows.map((row: any) => String(row.trackId || '')));
  const merged = mergePlaybackRows(rows as any[], meta);
  for (const [trackId, record] of Object.entries(merged)) {
    record.isDeleted = !meta[trackId] || record.isDeleted;
  }
  return merged;
}

async function publicHistory(requestedId: string, env: Env) {
  if (!env.DB) return json({ error: '資料庫尚未連線' }, 503);
  await ensureOwnershipSchema(env.DB);
  const member = await resolveMember(env.DB, requestedId);
  if (!member) return json({ error: '找不到指定會員' }, 404);
  return json(await canonicalRecordsForMember(env, member));
}

async function resolveMemberForWrite(request: Request, env: Env, identifier: string) {
  if (!env.DB) return null;
  const auth = await authenticatedUser(request, env);
  if (auth?.id) return auth;

  const direct = await resolveMember(env.DB, identifier);
  if (direct) return direct;

  const alias = normalize(identifier);
  if (!alias) return null;
  return env.DB.prepare(`
    SELECT u.id, u.email, u.name
    FROM playback_identity_aliases a
    JOIN users u ON u.id = a.memberId
    WHERE a.alias = ?
    LIMIT 1
  `).bind(alias).first();
}

function playbackStatement(
  db: any,
  ownerIdentifier: string,
  memberId: string,
  track: any,
  current: number,
  duration: number,
  completedHint = false,
  playedAt = Date.now()
) {
  const safeDuration = Math.max(1, Number(duration) || Number(track?.durationSeconds) || 600);
  const safeCurrent = Math.min(safeDuration, Math.max(0, Number(current) || 0));
  const rawProgress = Math.min(100, Math.max(0, safeCurrent / safeDuration * 100));
  const completed = completedHint || rawProgress >= 95;
  const progressPercent = completed ? 100 : Math.round(rawProgress * 10) / 10;
  const day = dateString();
  return db.prepare(PLAYBACK_UPSERT_SQL).bind(
    `${ownerIdentifier}_${track.id}`,
    track.id,
    ownerIdentifier,
    memberId || null,
    completed ? safeDuration : safeCurrent,
    safeDuration,
    progressPercent,
    playedAt,
    completed ? 1 : 0,
    String(track.title || ''),
    String(track.speaker || ''),
    String(track.speakerRank || ''),
    day,
    day,
    completed ? day : null
  );
}

async function recordPlayback(request: Request, env: Env) {
  if (!env.DB) return json({ error: '資料庫尚未連線' }, 503);
  await ensureOwnershipSchema(env.DB);
  const body: any = await request.clone().json().catch(() => ({}));
  const trackId = String(body.trackId || '').trim();
  const suppliedIdentifier = normalize(body.userIdOrDeviceId);
  if (!trackId || !suppliedIdentifier) {
    return json({ error: '缺少必要參數 (trackId, userIdOrDeviceId)' }, 400);
  }

  const member: any = await resolveMemberForWrite(request, env, suppliedIdentifier);
  const memberId = member?.id ? String(member.id) : '';
  const identifier = memberId || suppliedIdentifier;
  const track: any = await env.DB.prepare(`
    SELECT id, title, speaker, speakerRank, durationSeconds
    FROM tracks
    WHERE id = ?
    LIMIT 1
  `).bind(trackId).first();
  if (!track) return json({ error: '找不到音檔' }, 404);

  await playbackStatement(
    env.DB,
    identifier,
    memberId,
    track,
    Number(body.currentTime),
    Number(body.duration),
    Boolean(body.completed)
  ).run();

  const records = memberId ? await canonicalRecordsForMember(env, member) : {};
  return json({ success: true, owner: memberId || null, record: records[trackId] || null });
}

async function claimLocalPlayback(request: Request, env: Env) {
  if (!env.DB) return json({ error: '資料庫尚未連線' }, 503);
  await ensureOwnershipSchema(env.DB);

  // Device/localStorage claims are never trusted from an email in the body.
  // The existing Google-backed Bearer session is the sole owner authority.
  const member: any = await authenticatedUser(request, env);
  if (!member?.id) return json({ error: '請先以 Google 帳號登入' }, 401);

  const body: any = await request.clone().json().catch(() => ({}));
  const deviceId = normalize(body.deviceId);
  if (!/^dev-[a-z0-9-]+$/i.test(deviceId)) {
    return json({ error: '裝置識別格式錯誤' }, 400);
  }

  const memberId = String(member.id);
  const existing: any = await env.DB.prepare(`
    SELECT memberId
    FROM playback_identity_aliases
    WHERE alias = ?
    LIMIT 1
  `).bind(deviceId).first();

  // Never transfer a device already proven to belong to another account.
  if (existing && String(existing.memberId) !== memberId) {
    return json({ error: '此裝置已有其他會員歸戶紀錄，已停止自動合併。', conflict: true }, 409);
  }

  await env.DB.prepare(`
    INSERT INTO playback_identity_aliases(alias, memberId, aliasType, source, updatedAt)
    VALUES (?, ?, 'device', 'verified-session', ?)
    ON CONFLICT(alias) DO UPDATE SET
      updatedAt = excluded.updatedAt,
      source = excluded.source
    WHERE playback_identity_aliases.memberId = excluded.memberId
  `).bind(deviceId, memberId, Date.now()).run();

  // Existing cloud rows under this device become owned by this verified member.
  await env.DB.prepare(`
    UPDATE playback_memories
    SET memberId = ?
    WHERE (memberId IS NULL OR TRIM(memberId) = '')
      AND (
        LOWER(TRIM(userIdentifier)) = ?
        OR LOWER(SUBSTR(TRIM(key), 1, LENGTH(?) + 1)) = ?
      )
  `).bind(memberId, deviceId, deviceId, `${deviceId}_`).run();

  const localRows = Array.isArray(body.localPlayback) ? body.localPlayback.slice(0, 300) : [];
  const trackIds = [...new Set<string>(
    localRows.map((row: any) => String(row?.trackId || '').trim()).filter(Boolean)
  )];
  const meta = await trackMetaMap(env.DB, trackIds);
  const statements: any[] = [];

  for (const row of localRows) {
    const trackId = String(row?.trackId || '').trim();
    const track = meta[trackId];
    if (!track) continue;
    const duration = Number(row?.duration) || Number(track.durationSeconds) || 0;
    const percentage = Math.max(0, Math.min(100, Number(row?.percentage) || 0));
    const current = Number(row?.currentTime) || (duration > 0 ? duration * percentage / 100 : 0);
    const completed = Boolean(row?.completed) || percentage >= 95;
    statements.push(
      playbackStatement(env.DB, memberId, memberId, track, current, duration, completed)
    );
  }

  if (statements.length) await env.DB.batch(statements);
  const records = await canonicalRecordsForMember(env, member);
  return json({
    success: true,
    memberId,
    importedCount: statements.length,
    totalCount: Object.keys(records).length
  });
}

async function memberStats(request: Request, env: Env) {
  if (!env.DB) return json({ error: '資料庫尚未連線' }, 503);
  await ensureOwnershipSchema(env.DB);
  const url = new URL(request.url);
  const requested = url.searchParams.get('member') || '';
  let member: any = requested ? await resolveMember(env.DB, requested) : null;
  if (!member) member = await authenticatedUser(request, env);
  if (!member?.id) return json({ error: '找不到會員' }, 404);

  const records = await canonicalRecordsForMember(env, member);
  const summary = summarizePlaybackRecords(records);
  const email = normalize(member.email);
  const comments: any = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM comments
    WHERE LOWER(TRIM(authorEmail)) = ?
  `).bind(email).first();
  const shares: any = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM share_events
    WHERE userId = ? OR LOWER(TRIM(userEmail)) = ?
  `).bind(String(member.id), email).first();

  return json({
    ...summary,
    commentCount: Number(comments?.count) || 0,
    shareCount: Number(shares?.count) || 0
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (path === '/api/playback/claim-local' && method === 'POST') {
      return claimLocalPlayback(request, env);
    }
    if (path === '/api/playback/record' && method === 'POST') {
      return recordPlayback(request, env);
    }
    if (path.startsWith('/api/playback/history/') && method === 'GET') {
      const requestedId = decodeURIComponent(path.slice('/api/playback/history/'.length));
      return publicHistory(requestedId, env);
    }
    if (path === '/api/member-learning-card-stats' && method === 'GET') {
      return memberStats(request, env);
    }

    return learningWorker.fetch(request, env);
  }
};
