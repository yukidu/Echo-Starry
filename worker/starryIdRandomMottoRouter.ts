import { handleStarryIdCentral } from './starryIdCentralRouter';
import { handleStarryMirrorBridge } from './starryMirrorBridgeRouter';
import { handleStarryEyeSso } from './starryEyeSsoRouter';
import type { Env } from './index';

const ID_HOST = 'id.starry.phd';
const ECHO_HOST = 'echo.starry.phd';
const MOTTO_PATH = '/api/random-motto';
// This is the canonical public quote dataset used by https://mirror.starry.phd/.
// Read it server-side so Echo Starry and Starry ID share the same source without
// exposing the member page to Google Sheets CORS or inventing fallback quotes.
const QUOTES_CSV = 'https://docs.google.com/spreadsheets/d/1HufZqMwvvZh735nBMvKnDDI-BnZMUuYmFTA0_3B2lCE/export?format=csv';
let cache: { quotes: string[]; expires: number } | null = null;

function csvRows(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function extractQuotes(csv: string): string[] {
  const rows = csvRows(csv);
  const headers = rows[0] || [];
  const result = new Set<string>();
  // Starry Mirror: column 1 contains photos; only columns > 1 with a category
  // other than "未分類" are selectable quote cards.
  for (let col = 2; col < headers.length; col++) {
    const category = (headers[col] || '').trim();
    if (!category || category === '未分類') continue;
    for (let i = 1; i < rows.length; i++) {
      const value = (rows[i]?.[col] || '').trim();
      if (value && value.length <= 500) result.add(value);
    }
  }
  return [...result];
}

async function getQuotes(): Promise<string[]> {
  if (cache && cache.expires > Date.now()) return cache.quotes;
  try {
    const response = await fetch(QUOTES_CSV, {
      headers: { Accept: 'text/csv' },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('quotes_source_unavailable');
    const csv = await response.text();
    if (csv.length > 3_000_000) throw new Error('quotes_source_too_large');
    const quotes = extractQuotes(csv);
    if (!quotes.length) throw new Error('quotes_source_empty');
    cache = { quotes, expires: Date.now() + 30 * 60 * 1000 };
    return quotes;
  } catch (error) {
    if (cache && cache.quotes.length) return cache.quotes;
    throw error;
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive'
    }
  });
}

export async function handleStarryIdRandomMotto(request: Request, env: Env): Promise<Response | null> {
  // Keep the established Worker entry unchanged. App-specific bridges hook into
  // this already-global dispatcher before the legacy random-motto route.
  const eye = await handleStarryEyeSso(request, env);
  if (eye) return eye;

  const mirror = await handleStarryMirrorBridge(request, env);
  if (mirror) return mirror;

  const url = new URL(request.url);
  if (![ID_HOST, ECHO_HOST].includes(url.hostname) || url.pathname !== MOTTO_PATH) return null;
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  if (url.hostname === ID_HOST) {
    const sessionRequest = new Request(new URL('/api/session', request.url), {
      headers: { Cookie: request.headers.get('Cookie') || '' }
    });
    const session = await handleStarryIdCentral(sessionRequest, env as any);
    if (!session || !session.ok) return json({ error: '請先登入 Starry ID' }, 401);
  }

  try {
    const quotes = await getQuotes();
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    return json({
      motto: quotes[random[0] % quotes.length],
      source: 'https://mirror.starry.phd/'
    });
  } catch {
    return json({ error: '目前無法讀取繁星心鏡，請稍後再試' }, 503);
  }
}
