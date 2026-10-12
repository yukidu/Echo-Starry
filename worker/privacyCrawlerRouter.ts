import appWorker from './favoriteRouter';
import hiddenTrackWorker from './hiddenTrackRouter';
import sessionWorker from './sessionCookieRouter';
import iosGoogleRedirectWorker from './iosGoogleRedirectRouter';
import { handleStarbeautySso } from './starbeautySsoRouter';
import { handleV192TrackVisibility } from './v192TrackVisibilityRouter';
import type { Env } from './index';
import { unitsToStickers } from '../shared/stickers';

const X_ROBOTS_TAG = 'noindex, nofollow, noarchive, nosnippet, noimageindex';
const NOOP_EDIT_MARKER = '__ECHOSTARS_NOOP_EDIT_SAVE__';
const NOOP_EDIT_BOOKKEEPING_FIELDS = new Set(['userEmail', 'stickerOperationId']);

const BLOCKED_CRAWLER_PATTERNS: RegExp[] = [
  /Googlebot/i,
  /Bingbot/i,
  /DuckDuckBot/i,
  /Baiduspider/i,
  /YandexBot/i,
  /Yahoo! Slurp/i,
  /Sogou/i,
  /PetalBot/i,
  /Applebot(?:-Extended)?/i,
  /GPTBot/i,
  /ChatGPT-User/i,
  /OAI-SearchBot/i,
  /Google-Extended/i,
  /ClaudeBot/i,
  /Claude-Web/i,
  /anthropic-ai/i,
  /CCBot/i,
  /PerplexityBot/i,
  /Perplexity-User/i,
  /Bytespider/i,
  /cohere-ai/i,
  /Meta-ExternalAgent/i,
  /Meta-ExternalFetcher/i,
  /Diffbot/i,
  /ImagesiftBot/i,
  /YouBot/i,
  /omgili/i
];

const ROBOTS_TXT = `# 繁星回聲：禁止搜尋引擎與 AI 爬蟲索引／抓取
User-agent: *
Disallow: /

User-agent: Googlebot
Disallow: /
User-agent: Bingbot
Disallow: /
User-agent: DuckDuckBot
Disallow: /
User-agent: Baiduspider
Disallow: /
User-agent: YandexBot
Disallow: /
User-agent: Slurp
Disallow: /
User-agent: Sogou
Disallow: /
User-agent: PetalBot
Disallow: /
User-agent: Applebot
Disallow: /
User-agent: GPTBot
Disallow: /
User-agent: ChatGPT-User
Disallow: /
User-agent: OAI-SearchBot
Disallow: /
User-agent: Google-Extended
Disallow: /
User-agent: ClaudeBot
Disallow: /
User-agent: Claude-Web
Disallow: /
User-agent: anthropic-ai
Disallow: /
User-agent: CCBot
Disallow: /
User-agent: PerplexityBot
Disallow: /
User-agent: Perplexity-User
Disallow: /
User-agent: Applebot-Extended
Disallow: /
User-agent: Bytespider
Disallow: /
User-agent: cohere-ai
Disallow: /
User-agent: Meta-ExternalAgent
Disallow: /
User-agent: Meta-ExternalFetcher
Disallow: /
User-agent: Diffbot
Disallow: /
User-agent: ImagesiftBot
Disallow: /
User-agent: YouBot
Disallow: /
User-agent: omgili
Disallow: /
`;

function isBlockedCrawler(userAgent: string): boolean {
  return BLOCKED_CRAWLER_PATTERNS.some(pattern => pattern.test(userAgent));
}

function withPrivacyHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', X_ROBOTS_TAG);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function rewriteJsonRequest(request: Request, body: Record<string, unknown>) {
  const headers = new Headers(request.headers);
  headers.set('Content-Type', 'application/json');
  headers.delete('Content-Length');
  return new Request(request, { headers, body: JSON.stringify(body) });
}

async function rewriteNoopTrackEditRequest(request: Request): Promise<Request> {
  const url = new URL(request.url);
  if (
    request.method.toUpperCase() !== 'PUT' ||
    !/^\/api\/tracks\/[^/]+$/.test(url.pathname) ||
    !(request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')
  ) return request;

  const body: unknown = await request.clone().json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return request;

  const editableKeys = Object.keys(body as Record<string, unknown>)
    .filter(key => !NOOP_EDIT_BOOKKEEPING_FIELDS.has(key));
  if (editableKeys.length > 0) return request;

  return rewriteJsonRequest(request, {
    ...(body as Record<string, unknown>),
    [NOOP_EDIT_MARKER]: true
  });
}

async function spentStickerLeaderboard(env: Env): Promise<Response | null> {
  if (!env.DB) return null;
  try {
    const result = await env.DB.prepare(`SELECT
        u.id,u.name,u.avatar,u.center,
        CASE WHEN COALESCE(u.rankApproved,0)=1 THEN COALESCE(NULLIF(u.approvedRank,''),u.rank,'無') ELSE COALESCE(u.rank,'無') END AS effectiveRank,
        COALESCE(SUM(t.deltaUnits),0) AS balanceUnits,
        COALESCE(SUM(CASE WHEN t.type <> 'balance_correction' AND t.deltaUnits > 0 THEN t.deltaUnits ELSE 0 END),0) AS earnedUnits,
        COALESCE(SUM(CASE WHEN t.type <> 'balance_correction' AND t.deltaUnits < 0 THEN -t.deltaUnits ELSE 0 END),0) AS spentUnits
      FROM users u
      LEFT JOIN sticker_transactions t ON t.userId=u.id
      WHERE COALESCE(u.isBlocked,0)=0
        AND u.email IS NOT NULL AND TRIM(u.email)<>'' AND LOWER(u.email)<>'guest'
        AND u.id NOT LIKE 'guest-%' AND u.name NOT LIKE '訪客%'
      GROUP BY u.id,u.name,u.avatar,u.center,u.rank,u.approvedRank,u.rankApproved
      ORDER BY spentUnits DESC, earnedUnits DESC, u.name ASC
      LIMIT 20`).all();
    const entries = (result.results || []).map((row: any) => ({
      user: {
        id: row.id,
        name: row.name,
        rank: row.effectiveRank || '無',
        avatar: row.avatar || '',
        center: row.center || ''
      },
      current: unitsToStickers(Number(row.balanceUnits || 0)),
      spent: unitsToStickers(Number(row.spentUnits || 0)),
      earned: unitsToStickers(Number(row.earnedUnits || 0))
    }));
    return new Response(JSON.stringify({ entries, suggestions: [], searchScope: 'public' }), {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    console.warn('Spent sticker leaderboard fallback:', error);
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    const origin = request.headers.get('Origin');
    if (url.pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
        origin && origin !== url.origin &&
        (url.pathname === '/api/users/google-sync' || (request.headers.has('Cookie') && !request.headers.has('Authorization')))) {
      return new Response(JSON.stringify({ error: '不允許跨站修改會員資料' }), {
        status: 403, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      });
    }

    if (request.method === 'GET' && url.pathname === '/robots.txt') {
      return new Response(ROBOTS_TXT, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          'X-Robots-Tag': X_ROBOTS_TAG
        }
      });
    }

    const userAgent = request.headers.get('User-Agent') || '';
    if (isBlockedCrawler(userAgent)) {
      return new Response('Crawler access is disabled for this site.', {
        status: 403,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': X_ROBOTS_TAG
        }
      });
    }

    if (
      request.method === 'GET' &&
      url.pathname === '/api/stickers/leaderboard' &&
      !url.searchParams.get('q')
    ) {
      const ranked = await spentStickerLeaderboard(env);
      if (ranked) return withPrivacyHeaders(ranked);
    }

    const starBeautyResponse = await handleStarbeautySso(request, env);
    if (starBeautyResponse) return withPrivacyHeaders(starBeautyResponse);

    if (url.pathname === '/api/member-hidden-speakers' || url.pathname.startsWith('/api/member-hidden-speakers/')) {
      return withPrivacyHeaders(await hiddenTrackWorker.fetch(request, env));
    }

    if (url.pathname === '/api/users/google-sync' || url.pathname.startsWith('/api/auth/')) {
      return withPrivacyHeaders(await sessionWorker.fetch(request, env));
    }

    if (request.method === 'POST' && url.pathname === '/') {
      return withPrivacyHeaders(await iosGoogleRedirectWorker.fetch(request, env));
    }

    const appRequest = await rewriteNoopTrackEditRequest(request);
    const response = await handleV192TrackVisibility(
      appRequest,
      env,
      (nextRequest, nextEnv) => appWorker.fetch(nextRequest, nextEnv)
    );
    return withPrivacyHeaders(response);
  }
};
