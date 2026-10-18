import { Buffer } from 'node:buffer';
import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import appWorker from './starryMainInlineLoginRouter';
import { batteriesToUnits, unitsToBatteries } from '../shared/battery';
import { sessionContext } from './starryIdProfileDirectoryRouter';

const SOURCE_APP = 'echostars';
const SESSION_COOKIE = 'echostars_session';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,}$/;
const TRANSCRIPT_MODEL = '@cf/openai/whisper-large-v3-turbo';
const CHUNK_BYTES = 1024 * 1024;
const DAILY_TRANSCRIPT_SECONDS = 180 * 60;
const DEFAULT_UNLOCK_UNITS = 10;
const DEFAULT_CORRECTION_REWARD_UNITS = 1;
const schemaReady = new WeakMap<object, Promise<void>>();

interface TranscriptEnv {
  DB: any;
  STARRY_ID_DB: any;
  R2_BUCKET: any;
  AI: any;
  TRANSCRIPT_WORKFLOW: any;
  [key: string]: any;
}

type TranscriptSegment = { id: string; start: number; end: number; text: string };
type TranscriptFile = {
  version: number;
  trackId: string;
  model: string;
  createdAt: number;
  durationSeconds: number;
  text: string;
  segments: TranscriptSegment[];
  cleanedSegments?: {id:string;text:string}[];
  cleanupVersion?: number;
};

type BatteryResult = { inserted: boolean; insufficient?: boolean; balanceUnits: number; transaction?: any };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function text(value: unknown) { return value == null ? '' : String(value).trim(); }
function isSuperAdmin(actor: any) { return text(actor?.email).toLowerCase() === 'yukidu@gmail.com' || actor?.role === '超級管理員'; }
function formatBattery(units: number) { return unitsToBatteries(units); }

function bearerToken(request: Request) {
  return request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i)?.[1] || '';
}
function cookieToken(request: Request) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const index = part.indexOf('=');
    if (index >= 0 && part.slice(0, index).trim() === SESSION_COOKIE) {
      const token = part.slice(index + 1).trim();
      if (TOKEN_PATTERN.test(token)) return token;
    }
  }
  return '';
}
async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function echoActor(request: Request, env: TranscriptEnv) {
  const token = bearerToken(request) || cookieToken(request);
  if (!env.DB || !TOKEN_PATTERN.test(token)) return null;
  const actor: any = await env.DB.prepare(`SELECT u.id,u.email,u.name,u.role,u.rank,u.approvedRank,u.rankApproved,u.rankAuditStatus,
    u.isAdminUser,u.isBlocked,u.canUpload,u.isContributor,s.expiresAt
    FROM auth_sessions s JOIN users u ON u.id=s.userId WHERE s.tokenHash=? LIMIT 1`)
    .bind(await hashToken(token)).first();
  if (!actor || actor.isBlocked || Number(actor.expiresAt || 0) <= Date.now()) return null;
  return actor;
}

async function ensureSchema(env: TranscriptEnv) {
  if (!env.DB) throw new Error('DB not bound');
  const key = env.DB as object;
  if (!schemaReady.has(key)) {
    const task = (async () => {
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS transcript_index (
          trackId TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'pending',r2Key TEXT,model TEXT NOT NULL DEFAULT '${TRANSCRIPT_MODEL}',
          chunkCount INTEGER NOT NULL DEFAULT 0,segmentCount INTEGER NOT NULL DEFAULT 0,wordCount INTEGER NOT NULL DEFAULT 0,
          durationSeconds REAL NOT NULL DEFAULT 0,error TEXT,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL)`),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS transcript_index_status ON transcript_index(status,updatedAt)'),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS transcript_unlocks (
          userId TEXT NOT NULL,trackId TEXT NOT NULL,costUnits INTEGER NOT NULL,transactionId TEXT,createdAt INTEGER NOT NULL,
          PRIMARY KEY(userId,trackId))`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS transcript_corrections (
          id TEXT PRIMARY KEY,trackId TEXT NOT NULL,segmentId TEXT NOT NULL,oldText TEXT NOT NULL,newText TEXT NOT NULL,
          userId TEXT NOT NULL,rewardUnits INTEGER NOT NULL DEFAULT 0,rewarded INTEGER NOT NULL DEFAULT 0,createdAt INTEGER NOT NULL)`),
        env.DB.prepare('CREATE INDEX IF NOT EXISTS transcript_corrections_segment ON transcript_corrections(trackId,segmentId,createdAt DESC)'),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS transcript_settings (
          key TEXT PRIMARY KEY,valueUnits INTEGER NOT NULL,updatedAt INTEGER NOT NULL,updatedBy TEXT)`)
      ]);
      const now = Date.now();
      await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO transcript_settings(key,valueUnits,updatedAt,updatedBy) VALUES (?,?,?,?)')
          .bind('unlock_cost_units', DEFAULT_UNLOCK_UNITS, now, 'system'),
        env.DB.prepare('INSERT OR IGNORE INTO transcript_settings(key,valueUnits,updatedAt,updatedBy) VALUES (?,?,?,?)')
          .bind('correction_reward_units', DEFAULT_CORRECTION_REWARD_UNITS, now, 'system')
      ]);
    })();
    schemaReady.set(key, task);
    task.catch(() => schemaReady.delete(key));
  }
  await schemaReady.get(key);
}

async function transcriptSettings(env: TranscriptEnv) {
  await ensureSchema(env);
  const rows = await env.DB.prepare('SELECT key,valueUnits FROM transcript_settings').all();
  const values: Record<string, number> = {
    unlock_cost_units: DEFAULT_UNLOCK_UNITS,
    correction_reward_units: DEFAULT_CORRECTION_REWARD_UNITS
  };
  for (const row of rows.results || []) values[text(row.key)] = Number(row.valueUnits || 0);
  return values;
}

async function mapCentralUserId(env: TranscriptEnv, localUserId: string) {
  const local = text(localUserId);
  if (!local || !env.STARRY_ID_DB) return '';
  const linked: any = await env.STARRY_ID_DB.prepare("SELECT userId FROM legacy_links WHERE sourceApp='echostars' AND sourceUserId=? LIMIT 1")
    .bind(local).first().catch(() => null);
  const candidate = text(linked?.userId || local);
  const exists: any = await env.STARRY_ID_DB.prepare('SELECT id FROM users WHERE id=? LIMIT 1').bind(candidate).first().catch(() => null);
  return exists ? candidate : '';
}

async function primeBatteryAccount(request: Request, env: TranscriptEnv, ctx: ExecutionContext) {
  const url = new URL(request.url); url.pathname = '/api/batteries/summary'; url.search = '';
  const headers = new Headers(request.headers); headers.delete('Content-Length'); headers.delete('Content-Type');
  const req = new Request(url.toString(), { method: 'GET', headers });
  await appWorker.fetch(req, env as any, ctx).catch(() => null);
}

async function refreshBatteryAccount(env: TranscriptEnv, userId: string) {
  const row: any = await env.STARRY_ID_DB.prepare('SELECT COALESCE(SUM(deltaUnits),0) AS balance FROM battery_transactions WHERE userId=?')
    .bind(userId).first();
  const balance = Number(row?.balance || 0);
  await env.STARRY_ID_DB.prepare(`INSERT INTO battery_accounts(userId,balanceUnits,updatedAt) VALUES (?,?,?)
    ON CONFLICT(userId) DO UPDATE SET balanceUnits=excluded.balanceUnits,updatedAt=excluded.updatedAt`)
    .bind(userId, balance, Date.now()).run();
  return balance;
}

async function batteryTransaction(request: Request, env: TranscriptEnv, ctx: ExecutionContext, input: {
  localUserId: string; deltaUnits: number; type: string; uniqueKey: string; sourceId: string; description: string; track?: any;
}): Promise<BatteryResult> {
  await primeBatteryAccount(request, env, ctx);
  const userId = await mapCentralUserId(env, input.localUserId);
  if (!userId) throw new Error('找不到 Starry ID 會員帳號');
  const uniqueKey = input.uniqueKey.startsWith(SOURCE_APP + ':') ? input.uniqueKey : SOURCE_APP + ':' + input.uniqueKey;
  const existing: any = await env.STARRY_ID_DB.prepare('SELECT * FROM battery_transactions WHERE uniqueKey=? LIMIT 1').bind(uniqueKey).first();
  if (existing) return { inserted: false, balanceUnits: await refreshBatteryAccount(env, userId), transaction: existing };
  const balance = await refreshBatteryAccount(env, userId);
  const amount = Math.trunc(input.deltaUnits);
  if (balance + amount < 0) return { inserted: false, insufficient: true, balanceUnits: balance };
  const after = balance + amount;
  const id = 'battery-' + crypto.randomUUID();
  const track = input.track;
  const sourceLabel = track ? [text(track.speaker), text(track.speakerRank) && text(track.speakerRank) !== '無' ? text(track.speakerRank) : '', '-', text(track.title || track.id)].join('') : null;
  const result: any = await env.STARRY_ID_DB.prepare(`INSERT OR IGNORE INTO battery_transactions
    (id,userId,deltaUnits,balanceAfterUnits,type,sourceApp,sourceId,description,actorUserId,uniqueKey,createdAt,trackId,commentId,relatedUserId,sourceLabel)
    VALUES (?,?,?,?,?,'echostars',?,?,?,?,?,?,NULL,NULL,?)`)
    .bind(id, userId, amount, after, input.type, input.sourceId, input.description, userId, uniqueKey, Date.now(), track?.id || null, sourceLabel).run();
  const tx: any = await env.STARRY_ID_DB.prepare('SELECT * FROM battery_transactions WHERE uniqueKey=? LIMIT 1').bind(uniqueKey).first();
  const finalBalance = await refreshBatteryAccount(env, userId);
  return { inserted: Boolean(result?.meta?.changes), balanceUnits: finalBalance, transaction: tx };
}

const RANK_ORDER = [
  '無','3%','6%','9%','12%','12%初階','15%','15%銅章','18%','21%','銀章','金章','白金','紅寶石',
  '創辦人白金','創辦人紅寶石','藍寶石','創辦人藍寶石','明珠','翡翠','創辦人翡翠','鑽石級以上'
];
function hasRankAccess(actor: any, track: any) {
  if (isSuperAdmin(actor)) return true;
  const required = text(track?.requiredRank || '無');
  if (!required || required === '無' || required === '公開') return true;
  if (!actor) return false;
  if (actor.isAdminUser || actor.role === '管理員' || actor.role === '獎銜審核員') return true;
  if (!actor.rankApproved) return false;
  const rank = text(actor.approvedRank || actor.rank || '無');
  if (/鑽石|皇冠|大使/.test(rank)) return true;
  const need = RANK_ORDER.indexOf(required), have = RANK_ORDER.indexOf(rank);
  return need >= 0 && have >= need;
}
async function hasAudioAccess(env: TranscriptEnv, actor: any, track: any) {
  if (!actor || !hasRankAccess(actor, track)) return false;
  if (track.isPrivateVip && !isSuperAdmin(actor) && text(track.uploaderEmail).toLowerCase() !== text(actor.email).toLowerCase()) return false;
  const cost = Math.max(0, Number(track.stickerUnlockCost || 0));
  if (cost <= 0 || isSuperAdmin(actor)) return true;
  return Boolean(await env.DB.prepare('SELECT trackId FROM sticker_unlocks WHERE userId=? AND trackId=? LIMIT 1').bind(actor.id, track.id).first());
}

function transcriptR2Key(trackId: string) { return 'transcripts/' + encodeURIComponent(trackId) + '.json'; }
function audioR2Key(audioUrl: string) {
  const marker = '/api/r2/file/';
  const value = text(audioUrl);
  const index = value.indexOf(marker);
  if (index < 0) return '';
  try { return decodeURIComponent(value.slice(index + marker.length)); } catch { return value.slice(index + marker.length); }
}

async function loadTranscript(env: TranscriptEnv, trackId: string): Promise<TranscriptFile | null> {
  const index: any = await env.DB.prepare('SELECT * FROM transcript_index WHERE trackId=? LIMIT 1').bind(trackId).first();
  if (!index || index.status !== 'ready' || !index.r2Key) return null;
  const object = await env.R2_BUCKET.get(index.r2Key);
  if (!object) return null;
  return JSON.parse(await object.text()) as TranscriptFile;
}

function cleanedBaseline(transcript: TranscriptFile,segmentId:string,original:string){
  const cleaned=transcript.cleanedSegments?.find(s=>s.id===segmentId);
  return cleaned?.text || original;
}
async function applyCorrections(env: TranscriptEnv, transcript: TranscriptFile) {
  const rows = await env.DB.prepare(`SELECT c.segmentId,c.newText FROM transcript_corrections c
    JOIN (SELECT segmentId,MAX(createdAt) AS newest FROM transcript_corrections
      WHERE trackId=? AND createdAt>=? GROUP BY segmentId) latest
    ON latest.segmentId=c.segmentId AND latest.newest=c.createdAt WHERE c.trackId=? AND c.createdAt>=?`)
    .bind(transcript.trackId, Number(transcript.createdAt || 0), transcript.trackId, Number(transcript.createdAt || 0)).all();
  const map = new Map<string, string>();
  for (const row of rows.results || []) map.set(text(row.segmentId), text(row.newText));
  return transcript.segments.map(seg => ({ ...seg, text: map.get(seg.id) || cleanedBaseline(transcript,seg.id,seg.text) }));
}

async function getTranscriptApi(request: Request, env: TranscriptEnv, trackId: string) {
  await ensureSchema(env);
  const track: any = await env.DB.prepare('SELECT * FROM tracks WHERE id=? LIMIT 1').bind(trackId).first();
  if (!track) return json({ error: '找不到音檔', status: 'missing' }, 404);
  const settings = await transcriptSettings(env);
  const index: any = await env.DB.prepare('SELECT * FROM transcript_index WHERE trackId=? LIMIT 1').bind(trackId).first();
  const status = text(index?.status || 'pending');
  if (!index) {
    await env.DB.prepare(`INSERT OR IGNORE INTO transcript_index(trackId,status,r2Key,model,chunkCount,segmentCount,wordCount,durationSeconds,error,createdAt,updatedAt)
      VALUES (?,'pending',NULL,?,0,0,0,?,NULL,?,?)`).bind(trackId, TRANSCRIPT_MODEL, Number(track.durationSeconds || 0), Date.now(), Date.now()).run();
  }
  if (status !== 'ready') return json({ status, unlockCost: formatBattery(settings.unlock_cost_units), correctionReward: formatBattery(settings.correction_reward_units) });
  const actor = await echoActor(request, env);
  if (!actor) return json({ status: 'ready', loginRequired: true, locked: true, unlockCost: formatBattery(settings.unlock_cost_units) }, 401);
  if (!await hasAudioAccess(env, actor, track)) return json({ status: 'ready', accessDenied: true, error: '請先取得這份錄音的播放權限，再解鎖逐字稿。' }, 403);
  const centralUserId = await mapCentralUserId(env, actor.id);
  if (!centralUserId) return json({ error: '找不到 Starry ID 會員資料' }, 403);
  const unlocked = isSuperAdmin(actor) || Boolean(await env.DB.prepare('SELECT trackId FROM transcript_unlocks WHERE userId=? AND trackId=? LIMIT 1').bind(centralUserId, trackId).first());
  if (!unlocked) return json({ status: 'ready', locked: true, unlockCost: formatBattery(settings.unlock_cost_units), correctionReward: formatBattery(settings.correction_reward_units) });
  const transcript = await loadTranscript(env, trackId);
  if (!transcript) return json({ status: 'processing' });
  const segments = await applyCorrections(env, transcript);
  return json({
    status: 'ready', locked: false, segments, text: segments.map(s => s.text).join('\n'),
    canCorrect: true,
    correctionReward: formatBattery(settings.correction_reward_units), durationSeconds: transcript.durationSeconds
  });
}

async function unlockTranscriptApi(request: Request, env: TranscriptEnv, ctx: ExecutionContext, trackId: string) {
  await ensureSchema(env);
  const actor = await echoActor(request, env);
  if (!actor) return json({ error: '請先登入會員' }, 401);
  const track: any = await env.DB.prepare('SELECT * FROM tracks WHERE id=? LIMIT 1').bind(trackId).first();
  if (!track) return json({ error: '找不到音檔' }, 404);
  const index: any = await env.DB.prepare('SELECT status FROM transcript_index WHERE trackId=? LIMIT 1').bind(trackId).first();
  if (index?.status !== 'ready') return json({ error: '逐字稿尚未完成' }, 409);
  if (!await hasAudioAccess(env, actor, track)) return json({ error: '請先取得這份錄音的播放權限，再解鎖逐字稿。' }, 403);
  const centralUserId = await mapCentralUserId(env, actor.id);
  if (!centralUserId) return json({ error: '找不到 Starry ID 會員資料' }, 403);
  const existing = await env.DB.prepare('SELECT trackId FROM transcript_unlocks WHERE userId=? AND trackId=? LIMIT 1').bind(centralUserId, trackId).first();
  if (existing || isSuperAdmin(actor)) return json({ success: true, unlocked: true, charged: 0, duplicate: Boolean(existing) });
  const settings = await transcriptSettings(env);
  const cost = Math.max(0, Number(settings.unlock_cost_units || 0));
  if (cost <= 0) {
    await env.DB.prepare('INSERT OR IGNORE INTO transcript_unlocks(userId,trackId,costUnits,transactionId,createdAt) VALUES (?,?,?,?,?)')
      .bind(centralUserId, trackId, 0, null, Date.now()).run();
    return json({ success: true, unlocked: true, charged: 0 });
  }
  const result = await batteryTransaction(request, env, ctx, {
    localUserId: actor.id, deltaUnits: -cost, type: 'transcript_unlock_cost', sourceId: trackId,
    description: '解鎖逐字稿', uniqueKey: 'transcript-unlock:' + centralUserId + ':' + trackId, track
  });
  if (result.insufficient) return json({ error: '電池不足，需要 ' + formatBattery(cost) + ' 顆電池才能解鎖逐字稿', balance: formatBattery(result.balanceUnits) }, 402);
  try {
    await env.DB.prepare('INSERT OR IGNORE INTO transcript_unlocks(userId,trackId,costUnits,transactionId,createdAt) VALUES (?,?,?,?,?)')
      .bind(centralUserId, trackId, cost, result.transaction?.id || null, Date.now()).run();
  } catch (error) {
    if (result.inserted) {
      await batteryTransaction(request, env, ctx, {
        localUserId: actor.id, deltaUnits: cost, type: 'transcript_unlock_refund', sourceId: trackId,
        description: '逐字稿解鎖失敗退款', uniqueKey: 'transcript-unlock-refund:' + centralUserId + ':' + trackId, track
      }).catch(() => null);
    }
    throw error;
  }
  return json({ success: true, unlocked: true, charged: formatBattery(cost), balance: formatBattery(result.balanceUnits) });
}

async function correctSegmentApi(request: Request, env: TranscriptEnv, ctx: ExecutionContext, trackId: string, segmentId: string) {
  await ensureSchema(env);
  const actor = await echoActor(request, env);
  if (!actor) return json({ error: '請先登入會員' }, 401);
  const centralUserId = await mapCentralUserId(env, actor.id);
  if (!centralUserId) return json({ error: '找不到 Starry ID 會員資料' }, 403);
  const unlocked = isSuperAdmin(actor) || Boolean(await env.DB.prepare('SELECT trackId FROM transcript_unlocks WHERE userId=? AND trackId=? LIMIT 1').bind(centralUserId, trackId).first());
  if (!unlocked) return json({ error: '只有已用電池解鎖逐字稿的會員可以修正錯字' }, 403);
  const body: any = await request.clone().json().catch(() => ({}));
  const newText = text(body.newText), expectedText = text(body.expectedText);
  if (!newText || newText.length > 1000) return json({ error: '修正內容需為 1 至 1000 字' }, 400);
  const transcript = await loadTranscript(env, trackId);
  if (!transcript) return json({ error: '逐字稿尚未完成' }, 409);
  const base = transcript.segments.find(seg => seg.id === segmentId);
  if (!base) return json({ error: '找不到這一句逐字稿' }, 404);
  const latest: any = await env.DB.prepare('SELECT newText FROM transcript_corrections WHERE trackId=? AND segmentId=? AND createdAt>=? ORDER BY createdAt DESC LIMIT 1').bind(trackId, segmentId,Number(transcript.createdAt||0)).first();
  const currentText = text(latest?.newText || cleanedBaseline(transcript,segmentId,base.text));
  if (expectedText && expectedText !== currentText) return json({ error: '這一句剛被其他會員更新，請重新讀取後再修正', currentText }, 409);
  if (newText === currentText) return json({ success: true, text: currentText, rewardGranted: false, reward: 0 });
  const correctionId = 'transcript-correction-' + crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO transcript_corrections(id,trackId,segmentId,oldText,newText,userId,rewardUnits,rewarded,createdAt)
    VALUES (?,?,?,?,?,?,0,0,?)`).bind(correctionId, trackId, segmentId, currentText, newText, centralUserId, Date.now()).run();
  const settings = await transcriptSettings(env);
  const rewardUnits = Math.max(0, Number(settings.correction_reward_units || 0));
  let rewardGranted = false, balanceUnits = 0;
  if (rewardUnits > 0) {
    const track: any = await env.DB.prepare('SELECT id,title,speaker,speakerRank FROM tracks WHERE id=? LIMIT 1').bind(trackId).first();
    const reward = await batteryTransaction(request, env, ctx, {
      localUserId: actor.id, deltaUnits: rewardUnits, type: 'transcript_correction_reward', sourceId: trackId + ':' + segmentId,
      description: '首次有效修正逐字稿錯字', uniqueKey: 'transcript-correction:' + trackId + ':' + segmentId, track
    });
    rewardGranted = reward.inserted;
    balanceUnits = reward.balanceUnits;
    if (reward.inserted) {
      await env.DB.prepare('UPDATE transcript_corrections SET rewardUnits=?,rewarded=1 WHERE id=?').bind(rewardUnits, correctionId).run();
    }
  }
  return json({ success: true, text: newText, rewardGranted, reward: rewardGranted ? formatBattery(rewardUnits) : 0, balance: formatBattery(balanceUnits) });
}

async function transcriptSettingsApi(request: Request, env: TranscriptEnv) {
  const session = await sessionContext(request, env as any);
  if (!session) return json({ error: '請先登入 Starry ID' }, 401);
  if (!session.isSuperAdmin) return json({ error: '只有超級管理員可以修改逐字稿電池設定' }, 403);
  await ensureSchema(env);
  if (request.method === 'GET') {
    const settings = await transcriptSettings(env);
    const counts: any = await env.DB.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='ready' THEN 1 ELSE 0 END) AS ready,
      SUM(CASE WHEN status IN ('queued','processing') THEN 1 ELSE 0 END) AS processing,
      SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed FROM transcript_index`).first();
    return json({ isSuperAdmin: true, unlockCost: formatBattery(settings.unlock_cost_units), correctionReward: formatBattery(settings.correction_reward_units), counts });
  }
  if (request.method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
  const body: any = await request.clone().json().catch(() => ({}));
  const unlockCost = Number(body.unlockCost), correctionReward = Number(body.correctionReward);
  const unlockUnits = batteriesToUnits(unlockCost), rewardUnits = batteriesToUnits(correctionReward);
  const valid = (number: number, units: number, max: number) => Number.isFinite(number) && number >= 0 && number <= max && Math.abs(number * 10 - units) < 1e-8;
  if (!valid(unlockCost, unlockUnits, 100)) return json({ error: '逐字稿解鎖費用需為 0 至 100 顆，最小單位 0.1 顆' }, 400);
  if (!valid(correctionReward, rewardUnits, 10)) return json({ error: '修正錯字獎勵需為 0 至 10 顆，最小單位 0.1 顆' }, 400);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO transcript_settings(key,valueUnits,updatedAt,updatedBy) VALUES ('unlock_cost_units',?,?,?)
      ON CONFLICT(key) DO UPDATE SET valueUnits=excluded.valueUnits,updatedAt=excluded.updatedAt,updatedBy=excluded.updatedBy`).bind(unlockUnits, now, session.userId),
    env.DB.prepare(`INSERT INTO transcript_settings(key,valueUnits,updatedAt,updatedBy) VALUES ('correction_reward_units',?,?,?)
      ON CONFLICT(key) DO UPDATE SET valueUnits=excluded.valueUnits,updatedAt=excluded.updatedAt,updatedBy=excluded.updatedBy`).bind(rewardUnits, now, session.userId)
  ]);
  return json({ success: true, unlockCost: formatBattery(unlockUnits), correctionReward: formatBattery(rewardUnits) });
}

function ledgerSettingsMarkup() {
  return `<section id="v281-transcript-settings" hidden style="margin:12px 0;padding:14px;border:1px solid #fde68a;border-radius:16px;background:#fffbeb;color:#78350f">
    <h2 style="margin:0 0 8px;font-size:16px">📝 逐字稿電池設定</h2>
    <p style="margin:0 0 10px;font-size:12px;color:#92400e">只有超級管理員看得到。設定後立即套用所有逐字稿。</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <label style="font-size:12px;font-weight:700">逐字稿解鎖需要幾顆電池<input id="v281-unlock-cost" type="number" min="0" max="100" step="0.1" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border:1px solid #fbbf24;border-radius:10px"></label>
      <label style="font-size:12px;font-weight:700">首次有效修錯獎勵幾顆電池<input id="v281-correction-reward" type="number" min="0" max="10" step="0.1" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:9px;border:1px solid #fbbf24;border-radius:10px"></label>
    </div>
    <button id="v281-save-transcript-settings" type="button" style="width:100%;margin-top:10px;padding:10px;border:0;border-radius:12px;background:#b45309;color:white;font-weight:900;cursor:pointer">儲存逐字稿電池設定</button>
    <div id="v281-transcript-settings-status" style="margin-top:7px;font-size:12px"></div>
  </section>
  <script>(function(){var box=document.getElementById('v281-transcript-settings');if(!box)return;var u=document.getElementById('v281-unlock-cost'),r=document.getElementById('v281-correction-reward'),s=document.getElementById('v281-transcript-settings-status'),b=document.getElementById('v281-save-transcript-settings');fetch('/api/v281/transcript-settings',{credentials:'same-origin',cache:'no-store'}).then(function(x){if(!x.ok)throw new Error('hidden');return x.json()}).then(function(d){box.hidden=false;u.value=d.unlockCost;r.value=d.correctionReward;s.textContent='目前已完成 '+Number(d.counts&&d.counts.ready||0)+' 份逐字稿。'}).catch(function(){});b.addEventListener('click',function(){b.disabled=true;s.textContent='儲存中…';fetch('/api/v281/transcript-settings',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({unlockCost:Number(u.value),correctionReward:Number(r.value)})}).then(function(x){return x.json().then(function(d){if(!x.ok)throw new Error(d.error||'儲存失敗');return d})}).then(function(d){s.textContent='已儲存：解鎖 '+d.unlockCost+' 顆；修錯獎勵 '+d.correctionReward+' 顆。'}).catch(function(e){s.textContent=e.message||'儲存失敗'}).finally(function(){b.disabled=false})})})();</script>`;
}

async function injectHtml(response: Response, mode: 'echo' | 'ledger') {
  if (!response.ok || !String(response.headers.get('Content-Type') || '').includes('text/html')) return response;
  let html = await response.text();
  if (mode === 'echo' && !html.includes('/transcript-client.js')) html = html.replace('</body>', '<script defer src="/transcript-client.js?v=281"></script></body>');
  if (mode === 'ledger' && !html.includes('v281-transcript-settings')) {
    const markup = ledgerSettingsMarkup();
    html = html.includes('</main>') ? html.replace('</main>', markup + '</main>') : html.replace('</body>', markup + '</body>');
  }
  const headers = new Headers(response.headers); headers.delete('Content-Length'); headers.set('Cache-Control', 'no-store');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

function parseVtt(vtt: string): { start: number; end: number; text: string }[] {
  const lines = String(vtt || '').replace(/\r/g, '').split('\n');
  const result: { start: number; end: number; text: string }[] = [];
  const seconds = (value: string) => {
    const parts = value.trim().replace(',', '.').split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return Number(parts[0] || 0);
  };
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/([\d:. ,]+)\s+-->\s+([\d:. ,]+)/);
    if (!match) continue;
    const textLines: string[] = [];
    for (i += 1; i < lines.length && lines[i].trim(); i++) textLines.push(lines[i].trim());
    const content = textLines.join(' ').trim();
    if (content) result.push({ start: seconds(match[1]), end: seconds(match[2]), text: content });
  }
  return result;
}

function normalizeAiSegments(result: any): { start: number; end: number; text: string }[] {
  const raw = Array.isArray(result?.transcription_info?.segments) ? result.transcription_info.segments : (Array.isArray(result?.segments) ? result.segments : []);
  const segments = raw.map((seg: any) => ({ start: Number(seg.start || 0), end: Number(seg.end || 0), text: text(seg.text) })).filter((seg: any) => seg.text);
  if (segments.length) return segments;
  const vtt = text(result?.vtt || result?.transcription_info?.vtt);
  if (vtt) return parseVtt(vtt);
  const content = text(result?.text || result?.transcription_info?.text);
  return content ? [{ start: 0, end: 0, text: content }] : [];
}

export class TranscriptWorkflow extends WorkflowEntrypoint<TranscriptEnv, { trackId: string }> {
  async run(event: WorkflowEvent<{ trackId: string }>, step: WorkflowStep) {
    const trackId = text(event.payload.trackId);
    if (!trackId) throw new Error('Missing trackId');
    await ensureSchema(this.env);
    const info: any = await step.do('load-track', async () => {
      const track: any = await this.env.DB.prepare('SELECT id,title,speaker,speakerRank,audioUrl,durationSeconds FROM tracks WHERE id=? LIMIT 1').bind(trackId).first();
      if (!track) throw new Error('Track not found');
      const key = audioR2Key(track.audioUrl); if (!key) throw new Error('Audio R2 key not found');
      const object = await this.env.R2_BUCKET.head(key); if (!object) throw new Error('Audio object not found');
      await this.env.DB.prepare(`INSERT INTO transcript_index(trackId,status,r2Key,model,chunkCount,segmentCount,wordCount,durationSeconds,error,createdAt,updatedAt)
        VALUES (?,'processing',NULL,?,0,0,0,?,NULL,?,?) ON CONFLICT(trackId) DO UPDATE SET status='processing',error=NULL,updatedAt=excluded.updatedAt`)
        .bind(trackId, TRANSCRIPT_MODEL, Number(track.durationSeconds || 0), Date.now(), Date.now()).run();
      return { track, key, size: Number(object.size || 0) };
    });
    const duration = Math.max(1, Number(info.track.durationSeconds || 1));
    const chunks = Math.max(1, Math.ceil(info.size / CHUNK_BYTES));
    const collected: TranscriptSegment[] = [];
    let fullText = '';
    try {
      for (let index = 0; index < chunks; index++) {
        const offset = index * CHUNK_BYTES, length = Math.min(CHUNK_BYTES, info.size - offset);
        const output: any = await step.do('transcribe-' + String(index + 1).padStart(3, '0'), { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' } }, async () => {
          const object = await this.env.R2_BUCKET.get(info.key, { range: { offset, length } });
          if (!object) throw new Error('Audio chunk unavailable');
          const buffer = await object.arrayBuffer();
          const audio = Buffer.from(buffer).toString('base64');
          return this.env.AI.run(TRANSCRIPT_MODEL, {
            audio, task: 'transcribe', language: 'zh', vad_filter: true,
            condition_on_previous_text: true, initial_prompt: index === 0 ? '繁體中文演講逐字稿。人名、獎銜、安麗、白金、鑽石、翡翠、皇冠。' : undefined
          });
        });
        const local = normalizeAiSegments(output);
        const expectedStart = (offset / info.size) * duration, expectedEnd = ((offset + length) / info.size) * duration;
        const localMax = Math.max(0, ...local.map(seg => Number(seg.end || 0)));
        const scale = localMax > 0 ? (expectedEnd - expectedStart) / localMax : 1;
        for (const seg of local) {
          collected.push({ id: '', start: expectedStart + Math.max(0, seg.start) * scale, end: expectedStart + Math.max(seg.end, seg.start + .25) * scale, text: seg.text });
        }
        const chunkText = text(output?.text || output?.transcription_info?.text || local.map(seg => seg.text).join(' '));
        if (chunkText) fullText += (fullText ? '\n' : '') + chunkText;
      }
      collected.sort((a, b) => a.start - b.start);
      collected.forEach((seg, index) => {
        seg.id = 's' + String(index + 1).padStart(6, '0'); seg.start = Number(seg.start.toFixed(3)); seg.end = Number(Math.min(duration, Math.max(seg.start + .2, seg.end)).toFixed(3));
      });
      const file: TranscriptFile = { version: 1, trackId, model: TRANSCRIPT_MODEL, createdAt: Date.now(), durationSeconds: duration, text: fullText || collected.map(seg => seg.text).join('\n'), segments: collected };
      const r2Key = transcriptR2Key(trackId);
      await step.do('store-transcript', async () => {
        await this.env.R2_BUCKET.put(r2Key, JSON.stringify(file), { httpMetadata: { contentType: 'application/json; charset=utf-8' }, customMetadata: { trackId, model: TRANSCRIPT_MODEL } });
        await this.env.DB.prepare(`UPDATE transcript_index SET status='ready',r2Key=?,model=?,chunkCount=?,segmentCount=?,wordCount=?,durationSeconds=?,error=NULL,updatedAt=? WHERE trackId=?`)
          .bind(r2Key, TRANSCRIPT_MODEL, chunks, collected.length, file.text.length, duration, Date.now(), trackId).run();
      });
      return { trackId, chunks, segments: collected.length };
    } catch (error) {
      await this.env.DB.prepare("UPDATE transcript_index SET status='failed',error=?,updatedAt=? WHERE trackId=?")
        .bind(error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000), Date.now(), trackId).run().catch(() => null);
      throw error;
    }
  }
}

async function queueDailyTranscripts(env: TranscriptEnv) {
  await ensureSchema(env);
  const rows = await env.DB.prepare(`SELECT t.id,t.durationSeconds FROM tracks t LEFT JOIN transcript_index i ON i.trackId=t.id
    WHERE t.audioUrl IS NOT NULL AND TRIM(t.audioUrl)<>'' AND (i.trackId IS NULL OR i.status IN ('pending','failed'))
    ORDER BY COALESCE(t.uploadDate,'') DESC,t.id`).all();
  const selected: any[] = []; let seconds = 0;
  for (const row of rows.results || []) {
    const d = Math.max(60, Number(row.durationSeconds || 600));
    if (selected.length && seconds + d > DAILY_TRANSCRIPT_SECONDS) continue;
    if (d > DAILY_TRANSCRIPT_SECONDS && selected.length) continue;
    selected.push(row); seconds += d;
    if (selected.length >= 100 || seconds >= DAILY_TRANSCRIPT_SECONDS) break;
  }
  if (!selected.length) return { queued: 0, seconds: 0 };
  const day = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const instances = selected.map((row, index) => ({ id: 'echo-transcript-' + day + '-' + String(index).padStart(3, '0') + '-' + text(row.id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40), params: { trackId: row.id } }));
  const now = Date.now();
  for (const row of selected) {
    await env.DB.prepare(`INSERT INTO transcript_index(trackId,status,r2Key,model,chunkCount,segmentCount,wordCount,durationSeconds,error,createdAt,updatedAt)
      VALUES (?,'queued',NULL,?,0,0,0,?,NULL,?,?) ON CONFLICT(trackId) DO UPDATE SET status='queued',error=NULL,updatedAt=excluded.updatedAt`)
      .bind(row.id, TRANSCRIPT_MODEL, Number(row.durationSeconds || 0), now, now).run();
  }
  const result = await env.TRANSCRIPT_WORKFLOW.createBatch({ instances });
  for (const error of result.errors || []) {
    const row = selected[Number(error.index)];
    if (row) await env.DB.prepare("UPDATE transcript_index SET status='pending',error=?,updatedAt=? WHERE trackId=?").bind(text(error.message), Date.now(), row.id).run();
  }
  return { queued: (result.created || []).length, seconds, errors: result.errors || [] };
}

async function handleTranscriptApi(request: Request, env: TranscriptEnv, ctx: ExecutionContext) {
  const url = new URL(request.url), path = url.pathname, method = request.method.toUpperCase();
  if (path === '/api/v281/transcript-settings') return transcriptSettingsApi(request, env);
  const segment = path.match(/^\/api\/v281\/transcripts\/([^/]+)\/segments\/([^/]+)$/);
  if (segment && method === 'PUT') return correctSegmentApi(request, env, ctx, decodeURIComponent(segment[1]), decodeURIComponent(segment[2]));
  const unlock = path.match(/^\/api\/v281\/transcripts\/([^/]+)\/unlock$/);
  if (unlock && method === 'POST') return unlockTranscriptApi(request, env, ctx, decodeURIComponent(unlock[1]));
  const item = path.match(/^\/api\/v281\/transcripts\/([^/]+)$/);
  if (item && method === 'GET') return getTranscriptApi(request, env, decodeURIComponent(item[1]));
  return null;
}

export default {
  async fetch(request: Request, env: TranscriptEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url), host = url.hostname.toLowerCase();
    if (url.pathname.startsWith('/api/v281/transcript')) {
      try {
        const response = await handleTranscriptApi(request, env, ctx);
        if (response) return response;
      } catch (error) {
        console.error('Transcript API failed', error);
        return json({ error: '逐字稿服務暫時無法使用，請稍後再試' }, 503);
      }
    }
    const response = await appWorker.fetch(request, env as any, ctx as any);
    if (host === 'echo.starry.phd') return injectHtml(response, 'echo');
    if (host === 'id.starry.phd' && url.pathname === '/battery-ledger') return injectHtml(response, 'ledger');
    return response;
  },
  async scheduled(_controller: any, env: TranscriptEnv, ctx: ExecutionContext) {
    ctx.waitUntil(queueDailyTranscripts(env).then(result => console.log('Daily transcript batch', result)).catch(error => console.error('Daily transcript batch failed', error)));
  }
};