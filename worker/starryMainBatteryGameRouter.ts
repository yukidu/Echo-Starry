import type { Env } from './index';
import appWorker from './privacyCrawlerRouter';
import { sessionContext } from './starryIdProfileDirectoryRouter';
import { handleStarryEcosystemSso } from './starryEcosystemSsoRouter';

const ID_HOST = 'id.starry.phd';
const GAME_ORIGIN = 'https://starry.phd';
const GAME_PATH = '/api/starry-game/battery';
const SOURCE_APP = 'starryphd';
const PROMOTION_TYPE = 'starry_meteor_reward';
const HUNDREDTHS_PER_LEGACY_UNIT = 10;
const MIN_REWARD_INTERVAL_MS = 160;
const schemaReady = new WeakMap<object, Promise<void>>();

function json(request: Request, data: unknown, status = 200) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow'
  });
  if ((request.headers.get('Origin') || '') === GAME_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', GAME_ORIGIN);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function preflight(request: Request) {
  const origin = request.headers.get('Origin') || '';
  if (origin !== GAME_ORIGIN) return json(request, { error: 'Origin not allowed' }, 403);
  const headers = new Headers({
    'Access-Control-Allow-Origin': GAME_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  });
  return new Response(null, { status: 204, headers });
}

async function ensureSchema(env: Env) {
  const db = (env as any).STARRY_ID_DB;
  if (!db) throw new Error('STARRY_ID_DB not bound');
  const key = db as object;
  if (!schemaReady.has(key)) {
    const task = (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS battery_hundredth_transactions (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        deltaHundredths INTEGER NOT NULL,
        sourceApp TEXT NOT NULL DEFAULT 'starryphd',
        sourceId TEXT,
        description TEXT NOT NULL,
        uniqueKey TEXT NOT NULL UNIQUE,
        createdAt INTEGER NOT NULL
      )`).run();
      await db.prepare(`CREATE INDEX IF NOT EXISTS battery_hundredth_user_history
        ON battery_hundredth_transactions(userId, createdAt DESC, id DESC)`).run();
      await db.prepare(`CREATE INDEX IF NOT EXISTS battery_hundredth_source
        ON battery_hundredth_transactions(sourceApp, sourceId)`).run();
    })();
    schemaReady.set(key, task);
    task.catch(() => schemaReady.delete(key));
  }
  await schemaReady.get(key);
}

function cleanTargetId(value: unknown) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9:_-]{8,128}$/.test(id) ? id : '';
}

function randomRewardHundredths() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return (bytes[0] % 9) + 1;
}

async function readExactBalance(db: any, userId: string) {
  const legacy: any = await db.prepare(`SELECT COALESCE(SUM(deltaUnits),0) AS units
    FROM battery_transactions WHERE userId=?`).bind(userId).first();
  const fractional: any = await db.prepare(`SELECT COALESCE(SUM(deltaHundredths),0) AS hundredths
    FROM battery_hundredth_transactions WHERE userId=? AND sourceApp=?`).bind(userId, SOURCE_APP).first();
  const balanceUnits = Number(legacy?.units || 0);
  const lifetimeHundredths = Math.max(0, Number(fractional?.hundredths || 0));
  const remainderHundredths = lifetimeHundredths % HUNDREDTHS_PER_LEGACY_UNIT;
  const balanceHundredths = balanceUnits * 10 + remainderHundredths;
  return {
    balanceUnits,
    remainderHundredths,
    lifetimeHundredths,
    balance: Number((balanceHundredths / 100).toFixed(2))
  };
}

async function promoteHundredths(db: any, userId: string, lifetimeHundredths: number, now: number) {
  const wantedUnits = Math.floor(lifetimeHundredths / HUNDREDTHS_PER_LEGACY_UNIT);
  const promoted: any = await db.prepare(`SELECT COALESCE(SUM(deltaUnits),0) AS units
    FROM battery_transactions WHERE userId=? AND sourceApp=? AND type=?`)
    .bind(userId, SOURCE_APP, PROMOTION_TYPE).first();
  const existingUnits = Math.max(0, Number(promoted?.units || 0));
  if (wantedUnits <= existingUnits) return;

  const statements: any[] = [];
  for (let n = existingUnits + 1; n <= wantedUnits; n += 1) {
    const uniqueKey = `starryphd:meteor-promotion:${userId}:${n}`;
    statements.push(db.prepare(`INSERT OR IGNORE INTO battery_transactions
      (id,userId,deltaUnits,balanceAfterUnits,type,sourceApp,sourceId,description,actorUserId,uniqueKey,createdAt,sourceLabel)
      SELECT ?,?,1,
        COALESCE((SELECT SUM(deltaUnits) FROM battery_transactions WHERE userId=?),0)+1,
        ?,?,?,?, ?,?,?,?`)
      .bind(
        crypto.randomUUID(), userId, userId,
        PROMOTION_TYPE, SOURCE_APP, `meteor-batch-${n}`,
        '繁星主站・隕石爆破獎勵', userId, uniqueKey, now, '繁星主站'
      ));
  }
  if (statements.length) await db.batch(statements);

  const current: any = await db.prepare(`SELECT COALESCE(SUM(deltaUnits),0) AS units
    FROM battery_transactions WHERE userId=?`).bind(userId).first();
  const units = Number(current?.units || 0);
  await db.prepare(`INSERT INTO battery_accounts(userId,balanceUnits,updatedAt) VALUES(?,?,?)
    ON CONFLICT(userId) DO UPDATE SET balanceUnits=excluded.balanceUnits,updatedAt=excluded.updatedAt`)
    .bind(userId, units, now).run();
}

async function handleGame(request: Request, env: Env) {
  const url = new URL(request.url);
  if (url.hostname !== ID_HOST || url.pathname !== GAME_PATH) return null;

  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'GET' && request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405);

  if (request.method === 'POST' && (request.headers.get('Origin') || '') !== GAME_ORIGIN) {
    return json(request, { error: 'Origin not allowed' }, 403);
  }

  const session = await sessionContext(request, env);
  if (!session) return json(request, { authenticated: false, error: '請先登入 Starry ID' }, 401);

  await ensureSchema(env);
  const db = (env as any).STARRY_ID_DB;

  if (request.method === 'GET') {
    const balance = await readExactBalance(db, session.userId);
    return json(request, { authenticated: true, userId: session.userId, ...balance });
  }

  const input: any = await request.clone().json().catch(() => ({}));
  const targetId = cleanTargetId(input?.targetId);
  if (!targetId) return json(request, { error: '無效的隕石編號' }, 400);

  const duplicate: any = await db.prepare(`SELECT id FROM battery_hundredth_transactions
    WHERE uniqueKey=? LIMIT 1`).bind(`starryphd:meteor:${session.userId}:${targetId}`).first();
  if (duplicate) {
    const balance = await readExactBalance(db, session.userId);
    return json(request, { authenticated: true, success: true, duplicate: true, added: 0, ...balance });
  }

  const now = Date.now();
  const last: any = await db.prepare(`SELECT createdAt FROM battery_hundredth_transactions
    WHERE userId=? AND sourceApp=? ORDER BY createdAt DESC LIMIT 1`).bind(session.userId, SOURCE_APP).first();
  if (last && now - Number(last.createdAt || 0) < MIN_REWARD_INTERVAL_MS) {
    const balance = await readExactBalance(db, session.userId);
    return json(request, { authenticated: true, success: false, error: '點擊速度太快，請再試一次', ...balance }, 429);
  }

  const rewardHundredths = randomRewardHundredths();
  const added = Number((rewardHundredths / 100).toFixed(2));
  const uniqueKey = `starryphd:meteor:${session.userId}:${targetId}`;
  const insert: any = await db.prepare(`INSERT OR IGNORE INTO battery_hundredth_transactions
    (id,userId,deltaHundredths,sourceApp,sourceId,description,uniqueKey,createdAt)
    VALUES(?,?,?,?,?,?,?,?)`)
    .bind(
      crypto.randomUUID(),
      session.userId,
      rewardHundredths,
      SOURCE_APP,
      targetId,
      `繁星主站・成功爆破隕石 +${added.toFixed(2)} 電池`,
      uniqueKey,
      now
    ).run();

  const inserted = Number(insert?.meta?.changes || 0) > 0;
  if (!inserted) {
    const balance = await readExactBalance(db, session.userId);
    return json(request, { authenticated: true, success: true, duplicate: true, added: 0, ...balance });
  }

  const fraction: any = await db.prepare(`SELECT COALESCE(SUM(deltaHundredths),0) AS hundredths
    FROM battery_hundredth_transactions WHERE userId=? AND sourceApp=?`).bind(session.userId, SOURCE_APP).first();
  const lifetimeHundredths = Math.max(0, Number(fraction?.hundredths || 0));
  await promoteHundredths(db, session.userId, lifetimeHundredths, now);
  const balance = await readExactBalance(db, session.userId);
  return json(request, { authenticated: true, success: true, duplicate: false, added, rewardHundredths, ...balance });
}

export default {
  async fetch(request: Request, env: Env, ctx?: any): Promise<Response> {
    try {
      const game = await handleGame(request, env);
      if (game) return game;
    } catch (error) {
      console.error('Starry main battery game error:', error);
      const url = new URL(request.url);
      if (url.hostname === ID_HOST && url.pathname === GAME_PATH) {
        return json(request, { error: '電池資料暫時無法更新，請稍後再試' }, 503);
      }
    }

    try {
      const sso = await handleStarryEcosystemSso(
        request,
        env,
        ctx,
        nextRequest => appWorker.fetch(nextRequest, env, ctx)
      );
      if (sso) return sso;
    } catch (error) {
      console.error('Starry ecosystem SSO error:', error);
    }

    return appWorker.fetch(request, env, ctx);
  }
};
