import type { Env } from './index';
import { redeemCentralEchoTicket, CENTRAL_ECHO_V2_BASE } from './echoCentralV2Ticket';

const ECHO_ORIGIN = 'https://echo.starry.phd';
const COOKIE_NAME = '__Host-echo_v2_canary';
const STATE_RE = /^[A-Za-z0-9_-]{43}$/;
const MEMBER_ID_RE = /^[A-Za-z0-9_-]{1,200}$/;
const DEFAULT_GOOGLE_CLIENT_ID = '661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com';
const CANARY_TTL_SECONDS = 180;
type NextHandler = (request: Request) => Promise<Response>;
type CreateSession = (env: Env, userId: string) => Promise<{ token: string; expiresAt: number } | null>;

export function echoCentralV2CanaryEnabled(env: Env): boolean {
  // Explicit feature AND one exact, server-configured test subject required.
  const raw = String((env as any).ECHO_CENTRAL_V2_TEST_USER_ID || '').trim();
  return (env as any).ECHO_CENTRAL_V2_SSO === 'true' && MEMBER_ID_RE.test(raw);
}

function cookieValue(request: Request): string {
  const cookie = request.headers.get('Cookie') || '';
  const part = cookie.split(';').map(value => value.trim()).find(value => value.startsWith(COOKIE_NAME + '='));
  return part ? part.slice(COOKIE_NAME.length + 1) : '';
}

function makeState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function clearCanaryCookie(): string {
  return COOKIE_NAME + '=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0';
}

function canaryCookie(state: string): string {
  return COOKIE_NAME + '=' + state +
    '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + CANARY_TTL_SECONDS;
}

function securityHeaders(): Headers {
  return new Headers({
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
  });
}

function respond(data: unknown, status: number, clearState = true): Response {
  const headers = securityHeaders();
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (clearState) headers.append('Set-Cookie', clearCanaryCookie());
  return new Response(JSON.stringify(data), { status, headers });
}

function safeGoogleClientId(env: Env): string {
  const raw = String((env as any).STARRY_ID_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID).trim();
  return /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(raw)
    ? raw : DEFAULT_GOOGLE_CLIENT_ID;
}

function scriptForLogin(state: string, clientId: string): string {
  return [
    '(()=>{"use strict";',
    'const STATE=' + JSON.stringify(state) + ', CLIENT=' + JSON.stringify(clientId) + ';',
    'const status=document.getElementById("status");',
    'sessionStorage.setItem("echo_central_v2_pending",JSON.stringify({state:STATE,expires:Date.now()+180000}));',
    'function say(message){status.textContent=message;}',
    'async function onCredential(result){',
    'if(typeof result?.credential!=="string"||!result.credential){say("Google 未傳回身分資訊");return;}',
    'say("正在進行新版中央會員驗證…");',
    'try{',
    'const response=await fetch("https://id.hglobal1985.com/api/google-sync",{',
    'method:"POST",credentials:"include",cache:"no-store",redirect:"error",',
    'headers:{"Content-Type":"application/json"},',
    'body:JSON.stringify({appId:"echostars",credential:result.credential})});',
    'const data=await response.json().catch(()=>({}));',
    'if(!response.ok||data.success!==true||typeof data.continueUrl!=="string")throw Error("central_login_unavailable");',
    'const next=new URL(data.continueUrl);',
    'if(next.origin!=="https://id.hglobal1985.com"||next.pathname!=="/auth/echo/continue"||',
    'next.username||next.password||next.hash||!next.searchParams.get("code"))throw Error("central_redirect_invalid");',
    'window.location.assign(next.href);',
    '}catch{sessionStorage.removeItem("echo_central_v2_pending");say("測試登入目前無法完成，請使用原本 Google 登入。");}',
    '}',
    'function render(){if(localStorage.getItem("sq_current_user_v1")){say("請先登出目前 Echo 帳號，再進行新版測試登入");return;}',
    'if(!window.google?.accounts?.id){setTimeout(render,100);return;}',
    'window.google.accounts.id.initialize({client_id:CLIENT,callback:onCredential,auto_select:false,ux_mode:"popup"});',
    'window.google.accounts.id.renderButton(document.getElementById("google"),',
    '{type:"standard",size:"large",theme:"outline",shape:"pill",text:"continue_with",width:300,locale:"zh_TW"});',
    'say("請選擇指定的測試 Google 帳號");',
    '}',
    'render();',
    '})();'
  ].join('\n');
}

function scriptForCallback(): string {
  return [
    '(()=>{"use strict";',
    'const status=document.getElementById("status");',
    'const fallback=document.getElementById("fallback");',
    'const code=new URL(window.location.href).searchParams.get("code");',
    'history.replaceState(null,"","/auth/callback");',
    'function fail(){status.textContent="新版測試登入未完成，原登入仍可使用。";fallback.hidden=false;}',
    'async function run(){',
    'let pending=null;try{pending=JSON.parse(sessionStorage.getItem("echo_central_v2_pending")||"null");}catch{}',
    'sessionStorage.removeItem("echo_central_v2_pending");',
    'if(!code||!/^[A-Za-z0-9_-]{42,48}$/.test(code)||!pending||',
    'typeof pending.state!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(pending.state)||',
    'typeof pending.expires!=="number"||pending.expires<Date.now()){fail();return;}',
    'try{',
    'const response=await fetch("/api/auth/ecosystem-exchange",{',
    'method:"POST",credentials:"same-origin",cache:"no-store",',
    'headers:{"Content-Type":"application/json","X-Echo-V2-State":pending.state},',
    'body:JSON.stringify({source:"central_v2",code})});',
    'const data=await response.json().catch(()=>({}));',
    'if(!response.ok||data.authenticated!==true||!data.user?.id||!data.authToken||!data.starryUserId)',
    'throw Error("echo_exchange_denied");',
    'let cached=null;try{cached=JSON.parse(localStorage.getItem("sq_current_user_v1")||"null");}catch{}',
    'if(cached?._authToken&&String(cached.id)!==String(data.user.id))throw Error("existing_user_mismatch");',
    'localStorage.setItem("sq_current_user_v1",JSON.stringify({...data.user,',
    '_authToken:data.authToken,_sessionExpiresAt:data.sessionExpiresAt,',
    '_starryUserId:String(data.starryUserId),_centralV2Canary:true}));',
    'sessionStorage.setItem("echostars_auth_session_checked_at",String(Date.now()));',
    'window.location.replace("/");',
    '}catch{fail();}',
    '}',
    'run();',
    '})();'
  ].join('\n');
}

function htmlPage(kind: 'login' | 'callback', state: string, clientId: string): Response {
  const nonce = makeState();
  const script = kind === 'login' ? scriptForLogin(state, clientId) : scriptForCallback();
  const title = kind === 'login' ? 'Echo｜新版中央會員測試登入' : 'Echo｜正在完成測試登入';
  const content = '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + title + '</title>' +
    (kind === 'login' ? '<script src="https://accounts.google.com/gsi/client" async defer></script>' : '') +
    '<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#080e24;' +
    'color:#f5fbff;font:16px system-ui;padding:18px;box-sizing:border-box}.card{width:min(410px,100%);' +
    'padding:28px 20px;text-align:center;background:#101b39;border:1px solid #526b93;border-radius:22px;' +
    'box-sizing:border-box}h1{font-size:22px}p{line-height:1.7;color:#d5def3}' +
    '#google{display:flex;justify-content:center}a{color:#aee7ff}</style></head><body>' +
    '<main class="card"><h1>' + title + '</h1><p>僅供指定測試會員使用。其他會員登入保持不變。</p>' +
    '<div id="google"></div><p id="status">正在準備安全登入…</p>' +
    '<a id="fallback" href="/" ' + (kind === 'callback' ? 'hidden' : '') +
    '>返回原本繁星回聲登入</a></main><script nonce="' + nonce + '">' + script +
    '</script></body></html>';
  const headers = securityHeaders();
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Content-Security-Policy', "default-src 'none'; base-uri 'none'; form-action 'none'; " +
    "script-src 'nonce-" + nonce + "' https://accounts.google.com/gsi/client; " +
    "style-src 'unsafe-inline' https://accounts.google.com/gsi/style; " +
    "connect-src 'self' " + CENTRAL_ECHO_V2_BASE + " https://accounts.google.com https://www.googleapis.com; " +
    "frame-src https://accounts.google.com; img-src data: https:; frame-ancestors 'none'");
  if (kind === 'login') headers.append('Set-Cookie', canaryCookie(state));
  return new Response(content, { status: 200, headers });
}

/**
 * Separate, explicit canary entry. Callback is claimed only for a browser with
 * the HttpOnly pending cookie; all normal/legacy callbacks remain untouched.
 */
export function echoCentralV2CanaryPage(request: Request, env: Env): Response | null {
  const url = new URL(request.url);
  if (url.origin !== ECHO_ORIGIN) return null;
  if (url.pathname === '/auth/central-v2') {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    if (!echoCentralV2CanaryEnabled(env)) return new Response('Not found', { status: 404 });
    return htmlPage('login', makeState(), safeGoogleClientId(env));
  }
  if (url.pathname !== '/auth/callback' || !STATE_RE.test(cookieValue(request))) return null;
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  if (!echoCentralV2CanaryEnabled(env)) {
    const headers = securityHeaders();
    headers.append('Set-Cookie', clearCanaryCookie());
    return new Response('新版登入測試已停止，請返回繁星回聲原登入。', { status: 503, headers });
  }
  return htmlPage('callback', '', '');
}

/**
 * No email lookup, no auto-created Echo account, no role/rank transfer.
 * Failed v2 tickets are NEVER submitted to legacy starry_app_auth_codes.
 */
export async function exchangeCentralV2CanaryTicket(
  request: Request,
  env: Env,
  next: NextHandler,
  createEchoSession: CreateSession,
  fetcher: typeof fetch = fetch
): Promise<Response> {
  if (!echoCentralV2CanaryEnabled(env)) {
    return respond({ authenticated: false, error: 'central_v2_disabled' }, 503);
  }
  const state = request.headers.get('X-Echo-V2-State') || '';
  if (request.headers.get('Origin') !== ECHO_ORIGIN ||
    !STATE_RE.test(state) || state !== cookieValue(request) ||
    !String(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) {
    return respond({ authenticated: false, error: 'central_v2_state_invalid' }, 403);
  }
  const input: any = await request.clone().json().catch(() => null);
  if (input?.source !== 'central_v2') {
    return respond({ authenticated: false, error: 'central_v2_source_invalid' }, 400);
  }
  const ticket = await redeemCentralEchoTicket(input?.code, { fetcher });
  if (!ticket.ok) {
    return respond({ authenticated: false, error: ticket.error }, ticket.status);
  }
  // New central authenticates real old user status and echostars app membership
  // on ticket consume; Echo additionally verifies one exact canary subject.
  if (ticket.centralUserId !== String((env as any).ECHO_CENTRAL_V2_TEST_USER_ID).trim()) {
    return respond({ authenticated: false, error: 'central_v2_not_in_test_cohort' }, 403);
  }
  if (!ticket.echoLegacyUserId || !env.DB) {
    return respond({ authenticated: false, error: 'identity_link_missing' }, 409);
  }
  let local: any;
  try {
    local = await env.DB.prepare('SELECT * FROM users WHERE id=? LIMIT 1')
      .bind(ticket.echoLegacyUserId).first();
  } catch {
    return respond({ authenticated: false, error: 'local_identity_unavailable' }, 503);
  }
  if (!local || String(local.id) !== ticket.echoLegacyUserId) {
    return respond({ authenticated: false, error: 'identity_link_missing' }, 409);
  }
  if (Number(local.isBlocked || 0) === 1) {
    return respond({ authenticated: false, error: 'local_member_blocked' }, 403);
  }

  // Prevent a v2 test login from silently replacing a different existing Echo
  // member's first-party session on a shared device.
  const cookie = request.headers.get('Cookie') || '';
  if (/(?:^|;\s*)echostars_session=/.test(cookie)) {
    const currentUrl = new URL(request.url);
    currentUrl.pathname = '/api/auth/session';
    currentUrl.search = '';
    const currentHeaders = new Headers({ Cookie: cookie, Accept: 'application/json' });
    const existingResponse = await next(new Request(currentUrl.toString(), {
      method: 'GET', headers: currentHeaders
    })).catch(() => null);
    const existingData: any = await existingResponse?.clone().json().catch(() => null);
    if (!existingResponse?.ok || existingData?.authenticated !== true ||
      String(existingData?.user?.id || '') !== ticket.echoLegacyUserId) {
      return respond({ authenticated: false, error: 'existing_echo_session_conflict' }, 409);
    }
  }

  const session = await createEchoSession(env, String(local.id)).catch(() => null);
  if (!session) return respond({ authenticated: false, error: 'local_session_unavailable' }, 503);

  const delegatedUrl = new URL(request.url);
  delegatedUrl.pathname = '/api/auth/session';
  delegatedUrl.search = '';
  const headers = new Headers(request.headers);
  headers.set('Authorization', 'Bearer ' + session.token);
  headers.delete('Content-Length');
  headers.delete('Cookie');
  headers.delete('X-Echo-V2-State');
  const delegated = new Request(delegatedUrl.toString(), { method: 'GET', headers });
  let response: Response;
  try {
    response = await next(delegated);
  } catch {
    return respond({ authenticated: false, error: 'local_session_validation_failed' }, 503);
  }
  const data: any = await response.clone().json().catch(() => null);
  if (!response.ok || data?.authenticated !== true ||
    !data?.user?.id || String(data.user.id) !== ticket.echoLegacyUserId) {
    return respond({ authenticated: false, error: 'local_session_validation_failed' }, 503);
  }
  const result = respond({
    ...data,
    authenticated: true,
    authToken: session.token,
    sessionExpiresAt: session.expiresAt,
    starryUserId: ticket.centralUserId
  }, 200);
  // Do not issue a first-party member cookie before the browser has confirmed
  // that its previous local account matches this exact mapped Echo identity.
  // The established /api/auth/session middleware can set its cookie on the
  // next normal authenticated session check after the browser commits login.
  return result;
}
