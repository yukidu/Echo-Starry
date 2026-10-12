import appWorker from './favoriteRouter';
import type { Env } from './index';

const META_NAME = '__ECHOSTARS_V185_META__';
const schemaReady = new WeakMap<object, Promise<void>>();

type VisibilitySetting = {
  authorizedOnlyVisible: boolean;
  hiddenShareAllowed: boolean;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function legacyHiddenFromExternalFiles(value: unknown): boolean {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return false;
    const meta = parsed.find(item => item && typeof item === 'object' && item.name === META_NAME);
    if (!meta) return false;
    const payload = typeof meta.url === 'string' ? JSON.parse(meta.url || '{}') : {};
    return Boolean(payload?.authorizedOnlyVisible);
  } catch {
    return false;
  }
}

async function ensureSchema(db: any) {
  if (!db) return;
  const key = db as object;
  if (!schemaReady.has(key)) {
    const promise = db.prepare(`
      CREATE TABLE IF NOT EXISTS track_visibility_settings (
        trackId TEXT PRIMARY KEY,
        authorizedOnlyVisible INTEGER NOT NULL DEFAULT 0,
        hiddenShareAllowed INTEGER NOT NULL DEFAULT 0,
        updatedAt INTEGER NOT NULL
      )
    `).run().then(() => undefined);
    schemaReady.set(key, promise);
    promise.catch(() => schemaReady.delete(key));
  }
  await schemaReady.get(key);
}

async function effectiveSetting(db: any, trackId: string): Promise<VisibilitySetting | null> {
  if (!db || !trackId) return null;
  await ensureSchema(db);
  const saved: any = await db.prepare(
    'SELECT authorizedOnlyVisible, hiddenShareAllowed FROM track_visibility_settings WHERE trackId = ?'
  ).bind(trackId).first();
  if (saved) {
    const hidden = Boolean(saved.authorizedOnlyVisible);
    return {
      authorizedOnlyVisible: hidden,
      hiddenShareAllowed: hidden && Boolean(saved.hiddenShareAllowed)
    };
  }
  const track: any = await db.prepare('SELECT externalFiles FROM tracks WHERE id = ?').bind(trackId).first();
  if (!track) return null;
  return {
    authorizedOnlyVisible: legacyHiddenFromExternalFiles(track.externalFiles),
    hiddenShareAllowed: false
  };
}

async function saveSetting(db: any, trackId: string, hidden: boolean, allowShare: boolean) {
  await ensureSchema(db);
  await db.prepare(`
    INSERT INTO track_visibility_settings (trackId, authorizedOnlyVisible, hiddenShareAllowed, updatedAt)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(trackId) DO UPDATE SET
      authorizedOnlyVisible = excluded.authorizedOnlyVisible,
      hiddenShareAllowed = excluded.hiddenShareAllowed,
      updatedAt = excluded.updatedAt
  `).bind(trackId, hidden ? 1 : 0, hidden && allowShare ? 1 : 0, Date.now()).run();
}

function withSetting(track: any, setting: VisibilitySetting | null) {
  if (!track || typeof track !== 'object') return track;
  if (!setting) {
    return {
      ...track,
      authorizedOnlyVisible: Boolean(track.authorizedOnlyVisible),
      hiddenShareAllowed: false
    };
  }
  return {
    ...track,
    authorizedOnlyVisible: setting.authorizedOnlyVisible,
    hiddenShareAllowed: setting.hiddenShareAllowed
  };
}

async function overlayTrackResponse(response: Response, db: any): Promise<Response> {
  if (!db || !response.ok) return response;
  const data: any = await response.clone().json().catch(() => null);
  if (!data) return response;

  const overlayOne = async (track: any) => {
    const id = String(track?.id || '').trim();
    if (!id) return track;
    return withSetting(track, await effectiveSetting(db, id));
  };

  let next: any = data;
  if (Array.isArray(data)) {
    next = await Promise.all(data.map(overlayOne));
  } else if (data.track && typeof data.track === 'object') {
    next = { ...data, track: await overlayOne(data.track) };
  } else if (data.id && typeof data === 'object') {
    next = await overlayOne(data);
  } else {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  return new Response(JSON.stringify(next), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function shareBlockedByTrackId(db: any, trackId: string) {
  const setting = await effectiveSetting(db, trackId);
  return Boolean(setting?.authorizedOnlyVisible && !setting.hiddenShareAllowed);
}

async function shareBlockedBySlug(db: any, slug: string) {
  if (!db || !slug) return false;
  await ensureSchema(db);
  try {
    const track: any = await db.prepare('SELECT id, externalFiles FROM tracks WHERE shareSlug = ?').bind(slug).first();
    if (!track) return false;
    const saved: any = await db.prepare(
      'SELECT authorizedOnlyVisible, hiddenShareAllowed FROM track_visibility_settings WHERE trackId = ?'
    ).bind(track.id).first();
    const hidden = saved ? Boolean(saved.authorizedOnlyVisible) : legacyHiddenFromExternalFiles(track.externalFiles);
    const allowed = saved ? Boolean(saved.hiddenShareAllowed) : false;
    return hidden && !allowed;
  } catch {
    // shareSlug may not exist yet on a brand-new database. In that case there
    // cannot be a previously allocated short link to block.
    return false;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const path = url.pathname;
    const db = env.DB;

    const shareAction = path.match(/^\/api\/tracks\/([^/]+)\/(?:share-slug|vip-share(?:\/reset)?)$/);
    if (db && shareAction && method === 'POST') {
      const trackId = decodeURIComponent(shareAction[1]);
      if (await shareBlockedByTrackId(db, trackId)) {
        return json({ error: '此音檔已被隱藏，目前禁止分享' }, 403);
      }
    }

    if (db && method === 'GET' && path.startsWith('/share/')) {
      const slug = decodeURIComponent(path.slice('/share/'.length)).trim();
      if (await shareBlockedBySlug(db, slug)) {
        return new Response('分享連結不存在', { status: 404 });
      }
    }

    let body: any = null;
    const trackWrite = path === '/api/tracks' && method === 'POST'
      ? { create: true, trackId: '' }
      : (/^\/api\/tracks\/[^/]+$/.test(path) && method === 'PUT'
        ? { create: false, trackId: decodeURIComponent(path.split('/api/tracks/')[1]) }
        : null);

    if (trackWrite && (request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
      body = await request.clone().json().catch(() => null);
      if (body && Object.prototype.hasOwnProperty.call(body, 'hiddenShareAllowed') && typeof body.hiddenShareAllowed !== 'boolean') {
        return json({ error: '隱藏音檔分享設定格式錯誤' }, 400);
      }
    }

    const response = await appWorker.fetch(request, env);
    if (!db) return response;

    if (path === '/api/tracks' && method === 'GET') {
      try {
        return await overlayTrackResponse(response, db);
      } catch (error) {
        console.warn('v192 visibility overlay skipped:', error);
        return response;
      }
    }

    if (!trackWrite || !response.ok || !body || typeof body !== 'object') {
      return response;
    }

    try {
      const responseData: any = await response.clone().json().catch(() => null);
      const savedId = trackWrite.create
        ? String(responseData?.track?.id || responseData?.id || body.id || '').trim()
        : trackWrite.trackId;
      if (!savedId) return response;

      const touchesHidden = Object.prototype.hasOwnProperty.call(body, 'authorizedOnlyVisible');
      const touchesShare = Object.prototype.hasOwnProperty.call(body, 'hiddenShareAllowed');
      if (touchesHidden || touchesShare) {
        const current = await effectiveSetting(db, savedId);
        const hidden = touchesHidden ? body.authorizedOnlyVisible === true : Boolean(current?.authorizedOnlyVisible);
        const allowShare = hidden && (touchesShare ? body.hiddenShareAllowed === true : Boolean(current?.hiddenShareAllowed));
        await saveSetting(db, savedId, hidden, allowShare);
      } else if (trackWrite.create) {
        await saveSetting(db, savedId, body.authorizedOnlyVisible === true, false);
      }
      return await overlayTrackResponse(response, db);
    } catch (error) {
      console.error('v192 visibility setting save failed:', error);
      return json({ error: '隱藏音檔設定儲存失敗，請重試' }, 500);
    }
  }
};
