import type { Env } from './index';
import transcriptWorker from './transcriptMemberNotificationsRouter';
import { queueAllPendingTranscripts, transcriptBulkStatus } from './transcriptBulkScheduler';
import { queueNextTranscriptV293 } from './transcriptSequentialSchedulerV293';
import { handleCleanupAdmin } from './transcriptCleanupService';
import { batteriesToUnits, unitsToBatteries } from '../shared/battery';

const SESSION_COOKIE = 'echostars_session';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,}$/;
const TRANSLATION_SETTING_KEY = 'translation_cost_units';
const DEFAULT_TRANSLATION_COST_UNITS = 0;
const MAX_SENTENCE_CHARS = 12;
const MIN_SOFT_BREAK_CHARS = 5;
const PAUSE_BREAK_SECONDS = 0.35;
const sentenceSettingReady = new WeakMap<object, Promise<void>>();

function text(value: unknown) { return value == null ? '' : String(value).trim(); }
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options':'nosniff' }
  });
}
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
async function sessionActor(request: Request, env: Env) {
  const token = bearerToken(request) || cookieToken(request);
  if (!(env as any).DB || !TOKEN_PATTERN.test(token)) return null;
  const actor: any = await (env as any).DB.prepare(`SELECT u.id,u.email,u.name,u.role,u.isBlocked,s.expiresAt
    FROM auth_sessions s JOIN users u ON u.id=s.userId WHERE s.tokenHash=? LIMIT 1`)
    .bind(await hashToken(token)).first();
  if (!actor || actor.isBlocked || Number(actor.expiresAt || 0) <= Date.now()) return null;
  return actor;
}
function isSuperAdmin(actor: any) {
  return text(actor?.email).toLowerCase() === 'yukidu@gmail.com' || text(actor?.role) === '超級管理員';
}
async function superAdmin(request: Request, env: Env) {
  const actor = await sessionActor(request, env);
  return actor && isSuperAdmin(actor) ? actor : null;
}

async function ensureTranslationSetting(env: Env) {
  const db = (env as any).DB;
  if (!db) throw new Error('DB not bound');
  const key = db as object;
  if (!sentenceSettingReady.has(key)) {
    const task = (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS transcript_settings (
        key TEXT PRIMARY KEY,valueUnits INTEGER NOT NULL,updatedAt INTEGER NOT NULL,updatedBy TEXT)`).run();
      await db.prepare(`INSERT OR IGNORE INTO transcript_settings(key,valueUnits,updatedAt,updatedBy)
        VALUES (?,?,?,?)`).bind(TRANSLATION_SETTING_KEY, DEFAULT_TRANSLATION_COST_UNITS, Date.now(), 'system').run();
    })();
    sentenceSettingReady.set(key, task);
    task.catch(() => sentenceSettingReady.delete(key));
  }
  await sentenceSettingReady.get(key);
}

async function translationCostUnits(env: Env) {
  await ensureTranslationSetting(env);
  const row: any = await (env as any).DB.prepare('SELECT valueUnits FROM transcript_settings WHERE key=? LIMIT 1')
    .bind(TRANSLATION_SETTING_KEY).first();
  return Math.max(0, Number(row?.valueUnits ?? DEFAULT_TRANSLATION_COST_UNITS));
}

async function saveTranslationCost(env: Env, units: number, actorId: string) {
  await ensureTranslationSetting(env);
  await (env as any).DB.prepare(`INSERT INTO transcript_settings(key,valueUnits,updatedAt,updatedBy) VALUES (?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET valueUnits=excluded.valueUnits,updatedAt=excluded.updatedAt,updatedBy=excluded.updatedBy`)
    .bind(TRANSLATION_SETTING_KEY, units, Date.now(), actorId).run();
}

function sentenceSlices(value: unknown) {
  const chars = Array.from(String(value == null ? '' : value));
  const slices: Array<{ from: number; to: number; text: string }> = [];
  const hard = new Set(['。','！','？','!','?','；',';']);
  const soft = new Set(['，',',','、','：',':']);
  let cursor = 0;
  while (cursor < chars.length) {
    while (cursor < chars.length && /\s/u.test(chars[cursor])) cursor += 1;
    if (cursor >= chars.length) break;
    const remaining = chars.length - cursor;
    let cut = -1;
    const hardLimit = Math.min(chars.length, cursor + MAX_SENTENCE_CHARS);

    // 1. 語意標點優先：完整句號、問號、驚嘆號、分號最優先。
    for (let i = cursor; i < hardLimit; i += 1) {
      if (hard.has(chars[i])) { cut = i + 1; break; }
    }

    // 2. 單一 Whisper/VAD 語音停頓區段如果仍超過 12 字，先找自然弱標點。
    // 3. 仍找不到任何自然切點，才使用 12 字上限作最後保險。
    if (cut < 0 && remaining > MAX_SENTENCE_CHARS) {
      for (let i = hardLimit - 1; i >= cursor + MIN_SOFT_BREAK_CHARS; i -= 1) {
        if (soft.has(chars[i])) { cut = i + 1; break; }
      }
      if (cut < 0) cut = hardLimit;
    }
    if (cut < 0) {
      for (let i = cursor; i < chars.length; i += 1) {
        if (hard.has(chars[i])) { cut = i + 1; break; }
      }
    }
    if (cut < 0) cut = chars.length;
    let from = cursor;
    let to = cut;
    while (from < to && /\s/u.test(chars[from])) from += 1;
    while (to > from && /\s/u.test(chars[to - 1])) to -= 1;
    if (to > from) slices.push({ from, to, text: chars.slice(from, to).join('') });
    cursor = Math.max(cut, cursor + 1);
  }
  return slices;
}

function applySentencePolicy(data: any) {
  if (!data || !Array.isArray(data.segments) || !data.segments.length) return data;
  const sourceSegments = data.segments;
  const next: any[] = [];
  for (let segmentIndex = 0; segmentIndex < sourceSegments.length; segmentIndex += 1) {
    const segment = sourceSegments[segmentIndex];
    const following = sourceSegments[segmentIndex + 1];
    const sourceText = String(segment?.text || '');
    const chars = Array.from(sourceText);
    const slices = sentenceSlices(sourceText);
    const sourceEnd = Number(segment?.end || segment?.start || 0);
    const nextStart = following ? Number(following?.start || sourceEnd) : sourceEnd;
    const pauseAfterSeconds = Math.max(0, nextStart - sourceEnd);
    const pauseBoundary = !following || pauseAfterSeconds >= PAUSE_BREAK_SECONDS;
    if (slices.length <= 1) {
      next.push({
        ...segment,
        sourcePauseAfterSeconds: Number(pauseAfterSeconds.toFixed(3)),
        sourcePauseBoundary: pauseBoundary
      });
      continue;
    }
    const start = Number(segment?.start || 0);
    const end = Math.max(start + 0.2, Number(segment?.end || start + 2));
    const duration = end - start;
    const total = Math.max(1, chars.length);
    for (const slice of slices) {
      next.push({
        ...segment,
        id: `${text(segment?.id)}~${slice.from}~${slice.to}`,
        sourceSegmentId: text(segment?.id),
        sourceFrom: slice.from,
        sourceTo: slice.to,
        text: slice.text,
        start: Number((start + duration * (slice.from / total)).toFixed(3)),
        end: Number((start + duration * (slice.to / total)).toFixed(3)),
        sourcePauseAfterSeconds: slice.to >= total ? Number(pauseAfterSeconds.toFixed(3)) : 0,
        sourcePauseBoundary: slice.to >= total ? pauseBoundary : false
      });
    }
  }
  return {
    ...data,
    segments: next,
    sentencePolicy: {
      version: 2,
      order: ['semantic-punctuation','whisper-vad-pause-boundary','12-character-fallback'],
      maxCharacters: MAX_SENTENCE_CHARS,
      pauseBreakSeconds: PAUSE_BREAK_SECONDS,
      hardBreaks: '。！？!?；;',
      softBreaks: '，,、：:',
      fallback: '語意標點優先，保留 Whisper/VAD 的真實語音停頓時間邊界；單一停頓區段仍超過 12 字時，先找逗號等自然弱標點，最後才硬切 12 字'
    }
  };
}

function parseDerivedSegmentId(value: string) {
  const match = String(value || '').match(/^(.*)~(\d+)~(\d+)$/);
  if (!match) return null;
  return { sourceId: match[1], from: Number(match[2]), to: Number(match[3]) };
}

async function remapDerivedCorrection(request: Request, env: Env, ctx: any, trackId: string, derivedId: string) {
  const derived = parseDerivedSegmentId(derivedId);
  if (!derived) return null;
  const db = (env as any).DB;
  const bucket = (env as any).R2_BUCKET;
  if (!db || !bucket) return json({ error: '逐字稿資料服務尚未連線' }, 503);
  const index: any = await db.prepare('SELECT r2Key,status FROM transcript_index WHERE trackId=? LIMIT 1').bind(trackId).first();
  if (!index || index.status !== 'ready' || !index.r2Key) return json({ error: '逐字稿尚未完成' }, 409);
  const object = await bucket.get(index.r2Key);
  if (!object) return json({ error: '逐字稿檔案不存在' }, 404);
  const transcript: any = JSON.parse(await object.text());
  const base = Array.isArray(transcript?.segments) ? transcript.segments.find((item: any) => text(item?.id) === derived.sourceId) : null;
  if (!base) return json({ error: '找不到原始逐字稿句子' }, 404);
  const latest: any = await db.prepare('SELECT newText FROM transcript_corrections WHERE trackId=? AND segmentId=? AND createdAt>=? ORDER BY createdAt DESC LIMIT 1')
    .bind(trackId, derived.sourceId, Number(transcript?.createdAt || 0)).first().catch(() => null);
  const currentFull = String(latest?.newText ?? base.text ?? '');
  const currentChars = Array.from(currentFull);
  if (derived.from < 0 || derived.to > currentChars.length || derived.from >= derived.to) {
    return json({ error: '這一句已更新，請重新讀取後再修正' }, 409);
  }
  const body: any = await request.clone().json().catch(() => ({}));
  const expectedPiece = text(body.expectedText);
  const currentPiece = currentChars.slice(derived.from, derived.to).join('').trim();
  if (expectedPiece && expectedPiece !== currentPiece) {
    return json({ error: '這一句剛被其他會員更新，請重新讀取後再修正', currentText: currentPiece }, 409);
  }
  const replacement = text(body.newText);
  if (!replacement) return json({ error: '修正內容不可空白' }, 400);
  const merged = currentChars.slice(0, derived.from).join('') + replacement + currentChars.slice(derived.to).join('');
  const url = new URL(request.url);
  url.pathname = `/api/v281/transcripts/${encodeURIComponent(trackId)}/segments/${encodeURIComponent(derived.sourceId)}`;
  const headers = new Headers(request.headers);
  headers.set('Content-Type', 'application/json');
  headers.delete('Content-Length');
  const forwarded = new Request(url.toString(), {
    method: 'PUT',
    headers,
    body: JSON.stringify({ expectedText: currentFull, newText: merged })
  });
  return transcriptWorker.fetch(forwarded, env, ctx);
}

async function mapCentralUserId(env: Env, localUserId: string) {
  const db = (env as any).STARRY_ID_DB;
  if (!db) return '';
  const local = text(localUserId);
  const linked: any = await db.prepare("SELECT userId FROM legacy_links WHERE sourceApp='echostars' AND sourceUserId=? LIMIT 1")
    .bind(local).first().catch(() => null);
  const candidate = text(linked?.userId || local);
  const exists: any = await db.prepare('SELECT id FROM users WHERE id=? LIMIT 1').bind(candidate).first().catch(() => null);
  return exists ? candidate : '';
}

async function chargeTranslationUse(request: Request, env: Env, trackId: string) {
  const actor = await sessionActor(request, env);
  if (!actor) return json({ error: '請先登入會員' }, 401);
  const costUnits = await translationCostUnits(env);
  if (costUnits <= 0 || isSuperAdmin(actor)) {
    return json({ success: true, charged: 0, translationCost: unitsToBatteries(costUnits), adminFree: isSuperAdmin(actor) });
  }
  const centralDb = (env as any).STARRY_ID_DB;
  const centralUserId = await mapCentralUserId(env, actor.id);
  if (!centralDb || !centralUserId) return json({ error: '找不到 Starry ID 會員帳號' }, 403);
  const balanceRow: any = await centralDb.prepare('SELECT COALESCE(SUM(deltaUnits),0) AS balance FROM battery_transactions WHERE userId=?')
    .bind(centralUserId).first();
  const balance = Number(balanceRow?.balance || 0);
  if (balance < costUnits) {
    return json({ error: `電池不足，使用翻譯需要 ${unitsToBatteries(costUnits)} 顆電池`, insufficient: true, balance: unitsToBatteries(balance), translationCost: unitsToBatteries(costUnits) }, 402);
  }
  const track: any = await (env as any).DB?.prepare('SELECT id,title,speaker,speakerRank FROM tracks WHERE id=? LIMIT 1').bind(trackId).first().catch(() => null);
  const after = balance - costUnits;
  const now = Date.now();
  const id = 'battery-' + crypto.randomUUID();
  const uniqueKey = `echostars:transcript-translation:${centralUserId}:${trackId}:${crypto.randomUUID()}`;
  const sourceLabel = track ? [text(track.speaker), text(track.speakerRank) && text(track.speakerRank) !== '無' ? text(track.speakerRank) : '', '-', text(track.title || track.id)].join('') : '逐字稿翻譯';
  await centralDb.prepare(`INSERT INTO battery_transactions
    (id,userId,deltaUnits,balanceAfterUnits,type,sourceApp,sourceId,description,actorUserId,uniqueKey,createdAt,trackId,commentId,relatedUserId,sourceLabel)
    VALUES (?,?,?,?,'transcript_translation_cost','echostars',?,'使用逐字稿翻譯功能',?,?,?, ?,NULL,NULL,?)`)
    .bind(id, centralUserId, -costUnits, after, trackId, centralUserId, uniqueKey, now, trackId, sourceLabel).run();
  await centralDb.prepare(`INSERT INTO battery_accounts(userId,balanceUnits,updatedAt) VALUES (?,?,?)
    ON CONFLICT(userId) DO UPDATE SET balanceUnits=excluded.balanceUnits,updatedAt=excluded.updatedAt`)
    .bind(centralUserId, after, now).run().catch(() => null);
  return json({ success: true, charged: unitsToBatteries(costUnits), balance: unitsToBatteries(after), translationCost: unitsToBatteries(costUnits) });
}

async function extendSettings(request: Request, env: Env, ctx: any) {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return transcriptWorker.fetch(request, env, ctx);
  let requestedTranslationCost: number | null = null;
  if (method === 'PUT') {
    const actor = await superAdmin(request, env);
    if (!actor) return json({ error: '只有超級管理員可以修改逐字稿電池設定' }, 403);
    const input: any = await request.clone().json().catch(() => ({}));
    requestedTranslationCost = Number(input.translationCost);
    const units = batteriesToUnits(requestedTranslationCost);
    const valid = Number.isFinite(requestedTranslationCost) && requestedTranslationCost >= 0 && requestedTranslationCost <= 100 && Math.abs(requestedTranslationCost * 10 - units) < 1e-8;
    if (!valid) return json({ error: '逐字稿翻譯費用需為 0 至 100 顆，最小單位 0.1 顆' }, 400);
  }
  const downstream = await transcriptWorker.fetch(request, env, ctx);
  if (!downstream.ok) return downstream;
  if (method === 'PUT' && requestedTranslationCost != null) {
    const actor = await superAdmin(request, env);
    await saveTranslationCost(env, batteriesToUnits(requestedTranslationCost), text(actor?.id || actor?.email || 'admin'));
  }
  const data: any = await downstream.clone().json().catch(() => ({}));
  const cost = await translationCostUnits(env);
  return json({ ...data, translationCost: unitsToBatteries(cost) }, downstream.status);
}

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/v281/transcript-cleanup' || url.pathname.startsWith('/api/v281/transcript-cleanup/')) {
      const actor=await superAdmin(request,env);
      if(!actor) return json({error:'只有超級管理員能設定口語淨化規則'},403);
      return handleCleanupAdmin(request,env as any,String(actor.id));
    }
    const languageHintRoute = url.pathname.match(/^\/api\/v281\/transcript-language-hints\/([^/]+)$/);
    if (languageHintRoute) {
      const trackId = decodeURIComponent(languageHintRoute[1]);
      const actor = await sessionActor(request, env);
      if (!actor) return json({ error: '請先登入會員' }, 401);
      const db = (env as any).DB;
      const track: any = await db.prepare('SELECT id,uploaderId,uploaderEmail FROM tracks WHERE id=? LIMIT 1').bind(trackId).first();
      if (!track) return json({ error: '找不到音檔' }, 404);
      const isOwner = (text(track.uploaderId) && text(track.uploaderId) === text(actor.id)) ||
        (text(track.uploaderEmail) && text(track.uploaderEmail).toLowerCase() === text(actor.email).toLowerCase());
      if (!isSuperAdmin(actor) && !isOwner) return json({ error: '沒有權限修改音檔語言' }, 403);
      if (request.method.toUpperCase() === 'GET') {
        const row: any = await db.prepare('SELECT languageHint FROM transcript_language_hints WHERE trackId=? LIMIT 1')
          .bind(trackId).first().catch(() => null);
        return json({ languageHint: text(row?.languageHint) || 'auto' });
      }
      if (request.method.toUpperCase() !== 'PUT') return json({ error: 'Method not allowed' }, 405);
      const body: any = await request.json().catch(() => ({}));
      const hint = text(body.languageHint);
      if (!['auto','zh','nan','en','vi','yue','ja','ko','other'].includes(hint))
        return json({ error: '不支援的語言提示' }, 400);
      await db.prepare(`CREATE TABLE IF NOT EXISTS transcript_language_hints (
        trackId TEXT PRIMARY KEY,languageHint TEXT NOT NULL,updatedAt INTEGER NOT NULL)`).run();
      if (hint === 'auto') {
        await db.prepare('DELETE FROM transcript_language_hints WHERE trackId=?').bind(trackId).run();
      } else {
        await db.prepare(`INSERT INTO transcript_language_hints(trackId,languageHint,updatedAt)
          VALUES (?,?,?) ON CONFLICT(trackId) DO UPDATE SET languageHint=excluded.languageHint,updatedAt=excluded.updatedAt`)
          .bind(trackId, hint, Date.now()).run();
      }
      return json({ success: true, languageHint: hint });
    }
    // Admin-only per-track relistening. Old completed transcripts are never bulk rewritten.
    if (url.pathname === '/api/v281/transcript-management/status') {
      if (request.method.toUpperCase() !== 'GET') return json({ error: 'Method not allowed' }, 405);
      if (!await superAdmin(request, env)) return json({ error: '只有超級管理員可以查看逐字稿狀態' }, 403);
      const rows: any = await (env as any).DB.prepare('SELECT trackId,status FROM transcript_index').all();
      return json({ statuses: Object.fromEntries((rows.results || []).map((row: any) => [text(row.trackId), text(row.status)])) });
    }
    const relisten = url.pathname.match(/^\/api\/v281\/transcript-management\/relisten\/([^/]+)$/);
    if (relisten) {
      if (request.method.toUpperCase() !== 'POST') return json({ error: 'Method not allowed' }, 405);
      if (!await superAdmin(request, env)) return json({ error: '只有超級管理員可以重聽逐字稿' }, 403);
      const trackId = decodeURIComponent(relisten[1]);
      const db = (env as any).DB;
      const track: any = await db.prepare('SELECT id,audioUrl,durationSeconds FROM tracks WHERE id=? LIMIT 1').bind(trackId).first();
      if (!track || !text(track.audioUrl)) return json({ error: '找不到可重聽的原始音檔' }, 404);
      const now = Date.now();
      // Single atomic D1 statement: pending/queued/processing cannot be queued twice.
      // Preserve the old R2 key, corrections and reward history until the replacement finishes.
      const claimed: any = await db.prepare(`INSERT INTO transcript_index
        (trackId,status,r2Key,model,chunkCount,segmentCount,wordCount,durationSeconds,error,createdAt,updatedAt)
        VALUES (?,'pending',NULL,'@cf/openai/whisper-large-v3-turbo',0,0,0,?,NULL,?,?)
        ON CONFLICT(trackId) DO UPDATE SET
          status='pending',error=NULL,updatedAt=excluded.updatedAt
        WHERE transcript_index.status IN ('ready','failed')
        RETURNING trackId`)
        .bind(trackId, Math.max(0, Number(track.durationSeconds || 0)), now, now).all();
      if (!claimed?.results?.length) return json({ error: '這份逐字稿已在排隊或處理中，不能重複啟動' }, 409);
      // Queue promptly but preserve the existing central concurrency policy.
      ctx.waitUntil(queueNextTranscriptV293(env as any, { includeFailed: false }).catch((error: unknown) => {
        console.error('Transcript relisten scheduling failed', error);
      }));
      return json({ success: true, trackId, status: 'pending', message: '已排入重聽逐字稿隊列' }, 202);
    }
    if (url.pathname === '/api/v281/transcripts/bulk-start') {
      if (request.method.toUpperCase() !== 'POST') return json({ error: 'Method not allowed' }, 405);
      const actor = await superAdmin(request, env);
      if (!actor) return json({ error: '只有超級管理員可以啟動整批逐字稿' }, 403);
      const result = await queueAllPendingTranscripts(env as any);
      return json({ success: true, ...result });
    }
    if (url.pathname === '/api/v281/transcripts/bulk-status') {
      if (request.method.toUpperCase() !== 'GET') return json({ error: 'Method not allowed' }, 405);
      const actor = await superAdmin(request, env);
      if (!actor) return json({ error: '只有超級管理員可以查看整批逐字稿狀態' }, 403);
      return json({ success: true, ...(await transcriptBulkStatus(env as any)) });
    }
    if (url.pathname === '/api/v281/transcript-settings') {
      return extendSettings(request, env, ctx);
    }
    const translationUse = url.pathname.match(/^\/api\/v281\/transcripts\/([^/]+)\/translation-use$/);
    if (translationUse && request.method.toUpperCase() === 'POST') {
      return chargeTranslationUse(request, env, decodeURIComponent(translationUse[1]));
    }
    const correction = url.pathname.match(/^\/api\/v281\/transcripts\/([^/]+)\/segments\/([^/]+)$/);
    if (correction && request.method.toUpperCase() === 'PUT') {
      const mapped = await remapDerivedCorrection(request, env, ctx, decodeURIComponent(correction[1]), decodeURIComponent(correction[2]));
      if (mapped) return mapped;
    }
    const item = url.pathname.match(/^\/api\/v281\/transcripts\/([^/]+)$/);
    const translate = text(url.searchParams.get('translate'));
    if (item && translate && request.method.toUpperCase() === 'POST') {
      return json({
        error: '外語 AI 翻譯目前已停用，請使用瀏覽器的整頁翻譯功能',
        aiTranslationDisabled: true,
        futureReenableReady: true
      }, 410);
    }
    if (item && request.method.toUpperCase() === 'GET') {
      const downstream = await transcriptWorker.fetch(request, env, ctx);
      if (!downstream.ok || !String(downstream.headers.get('Content-Type') || '').includes('application/json')) return downstream;
      const data: any = await downstream.clone().json().catch(() => null);
      if (!data) return downstream;
      const cost = await translationCostUnits(env).catch(() => DEFAULT_TRANSLATION_COST_UNITS);
      return json({ ...applySentencePolicy(data), translationCost: unitsToBatteries(cost) }, downstream.status);
    }
    return transcriptWorker.fetch(request, env, ctx);
  }
};