import { Buffer } from 'node:buffer';
import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { queueNextTranscriptV293 } from './transcriptSequentialSchedulerV293';
import { markSpeakerBiosDirty } from './aiSpeakerProfileRouter';
import { cleanTranscriptSegmentsOnce, loadCleanupSettings } from './transcriptCleanupService';

const MODEL = '@cf/openai/whisper-large-v3-turbo';
const TRADITIONAL_MODEL = '@cf/openai/gpt-oss-20b';
const SEGMENT_SECONDS = 180;

type Env = {
  DB: any;
  R2_BUCKET: any;
  AI: any;
  AUDIO_SEGMENTER: any;
  TRANSCRIPT_WORKFLOW: any;
};

type Segment = { id: string; start: number; end: number; text: string };
type TranscriptFile = {
  version: number;
  trackId: string;
  model: string;
  language: string;
  createdAt: number;
  durationSeconds: number;
  text: string;
  segments: Segment[];
  cleanupVersion?: number;
  cleanedSegments?: {id:string;text:string}[];
};

function text(value: unknown) { return value == null ? '' : String(value).trim(); }

function eventTrackId(payload: unknown) {
  if (payload && typeof payload === 'object') return text((payload as any).trackId);
  if (typeof payload === 'string') {
    try { return text(JSON.parse(payload)?.trackId); } catch { return ''; }
  }
  return '';
}

function audioR2Key(audioUrl: string) {
  const marker = '/api/r2/file/';
  const value = text(audioUrl);
  const index = value.indexOf(marker);
  if (index < 0) return '';
  try { return decodeURIComponent(value.slice(index + marker.length)); } catch { return value.slice(index + marker.length); }
}

function audioExtension(key: string) {
  const name = key.split('/').pop() || '';
  const match = name.match(/\.([A-Za-z0-9]{1,8})$/);
  return match ? match[1].toLowerCase() : 'audio';
}

function folder(trackId: string) { return `transcripts/${encodeURIComponent(trackId)}`; }

async function ensureIndex(env: Env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS transcript_index (
    trackId TEXT PRIMARY KEY,status TEXT NOT NULL DEFAULT 'pending',r2Key TEXT,model TEXT NOT NULL DEFAULT '${MODEL}',
    chunkCount INTEGER NOT NULL DEFAULT 0,segmentCount INTEGER NOT NULL DEFAULT 0,wordCount INTEGER NOT NULL DEFAULT 0,
    durationSeconds REAL NOT NULL DEFAULT 0,error TEXT,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL)`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS transcript_index_status ON transcript_index(status,updatedAt)').run();
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
    const body: string[] = [];
    for (i += 1; i < lines.length && lines[i].trim(); i++) body.push(lines[i].trim());
    const content = body.join(' ').trim();
    if (content) result.push({ start: seconds(match[1]), end: seconds(match[2]), text: content });
  }
  return result;
}

function normalizeSegments(result: any): { start: number; end: number; text: string }[] {
  const raw = Array.isArray(result?.transcription_info?.segments)
    ? result.transcription_info.segments
    : Array.isArray(result?.segments) ? result.segments : [];
  const direct = raw.map((seg: any) => ({ start: Number(seg.start || 0), end: Number(seg.end || 0), text: text(seg.text) }))
    .filter((seg: any) => seg.text);
  if (direct.length) return direct;
  const vtt = text(result?.vtt || result?.transcription_info?.vtt);
  if (vtt) return parseVtt(vtt);
  const content = text(result?.text || result?.transcription_info?.text);
  const seconds = Math.max(1, Number(result?.transcription_info?.duration_after_vad || result?.transcription_info?.duration || 0));
  return content ? [{ start: 0, end: seconds, text: content }] : [];
}

function aiText(result: any) {
  if (typeof result === 'string') return result;
  if (typeof result?.response === 'string') return result.response;
  if (typeof result?.output_text === 'string') return result.output_text;
  if (typeof result?.choices?.[0]?.message?.content === 'string') return result.choices[0].message.content;
  if (Array.isArray(result?.output)) {
    const parts: string[] = [];
    for (const item of result.output) {
      if (typeof item?.content === 'string') parts.push(item.content);
      if (Array.isArray(item?.content)) for (const part of item.content) if (typeof part?.text === 'string') parts.push(part.text);
    }
    if (parts.length) return parts.join('\n');
  }
  return '';
}

function parseStringArray(raw: string, count: number) {
  const source = String(raw || '').trim();
  const start = source.indexOf('['), end = source.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('Traditional Chinese normalization returned invalid JSON');
  const value = JSON.parse(source.slice(start, end + 1));
  if (!Array.isArray(value) || value.length !== count || value.some(item => typeof item !== 'string')) {
    throw new Error('Traditional Chinese normalization segment count mismatch');
  }
  return value.map(item => item.trim());
}

function likelyChineseTranscript(segments: Segment[]) {
  const sample = segments.map(item => item.text).join('').slice(0, 24000);
  if (!sample) return false;
  const han = (sample.match(/\p{Script=Han}/gu) || []).length;
  const kana = (sample.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length;
  const hangul = (sample.match(/\p{Script=Hangul}/gu) || []).length;
  const latin = (sample.match(/[A-Za-z]/g) || []).length;
  const chineseMarkers = (sample.match(/[的了是在我你他們这這個个有和不就也都要會会說说為为跟讓让把嗎吗呢]/g) || []).length;
  const scriptTotal = han + kana + hangul + latin;
  if (han < 20 || kana > han * 0.12 || hangul > han * 0.08) return false;
  return chineseMarkers >= 8 || (scriptTotal > 0 && han / scriptTotal >= 0.45);
}

async function traditionalizeBatch(env: Env, values: string[]) {
  if (!values.length) return [];
  const result: any = await env.AI.run(TRADITIONAL_MODEL, {
    messages: [
      {
        role: 'system',
        content: `Convert only Chinese-language text within the JSON array items to Taiwan Traditional Chinese (繁體中文／台灣用字) and restore natural Taiwan Chinese punctuation from the spoken meaning and phrasing without changing other languages. Preserve English, Japanese, Korean, Vietnamese, Cantonese and all other non-Chinese spoken phrases verbatim and in their original order, even when mixed within the same segment. Return ONLY one JSON array of exactly ${values.length} strings in the same order. Do not merge or split array items. Do not add, remove, paraphrase, summarize, translate or reorder spoken content. Keep names, Amway terminology, ranks and spoken style unchanged. Add punctuation only where the meaning clearly supports it; use question marks only for actual questions. Never output Simplified Chinese characters when a Traditional form exists.`
      },
      { role: 'user', content: JSON.stringify(values) }
    ],
    max_tokens: 4096,
    temperature: 0.1
  });
  return parseStringArray(aiText(result), values.length);
}

async function traditionalizeBatchRobust(env: Env, values: string[]): Promise<string[]> {
  // Text normalization must NEVER erase hours of successful Whisper transcription.
  // Invalid/truncated AI JSON is a formatting failure, not an audio-transcription failure.
  // Limit to one normalization request per batch (Workflow itself may retry transient errors).
  try {
    return await traditionalizeBatch(env, values);
  } catch (error) {
    console.warn('Transcript normalization skipped; preserving original recognized text:', error instanceof Error ? error.message.slice(0,120) : 'unknown');
    return values;
  }
}

async function traditionalizeSegments(env: Env, step: WorkflowStep, segments: Segment[]) {
  const batchSize = 12;
  for (let offset = 0; offset < segments.length; offset += batchSize) {
    const batch = segments.slice(offset, offset + batchSize);
    const normalized: string[] = await step.do(
      `traditionalize-${String(Math.floor(offset / batchSize) + 1).padStart(3, '0')}`,
      { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' }, timeout: '10 minutes' },
      async () => traditionalizeBatchRobust(env, batch.map(item => item.text))
    );
    normalized.forEach((value, index) => { batch[index].text = value || batch[index].text; });
  }
}

function vttTime(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(milli).padStart(3,'0')}`;
}

function toVtt(segments: Segment[]) {
  return 'WEBVTT\n\n' + segments.map((seg, index) => `${index + 1}\n${vttTime(seg.start)} --> ${vttTime(seg.end)}\n${seg.text}\n`).join('\n');
}

function segmenter(env: Env, trackId: string) {
  const id = env.AUDIO_SEGMENTER.idFromName(trackId);
  return env.AUDIO_SEGMENTER.get(id);
}

async function loadAudio(env: Env, trackId: string, key: string, ext: string) {
  const object = await env.R2_BUCKET.get(key);
  if (!object) throw new Error('Audio object not found');
  const response = await segmenter(env, trackId).fetch(`https://audio-segmenter/load?trackId=${encodeURIComponent(trackId)}&ext=${encodeURIComponent(ext)}`, {
    method: 'POST',
    headers: { 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream' },
    body: object.body
  });
  if (!response.ok) throw new Error(`Audio segmenter load failed ${response.status}: ${await response.text()}`);
}

async function getAudioSegment(env: Env, trackId: string, key: string, ext: string, start: number, duration: number) {
  const url = `https://audio-segmenter/segment?trackId=${encodeURIComponent(trackId)}&ext=${encodeURIComponent(ext)}&start=${start}&duration=${duration}`;
  let response = await segmenter(env, trackId).fetch(url);
  if (response.status === 404) {
    await loadAudio(env, trackId, key, ext);
    response = await segmenter(env, trackId).fetch(url);
  }
  if (!response.ok) throw new Error(`Audio segment failed ${response.status}: ${await response.text()}`);
  return response.arrayBuffer();
}

async function cleanupAudio(env: Env, trackId: string, ext: string) {
  await segmenter(env, trackId).fetch(`https://audio-segmenter/load?trackId=${encodeURIComponent(trackId)}&ext=${encodeURIComponent(ext)}`, {
    method: 'DELETE'
  }).catch(() => null);
}

async function queueFollowingTranscript(env: Env, step: WorkflowStep, stepName: string) {
  try {
    return await step.do(
      stepName,
      { retries: { limit: 3, delay: '2 seconds', backoff: 'exponential' }, timeout: '2 minutes' },
      async () => queueNextTranscriptV293(env, { includeFailed: false })
    );
  } catch (error) {
    // 接棒失敗不能把剛完成的逐字稿改成 failed；15 分鐘 watchdog 會自動補救。
    return { queued: 0, watchdogFallback: true, error: text(error instanceof Error ? error.message : error) };
  }
}

export class TranscriptWorkflow extends WorkflowEntrypoint<Env, { trackId: string }> {
  async run(event: WorkflowEvent<{ trackId: string }>, step: WorkflowStep) {
    const trackId = eventTrackId(event.payload);
    if (!trackId) throw new Error('Missing trackId');
    await ensureIndex(this.env);

    let info: any = null;
    try {
      info = await step.do('load-track', async () => {
        const track: any = await this.env.DB.prepare('SELECT id,title,speaker,speakerRank,audioUrl,durationSeconds FROM tracks WHERE id=? LIMIT 1')
          .bind(trackId).first();
        if (!track) throw new Error('Track not found');
        const key = audioR2Key(track.audioUrl);
        if (!key) throw new Error('Audio R2 key not found');
        // Avoid R2.head here: it previously hit Cloudflare subrequest-depth 10034.
        // prepare-audio-container will GET and validate the actual source before transcribing.
        const now = Date.now();
        await this.env.DB.prepare(`INSERT INTO transcript_index(trackId,status,r2Key,model,chunkCount,segmentCount,wordCount,durationSeconds,error,createdAt,updatedAt)
          VALUES (?,'processing',NULL,?,0,0,0,?,NULL,?,?)
          ON CONFLICT(trackId) DO UPDATE SET status='processing',error=NULL,updatedAt=excluded.updatedAt`)
          .bind(trackId, MODEL, Number(track.durationSeconds || 0), now, now).run();
        const hintRow: any = await this.env.DB.prepare('SELECT languageHint FROM transcript_language_hints WHERE trackId=? LIMIT 1')
          .bind(trackId).first().catch(() => null);
        return { track, key, size: 0, ext: audioExtension(key), languageHint: text(hintRow?.languageHint) || 'auto' };
      });

      const duration = Math.max(1, Number(info.track.durationSeconds || 1));
      const chunks = Math.max(1, Math.ceil(duration / SEGMENT_SECONDS));
      const segments: Segment[] = [];

      await step.do('prepare-audio-container', { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' } }, async () => {
        await loadAudio(this.env, trackId, info.key, info.ext);
        return { ok: true, bytes: info.size };
      });

      for (let index = 0; index < chunks; index++) {
        const start = index * SEGMENT_SECONDS;
        const seconds = Math.max(1, Math.min(SEGMENT_SECONDS, duration - start));
        const output: any = await step.do(
          `transcribe-${String(index + 1).padStart(3, '0')}`,
          { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' }, timeout: '10 minutes' },
          async () => {
            const buffer = await getAudioSegment(this.env, trackId, info.key, info.ext, start, seconds);
            const audio = Buffer.from(buffer).toString('base64');
            return this.env.AI.run(MODEL, {
              audio,
              task: 'transcribe',
              vad_filter: true,
              condition_on_previous_text: true,
              initial_prompt: `Transcribe exactly in ALL originally spoken languages, preserving arbitrary mixed-language code switching; do not translate or unify languages. Language identification hint (never a forced output language): ${text(info.languageHint || 'auto')}. 所有原音語言均須照實保留，遇到國語、台語、英語、日語、越南語、粵語等任意混合時，依發話順序逐字轉錄，不翻譯、不統一成單一語言。Speaker/講者：${text(info.track.speaker)}。Rank/獎銜：${text(info.track.speakerRank)}。Common proper nouns/常見專有名詞：Amway/安麗、Platinum/白金、Diamond/鑽石、Emerald/翡翠、Crown/皇冠。`
            });
          }
        );

        const local = normalizeSegments(output);
        for (const seg of local) {
          const localStart = Math.max(0, Number(seg.start || 0));
          const localEnd = Math.max(localStart + 0.2, Number(seg.end || 0));
          segments.push({
            id: '',
            start: Math.min(duration, start + localStart),
            end: Math.min(duration, start + localEnd),
            text: seg.text
          });
        }
      }

      segments.sort((a, b) => a.start - b.start);
      segments.forEach((seg, index) => {
        seg.id = `s${String(index + 1).padStart(6, '0')}`;
        seg.start = Number(seg.start.toFixed(3));
        seg.end = Number(Math.min(duration, Math.max(seg.start + 0.2, seg.end)).toFixed(3));
      });

      const isChinese = likelyChineseTranscript(segments);
      if (isChinese) await traditionalizeSegments(this.env, step, segments);
      const storedLanguage = isChinese ? 'zh-Hant-TW' : 'original';
      // Preserve raw segments and timecodes; store separate C1 display text only.
      // Snapshot one policy version for this entire recording, without reading D1 during playback.
      const cleanupSnapshot = await step.do('c1-cleanup-settings-v1', async () => loadCleanupSettings(this.env.DB));
      const cleanedSegments: {id:string;text:string}[] = [];
      for (let offset=0;offset<segments.length;offset+=20) {
        const part = await step.do(
          'c1-cleanup-part-' + String(Math.floor(offset/20)+1).padStart(4,'0'),
          { retries: { limit: 2, delay: '5 seconds', backoff: 'exponential' }, timeout: '10 minutes' },
          async () => cleanTranscriptSegmentsOnce(this.env, segments.slice(offset,offset+20), cleanupSnapshot)
        );
        cleanedSegments.push(...part.cleanedSegments);
      }
      const fullText = segments.map(seg => seg.text).join('\n');
      const file: TranscriptFile = {
        version: 5,
        trackId,
        model: MODEL,
        language: storedLanguage,
        createdAt: Date.now(),
        durationSeconds: duration,
        text: fullText,
        segments,
        cleanupVersion: cleanupSnapshot.version,
        cleanedSegments
      };
      const base = folder(trackId);
      const jsonKey = `${base}/transcript.json`;
      const txtKey = `${base}/transcript.txt`;
      const vttKey = `${base}/transcript.vtt`;

      await step.do('store-transcript-formats', async () => {
        await Promise.all([
          this.env.R2_BUCKET.put(jsonKey, JSON.stringify(file), {
            httpMetadata: { contentType: 'application/json; charset=utf-8' },
            customMetadata: { trackId, model: MODEL, format: 'json', language: storedLanguage }
          }),
          this.env.R2_BUCKET.put(txtKey, fullText, {
            httpMetadata: { contentType: 'text/plain; charset=utf-8' },
            customMetadata: { trackId, model: MODEL, format: 'txt', language: storedLanguage }
          }),
          this.env.R2_BUCKET.put(vttKey, toVtt(segments), {
            httpMetadata: { contentType: 'text/vtt; charset=utf-8' },
            customMetadata: { trackId, model: MODEL, format: 'vtt', language: storedLanguage }
          })
        ]);
        await this.env.DB.prepare(`UPDATE transcript_index SET status='ready',r2Key=?,model=?,chunkCount=?,segmentCount=?,wordCount=?,durationSeconds=?,error=NULL,updatedAt=? WHERE trackId=?`)
          .bind(jsonKey, MODEL, chunks, segments.length, fullText.length, duration, Date.now(), trackId).run();
      });

      // Successful new transcripts queue a speaker biography refresh without making the recording fail on bio errors.
      await markSpeakerBiosDirty(this.env, trackId).catch(() => null);
      await cleanupAudio(this.env, trackId, info.ext);
      const next = await queueFollowingTranscript(this.env, step, 'queue-next-transcript');
      return { trackId, chunks, segments: segments.length, language: storedLanguage, jsonKey, txtKey, vttKey, next };
    } catch (error) {
      if (info?.ext) await cleanupAudio(this.env, trackId, info.ext);
      await this.env.DB.prepare("UPDATE transcript_index SET status='failed',error=?,updatedAt=? WHERE trackId=?")
        .bind(error instanceof Error ? error.message.slice(0,1000) : String(error).slice(0,1000), Date.now(), trackId).run().catch(() => null);
      await queueFollowingTranscript(this.env, step, 'queue-next-after-failure');
      throw error;
    }
  }
}