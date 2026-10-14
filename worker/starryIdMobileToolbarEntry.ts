import privacyCrawlerRouter from './privacyCrawlerRouter';
import type { Env } from './index';

const STAR_DOMAIN = 'id.starry.phd';
const MEMBER_CENTER_PATHS = new Set(['/', '/my-card']);

const MOBILE_TOOLBAR_FIX = String.raw`<style id="v227-mobile-toolbar-fix">
  .topbar{box-sizing:border-box!important;width:100%!important;max-width:none!important;left:auto!important;transform:none!important}
  .topbar .brand{flex:1 1 auto!important;min-width:0!important;display:flex!important;align-items:center!important;overflow:hidden!important}
  .topbar .brand h1{white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
  .topbar .top-actions{flex:0 0 auto!important;display:flex!important;align-items:center!important;gap:8px!important;margin-left:auto!important}
  @media(max-width:760px){
    .topbar{gap:8px!important}
    .topbar .brand{flex:1 1 0!important;min-width:0!important}
    .topbar .top-actions{flex:0 0 auto!important}
    .topbar .brand h1{font-size:15px!important;max-width:100%!important}
  }
</style>`;

function copyHeaders(response: Response) {
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  return headers;
}

export default {
  async fetch(request: Request, env: Env, ctx?: any): Promise<Response> {
    const response = await privacyCrawlerRouter.fetch(request, env, ctx);
    const url = new URL(request.url);

    if (
      url.hostname !== STAR_DOMAIN ||
      request.method.toUpperCase() !== 'GET' ||
      !MEMBER_CENTER_PATHS.has(url.pathname) ||
      !(response.headers.get('Content-Type') || '').includes('text/html')
    ) {
      return response;
    }

    const html = await response.text();
    if (html.includes('id="v227-mobile-toolbar-fix"')) {
      return new Response(html, {
        status: response.status,
        statusText: response.statusText,
        headers: copyHeaders(response)
      });
    }

    return new Response(html.replace('</head>', `${MOBILE_TOOLBAR_FIX}</head>`), {
      status: response.status,
      statusText: response.statusText,
      headers: copyHeaders(response)
    });
  }
};
