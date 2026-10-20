import transcriptWorker, { TranscriptWorkflow } from './transcriptRouter';
import { rebuildQaSearchAfterMutation } from './qaTranscriptSearchIndex';

export { TranscriptWorkflow };

type Env = {
  DB: any;
  STARRY_ID_DB: any;
  R2_BUCKET: any;
  [key: string]: any;
};

type Actor = {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  isBlocked?: number;
  expiresAt?: number;
};

type BaseSegment = { id: string; start: number; end: number; text: string };
type TranscriptFile = { trackId:string;segments:BaseSegment[];cleanedSegments?:{id:string;text:string}[];text?:string;durationSeconds?:number;createdAt?:number };

const SESSION_COOKIE = 'echostars_session';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,}$/;
const SOURCE_APP = 'echostars';
const schemaReady = new WeakMap<object, Promise<void>>();

function json(data: unknown, status = 200, baseHeaders?: HeadersInit) {
  const headers = new Headers(baseHeaders || {});
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.delete('Content-Length');
  return new Response(JSON.stringify(data), { status, headers });
}

function text(value: unknown) { return value == null ? '' : String(value).trim(); }
function isSuperAdmin(actor: Actor | null) {
  return text(actor?.email).toLowerCase() === 'yukidu@gmail.com' || actor?.role === '超級管理員';
}
function unitsToBatteries(units: number) { return Number((Number(units || 0) / 10).toFixed(1)); }

function bearerToken(request: Request) {
  return request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i)?.[1] || '';
}
function cookieToken(request: Request) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== SESSION_COOKIE) continue;
    const token = part.slice(index + 1).trim();
    if (TOKEN_PATTERN.test(token)) return token;
  }
  return '';
}
async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}
async function verifiedActor(request: Request, env: Env): Promise<Actor | null> {
  const token = bearerToken(request) || cookieToken(request);
  if (!env.DB || !TOKEN_PATTERN.test(token)) return null;
  const actor: any = await env.DB.prepare(`SELECT u.id,u.email,u.name,u.role,u.isBlocked,s.expiresAt
    FROM auth_sessions s JOIN users u ON u.id=s.userId WHERE s.tokenHash=? LIMIT 1`)
    .bind(await hashToken(token)).first();
  if (!actor || actor.isBlocked || Number(actor.expiresAt || 0) <= Date.now()) return null;
  return actor as Actor;
}

async function ensureSchema(env: Env) {
  if (!env.DB) throw new Error('DB not bound');
  const key = env.DB as object;
  if (!schemaReady.has(key)) {
    const task = (async () => {
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS transcript_correction_events (
          id TEXT PRIMARY KEY,
          trackId TEXT NOT NULL,
          segmentId TEXT NOT NULL,
          parentId TEXT,
          segmentStart REAL NOT NULL DEFAULT 0,
          segmentEnd REAL NOT NULL DEFAULT 0,
          oldText TEXT NOT NULL,
          newText TEXT NOT NULL,
          userId TEXT NOT NULL,
          userName TEXT NOT NULL DEFAULT '',
          rewardUnits INTEGER NOT NULL DEFAULT 0,
          rewardTransactionId TEXT,
          rewardReversalTransactionId TEXT,
          status TEXT NOT NULL DEFAULT 'pending_review',
          adminText TEXT,
          reviewedBy TEXT,
          reviewedByName TEXT,
          reviewedAt INTEGER,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL
        )`),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS transcript_correction_events_status ON transcript_correction_events(status,createdAt DESC)'),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS transcript_correction_events_segment ON transcript_correction_events(trackId,segmentId,createdAt DESC)'),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS transcript_correction_events_user ON transcript_correction_events(userId,createdAt DESC)')
      ]);
    })();
    schemaReady.set(key, task);
    task.catch(() => schemaReady.delete(key));
  }
  await schemaReady.get(key);
}

async function centralUserId(env: Env, localUserId: string) {
  const local = text(localUserId);
  if (!local || !env.STARRY_ID_DB) return '';
  const linked: any = await env.STARRY_ID_DB.prepare("SELECT userId FROM legacy_links WHERE sourceApp='echostars' AND sourceUserId=? LIMIT 1")
    .bind(local).first().catch(() => null);
  const candidate = text(linked?.userId || local);
  const exists = await env.STARRY_ID_DB.prepare('SELECT id FROM users WHERE id=? LIMIT 1').bind(candidate).first().catch(() => null);
  return exists ? candidate : '';
}

async function centralDisplayName(env: Env, userId: string, fallback = '') {
  if (!userId || !env.STARRY_ID_DB) return fallback;
  const row: any = await env.STARRY_ID_DB.prepare(`SELECT COALESCE(NULLIF(TRIM(p.name),''),NULLIF(TRIM(u.primaryEmail),''),'') AS name
    FROM users u LEFT JOIN profiles p ON p.userId=u.id WHERE u.id=? LIMIT 1`).bind(userId).first().catch(() => null);
  return text(row?.name || fallback);
}

async function refreshBatteryAccount(env: Env, userId: string) {
  const row: any = await env.STARRY_ID_DB.prepare('SELECT COALESCE(SUM(deltaUnits),0) AS balance FROM battery_transactions WHERE userId=?')
    .bind(userId).first();
  const balance = Number(row?.balance || 0);
  await env.STARRY_ID_DB.prepare(`INSERT INTO battery_accounts(userId,balanceUnits,updatedAt) VALUES (?,?,?)
    ON CONFLICT(userId) DO UPDATE SET balanceUnits=excluded.balanceUnits,updatedAt=excluded.updatedAt`)
    .bind(userId, balance, Date.now()).run();
  return balance;
}

async function primeBatteryAccount(request: Request, env: Env, ctx: ExecutionContext) {
  const actor = await verifiedActor(request, env);
  if (!actor) return;
  const url = new URL(request.url);
  url.pathname = '/api/batteries/summary';
  url.search = '';
  const headers = new Headers(request.headers);
  headers.delete('Content-Length');
  headers.delete('Content-Type');
  await transcriptWorker.fetch(new Request(url.toString(), { method: 'GET', headers }), env as any, ctx as any).catch(() => null);
}

type BatteryInput = {
  targetUserId: string;
  deltaUnits: number;
  type: string;
  uniqueKey: string;
  sourceId: string;
  trackId: string;
  description: string;
  actorUserId?: string;
  sourceLabel?: string;
  allowNegative?: boolean;
};

async function addCentralBattery(env: Env, input: BatteryInput) {
  const db = env.STARRY_ID_DB;
  if (!db) throw new Error('Central battery database not bound');
  const target = text(input.targetUserId);
  if (!target) throw new Error('Missing battery user');
  const exists = await db.prepare('SELECT id FROM users WHERE id=? LIMIT 1').bind(target).first();
  if (!exists) throw new Error('Central user reference missing');
  const uniqueKey = input.uniqueKey.startsWith(SOURCE_APP + ':') ? input.uniqueKey : SOURCE_APP + ':' + input.uniqueKey;
  const previous: any = await db.prepare('SELECT * FROM battery_transactions WHERE uniqueKey=? LIMIT 1').bind(uniqueKey).first();
  if (previous) return { inserted: false, balanceUnits: await refreshBatteryAccount(env, target), transaction: previous };
  const balance = await refreshBatteryAccount(env, target);
  const delta = Math.trunc(Number(input.deltaUnits || 0));
  if (!input.allowNegative && balance + delta < 0) return { inserted: false, insufficient: true, balanceUnits: balance };
  const after = balance + delta;
  const id = 'battery-' + crypto.randomUUID();
  const result: any = await db.prepare(`INSERT OR IGNORE INTO battery_transactions
    (id,userId,deltaUnits,balanceAfterUnits,type,sourceApp,sourceId,description,actorUserId,uniqueKey,createdAt,trackId,commentId,relatedUserId,sourceLabel)
    VALUES (?,?,?,?,?,'echostars',?,?,?,?,?,?,NULL,NULL,?)`)
    .bind(id, target, delta, after, input.type, input.sourceId, input.description, input.actorUserId || target, uniqueKey, Date.now(), input.trackId, input.sourceLabel || null).run();
  const transaction: any = await db.prepare('SELECT * FROM battery_transactions WHERE uniqueKey=? LIMIT 1').bind(uniqueKey).first();
  return { inserted: Boolean(result?.meta?.changes), balanceUnits: await refreshBatteryAccount(env, target), transaction };
}

async function transcriptSettings(env: Env) {
  const rows = await env.DB.prepare('SELECT key,valueUnits FROM transcript_settings').all().catch(() => ({ results: [] }));
  const result = { unlock_cost_units: 10, correction_reward_units: 1 };
  for (const row of rows.results || []) {
    if (row.key === 'unlock_cost_units') result.unlock_cost_units = Number(row.valueUnits || 0);
    if (row.key === 'correction_reward_units') result.correction_reward_units = Number(row.valueUnits || 0);
  }
  return result;
}

async function baseTranscript(env: Env, trackId: string): Promise<TranscriptFile | null> {
  const row: any = await env.DB.prepare("SELECT r2Key FROM transcript_index WHERE trackId=? AND status='ready' LIMIT 1").bind(trackId).first();
  if (!row?.r2Key || !env.R2_BUCKET) return null;
  const object = await env.R2_BUCKET.get(row.r2Key);
  if (!object) return null;
  const parsed = JSON.parse(await object.text());
  if (!Array.isArray(parsed?.segments)) return null;
  return parsed as TranscriptFile;
}

function activeText(event: any) { return text(event?.adminText || event?.newText); }
function cleanedBaseline(transcript:TranscriptFile, segmentId:string, original:string){
  return transcript.cleanedSegments?.find(s=>s.id===segmentId)?.text || original;
}

async function currentSegmentState(env: Env, trackId: string, segmentId: string) {
  const transcript = await baseTranscript(env, trackId);
  const base = transcript?.segments.find(segment => segment.id === segmentId);
  if (!base) return null;
  const latest: any = await env.DB.prepare(`SELECT * FROM transcript_correction_events
    WHERE trackId=? AND segmentId=? AND createdAt>=? AND status<>'revoked' ORDER BY createdAt DESC,id DESC LIMIT 1`)
    .bind(trackId, segmentId, Number((transcript as any)?.createdAt || 0)).first();
  return {
    base,
    latest: latest || null,
    text: latest ? activeText(latest) : cleanedBaseline(transcript as TranscriptFile,segmentId,base.text)
  };
}

async function resolvedSegments(env: Env, trackId: string) {
  const transcript = await baseTranscript(env, trackId);
  if (!transcript) return null;
  const rows = await env.DB.prepare(`SELECT segmentId,newText,adminText FROM transcript_correction_events
    WHERE trackId=? AND createdAt>=? AND status<>'revoked' ORDER BY createdAt ASC,id ASC`)
    .bind(trackId, Number((transcript as any)?.createdAt || 0)).all();
  const latest = new Map<string, string>();
  for (const row of rows.results || []) latest.set(text(row.segmentId), activeText(row));
  return transcript.segments.map(segment => ({ ...segment, text: latest.get(segment.id) || cleanedBaseline(transcript,segment.id,segment.text) }));
}

async function correctedTranscriptResponse(request: Request, env: Env, ctx: ExecutionContext, trackId: string) {
  const inner = await transcriptWorker.fetch(request, env as any, ctx as any);
  if (!inner.ok) return inner;
  const data: any = await inner.clone().json().catch(() => null);
  if (!data || data.status !== 'ready' || data.locked || !Array.isArray(data.segments)) return inner;
  await ensureSchema(env);
  const segments = await resolvedSegments(env, trackId);
  if (!segments) return inner;
  return json({ ...data, segments, text: segments.map(segment => segment.text).join('\n') }, inner.status, inner.headers);
}

function syncQaSearchAfterCorrection(env:Env,ctx:ExecutionContext,trackId:string){
  // Mutation-time D1 triggers immediately mark all existing indexed paragraphs
  // invalid. Background rebuild is optional and never blocks correction/rewards.
  if((env as any).QA_CHINESE_SEARCH_WRITE_ENABLED!=='true')return;
  ctx.waitUntil(rebuildQaSearchAfterMutation(env as any,trackId).catch(error=>{
    console.warn('C09 correction index sync deferred',error instanceof Error?error.name:'unknown');
  }));
}
async function createCorrection(request: Request, env: Env, ctx: ExecutionContext, trackId: string, segmentId: string) {
  await ensureSchema(env);
  const actor = await verifiedActor(request, env);
  if (!actor) return json({ error: '請先登入會員' }, 401);
  await primeBatteryAccount(request, env, ctx);
  const userId = await centralUserId(env, actor.id);
  if (!userId) return json({ error: '找不到 Starry ID 會員資料' }, 403);
  const unlocked = isSuperAdmin(actor) || Boolean(await env.DB.prepare('SELECT trackId FROM transcript_unlocks WHERE userId=? AND trackId=? LIMIT 1').bind(userId, trackId).first());
  if (!unlocked) return json({ error: '只有已用電池解鎖逐字稿的會員可以修正錯字' }, 403);
  const body: any = await request.clone().json().catch(() => ({}));
  const newText = text(body.newText), expectedText = text(body.expectedText);
  if (!newText || newText.length > 1000) return json({ error: '修正內容需為 1 至 1000 字' }, 400);
  const state = await currentSegmentState(env, trackId, segmentId);
  if (!state) return json({ error: '找不到這一句逐字稿' }, 404);
  if (expectedText && expectedText !== state.text) return json({ error: '這一句剛被其他會員更新，請重新讀取後再修正', currentText: state.text }, 409);
  if (newText === state.text) return json({ success: true, text: state.text, rewardGranted: false, reward: 0 });
  const eventId = 'transcript-correction-' + crypto.randomUUID();
  const userName = await centralDisplayName(env, userId, text(actor.name || actor.email));
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO transcript_correction_events
    (id,trackId,segmentId,parentId,segmentStart,segmentEnd,oldText,newText,userId,userName,rewardUnits,rewardTransactionId,rewardReversalTransactionId,status,adminText,reviewedBy,reviewedByName,reviewedAt,createdAt,updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,0,NULL,NULL,'pending_review',NULL,NULL,NULL,NULL,?,?)`)
    .bind(eventId, trackId, segmentId, state.latest?.id || null, Number(state.base.start || 0), Number(state.base.end || 0), state.text, newText, userId, userName, now, now).run();

  const settings = await transcriptSettings(env);
  const rewardUnits = Math.max(0, Number(settings.correction_reward_units || 0));
  let rewardGranted = false, balanceUnits = 0, transactionId = '';
  if (rewardUnits > 0) {
    const track: any = await env.DB.prepare('SELECT id,title,speaker,speakerRank FROM tracks WHERE id=? LIMIT 1').bind(trackId).first();
    const sourceLabel = track ? `${text(track.speaker)}${text(track.speakerRank) && text(track.speakerRank) !== '無' ? text(track.speakerRank) : ''}-${text(track.title || track.id)}` : '';
    const reward = await addCentralBattery(env, {
      targetUserId: userId,
      deltaUnits: rewardUnits,
      type: 'transcript_correction_reward',
      uniqueKey: `transcript-correction:${userId}:${trackId}:${segmentId}`,
      sourceId: eventId,
      trackId,
      description: '首次有效修正逐字稿錯字',
      actorUserId: userId,
      sourceLabel
    });
    rewardGranted = reward.inserted;
    balanceUnits = reward.balanceUnits;
    transactionId = text(reward.transaction?.id);
    if (reward.inserted) {
      await env.DB.prepare('UPDATE transcript_correction_events SET rewardUnits=?,rewardTransactionId=?,updatedAt=? WHERE id=?')
        .bind(rewardUnits, transactionId || null, Date.now(), eventId).run();
    }
  }
  syncQaSearchAfterCorrection(env,ctx,trackId);
  return json({
    success: true,
    id: eventId,
    text: newText,
    rewardGranted,
    reward: rewardGranted ? unitsToBatteries(rewardUnits) : 0,
    balance: unitsToBatteries(balanceUnits),
    status: 'pending_review'
  });
}

async function listCorrections(request: Request, env: Env) {
  await ensureSchema(env);
  const actor = await verifiedActor(request, env);
  if (!actor) return json({ error: '請先登入會員' }, 401);
  if (!isSuperAdmin(actor)) return json({ error: '只有超級管理員可以管理逐字稿修正' }, 403);
  const url = new URL(request.url);
  const mode = url.searchParams.get('view') === 'pending' ? 'pending' : 'all';
  const where = mode === 'pending' ? "WHERE c.status='pending_review'" : '';
  const rows = await env.DB.prepare(`SELECT c.*,t.title AS trackTitle,t.speaker AS trackSpeaker,t.speakerRank AS trackSpeakerRank,
      CASE WHEN c.id=(SELECT x.id FROM transcript_correction_events x WHERE x.trackId=c.trackId AND x.segmentId=c.segmentId AND x.status<>'revoked' ORDER BY x.createdAt DESC,x.id DESC LIMIT 1) THEN 1 ELSE 0 END AS isCurrentVersion
    FROM transcript_correction_events c LEFT JOIN tracks t ON t.id=c.trackId
    ${where}
    ORDER BY CASE WHEN c.status='pending_review' THEN 0 ELSE 1 END,c.createdAt DESC,c.id DESC LIMIT 200`).all();
  const count: any = await env.DB.prepare("SELECT COUNT(*) AS n FROM transcript_correction_events WHERE status='pending_review'").first();
  return json({
    pendingCount: Number(count?.n || 0),
    corrections: (rows.results || []).map((row: any) => ({
      id: row.id,
      trackId: row.trackId,
      trackTitle: text(row.trackTitle || row.trackId),
      trackSpeaker: text(row.trackSpeaker),
      trackSpeakerRank: text(row.trackSpeakerRank),
      segmentId: row.segmentId,
      start: Number(row.segmentStart || 0),
      end: Number(row.segmentEnd || 0),
      before: text(row.oldText),
      after: text(row.newText),
      finalText: text(row.adminText || row.newText),
      userId: row.userId,
      userName: text(row.userName || row.userId),
      reward: unitsToBatteries(Number(row.rewardUnits || 0)),
      rewardGranted: Boolean(row.rewardTransactionId),
      rewardRevoked: Boolean(row.rewardReversalTransactionId),
      status: text(row.status),
      reviewedBy: text(row.reviewedBy),
      reviewedByName: text(row.reviewedByName),
      reviewedAt: row.reviewedAt ? Number(row.reviewedAt) : null,
      createdAt: Number(row.createdAt || 0),
      isCurrentVersion: Boolean(row.isCurrentVersion)
    }))
  });
}

async function reviewCorrection(request: Request, env: Env, ctx: ExecutionContext, correctionId: string, action: 'accept' | 'revoke' | 'supplement') {
  await ensureSchema(env);
  const actor = await verifiedActor(request, env);
  if (!actor) return json({ error: '請先登入會員' }, 401);
  if (!isSuperAdmin(actor)) return json({ error: '只有超級管理員可以管理逐字稿修正' }, 403);
  await primeBatteryAccount(request, env, ctx);
  const reviewerId = await centralUserId(env, actor.id);
  if (!reviewerId) return json({ error: '找不到超級管理員 Starry ID' }, 403);
  const reviewerName = await centralDisplayName(env, reviewerId, text(actor.name || actor.email));
  const row: any = await env.DB.prepare('SELECT * FROM transcript_correction_events WHERE id=? LIMIT 1').bind(correctionId).first();
  if (!row) return json({ error: '找不到這筆逐字稿修正' }, 404);
  const now = Date.now();

  if (action === 'accept') {
    if (row.status === 'revoked') return json({ error: '這筆修正已撤銷，不能再接受' }, 409);
    await env.DB.prepare(`UPDATE transcript_correction_events SET status='accepted',reviewedBy=?,reviewedByName=?,reviewedAt=?,updatedAt=? WHERE id=?`)
      .bind(reviewerId, reviewerName, now, now, correctionId).run();
  }

  if (action === 'supplement') {
    if (row.status === 'revoked') return json({ error: '這筆修正已撤銷，不能再補充修正' }, 409);
    const body: any = await request.clone().json().catch(() => ({}));
    const adminText = text(body.text);
    if (!adminText || adminText.length > 1000) return json({ error: '補充修正需為 1 至 1000 字' }, 400);
    await env.DB.prepare(`UPDATE transcript_correction_events SET status='supplemented',adminText=?,reviewedBy=?,reviewedByName=?,reviewedAt=?,updatedAt=? WHERE id=?`)
      .bind(adminText, reviewerId, reviewerName, now, now, correctionId).run();
  }

  let revokedReward = 0;
  if (action === 'revoke') {
    if (row.status !== 'revoked') {
      if (Number(row.rewardUnits || 0) > 0 && row.rewardTransactionId && !row.rewardReversalTransactionId) {
        const track: any = await env.DB.prepare('SELECT id,title,speaker,speakerRank FROM tracks WHERE id=? LIMIT 1').bind(row.trackId).first();
        const sourceLabel = track ? `${text(track.speaker)}${text(track.speakerRank) && text(track.speakerRank) !== '無' ? text(track.speakerRank) : ''}-${text(track.title || track.id)}` : '';
        const reversal = await addCentralBattery(env, {
          targetUserId: row.userId,
          deltaUnits: -Number(row.rewardUnits),
          type: 'transcript_correction_reward_reversal',
          uniqueKey: `transcript-correction-reversal:${row.id}`,
          sourceId: row.id,
          trackId: row.trackId,
          description: '超級管理員撤銷逐字稿修正，扣回原修正獎勵',
          actorUserId: reviewerId,
          sourceLabel,
          allowNegative: true
        });
        const reversalId = text(reversal.transaction?.id);
        if (reversal.inserted || reversalId) {
          revokedReward = unitsToBatteries(Number(row.rewardUnits));
          await env.DB.prepare('UPDATE transcript_correction_events SET rewardReversalTransactionId=? WHERE id=?').bind(reversalId || 'recorded', row.id).run();
        }
      }
      await env.DB.prepare(`UPDATE transcript_correction_events SET status='revoked',reviewedBy=?,reviewedByName=?,reviewedAt=?,updatedAt=? WHERE id=?`)
        .bind(reviewerId, reviewerName, now, now, correctionId).run();
    }
  }

  syncQaSearchAfterCorrection(env,ctx,row.trackId);
  const current = await currentSegmentState(env, row.trackId, row.segmentId);
  const fresh: any = await env.DB.prepare('SELECT * FROM transcript_correction_events WHERE id=? LIMIT 1').bind(correctionId).first();
  return json({
    success: true,
    id: correctionId,
    status: fresh?.status,
    finalText: activeText(fresh),
    visibleText: current?.text || '',
    rewardRevoked: revokedReward,
    isCurrentVersion: current?.latest?.id === correctionId
  });
}

async function moderationApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  const url = new URL(request.url), path = url.pathname, method = request.method.toUpperCase();
  if (path === '/api/v281/transcript-corrections' && method === 'GET') return listCorrections(request, env);
  const review = path.match(/^\/api\/v281\/transcript-corrections\/([^/]+)\/(accept|revoke|supplement)$/);
  if (review && (method === 'POST' || method === 'PUT')) {
    return reviewCorrection(request, env, ctx, decodeURIComponent(review[1]), review[2] as 'accept' | 'revoke' | 'supplement');
  }
  const segment = path.match(/^\/api\/v281\/transcripts\/([^/]+)\/segments\/([^/]+)$/);
  if (segment && method === 'PUT') return createCorrection(request, env, ctx, decodeURIComponent(segment[1]), decodeURIComponent(segment[2]));
  const item = path.match(/^\/api\/v281\/transcripts\/([^/]+)$/);
  if (item && method === 'GET') return correctedTranscriptResponse(request, env, ctx, decodeURIComponent(item[1]));
  return null;
}

async function injectAdminScript(response: Response, request: Request) {
  const url = new URL(request.url);
  if (url.hostname.toLowerCase() !== 'echo.starry.phd') return response;
  if (!response.ok || !String(response.headers.get('Content-Type') || '').includes('text/html')) return response;
  let html = await response.text();
  if (!html.includes('/transcript-admin.js')) html = html.replace('</body>', '<script defer src="/transcript-admin.js?v=281"></script></body>');
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'no-store');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      if (new URL(request.url).pathname.startsWith('/api/v281/')) {
        const handled = await moderationApi(request, env, ctx);
        if (handled) return handled;
      }
    } catch (error) {
      console.error('Transcript moderation failed', error);
      return json({ error: '逐字稿修正服務暫時無法使用，請稍後再試' }, 503);
    }
    const response = await transcriptWorker.fetch(request, env as any, ctx as any);
    return injectAdminScript(response, request);
  },
  async scheduled(controller: any, env: Env, ctx: ExecutionContext) {
    const handler = (transcriptWorker as any).scheduled;
    if (typeof handler === 'function') return handler(controller, env, ctx);
  }
};
