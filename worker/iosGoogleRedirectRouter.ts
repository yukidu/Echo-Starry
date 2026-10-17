import appWorker from './adminUserDeleteRouter';
import sessionWorker from './sessionCookieRouter';
import { issueEchoIosLoginHandoff } from './starryIdCentralRouter';
import type { Env } from './index';

const LOGIN_PATH = '/';
const USER_KEY = 'sq_current_user_v1';
const AUTH_RETURN_KEY = 'echostars_auth_return_v1';
const AUTH_RESTORE_KEY = 'echostars_auth_restore_v1';
const SKIP_FORCED_PROFILE_KEY = 'echostars_skip_forced_profile_once';
const SESSION_CHECK_KEY = 'echostars_auth_session_checked_at';

function cookieValue(request: Request, name: string) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return '';
}

function safeJson(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function escapeHtml(value: unknown) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Pragma': 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' https://id.starry.phd; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
    }
  });
}

function failurePage(message: string, status = 400) {
  return html(`<!doctype html>
<html lang="zh-Hant-TW">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Google 登入</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#0f172a;display:grid;min-height:100vh;place-items:center;padding:24px;box-sizing:border-box">
  <main style="width:min(92vw,420px);background:#fff;border:1px solid #e2e8f0;border-radius:24px;padding:24px;text-align:center;box-shadow:0 16px 50px rgba(15,23,42,.12)">
    <div style="font-size:42px">⚠️</div>
    <h1 style="font-size:20px;margin:12px 0 8px">Google 登入未完成</h1>
    <p style="font-size:14px;line-height:1.7;color:#64748b;margin:0 0 18px">${escapeHtml(message)}</p>
    <a href="/" style="display:inline-block;text-decoration:none;background:#0f8b83;color:white;padding:11px 18px;border-radius:14px;font-weight:800">返回繁星回聲</a>
  </main>
</body>
</html>`, status);
}

export function successPage(user: any, ticket: string) {
  const serializedUser = safeJson(user);
  const serializedTicket = safeJson(ticket);
  return html(`<!doctype html>
<html lang="zh-Hant-TW">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登入完成</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#0f172a;display:grid;min-height:100vh;place-items:center;padding:24px;box-sizing:border-box">
  <main style="width:min(92vw,420px);background:#fff;border:1px solid #e2e8f0;border-radius:24px;padding:24px;text-align:center;box-shadow:0 16px 50px rgba(15,23,42,.12)">
    <div style="font-size:42px">✓</div>
    <h1 style="font-size:20px;margin:12px 0 8px">Google 登入完成</h1>
    <p id="login-progress" style="font-size:14px;line-height:1.7;color:#64748b;margin:0">正在同步繁星通行證…</p>
    <p id="login-error" role="alert" style="color:#b91c1c;font-size:14px;line-height:1.7;margin-top:12px"></p>
    <a id="login-retry" href="https://id.starry.phd/" style="display:none;margin-top:12px;color:#0f8b83;font-weight:bold">前往繁星通行證登入，完成後返回繁星回聲</a>
  </main>
  <script>
    (async function () {
      try {
        var user = ${serializedUser};
        // A short-lived server-issued one-time ticket creates the ID cookie.
        // Google credentials remain on the server and never enter this page.
        var centralResponse = await fetch('https://id.starry.phd/api/mobile-login/complete', {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket: ${serializedTicket} })
        });
        var centralData = await centralResponse.json().catch(function () { return {}; });
        if (!centralResponse.ok || !centralData.success || !centralData.user || !centralData.user.id) {
          throw new Error('中央會員登入尚未完成，請重新登入。');
        }
        if (String(centralData.user.email || '').toLowerCase() !== String(user.email || '').toLowerCase()) {
          throw new Error('兩個網站的 Google 會員身分不一致，請重新登入。');
        }
        // Refresh Echo's first-party HttpOnly cookie only after ID succeeds.
        var echoResponse = await fetch('/api/auth/session', {
          credentials: 'include',
          cache: 'no-store',
          headers: { Authorization: 'Bearer ' + user._authToken }
        });
        var echoData = await echoResponse.json().catch(function () { return {}; });
        if (!echoResponse.ok || !echoData.authenticated || !echoData.user || String(echoData.user.id) !== String(user.id)) {
          throw new Error('繁星回聲登入確認尚未完成，請重新登入。');
        }
        user._starryUserId = String(centralData.user.id);
        localStorage.setItem(${safeJson(USER_KEY)}, JSON.stringify(user));
        sessionStorage.setItem(${safeJson(SESSION_CHECK_KEY)}, String(Date.now()));
        var returnRaw = sessionStorage.getItem(${safeJson(AUTH_RETURN_KEY)}) || '';
        if (returnRaw) sessionStorage.setItem(${safeJson(AUTH_RESTORE_KEY)}, returnRaw);
        sessionStorage.setItem(${safeJson(SKIP_FORCED_PROFILE_KEY)}, '1');
        sessionStorage.removeItem(${safeJson(AUTH_RETURN_KEY)});
        var target = '/';
        if (returnRaw) {
          try {
            var context = JSON.parse(returnRaw);
            if (context && typeof context.url === 'string' && context.url.charAt(0) === '/' && context.url.charAt(1) !== '/') {
              target = context.url;
            }
          } catch (_) {}
        }
        window.location.replace(target);
      } catch (error) {
        document.getElementById('login-progress').textContent = '登入尚未完成';
        document.getElementById('login-error').textContent = error && error.message
          ? String(error.message) : '登入暫時無法完成，請重新登入。';
        document.getElementById('login-retry').style.display = 'inline-block';
      }
    })();
  </script>
</body>
</html>`);
}

async function handleGoogleRedirect(request: Request, env: Env) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return failurePage('Google 回傳的登入資料格式不正確，請重新登入。', 400);
  }

  const csrfBody = String(form.get('g_csrf_token') || '');
  const csrfCookie = cookieValue(request, 'g_csrf_token');
  if (!csrfBody || !csrfCookie || csrfBody !== csrfCookie) {
    return failurePage('登入安全驗證失敗，請回到網站後重新點選 Google 登入。', 403);
  }

  const credential = String(form.get('credential') || '');
  if (!credential) return failurePage('Google 沒有回傳登入憑證，請重新登入。', 400);

  const verifiedRequest = new Request(new URL('/api/users/google-sync', request.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential })
  });

  const response = await sessionWorker.fetch(verifiedRequest, env);
  const data: any = await response.clone().json().catch(() => ({}));
  if (!response.ok || !data?.user || !data?.authToken) {
    return failurePage(data?.error || 'Google 登入驗證失敗，請重新選擇 Google 帳號。', response.status || 401);
  }

  // No Echo-only cookie should be published on a half-completed login.
  // Only a one-time, 90-second handoff code reaches the browser, never
  // the submitted Google ID token.
  let handoff: { code: string; email: string };
  try {
    handoff = await issueEchoIosLoginHandoff(env, credential);
  } catch (error) {
    console.warn('iOS central login handoff failed', {
      code: error instanceof Error ? error.message : 'unknown'
    });
    return failurePage('繁星通行證暫時無法完成登入，請稍後重試。', 503);
  }
  if (handoff.email !== String(data.user.email || '').trim().toLowerCase()) {
    return failurePage('會員身分不一致，請重新登入。', 409);
  }
  return successPage({
    ...data.user,
    _authToken: data.authToken,
    _sessionExpiresAt: data.sessionExpiresAt
  }, handoff.code);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method.toUpperCase() === 'POST' && url.pathname === LOGIN_PATH) {
      try {
        return await handleGoogleRedirect(request, env);
      } catch (error) {
        console.error('iOS Google redirect login failed:', error);
        return failurePage('登入時發生暫時性錯誤，請稍後再試。', 500);
      }
    }
    return appWorker.fetch(request, env);
  }
};
