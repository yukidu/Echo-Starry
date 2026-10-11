import appWorker from './hiddenTrackRouter';
import type { Env } from './index';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

const initialized = new WeakMap<object, Promise<void>>();

async function ensureFavoriteSchema(db: any) {
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
    })();
    initialized.set(db, promise);
    promise.catch(() => initialized.delete(db));
  }
  await initialized.get(db);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}

function parseIds(value: unknown): string[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function identityKeys(body: any) {
  return [...new Set(
    [body.identifier, body.userEmail, body.userId, body.deviceId]
      .filter(value => typeof value === 'string' && value.trim())
      .map(value => value.includes('@') ? value.toLowerCase().trim() : value.trim())
  )];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const favoriteAction = url.pathname.match(/^\/api\/tracks\/([^/]+)\/favorite$/);
    const trackList = url.pathname === '/api/tracks' && method === 'GET';

    if (!favoriteAction && !trackList) return appWorker.fetch(request, env);
    if (!env.DB) {
      if (favoriteAction) return json({ error: '收藏統計資料庫尚未連線' }, 503);
      return appWorker.fetch(request, env);
    }

    try {
      await ensureFavoriteSchema(env.DB);
    } catch (error) {
      console.warn('Favorite schema setup failed:', error);
      if (favoriteAction) return json({ error: '收藏統計暫時無法使用' }, 500);
      return appWorker.fetch(request, env);
    }

    if (trackList) return appWorker.fetch(request, env);
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