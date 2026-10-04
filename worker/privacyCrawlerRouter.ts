import appWorker from './adminUserDeleteRouter';
import type { Env } from './index';

const X_ROBOTS_TAG = 'noindex, nofollow, noarchive, nosnippet, noimageindex';

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Always let crawlers read the explicit global exclusion policy.
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

    return withPrivacyHeaders(await appWorker.fetch(request, env));
  }
};