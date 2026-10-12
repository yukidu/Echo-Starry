import { createRemoteJWKSet, jwtVerify } from 'jose';
import appWorker from './privacyCrawlerRouter';
import type { Env } from './index';
import {
  createStarrySession,
  logoutStarrySession,
  starrySessionUser,
  syncEchoMemberToStarry,
  syncVerifiedStarryIdentity,
  updateStarryProfile
} from './starryIdRepository';

const GOOGLE_CLIENT_ID = '400699489182-lb412nhvj4s6t1qr5ovkg40hc646dq79.apps.googleusercontent.com';
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const NOINDEX = 'noindex, nofollow, noarchive, nosnippet, noimageindex';

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

async function verifyGoogleCredential(credential: string) {
  if (!credential || credential.split('.').length !== 3) throw new Error('Missing Google credential');
  const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
    audience: GOOGLE_CLIENT_ID,
    issuer: ['https://accounts.google.com', 'accounts.google.com']
  });
  const email = normalizeEmail(payload.email);
  const subject = String(payload.sub || '').trim();
  if (!email || !subject || payload.email_verified !== true) throw new Error('Google email is not verified');
  return {
    email,
    subject,
    name: String(payload.name || email.split('@')[0]),
    avatar: String(payload.picture || '')
  };
}

function trustedOrigin(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (!origin) return '';
  if (origin === url.origin) return origin;
  try {
    const candidate = new URL(origin);
    if (candidate.protocol !== 'https:' && candidate.hostname !== 'localhost' && candidate.hostname !== '127.0.0.1') return '';
    if (candidate.hostname === 'starry.phd' || candidate.hostname.endsWith('.starry.phd')) return origin;
    if (candidate.hostname === 'echostars.yukidu.workers.dev') return origin;
    if (candidate.hostname === 'localhost' || candidate.hostname === '127.0.0.1') return origin;
  } catch {
    return '';
  }
  return '';
}

function starryHeaders(request: Request) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': NOINDEX,
    'Vary': 'Origin'
  });
  const origin = trustedOrigin(request);
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  return headers;
}

function json(request: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: starryHeaders(request) });
}

async function body(request: Request) {
  return request.clone().json().catch(() => ({} as any)) as Promise<any>;
}

async function handleStarryApi(request: Request, env: Env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  const origin = request.headers.get('Origin');

  if (origin && !trustedOrigin(request)) return json(request, { error: 'Origin not allowed' }, 403);
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: starryHeaders(request) });
  if (!env.STARRY_ID_DB) return json(request, { error: 'Starry ID service unavailable' }, 503);

  if (path === '/api/starry-id/health' && method === 'GET') {
    return json(request, { ok: true, service: 'starry-id' });
  }

  if (path === '/api/starry-id/google-sync' && method === 'POST') {
    const requestId = crypto.randomUUID();
    try {
      const input = await body(request);
      const identity = await verifyGoogleCredential(String(input.credential || ''));
      const appId = String(input.appId || 'starry').trim().toLowerCase();
      const member: any = await syncVerifiedStarryIdentity(env, identity, appId);
      const session = await createStarrySession(env, member.id, appId);
      return json(request, {
        success: true,
        user: member,
        authToken: session.token,
        sessionExpiresAt: session.expiresAt
      });
    } catch (error) {
      console.warn('Starry ID Google login rejected', { requestId, code: String((error as any)?.code || '') });
      return json(request, { requestId, error: 'Google 登入驗證失敗，請重新選擇 Google 帳號。' }, 401);
    }
  }

  if (path === '/api/starry-id/session' && method === 'GET') {
    const session = await starrySessionUser(request, env);
    if (!session?.member) return json(request, { authenticated: false }, 401);
    return json(request, {
      authenticated: true,
      user: session.member,
      appId: session.appId,
      sessionExpiresAt: session.expiresAt
    });
  }

  if (path === '/api/starry-id/profile' && method === 'GET') {
    const session = await starrySessionUser(request, env);
    if (!session?.member) return json(request, { error: '請先登入 Starry ID' }, 401);
    return json(request, { user: session.member });
  }

  if (path === '/api/starry-id/profile' && method === 'PUT') {
    const session = await starrySessionUser(request, env);
    if (!session?.member) return json(request, { error: '請先登入 Starry ID' }, 401);
    try {
      const changes = await body(request);
      const updated = await updateStarryProfile(env, session.member.id, session.member.id, session.appId, changes);
      return json(request, { success: true, user: updated });
    } catch {
      return json(request, { error: '會員資料更新失敗，請稍後再試。' }, 503);
    }
  }

  if (path === '/api/starry-id/logout' && method === 'POST') {
    await logoutStarrySession(request, env).catch(() => undefined);
    return json(request, { success: true });
  }

  return json(request, { error: 'Not found' }, 404);
}

async function syncLegacyMutation(request: Request, response: Response, env: Env) {
  if (!response.ok || !env.DB || !env.STARRY_ID_DB) return;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  try {
    if (url.pathname === '/api/users/google-sync' && method === 'POST') {
      const data: any = await response.clone().json().catch(() => null);
      const userId = String(data?.user?.id || '').trim();
      if (userId) await syncEchoMemberToStarry(env, userId, userId);
      return;
    }

    const match = url.pathname.match(/^\/api\/users\/([^/]+)(?:\/(?:contributor|admin-role|block|audit-rank))?$/);
    if (match && method === 'PUT') {
      await syncEchoMemberToStarry(env, decodeURIComponent(match[1]), 'echostars');
    }
  } catch (error) {
    // Transition mode: central sync issues never break the already-successful EchoStars request.
    console.warn('Starry ID background sync failed', { path: url.pathname, code: String((error as any)?.code || '') });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/starry-id/')) return handleStarryApi(request, env);

    const response = await appWorker.fetch(request, env);
    await syncLegacyMutation(request, response, env);
    return response;
  }
};
