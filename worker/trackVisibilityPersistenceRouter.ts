import appWorker from './privacyCrawlerRouter';
import type { Env } from './index';

const LEGACY_META_NAME = '__ECHOSTARS_V185_META__';
const MIGRATION_NAME = 'authorized-only-visible-v188';
const initByDb = new WeakMap<object, Promise<void>>();

function legacyAuthorizedOnlyVisible(value: unknown): boolean {
  let items: any[] = [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    items = Array.isArray(parsed) ? parsed : [];
  } catch {
    items = [];
  }

  const meta = items.find(item => item && typeof item === 'object' && item.name === LEGACY_META_NAME);
  if (!meta) return false;
  try {
    const decoded = JSON.parse(String(meta.url || '{}'));
    return decoded?.authorizedOnlyVisible === true;
  } catch {
    return false;
  }
}

async function ensureVisibilityPersistence(db: any) {
  if (!db || typeof db !== 'object') return;

  let pending = initByDb.get(db);
  if (!pending) {
    pending = (async () => {
      const tableInfo = await db.prepare('PRAGMA table_info(tracks)').all();
      const columns = new Set((tableInfo.results || []).map((row: any) => String(row.name || '')));
      if (!columns.has('authorizedOnlyVisible')) {
        try {
          await db.prepare('ALTER TABLE tracks ADD COLUMN authorizedOnlyVisible INTEGER DEFAULT 0').run();
        } catch (error) {
          const check = await db.prepare('PRAGMA table_info(tracks)').all();
          if (!(check.results || []).some((row: any) => row.name === 'authorizedOnlyVisible')) throw error;
        }
      }

      // Use a dedicated migration table. The project already has an older
      // app_migrations table with a different schema, so v188 must not reuse it.
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS track_visibility_migrations_v188 (
          name TEXT PRIMARY KEY,
          appliedAt INTEGER NOT NULL
        )
      `).run();

      const migrated = await db.prepare(
        'SELECT name FROM track_visibility_migrations_v188 WHERE name = ?'
      ).bind(MIGRATION_NAME).first();
      if (migrated) return;

      const rows = await db.prepare(
        'SELECT id, externalFiles, authorizedOnlyVisible FROM tracks'
      ).all();
      const updates = (rows.results || [])
        .filter((row: any) => !Boolean(row.authorizedOnlyVisible) && legacyAuthorizedOnlyVisible(row.externalFiles))
        .map((row: any) =>
          db.prepare('UPDATE tracks SET authorizedOnlyVisible = 1, guestVisible = 0 WHERE id = ?').bind(row.id)
        );

      for (let index = 0; index < updates.length; index += 50) {
        await db.batch(updates.slice(index, index + 50));
      }

      await db.prepare(
        'INSERT OR REPLACE INTO track_visibility_migrations_v188(name, appliedAt) VALUES (?, ?)'
      ).bind(MIGRATION_NAME, Date.now()).run();
    })().catch(error => {
      initByDb.delete(db);
      throw error;
    });
    initByDb.set(db, pending);
  }

  await pending;
}

function jsonHeaders(response: Response) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  return headers;
}

async function canonicalTrackMap(db: any) {
  const rows = await db.prepare(
    'SELECT id, authorizedOnlyVisible, guestVisible FROM tracks'
  ).all();
  return new Map((rows.results || []).map((row: any) => [String(row.id), {
    authorizedOnlyVisible: Boolean(row.authorizedOnlyVisible),
    guestVisible: Boolean(row.guestVisible) && !Boolean(row.authorizedOnlyVisible)
  }]));
}

async function canonicalizeTrackList(response: Response, db: any): Promise<Response> {
  if (!response.ok) return response;
  const data = await response.clone().json().catch(() => null);
  if (!Array.isArray(data)) return response;

  const canonical = await canonicalTrackMap(db);
  const tracks = data.map((track: any) => {
    const visibility = canonical.get(String(track?.id || ''));
    return visibility ? { ...track, ...visibility } : track;
  });

  return new Response(JSON.stringify(tracks), {
    status: response.status,
    statusText: response.statusText,
    headers: jsonHeaders(response)
  });
}

async function persistMutationVisibility(
  response: Response,
  db: any,
  requestUrl: URL,
  method: string,
  body: any
): Promise<Response> {
  if (!response.ok || typeof body?.authorizedOnlyVisible !== 'boolean') return response;

  const responseData = await response.clone().json().catch(() => null);
  const trackFromResponse = responseData?.track || responseData;
  const trackId = method === 'PUT'
    ? decodeURIComponent(requestUrl.pathname.slice('/api/tracks/'.length))
    : String(trackFromResponse?.id || body?.id || '');
  if (!trackId) return response;

  const restricted = body.authorizedOnlyVisible === true;
  if (restricted) {
    await db.prepare(
      'UPDATE tracks SET authorizedOnlyVisible = 1, guestVisible = 0 WHERE id = ?'
    ).bind(trackId).run();
  } else if (typeof body.guestVisible === 'boolean') {
    await db.prepare(
      'UPDATE tracks SET authorizedOnlyVisible = 0, guestVisible = ? WHERE id = ?'
    ).bind(body.guestVisible ? 1 : 0, trackId).run();
  } else {
    await db.prepare(
      'UPDATE tracks SET authorizedOnlyVisible = 0 WHERE id = ?'
    ).bind(trackId).run();
  }

  const saved = await db.prepare(
    'SELECT authorizedOnlyVisible, guestVisible FROM tracks WHERE id = ?'
  ).bind(trackId).first();
  if (!saved || !responseData || typeof responseData !== 'object') return response;

  const canonical = {
    authorizedOnlyVisible: Boolean(saved.authorizedOnlyVisible),
    guestVisible: Boolean(saved.guestVisible) && !Boolean(saved.authorizedOnlyVisible)
  };

  const patched = responseData?.track && typeof responseData.track === 'object'
    ? { ...responseData, track: { ...responseData.track, ...canonical } }
    : { ...responseData, ...canonical };

  return new Response(JSON.stringify(patched), {
    status: response.status,
    statusText: response.statusText,
    headers: jsonHeaders(response)
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const isTrackList = url.pathname === '/api/tracks';
    const isTrackMutation =
      (method === 'POST' && isTrackList) ||
      (method === 'PUT' && /^\/api\/tracks\/[^/]+$/.test(url.pathname));

    if (!env.DB || (!isTrackList && !isTrackMutation)) {
      return appWorker.fetch(request, env);
    }

    try {
      await ensureVisibilityPersistence(env.DB);
    } catch (error) {
      console.error('authorizedOnlyVisible schema migration failed:', error);
      return new Response(JSON.stringify({ error: '音檔顯示權限資料初始化失敗，請稍後再試' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
      });
    }

    if (method === 'GET' && isTrackList) {
      const response = await appWorker.fetch(request, env);
      try {
        return await canonicalizeTrackList(response, env.DB);
      } catch (error) {
        console.error('authorizedOnlyVisible list canonicalization failed:', error);
        return response;
      }
    }

    if (isTrackMutation) {
      const body = await request.clone().json().catch(() => ({}));
      const response = await appWorker.fetch(request, env);
      try {
        return await persistMutationVisibility(response, env.DB, url, method, body);
      } catch (error) {
        console.error('authorizedOnlyVisible persistence failed:', error);
        return new Response(JSON.stringify({ error: '音檔已寫入，但顯示權限未能完整保存，請重新儲存' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
        });
      }
    }

    return appWorker.fetch(request, env);
  }
};