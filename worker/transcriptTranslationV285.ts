import type { Env } from './index';
import transcriptWorker from './transcriptMemberNotificationsRouter';

const MODEL = '@cf/openai/gpt-oss-20b';
const LANGUAGE_NAMES: Record<string,string> = {
  'zh-Hans': '简体中文',
  en: 'English',
  vi: 'Tiếng Việt',
  id: 'Bahasa Indonesia',
  yue: '粵語',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  hi: 'हिन्दी',
  es: 'Español',
  th: 'ไทย',
  ms: 'Bahasa Melayu',
  de: 'Deutsch',
  pt: 'Português',
  ar: 'العربية'
};

type Segment = { id: string; start: number; end: number; text: string };

function text(value: unknown) { return value == null ? '' : String(value).trim(); }
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'
  }});
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
}

function aiText(result: any) {
  if (typeof result === 'string') return result;
  if (typeof result?.response === 'string') return result.response;
  if (typeof result?.output_text === 'string') return result.output_text;
  if (typeof result?.choices?.[0]?.message?.content === 'string') return result.choices[0].message.content;
  const output = result?.output;
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const item of output) {
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
  if (start < 0 || end <= start) throw new Error('Translation returned invalid JSON');
  const parsed = JSON.parse(source.slice(start, end + 1));
  if (!Array.isArray(parsed) || parsed.length !== count || parsed.some(item => typeof item !== 'string')) {
    throw new Error('Translation segment count mismatch');
  }
  return parsed.map(item => item.trim());
}

async function translateBatch(env: Env, source: string[], target: string) {
  if (!source.length) return [];
  const prompt = `Translate each JSON array item into ${target}. Return ONLY one JSON array of exactly ${source.length} strings in the same order. Do not merge, split, number, explain, or add notes. Preserve names, Amway terminology, ranks, product names and meaning naturally. Empty input stays empty.`;
  const result: any = await (env as any).AI.run(MODEL, {
    messages: [
      { role:'system', content: prompt },
      { role:'user', content: JSON.stringify(source) }
    ],
    max_tokens: 4096,
    temperature: 0.15
  });
  return parseStringArray(aiText(result), source.length);
}

async function translateBatchRobust(env: Env, source: string[], target: string): Promise<string[]> {
  try {
    return await translateBatch(env, source, target);
  } catch (error) {
    if (source.length <= 1) throw error;
    const middle = Math.ceil(source.length / 2);
    const [left, right] = await Promise.all([
      translateBatchRobust(env, source.slice(0, middle), target),
      translateBatchRobust(env, source.slice(middle), target)
    ]);
    return [...left, ...right];
  }
}

async function translateSegments(env: Env, segments: Segment[], target: string) {
  const batchSize = 12;
  const batches: Array<{ index: number; items: Segment[] }> = [];
  for (let i = 0; i < segments.length; i += batchSize) {
    batches.push({ index: i, items: segments.slice(i, i + batchSize) });
  }

  const output = new Array<Segment>(segments.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const slot = cursor++;
      if (slot >= batches.length) return;
      const batch = batches[slot];
      const values = await translateBatchRobust(env, batch.items.map(item => text(item.text)), target);
      batch.items.forEach((item, offset) => {
        output[batch.index + offset] = {
          id: text(item.id),
          start: Number(item.start || 0),
          end: Number(item.end || 0),
          text: values[offset] || text(item.text)
        };
      });
    }
  };

  const concurrency = Math.min(3, Math.max(1, batches.length));
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return output.filter(Boolean);
}

export async function handleTranscriptTranslationV285(request: Request, env: Env, ctx: any, trackId: string, language: string) {
  const target = LANGUAGE_NAMES[language];
  if (!target) return json({ error:'不支援這個翻譯語言' }, 400);
  if (!(env as any).AI || !(env as any).R2_BUCKET) return json({ error:'翻譯服務尚未設定完成' }, 503);

  const sourceUrl = new URL(request.url);
  sourceUrl.pathname = '/api/v281/transcripts/' + encodeURIComponent(trackId);
  sourceUrl.search = '';
  const headers = new Headers(request.headers);
  headers.delete('Content-Length'); headers.delete('Content-Type');
  const sourceRequest = new Request(sourceUrl.toString(), { method:'GET', headers });
  const sourceResponse = await transcriptWorker.fetch(sourceRequest, env, ctx);
  const sourceData: any = await sourceResponse.clone().json().catch(() => ({}));
  if (!sourceResponse.ok) return json(sourceData, sourceResponse.status);
  if (!Array.isArray(sourceData?.segments) || sourceData.status !== 'ready' || sourceData.locked) {
    return json(sourceData, sourceData.locked ? 403 : 409);
  }

  const sourceSegments: Segment[] = sourceData.segments.map((item: any) => ({
    id:text(item.id), start:Number(item.start || 0), end:Number(item.end || 0), text:text(item.text)
  }));
  const sourceHash = await digest(JSON.stringify(sourceSegments.map(item => [item.id,item.text])));
  const key = `transcripts/${encodeURIComponent(trackId)}/translations/${encodeURIComponent(language)}.json`;
  const cached = await (env as any).R2_BUCKET.get(key);
  if (cached) {
    try {
      const saved: any = JSON.parse(await cached.text());
      if (saved?.sourceHash === sourceHash && Array.isArray(saved?.segments)) {
        return json({ status:'ready', language, label:target, cached:true, segments:saved.segments, durationSeconds:sourceData.durationSeconds });
      }
    } catch {}
  }

  try {
    const translated = await translateSegments(env, sourceSegments, target);
    const payload = { version:3, trackId, language, label:target, model:MODEL, sourceHash, createdAt:Date.now(), segments:translated };
    await (env as any).R2_BUCKET.put(key, JSON.stringify(payload), {
      httpMetadata:{ contentType:'application/json; charset=utf-8' },
      customMetadata:{ trackId, language, sourceHash, model:MODEL, format:'translation-json' }
    });
    return json({ status:'ready', language, label:target, cached:false, segments:translated, durationSeconds:sourceData.durationSeconds });
  } catch (error) {
    console.warn('Transcript translation failed', trackId, language, error);
    return json({ error:'翻譯暫時失敗，請稍後再試' }, 502);
  }
}