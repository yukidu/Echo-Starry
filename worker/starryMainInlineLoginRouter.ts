import type { Env } from './index';
import appWorker from './starryMainBatteryGameRouter';
import { handleStarryIdRandomMotto } from './starryIdRandomMottoRouter';
import { handleStarryEcosystemAuthEntry } from './starryEcosystemAuthEntryRouter';
import { queueNextTranscriptV293 } from './transcriptSequentialSchedulerV293';
import { handleQaRequest, processQaAfterComment } from './aiSpeakerQaRouter';
import { handleSpeakerProfileRequest } from './aiSpeakerProfileRouter';
import { handleStoryAttributionRequest } from './aiSpeakerStoryRouter';
import { generateNextSpeakerBiography } from './aiSpeakerBiographyScheduler';

// Workflow / Container named handlers 必須由正式安全入口匯出，不改既有網站路由。
export { TranscriptWorkflow } from './transcriptWorkflowV282';
export { AudioSegmenterContainer } from './audioSegmenterContainer';

const ID_HOST = 'id.starry.phd';
const LOGIN_PATH = '/starry-main-login';
const GOOGLE_SYNC_PATH = '/api/google-sync';
const MAIN_ORIGIN = 'https://starry.phd';
const DEFAULT_GOOGLE_CLIENT_ID = '661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com';

const HOME_TRACKS_CACHE_KEY = 'v265:home:tracks';
const HOME_CATEGORIES_CACHE_KEY = 'v265:home:categories';
const HOME_CACHE_REVALIDATE_MS = 30_000;

type HomeApiCache = {
  savedAt: number;
  body: string;
};

function safeClientId(env: Env) {
  const raw = String((env as any).STARRY_ID_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID).trim();
  return /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(raw) ? raw : DEFAULT_GOOGLE_CLIENT_ID;
}

function withMainOriginCredentials(response: Response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', MAIN_ORIGIN);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function homeCacheKey(pathname: string) {
  if (pathname === '/api/tracks') return HOME_TRACKS_CACHE_KEY;
  if (pathname === '/api/categories') return HOME_CATEGORIES_CACHE_KEY;
  return '';
}

function cachedHomeResponse(body: string, cacheState: 'hit' | 'stale') {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'X-Echo-Home-Cache': cacheState
    }
  });
}

async function readHomeApiCache(env: Env, pathname: string): Promise<HomeApiCache | null> {
  const key = homeCacheKey(pathname);
  if (!key || !env.KV) return null;
  try {
    const raw = await env.KV.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.body !== 'string' || !Number(parsed.savedAt)) return null;
    return { savedAt: Number(parsed.savedAt), body: parsed.body };
  } catch (error) {
    console.warn('Home API cache read failed:', pathname, error);
    return null;
  }
}

async function writeHomeApiCache(env: Env, pathname: string, body: string) {
  const key = homeCacheKey(pathname);
  if (!key || !env.KV) return;
  const value: HomeApiCache = { savedAt: Date.now(), body };
  await env.KV.put(key, JSON.stringify(value));
}

function runInBackground(ctx: any, task: Promise<unknown>) {
  const guarded = task.catch(error => console.warn('Home API background refresh failed:', error));
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(guarded);
  else void guarded;
}

async function rebuildHomeApiCache(requestUrl: string, pathname: '/api/tracks' | '/api/categories', env: Env, ctx?: any) {
  if (!env.KV) return;
  const url = new URL(requestUrl);
  url.pathname = pathname;
  url.search = '';
  const response = await appWorker.fetch(new Request(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' }
  }), env, ctx);
  if (!response.ok) return;
  await writeHomeApiCache(env, pathname, await response.text());
}
function cacheLiveHomeResponse(response: Response, pathname: '/api/tracks' | '/api/categories', env: Env, ctx?: any) {
  if (!env.KV || !response.ok) return;
  const clone = response.clone();
  runInBackground(ctx, clone.text().then(body => writeHomeApiCache(env, pathname, body)));
}

function isStructuralTrackMutation(pathname: string, method: string) {
  if (pathname === '/api/tracks' && method === 'POST') return true;
  const parts = pathname.split('/').filter(Boolean);
  return parts.length === 3 && parts[0] === 'api' && parts[1] === 'tracks' && (method === 'PUT' || method === 'DELETE');
}

function isCategoryMutation(pathname: string, method: string) {
  return pathname.startsWith('/api/categories') && (method === 'POST' || method === 'PUT' || method === 'DELETE');
}

async function serveFastHomeApi(request: Request, env: Env, ctx?: any): Promise<Response | null> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const pathname = url.pathname;

  if (method === 'GET' && (pathname === '/api/tracks' || pathname === '/api/categories')) {
    const cached = await readHomeApiCache(env, pathname);
    if (cached) {
      const stale = Date.now() - cached.savedAt >= HOME_CACHE_REVALIDATE_MS;
      if (stale) {
        runInBackground(ctx, rebuildHomeApiCache(request.url, pathname, env, ctx));
      }
      return cachedHomeResponse(cached.body, stale ? 'stale' : 'hit');
    }

    const response = await appWorker.fetch(request, env, ctx);
    cacheLiveHomeResponse(response, pathname, env, ctx);
    return response;
  }

  if (isStructuralTrackMutation(pathname, method) || isCategoryMutation(pathname, method)) {
    const response = await appWorker.fetch(request, env, ctx);
    if (response.ok && env.KV) {
      runInBackground(ctx, rebuildHomeApiCache(request.url, '/api/tracks', env, ctx));
      if (isCategoryMutation(pathname, method)) {
        runInBackground(ctx, rebuildHomeApiCache(request.url, '/api/categories', env, ctx));
      }
    }
    return response;
  }

  return null;
}

function loginPage(env: Env) {
  const clientId = safeClientId(env);
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="dark">
  <title>登入 Starry ID</title>
  <style>
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#050714;color:#f5fbff;font-family:"Noto Sans TC",system-ui,-apple-system,"Segoe UI",sans-serif}
    body{display:grid;place-items:center;padding:18px}.card{width:min(420px,100%);text-align:center;padding:26px 18px 24px;border:1px solid rgba(146,221,255,.22);border-radius:22px;background:rgba(9,15,35,.96);box-shadow:0 20px 70px rgba(0,0,0,.35)}
    h1{margin:0 0 8px;font-size:22px}p{margin:0 0 22px;color:#abc7da;font-size:14px;line-height:1.65}.google{min-height:44px;display:flex;justify-content:center}.status{min-height:22px;margin-top:16px;color:#bfe9ff;font-size:13px}.error{color:#ffb8b8}.spinner{display:inline-block;width:14px;height:14px;margin-right:7px;border:2px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;vertical-align:-2px}@keyframes spin{to{transform:rotate(360deg)}}
  </style>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
</head>
<body>
  <main class="card">
    <h1>登入 Starry ID</h1>
    <p>使用 Google 帳號登入或第一次綁定。完成後會自動回到繁星首頁，不會離開目前畫面。</p>
    <div id="googleButton" class="google"></div>
    <div id="status" class="status">正在準備 Google 登入…</div>
  </main>
  <script nonce="${nonce}">
    const CLIENT_ID = ${JSON.stringify(clientId)};
    const MAIN_ORIGIN = ${JSON.stringify(MAIN_ORIGIN)};
    const statusEl = document.getElementById('status');

    function tellParent(payload) {
      try {
        if (window.parent && window.parent !== window) window.parent.postMessage(payload, MAIN_ORIGIN);
        if (window.opener && !window.opener.closed) window.opener.postMessage(payload, MAIN_ORIGIN);
      } catch (_) {}
    }

    async function onCredential(response) {
      const credential = String(response?.credential || '');
      if (!credential) {
        statusEl.textContent = '沒有取得 Google 登入資料，請再試一次。';
        statusEl.className = 'status error';
        return;
      }
      statusEl.innerHTML = '<span class="spinner"></span>正在登入 Starry ID…';
      statusEl.className = 'status';
      try {
        const result = await fetch('/api/google-sync', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential, appId: 'starryphd' })
        });
        const data = await result.json().catch(() => ({}));
        if (!result.ok || !data?.success) throw new Error(data?.error || '登入失敗');
        statusEl.textContent = '登入成功，正在返回繁星首頁…';
        tellParent({ type: 'starry-id-login-success', user: data.user || null });
      } catch (error) {
        statusEl.textContent = error instanceof Error ? error.message : '登入失敗，請再試一次。';
        statusEl.className = 'status error';
        tellParent({ type: 'starry-id-login-error' });
      }
    }

    function boot() {
      if (!window.google?.accounts?.id) {
        setTimeout(boot, 80);
        return;
      }
      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: onCredential,
        ux_mode: 'popup',
        auto_select: false,
        cancel_on_tap_outside: false,
        itp_support: true
      });
      google.accounts.id.renderButton(document.getElementById('googleButton'), {
        type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width: 300, locale: 'zh_TW'
      });
      statusEl.textContent = '請選擇 Google 帳號';
    }
    addEventListener('load', boot, { once: true });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}' https://accounts.google.com/gsi/client; style-src 'unsafe-inline' https://accounts.google.com/gsi/style; frame-src https://accounts.google.com; connect-src 'self' https://accounts.google.com https://www.googleapis.com; img-src data: https:; font-src data:; frame-ancestors ${MAIN_ORIGIN}; base-uri 'none'; form-action 'none'`
    }
  });
}

function isTranscriptV281Path(pathname: string) {
  return pathname === '/api/v281/transcript-cleanup' || pathname.startsWith('/api/v281/transcript-cleanup/') ||
    pathname === '/api/v281/transcript-settings' ||
    pathname === '/api/v281/transcript-corrections' ||
    pathname === '/api/v281/transcript-user-notifications' ||
    pathname === '/api/v281/transcript-user-notifications/read' ||
    /^\/api\/v281\/transcript-language-hints\/[^/]+$/.test(pathname) ||
    pathname === '/api/v281/transcript-management/status' ||
    /^\/api\/v281\/transcript-management\/relisten\/[^/]+$/.test(pathname) ||
    pathname === '/api/v281/transcripts/bulk-start' ||
    pathname === '/api/v281/transcripts/bulk-status' ||
    /^\/api\/v281\/transcript-corrections\/[^/]+\/(accept|revoke|supplement)$/.test(pathname) ||
    /^\/api\/v281\/transcripts\/[^/]+$/.test(pathname) ||
    /^\/api\/v281\/transcripts\/[^/]+\/unlock$/.test(pathname) ||
    /^\/api\/v281\/transcripts\/[^/]+\/segments\/[^/]+$/.test(pathname);
}

export default {
  async fetch(request: Request, env: Env, ctx?: any): Promise<Response> {
    const url = new URL(request.url);

    const ecosystemAuthResponse = handleStarryEcosystemAuthEntry(request, env);
    if (ecosystemAuthResponse) return ecosystemAuthResponse;

    if (isTranscriptV281Path(url.pathname)) {
      const transcript = await import('./transcriptV281Gateway');
      return transcript.default.fetch(request, env as any, ctx as any);
    }

    if (url.pathname.startsWith('/api/speaker-stories/')) {
      const attribution = await handleStoryAttributionRequest(request, env as any);
      if (attribution) return attribution;
    }

    if (url.pathname.startsWith('/api/speaker-profiles/')) {
      const speakerProfile = await handleSpeakerProfileRequest(request, env as any);
      if (speakerProfile) return speakerProfile;
    }

    // First-party transcript QA management and public quota status.
    if (url.pathname.startsWith('/api/qa/')) {
      const qa = await handleQaRequest(request, env as any);
      if (qa) return qa;
    }

    // Community comments remain the source of truth. Trigger AI only after
    // the real comment POST succeeded; never on edited/replayed comments.
    if (url.hostname === 'echo.starry.phd' &&
        request.method.toUpperCase() === 'POST' &&
        /^\/api\/tracks\/[^/]+\/comments$/.test(url.pathname)) {
      const payload: any = await request.clone().json().catch(() => ({}));
      const response = await appWorker.fetch(request, env, ctx);
      if (response.ok && (payload.qaMode === 'current' || payload.qaMode === 'all')) {
        const saved: any = await response.clone().json().catch(() => null);
        if (saved?.id) await processQaAfterComment(request, env as any, ctx, saved, payload.qaMode);
      }
      return response;
    }

    const randomMottoResponse = await handleStarryIdRandomMotto(request, env);
    if (randomMottoResponse) return randomMottoResponse;

    if (url.hostname === ID_HOST && url.pathname === LOGIN_PATH) {
      if (request.method.toUpperCase() !== 'GET') return new Response('Method not allowed', { status: 405 });
      return loginPage(env);
    }

    if (
      url.hostname === ID_HOST &&
      url.pathname === GOOGLE_SYNC_PATH &&
      (request.headers.get('Origin') || '') === MAIN_ORIGIN
    ) {
      const response = await appWorker.fetch(request, env, ctx);
      return withMainOriginCredentials(response);
    }

    const fastHomeResponse = await serveFastHomeApi(request, env, ctx);
    if (fastHomeResponse) return fastHomeResponse;

    if (url.hostname === ID_HOST && url.pathname === '/battery-ledger') {
      const response = await appWorker.fetch(request, env, ctx);
      const ledger = await import('./transcriptLedgerSettingsInjector');
      return ledger.injectTranscriptLedgerSettings(response);
    }
    return appWorker.fetch(request, env, ctx);
  },
  async scheduled(_controller: any, env: Env, ctx: any) {
    ctx.waitUntil(queueNextTranscriptV293(env as any));
    // Budgeted and scheduled; biography AI never blocks the playback site.
    ctx.waitUntil(generateNextSpeakerBiography(env as any));
  }
};