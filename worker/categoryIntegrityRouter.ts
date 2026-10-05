import appWorker from './stickerRouter';
import type { Env } from './index';

const CATEGORY_INTEGRITY_MIGRATION = 'category-integrity-v71';
const CATEGORY_UPDATE_BATCH_SIZE = 50;
const initialized = new WeakMap<object, Promise<void>>();

function parseCategories(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map(item => String(item || '').trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

async function liveCategories(db: any): Promise<string[]> {
  const { results } = await db.prepare(
    'SELECT name FROM categories ORDER BY createdAt ASC, rowid ASC'
  ).all();
  return (results || [])
    .map((row: any) => String(row?.name || '').trim())
    .filter(Boolean);
}

function sanitizeCategories(input: unknown, allowed: string[]): string[] {
  const allowedSet = new Set(allowed);
  return [...new Set(parseCategories(input))]
    .filter(name => allowedSet.has(name))
    .slice(0, 3);
}

async function reconcileAllTrackCategories(db: any, allowed?: string[]) {
  const activeCategories = allowed ?? await liveCategories(db);
  const { results: rows } = await db.prepare('SELECT id, categories FROM tracks').all();
  const statements: any[] = [];
  for (const row of rows || []) {
    const before = parseCategories((row as any).categories);
    const after = sanitizeCategories(before, activeCategories);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      statements.push(
        db.prepare('UPDATE tracks SET categories = ? WHERE id = ?')
          .bind(JSON.stringify(after), (row as any).id)
      );
    }
  }

  // Keep reconciliation safe even when an installation has accumulated many
  // tracks. D1 batch sizes stay small and every update is idempotent.
  for (let index = 0; index < statements.length; index += CATEGORY_UPDATE_BATCH_SIZE) {
    await db.batch(statements.slice(index, index + CATEGORY_UPDATE_BATCH_SIZE));
  }
}

async function ensureCategoryIntegrity(db: any) {
  if (!db) return;
  const key = db as object;
  if (!initialized.has(key)) {
    const task = (async () => {
      await db.prepare('CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY)').run();
      const migrated = await db.prepare('SELECT name FROM app_migrations WHERE name = ?')
        .bind(CATEGORY_INTEGRITY_MIGRATION)
        .first();
      if (migrated) return;

      // The categories table is the only source of truth. This one-time v71
      // reconciliation safely removes stale/deleted category names from old
      // track rows. A track with no valid category stays as an empty array.
      await reconcileAllTrackCategories(db);
      await db.prepare('INSERT OR IGNORE INTO app_migrations(name) VALUES (?)')
        .bind(CATEGORY_INTEGRITY_MIGRATION)
        .run();
    })();
    initialized.set(key, task);
    task.catch(() => initialized.delete(key));
  }
  await initialized.get(key);
}

async function sanitizeTrackWrite(request: Request, env: Env): Promise<Request> {
  if (!env.DB) return request;

  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const isCreate = url.pathname === '/api/tracks' && method === 'POST';
  const isUpdate = /^\/api\/tracks\/[^/]+$/.test(url.pathname) && method === 'PUT';
  if (!isCreate && !isUpdate) return request;
  if (!(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) return request;

  const body: any = await request.clone().json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return request;

  const hasCategories = Object.prototype.hasOwnProperty.call(body, 'categories');
  if (!isCreate && !hasCategories) return request;

  const allowed = await liveCategories(env.DB);
  body.categories = sanitizeCategories(body.categories, allowed);

  const headers = new Headers(request.headers);
  headers.set('Content-Type', 'application/json');
  headers.delete('Content-Length');
  return new Request(request, {
    headers,
    body: JSON.stringify(body)
  });
}

function jsonResponse(data: unknown, base?: Response) {
  const headers = new Headers(base?.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.delete('Content-Length');
  headers.delete('Content-Encoding');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  return new Response(JSON.stringify(data), {
    status: base?.status || 200,
    statusText: base?.statusText,
    headers
  });
}

async function repairCreatedTrackResponse(response: Response, env: Env): Promise<Response> {
  if (!env.DB || !response.ok) return response;
  try {
    const data: any = await response.clone().json();
    const track = data?.track || data;
    const id = String(track?.id || '').trim();
    if (!id) return response;
    const allowed = await liveCategories(env.DB);
    const categories = sanitizeCategories(track?.categories, allowed);
    if (JSON.stringify(categories) !== JSON.stringify(track?.categories || [])) {
      await env.DB.prepare('UPDATE tracks SET categories = ? WHERE id = ?')
        .bind(JSON.stringify(categories), id)
        .run();
    }
    const fixedTrack = { ...track, categories };
    return jsonResponse(data?.track ? { ...data, track: fixedTrack, categories } : fixedTrack, response);
  } catch {
    return response;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const categoryOrTrackRequest =
      url.pathname.startsWith('/api/categories') ||
      url.pathname === '/api/tracks' ||
      /^\/api\/tracks\/[^/]+$/.test(url.pathname);

    if (env.DB && categoryOrTrackRequest) {
      try {
        await ensureCategoryIntegrity(env.DB);
      } catch (error) {
        console.warn('Category integrity migration failed:', error);
      }
    }

    // Do not allow a legacy fallback list to become visible when D1 is present.
    // The table itself is authoritative, including the valid empty-list state.
    if (env.DB && url.pathname === '/api/categories' && method === 'GET') {
      try {
        return jsonResponse(await liveCategories(env.DB));
      } catch (error) {
        console.warn('Authoritative category read failed:', error);
        return jsonResponse([], new Response(null, { status: 503 }));
      }
    }

    const nextRequest =
      method === 'POST' || method === 'PUT'
        ? await sanitizeTrackWrite(request, env)
        : request;

    let response = await appWorker.fetch(nextRequest, env);

    if (!env.DB) return response;

    // The older inner route used to append 「未分類」 after deleting the last
    // category from a track. Reconcile immediately after category mutations so
    // that behavior can never leak back into D1.
    if (
      url.pathname.startsWith('/api/categories/') &&
      url.pathname !== '/api/categories/order' &&
      (method === 'PUT' || method === 'DELETE') &&
      response.ok
    ) {
      try {
        const allowed = await liveCategories(env.DB);
        await reconcileAllTrackCategories(env.DB, allowed);
      } catch (error) {
        console.warn('Post-mutation category reconciliation failed:', error);
      }
    }

    // A legacy create route also used to turn [] back into [「未分類」]. Repair
    // the just-created row and response without adding any extra default label.
    if (url.pathname === '/api/tracks' && method === 'POST') {
      response = await repairCreatedTrackResponse(response, env);
    }

    return response;
  }
};
