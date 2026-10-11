import privacyWorker from './privacyCrawlerRouter';
import type { Env } from './index';

const X_ROBOTS_TAG = 'noindex, nofollow, noarchive, nosnippet, noimageindex';

function withPrivacyHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', X_ROBOTS_TAG);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function canServePreviewAssetDirectly(request: Request, env: Env, url: URL) {
  if (env.ENVIRONMENT !== 'preview' || !env.ASSETS) return false;
  if (!['GET', 'HEAD'].includes(request.method)) return false;

  // Keep every data/auth/share endpoint on the normal Worker router chain.
  if (url.pathname.startsWith('/api/')) return false;
  if (url.pathname.startsWith('/share/')) return false;
  if (url.pathname === '/robots.txt') return false;

  // Everything else is the Vite/PWA application shell or a static resource.
  // Cloudflare Assets already provides SPA fallback, so preview navigation stays
  // functional without waiting for D1/auth/router cold-start work.
  return true;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (canServePreviewAssetDirectly(request, env, url) && env.ASSETS) {
      return withPrivacyHeaders(await env.ASSETS.fetch(request));
    }

    return privacyWorker.fetch(request, env);
  }
};
