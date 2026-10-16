import appWorker from './adminUserDeleteRouter';
import type { Env } from './index';
import {
  MAX_TRACK_SPEAKERS,
  normalizeTrackSpeakers,
  parseSpeakerInput,
  speakerDisplay
} from '../shared/speakers';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

const MULTI_SPEAKER_MIGRATION = 'multi-speakers-v187';
const DB_BATCH_SIZE = 50;
const initialized = new WeakMap<object, Promise<void>>();

async function runBatches(db: any, statements: any[]) {
  for (let index = 0; index < statements.length; index += DB_BATCH_SIZE) {
    await db.batch(statements.slice(index, index + DB_BATCH_SIZE));
  }
}

async function ensureDatabaseExtensions(db: any) {
  if (!initialized.has(db)) {
    const promise = (async () => {
      const { results } = await db.prepare('PRAGMA table_info(tracks)').all();
      if (!results?.length) throw new Error('Missing database table: tracks');
      const columns = new Set(results.map((row: any) => row.name));
      if (!columns.has('favoritedBy')) {
        try { await db.prepare("ALTER TABLE tracks ADD COLUMN favoritedBy TEXT DEFAULT '[]'").run(); }
        catch (error) {
          const check = await db.prepare('PRAGMA table_info(tracks)').all();
          if (!check.results.some((row: any) => row.name === 'favoritedBy')) throw error;
        }
      }
      if (!columns.has('favoriteCount')) {
        try { await db.prepare('ALTER TABLE tracks ADD COLUMN favoriteCount INTEGER DEFAULT 0').run(); }
        catch (error) {
          const check = await db.prepare('PRAGMA table_info(tracks)').all();
          if (!check.results.some((row: any) => row.name === 'favoriteCount')) throw error;
        }
      }

      await db.prepare('CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY)').run();
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS track_speakers (
          trackId TEXT NOT NULL,
          speakerName TEXT NOT NULL,
          position INTEGER NOT NULL CHECK(position >= 0 AND position < 5),
          PRIMARY KEY (trackId, position),
          UNIQUE (trackId, speakerName)
        )
      `).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS track_speakers_name ON track_speakers(speakerName)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS comments_author_email_created ON comments(authorEmail, createdAt)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS playback_completed_member_track ON playback_memories(completed, memberId, trackId)').run();

      const migrated = await db.prepare('SELECT name FROM app_migrations WHERE name = ?')
        .bind(MULTI_SPEAKER_MIGRATION)
        .first();
      if (!migrated) {
        const { results: tracks } = await db.prepare('SELECT id, speaker FROM tracks').all();
        const statements: any[] = [];
        for (const row of tracks || []) {
          const trackId = String((row as any).id || '').trim();
          if (!trackId) continue;
          const names = normalizeTrackSpeakers((row as any).speaker);
          if (!names.length) continue;
          const canonical = speakerDisplay(names);
          statements.push(db.prepare('DELETE FROM track_speakers WHERE trackId = ?').bind(trackId));
          names.forEach((name, position) => {
            statements.push(
              db.prepare('INSERT OR REPLACE INTO track_speakers (trackId, speakerName, position) VALUES (?, ?, ?)')
                .bind(trackId, name, position)
            );
          });
          if (canonical && canonical !== String((row as any).speaker || '')) {
            statements.push(db.prepare('UPDATE tracks SET speaker = ? WHERE id = ?').bind(canonical, trackId));
          }
        }
        await runBatches(db, statements);
        await db.prepare('INSERT OR IGNORE INTO app_migrations(name) VALUES (?)')
          .bind(MULTI_SPEAKER_MIGRATION)
          .run();
      }
    })();
    initialized.set(db, promise);
    promise.catch(() => initialized.delete(db));
  }
  await initialized.get(db);
}

function json(data: unknown, status = 200, base?: Response) {
  const headers = new Headers(base?.headers || HEADERS);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  return new Response(JSON.stringify(data), { status, headers });
}

function parseIds(value: unknown): string[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map(String).map(value => value.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseRatings(value: unknown): Record<string, number> {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const next: Record<string, number> = {};
    for (const [key, rawScore] of Object.entries(parsed as Record<string, unknown>)) {
      const score = Number(rawScore);
      if (key.trim() && Number.isFinite(score) && score >= 1 && score <= 5) next[key] = score;
    }
    return next;
  } catch {
    return {};
  }
}

function canonicalRating(value: unknown) {
  const ratings = parseRatings(value);
  const scores = Object.values(ratings);
  const ratingCount = scores.length;
  const rating = ratingCount
    ? Math.round((scores.reduce((sum, score) => sum + score, 0) / ratingCount) * 10) / 10
    : 0;
  return { ratings, rating, ratingCount };
}

function identityKeys(body: any) {
  return [...new Set(
    [body.identifier, body.userEmail, body.userId, body.deviceId]
      .filter(value => typeof value === 'string' && value.trim())
      .map(value => value.includes('@') ? value.toLowerCase().trim() : value.trim())
  )];
}

async function trackSpeakerRows(db: any) {
  const { results } = await db.prepare(
    'SELECT trackId, speakerName, position FROM track_speakers ORDER BY trackId ASC, position ASC'
  ).all();
  const map = new Map<string, string[]>();
  for (const row of results || []) {
    const trackId = String((row as any).trackId || '').trim();
    const speakerName = String((row as any).speakerName || '').trim();
    if (!trackId || !speakerName) continue;
    const names = map.get(trackId) || [];
    names.push(speakerName);
    map.set(trackId, names);
  }
  return map;
}

async function actualCommentCounts(db: any) {
  const { results } = await db.prepare(
    'SELECT trackId, COUNT(*) AS count FROM comments GROUP BY trackId'
  ).all();
  const map = new Map<string, number>();
  for (const row of results || []) {
    map.set(String((row as any).trackId || ''), Number((row as any).count || 0));
  }
  return map;
}

async function canonicalizeTrackStatistics(tracks: any[], db: any) {
  const commentCounts = await actualCommentCounts(db);
  const repairs: any[] = [];
  const normalized = tracks.map(track => {
    const likedBy = parseIds(track?.likedBy);
    const { ratings, rating, ratingCount } = canonicalRating(track?.ratings);
    const likes = likedBy.length;
    const commentsCount = commentCounts.get(String(track?.id || '')) || 0;

    if (
      Number(track?.likes || 0) !== likes ||
      Number(track?.ratingCount || 0) !== ratingCount ||
      Number(track?.rating || 0) !== rating ||
      Number(track?.commentsCount || 0) !== commentsCount
    ) {
      repairs.push(
        db.prepare('UPDATE tracks SET likes = ?, rating = ?, ratingCount = ?, commentsCount = ? WHERE id = ?')
          .bind(likes, rating, ratingCount, commentsCount, String(track?.id || ''))
      );
    }

    return {
      ...track,
      likedBy,
      ratings,
      likes,
      rating,
      ratingCount,
      commentsCount
    };
  });

  if (repairs.length) await runBatches(db, repairs);
  return normalized;
}

async function augmentTrackList(response: Response, db: any) {
  if (!response.ok) return response;
  try {
    const tracks: any = await response.clone().json();
    if (!Array.isArray(tracks)) return response;
    const [map, canonicalTracks] = await Promise.all([
      trackSpeakerRows(db),
      canonicalizeTrackStatistics(tracks, db)
    ]);
    const next = canonicalTracks.map(track => {
      const names = map.get(String(track?.id || '').trim()) || normalizeTrackSpeakers(track?.speaker);
      const canonical = speakerDisplay(names) || String(track?.speaker || '').trim();
      return { ...track, speaker: canonical, speakers: names };
    });
    return json(next, response.status, response);
  } catch (error) {
    console.warn('Track statistics health normalization failed:', error);
    return response;
  }
}

function leaderboardUser(row: any) {
  return {
    id: String(row?.id || ''),
    name: String(row?.name || ''),
    email: String(row?.email || ''),
    role: String(row?.role || ''),
    rank: String(row?.rank || '無'),
    approvedRank: String(row?.approvedRank || ''),
    rankApproved: Boolean(row?.rankApproved),
    avatar: String(row?.avatar || ''),
    center: String(row?.center || ''),
    lastActive: String(row?.lastActive || ''),
    rankUpdatedAt: String(row?.rankUpdatedAt || ''),
    registerDate: String(row?.registerDate || ''),
    playCount: Number(row?.playCount || 0)
  };
}

type LeaderboardUser = ReturnType<typeof leaderboardUser>;

async function realLeaderboard(db: any) {
  const [userResult, trackResult, commentResult, finishResult] = await Promise.all([
    db.prepare(`
      SELECT id,name,email,role,rank,approvedRank,rankApproved,avatar,center,lastActive,rankUpdatedAt,registerDate,playCount
      FROM users
      WHERE COALESCE(isBlocked,0)=0
        AND email IS NOT NULL AND TRIM(email)<>'' AND LOWER(TRIM(email))<>'guest'
        AND id<>'guest' AND id NOT LIKE 'guest-%' AND name NOT LIKE '訪客%'
    `).all(),
    db.prepare('SELECT id, likedBy FROM tracks').all(),
    db.prepare(`
      SELECT LOWER(TRIM(COALESCE(authorEmail,''))) AS emailKey, TRIM(COALESCE(authorName,'')) AS authorName, COUNT(*) AS count
      FROM comments
      GROUP BY LOWER(TRIM(COALESCE(authorEmail,''))), TRIM(COALESCE(authorName,''))
    `).all(),
    db.prepare(`
      SELECT u.id AS userId, COUNT(DISTINCT pm.trackId) AS count
      FROM users u
      JOIN playback_memories pm
        ON COALESCE(pm.completed,0)=1
       AND COALESCE(pm.isDeleted,0)=0
       AND (
         pm.memberId=u.id OR
         pm.userIdentifier=u.id OR
         (u.email IS NOT NULL AND TRIM(u.email)<>'' AND LOWER(TRIM(pm.userIdentifier))=LOWER(TRIM(u.email)))
       )
      WHERE COALESCE(u.isBlocked,0)=0
      GROUP BY u.id
    `).all()
  ]);

  const users: LeaderboardUser[] = (userResult.results || []).map(leaderboardUser);
  const userById = new Map<string, LeaderboardUser>(users.map(user => [user.id, user] as const));
  const identityOwner = new Map<string, string>();
  const uniqueNameOwner = new Map<string, string | null>();
  for (const user of users) {
    identityOwner.set(user.id, user.id);
    if (user.email) identityOwner.set(user.email.toLowerCase().trim(), user.id);
    const nameKey = user.name.trim();
    if (nameKey) uniqueNameOwner.set(nameKey, uniqueNameOwner.has(nameKey) ? null : user.id);
  }

  const likeCounts = new Map<string, number>();
  for (const track of trackResult.results || []) {
    const owners = new Set<string>();
    for (const rawKey of parseIds((track as any).likedBy)) {
      const key = rawKey.includes('@') ? rawKey.toLowerCase().trim() : rawKey.trim();
      const owner = identityOwner.get(key);
      if (owner) owners.add(owner);
    }
    owners.forEach(owner => likeCounts.set(owner, (likeCounts.get(owner) || 0) + 1));
  }

  const commentCounts = new Map<string, number>();
  for (const row of commentResult.results || []) {
    const emailKey = String((row as any).emailKey || '').toLowerCase().trim();
    const authorName = String((row as any).authorName || '').trim();
    const owner = (emailKey && identityOwner.get(emailKey)) || (authorName ? uniqueNameOwner.get(authorName) : null);
    if (owner) commentCounts.set(owner, (commentCounts.get(owner) || 0) + Number((row as any).count || 0));
  }

  const finishCounts = new Map<string, number>();
  for (const row of finishResult.results || []) {
    finishCounts.set(String((row as any).userId || ''), Number((row as any).count || 0));
  }

  const ranked = (counts: Map<string, number>) => [...counts.entries()]
    .flatMap(([id, count]) => {
      const user = userById.get(id);
      return user && count > 0 ? [{ user, count }] : [];
    })
    .sort((a, b) => b.count - a.count || a.user.name.localeCompare(b.user.name, 'zh-Hant'))
    .slice(0, 5);

  return json({
    source: 'd1-real-data',
    generatedAt: Date.now(),
    recentlyUpdated: users.map(user => ({
      user,
      value: user.lastActive || user.rankUpdatedAt || user.registerDate || '近期'
    })),
    topLikes: ranked(likeCounts),
    topComments: ranked(commentCounts),
    topClicks: users
      .filter(user => user.playCount > 0)
      .map(user => ({ user, count: user.playCount }))
      .sort((a, b) => b.count - a.count || a.user.name.localeCompare(b.user.name, 'zh-Hant'))
      .slice(0, 5),
    topFinished: ranked(finishCounts)
  });
}

function speakerPatchFromBody(body: any, isCreate: boolean) {
  const hasSpeakers = Object.prototype.hasOwnProperty.call(body, 'speakers');
  const hasSpeaker = Object.prototype.hasOwnProperty.call(body, 'speaker');
  if (!isCreate && !hasSpeakers && !hasSpeaker) {
    return { body, names: null as string[] | null };
  }

  const raw = hasSpeakers ? body.speakers : body.speaker;
  const parsed = parseSpeakerInput(raw);
  if (parsed.length > MAX_TRACK_SPEAKERS) {
    throw new Error(`一部音檔最多只能設定 ${MAX_TRACK_SPEAKERS} 位演講者`);
  }
  const names = normalizeTrackSpeakers(raw);
  if (!names.length) throw new Error('至少需要一位演講者');

  const nextBody = { ...body, speaker: speakerDisplay(names) };
  delete nextBody.speakers;
  if (isCreate) {
    const { ratings, rating, ratingCount } = canonicalRating(nextBody.ratings);
    const likedBy = parseIds(nextBody.likedBy);
    nextBody.ratings = ratings;
    nextBody.rating = rating;
    nextBody.ratingCount = ratingCount;
    nextBody.likedBy = likedBy;
    nextBody.likes = likedBy.length;
    nextBody.commentsCount = 0;
  }
  return { body: nextBody, names };
}

function rewriteJsonRequest(request: Request, body: any) {
  const headers = new Headers(request.headers);
  headers.set('Content-Type', 'application/json');
  headers.delete('Content-Length');
  return new Request(request, { headers, body: JSON.stringify(body) });
}

async function syncTrackSpeakers(db: any, trackId: string, names: string[]) {
  const safeNames = normalizeTrackSpeakers(names);
  const statements = [db.prepare('DELETE FROM track_speakers WHERE trackId = ?').bind(trackId)];
  safeNames.forEach((name, position) => {
    statements.push(
      db.prepare('INSERT INTO track_speakers (trackId, speakerName, position) VALUES (?, ?, ?)')
        .bind(trackId, name, position)
    );
  });
  await db.batch(statements);
}

async function handleTrackMutation(request: Request, env: Env, method: string, path: string) {
  const isCreate = path === '/api/tracks' && method === 'POST';
  const isUpdate = /^\/api\/tracks\/[^/]+$/.test(path) && method === 'PUT';
  const isDelete = /^\/api\/tracks\/[^/]+$/.test(path) && method === 'DELETE';
  if (!isCreate && !isUpdate && !isDelete) return null;

  if (isDelete) {
    const response = await appWorker.fetch(request, env);
    if (response.ok && env.DB) {
      const trackId = decodeURIComponent(path.slice('/api/tracks/'.length));
      await env.DB.prepare('DELETE FROM track_speakers WHERE trackId = ?').bind(trackId).run();
    }
    return response;
  }

  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
    return appWorker.fetch(request, env);
  }
  const originalBody: any = await request.clone().json().catch(() => null);
  if (!originalBody || typeof originalBody !== 'object' || Array.isArray(originalBody)) {
    return appWorker.fetch(request, env);
  }

  let patched;
  try {
    patched = speakerPatchFromBody(originalBody, isCreate);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : '演講者格式錯誤' }, 400);
  }

  const response = await appWorker.fetch(rewriteJsonRequest(request, patched.body), env);
  if (!response.ok || !env.DB || !patched.names) return response;

  try {
    const data: any = await response.clone().json().catch(() => ({}));
    const trackId = String(
      data?.track?.id || data?.id || (isUpdate ? decodeURIComponent(path.slice('/api/tracks/'.length)) : '')
    ).trim();
    if (!trackId) return json({ error: '音檔已儲存，但演講者關聯缺少音檔編號，請重試' }, 500);
    await syncTrackSpeakers(env.DB, trackId, patched.names);
    const speakers = [...patched.names];
    const stats = canonicalRating(data?.track?.ratings ?? data?.ratings ?? patched.body.ratings);
    if (data?.track && typeof data.track === 'object') {
      data.track = {
        ...data.track,
        speaker: speakerDisplay(speakers),
        speakers,
        ...(isCreate ? { rating: stats.rating, ratingCount: stats.ratingCount, ratings: stats.ratings, likes: parseIds(patched.body.likedBy).length, commentsCount: 0 } : {})
      };
      return json(data, response.status, response);
    }
    return json({
      ...data,
      speaker: speakerDisplay(speakers),
      speakers,
      ...(isCreate ? { rating: stats.rating, ratingCount: stats.ratingCount, ratings: stats.ratings, likes: parseIds(patched.body.likedBy).length, commentsCount: 0 } : {})
    }, response.status, response);
  } catch (error) {
    console.error('v187 track speaker relation sync failed:', error);
    return json({ error: '音檔已儲存，但共同演講者關聯同步失敗，請再按一次儲存' }, 500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const favoriteAction = url.pathname.match(/^\/api\/tracks\/([^/]+)\/favorite$/);
    const trackList = url.pathname === '/api/tracks' && method === 'GET';
    const leaderboard = url.pathname === '/api/leaderboard' && method === 'GET';
    const trackMutation =
      (url.pathname === '/api/tracks' && method === 'POST') ||
      (/^\/api\/tracks\/[^/]+$/.test(url.pathname) && ['PUT', 'DELETE'].includes(method));

    if (!favoriteAction && !trackList && !leaderboard && !trackMutation) return appWorker.fetch(request, env);
    if (!env.DB) {
      if (favoriteAction) return json({ error: '收藏統計資料庫尚未連線' }, 503);
      if (leaderboard) return json({ error: '排行榜資料庫尚未連線' }, 503);
      return appWorker.fetch(request, env);
    }

    try {
      await ensureDatabaseExtensions(env.DB);
    } catch (error) {
      console.warn('Favorite/leaderboard/multi-speaker schema setup failed:', error);
      if (favoriteAction) return json({ error: '收藏統計暫時無法使用' }, 500);
      if (leaderboard) return json({ error: '排行榜統計暫時無法使用' }, 500);
      if (trackMutation) return json({ error: '演講者資料庫升級暫時無法完成，請稍後再試' }, 500);
      return appWorker.fetch(request, env);
    }

    if (leaderboard) return realLeaderboard(env.DB);
    if (trackList) return augmentTrackList(await appWorker.fetch(request, env), env.DB);

    if (trackMutation) {
      const response = await handleTrackMutation(request, env, method, url.pathname);
      if (response) return response;
    }

    if (!favoriteAction || method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const trackId = decodeURIComponent(favoriteAction[1]);
    const body: any = await request.json().catch(() => ({}));
    if (typeof body.favorite !== 'boolean') return json({ error: '收藏狀態格式錯誤' }, 400);
    const keys = identityKeys(body);
    const identifier = keys[0];
    if (!identifier) return json({ error: '缺少收藏者識別資料' }, 400);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const row: any = await env.DB.prepare('SELECT id, favoritedBy, favoriteCount FROM tracks WHERE id = ?').bind(trackId).first();
      if (!row) return json({ error: '找不到此音檔' }, 404);

      const previous = parseIds(row.favoritedBy);
      const alreadyFavorite = previous.some(key => keys.includes(key));
      if (alreadyFavorite === body.favorite) {
        const favoriteCount = previous.length;
        if (Number(row.favoriteCount || 0) !== favoriteCount) {
          await env.DB.prepare('UPDATE tracks SET favoriteCount = ? WHERE id = ?').bind(favoriteCount, trackId).run();
        }
        return json({ success: true, isFavorite: body.favorite, favoriteCount });
      }

      const next = previous.filter(key => !keys.includes(key));
      if (body.favorite) next.push(identifier);
      const favoriteCount = next.length;
      const update = await env.DB.prepare(
        "UPDATE tracks SET favoritedBy = ?, favoriteCount = ? WHERE id = ? AND COALESCE(favoritedBy, '[]') = ?"
      ).bind(JSON.stringify(next), favoriteCount, trackId, row.favoritedBy ?? '[]').run();
      if (update.meta.changes) {
        return json({ success: true, isFavorite: body.favorite, favoriteCount });
      }
    }

    return json({ error: '同時收藏操作過多，請再試一次' }, 409);
  }
};
