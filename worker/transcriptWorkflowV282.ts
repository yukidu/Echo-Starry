import { Buffer } from 'node:buffer';
import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

const MODEL = '@cf/openai/whisper-large-v3-turbo';
const SEGMENT_SECONDS = 180;

type Env = {
  DB: any;
  R2_BUCKET: any;
  AI: any;
  AUDIO_SEGMENTER: any;
};

type Segment = { id: string; start: number; end: number; text: string };
type TranscriptFile = {
  version: number;
  trackId: string;
  model: string;
  createdAt: number;
  durationSeconds: number;
  text: string;
  segments: Segment[];
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

export class TranscriptWorkflow extends WorkflowEntrypoint<Env, { trackId: string }> {
  async run(event: WorkflowEvent<{ trackId: string }>, step: WorkflowStep) {
    const trackId = eventTrackId(event.payload);
    if (!trackId) throw new Error('Missing trackId');
    await ensureIndex(this.env);

    const info: any = await step.do('load-track', async () => {
      const track: any = await this.env.DB.prepare('SELECT id,title,speaker,speakerRank,audioUrl,durationSeconds FROM tracks WHERE id=? LIMIT 1')
        .bind(trackId).first();
      if (!track) throw new Error('Track not found');
      const key = audioR2Key(track.audioUrl);
      if (!key) throw new Error('Audio R2 key not found');
      const object = await this.env.R2_BUCKET.head(key);
      if (!object) throw new Error('Audio object not found');
      const now = Date.now();
      await this.env.DB.prepare(`INSERT INTO transcript_index(trackId,status,r2Key,model,chunkCount,segmentCount,wordCount,durationSeconds,error,createdAt,updatedAt)
        VALUES (?,'processing',NULL,?,0,0,0,?,NULL,?,?)
        ON CONFLICT(trackId) DO UPDATE SET status='processing',error=NULL,updatedAt=excluded.updatedAt`)
        .bind(trackId, MODEL, Number(track.durationSeconds || 0), now, now).run();
      return { track, key, size: Number(object.size || 0), ext: audioExtension(key) };
    });

    const duration = Math.max(1, Number(info.track.durationSeconds || 1));
    const chunks = Math.max(1, Math.ceil(duration / SEGMENT_SECONDS));
    const segments: Segment[] = [];
    const textParts: string[] = [];

    try {
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
              language: 'zh',
              vad_filter: true,
              condition_on_previous_text: true,
              initial_prompt: `繁體中文演講逐字稿。講者：${text(info.track.speaker)}。獎銜：${text(info.track.speakerRank)}。常見詞：安麗、白金、鑽石、翡翠、皇冠。`
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
        const part = text(output?.text || output?.transcription_info?.text || local.map((seg: any) => seg.text).join(' '));
        if (part) textParts.push(part);
      }

      segments.sort((a, b) => a.start - b.start);
      segments.forEach((seg, index) => {
        seg.id = `s${String(index + 1).padStart(6, '0')}`;
        seg.start = Number(seg.start.toFixed(3));
        seg.end = Number(Math.min(duration, Math.max(seg.start + 0.2, seg.end)).toFixed(3));
      });
      const fullText = textParts.join('\n') || segments.map(seg => seg.text).join('\n');
      const file: TranscriptFile = {
        version: 2,
        trackId,
        model: MODEL,
        createdAt: Date.now(),
        durationSeconds: duration,
        text: fullText,
        segments
      };
      const base = folder(trackId);
      const jsonKey = `${base}/transcript.json`;
      const txtKey = `${base}/transcript.txt`;
      const vttKey = `${base}/transcript.vtt`;

      await step.do('store-transcript-formats', async () => {
        await Promise.all([
          this.env.R2_BUCKET.put(jsonKey, JSON.stringify(file), {
            httpMetadata: { contentType: 'application/json; charset=utf-8' },
            customMetadata: { trackId, model: MODEL, format: 'json' }
          }),
          this.env.R2_BUCKET.put(txtKey, fullText, {
            httpMetadata: { contentType: 'text/plain; charset=utf-8' },
            customMetadata: { trackId, model: MODEL, format: 'txt' }
          }),
          this.env.R2_BUCKET.put(vttKey, toVtt(segments), {
            httpMetadata: { contentType: 'text/vtt; charset=utf-8' },
            customMetadata: { trackId, model: MODEL, format: 'vtt' }
          })
        ]);
        await this.env.DB.prepare(`UPDATE transcript_index SET status='ready',r2Key=?,model=?,chunkCount=?,segmentCount=?,wordCount=?,durationSeconds=?,error=NULL,updatedAt=? WHERE trackId=?`)
          .bind(jsonKey, MODEL, chunks, segments.length, fullText.length, duration, Date.now(), trackId).run();
      });

      await cleanupAudio(this.env, trackId, info.ext);
      return { trackId, chunks, segments: segments.length, jsonKey, txtKey, vttKey };
    } catch (error) {
      await cleanupAudio(this.env, trackId, info.ext);
      await this.env.DB.prepare("UPDATE transcript_index SET status='failed',error=?,updatedAt=? WHERE trackId=?")
        .bind(error instanceof Error ? error.message.slice(0,1000) : String(error).slice(0,1000), Date.now(), trackId).run().catch(() => null);
      throw error;
    }
  }
}
