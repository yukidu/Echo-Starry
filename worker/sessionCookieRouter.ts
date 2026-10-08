import appWorker from './uiPreferencesRouter';
import type { Env } from './index';

const SESSION_COOKIE = 'echostars_session';
// Site policy: keep the verified member session until the user explicitly logs
// out / clears site data, or the account/session is revoked for security.
// 2^31-1 seconds is the broadest interoperable persistent-cookie value. Some
// browsers may impose a shorter storage cap, so /api/auth/session refreshes the
// cookie whenever the member returns to the site.
const PERSISTENT_COOKIE_MAX_AGE_SECONDS = 2147483647;
const PERSISTENT_COOKIE_EXPIRES = 'Fri, 31 Dec 9999 23:59:59 GMT';
const PERSISTENT_SESSION_EXPIRES_AT = 253402300799999;
const PERSISTENCE_MIGRATION = 'persistent-auth-sessions-v1';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,}$/;
const persistentSchemaReady = new WeakMap<object, Promise<void>>();

function bearerToken(request: Request) {
  const match = request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i);
  return match?.[1] || '';
}

function cookieToken(request: Request) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name !== SESSION_COOKIE) continue;
    const value = part.slice(separator + 1).trim();
    return TOKEN_PATTERN.test(value) ? value : '';
  }
  return '';
}

function sessionTokens(request: Request) {
  return [...new Set([bearerToken(request), cookieToken(request)].filter(Boolean))];
}

function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${PERSISTENT_COOKIE_MAX_AGE_SECONDS}; Expires=${PERSISTENT_COOKIE_EXPIRES}; Priority=High`;
}

function clearedSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Priority=High`;
}

function requestWithCookieSession(request: Request) {
  if (bearerToken(request)) return request;
  const token = cookieToken(request);
  if (!token) return request;
  const headers = new Headers(request.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return new Request(request, { headers });
}

function withSetCookie(response: Response, cookie: string) {
  const headers = new Headers(response.headers);
  headers.set('Set-Cookie', cookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function withJsonAndCookie(response: Response, data: unknown, cookie: string) {
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  headers.set('Set-Cookie', cookie);
  return new Response(JSON.stringify(data), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function ensurePersistentSessions(db: any) {
  if (!db) return;
  const key = db as object;
  if (!persistentSchemaReady.has(key)) {
    const task = (async () => {
      const authTable = await db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'auth_sessions'"
      ).first();
      if (!authTable) return;

      await db.prepare('CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY)').run();
      const done = await db.prepare('SELECT name FROM app_migrations WHERE name = ?')
        .bind(PERSISTENCE_MIGRATION).first();
      if (done) return;

      const now = Date.now();
      await db.batch([
        // Do not resurrect sessions that had already expired before this policy
        // change. Every still-valid session is upgraded in place.
        db.prepare('DELETE FROM auth_sessions WHERE expiresAt <= ?').bind(now),
        db.prepare('UPDATE auth_sessions SET expiresAt = ? WHERE expiresAt > ?')
          .bind(PERSISTENT_SESSION_EXPIRES_AT, now),
        db.prepare('INSERT OR IGNORE INTO app_migrations(name) VALUES (?)')
          .bind(PERSISTENCE_MIGRATION)
      ]);
    })();
    persistentSchemaReady.set(key, task);
    task.catch(() => persistentSchemaReady.delete(key));
  }
  await persistentSchemaReady.get(key);
}

async function persistSessionToken(db: any, token: string) {
  if (!db || !TOKEN_PATTERN.test(token)) return false;
  await ensurePersistentSessions(db);
  const tokenHash = await hashToken(token);
  const row: any = await db.prepare('SELECT expiresAt FROM auth_sessions WHERE tokenHash = ? LIMIT 1')
    .bind(tokenHash).first();
  if (!row) return false;
  const currentExpiry = Number(row.expiresAt || 0);
  if (currentExpiry <= Date.now()) return false;
  if (currentExpiry !== PERSISTENT_SESSION_EXPIRES_AT) {
    await db.prepare('UPDATE auth_sessions SET expiresAt = ? WHERE tokenHash = ?')
      .bind(PERSISTENT_SESSION_EXPIRES_AT, tokenHash).run();
  }
  return true;
}

async function logout(request: Request, env: Env) {
  const tokens = sessionTokens(request);
  if (env.DB && tokens.length) {
    try {
      const hashes = await Promise.all(tokens.map(hashToken));
      await env.DB.batch(
        hashes.map(hash => env.DB.prepare('DELETE FROM auth_sessions WHERE tokenHash = ?').bind(hash))
      );
    } catch (error) {
      console.warn('Session logout cleanup failed:', error);
    }
  }
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': clearedSessionCookie()
    }
  });
}

async function sessionResponse(request: Request, env: Env) {
  try {
    await ensurePersistentSessions(env.DB);
  } catch (error) {
    console.warn('Persistent session migration failed:', error);
  }

  const token = bearerToken(request) || cookieToken(request);
  const delegated = requestWithCookieSession(request);
  const response = await appWorker.fetch(delegated, env);

  if (!response.ok || !token) {
    return response.ok ? response : withSetCookie(response, clearedSessionCookie());
  }

  const data: any = await response.clone().json().catch(() => null);
  if (!data || data.authenticated !== true || !data.user) {
    return withSetCookie(response, sessionCookie(token));
  }

  // The existing frontend already understands a bearer token stored with the
  // cached member. Returning the same verified first-party session token here
  // lets a browser context recovered from the HttpOnly cookie immediately join
  // the existing authenticated fetch path without introducing a second auth model.
  return withJsonAndCookie(response, {
    ...data,
    authToken: token,
    sessionExpiresAt: PERSISTENT_SESSION_EXPIRES_AT
  }, sessionCookie(token));
}

async function googleLoginResponse(request: Request, env: Env) {
  try {
    await ensurePersistentSessions(env.DB);
  } catch (error) {
    console.warn('Persistent session migration failed before login:', error);
  }

  const response = await appWorker.fetch(request, env);
  if (!response.ok) return response;
  const data: any = await response.clone().json().catch(() => null);
  const token = String(data?.authToken || '');
  if (!TOKEN_PATTERN.test(token)) return response;

  try {
    const persisted = await persistSessionToken(env.DB, token);
    if (!persisted) console.warn('Verified login session could not be upgraded to persistent storage.');
  } catch (error) {
    console.warn('Persisting verified login session failed:', error);
  }

  return withJsonAndCookie(response, {
    ...data,
    sessionExpiresAt: PERSISTENT_SESSION_EXPIRES_AT
  }, sessionCookie(token));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (path === '/api/auth/logout' && method === 'POST') {
      return logout(request, env);
    }

    if (path === '/api/users/google-sync' && method === 'POST') {
      return googleLoginResponse(request, env);
    }

    if (path === '/api/auth/session' && method === 'GET') {
      return sessionResponse(request, env);
    }

    // Same-origin cookies are automatically attached by browsers. Convert the
    // cookie to the already-established Authorization contract before the
    // existing routers see the request. This keeps all current permission
    // checks unchanged while allowing session continuity beyond localStorage.
    return appWorker.fetch(requestWithCookieSession(request), env);
  }
};