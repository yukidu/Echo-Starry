import type { Env } from './index';
import { resolveEchoSessionUser } from './authRouter';
import {
  readProfileSchemaBundle,
  readExtensionProfileValues,
  writeExtensionProfileValues
} from './starryProfileSchemaService';

const CENTRAL_HOST = 'id.starry.phd';
const SCHEMA_TTL_SECONDS = 300;
const ECHO_SESSION_COOKIE = 'echostars_session';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,}$/;

function json(data: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
      ...headers
    }
  });
}

function isSchemaPath(url: URL) {
  return (url.hostname === CENTRAL_HOST && url.pathname === '/api/profile-schema') ||
    url.pathname === '/api/starry/profile-schema';
}

function isEchoValuePath(url: URL) {
  return url.pathname === '/api/starry/profile-values';
}

function withEchoCookieAuthorization(request: Request) {
  if (request.headers.has('Authorization')) return request;
  const cookie = request.headers.get('Cookie') || '';
  let token = '';
  for (const part of cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0,separator).trim() !== ECHO_SESSION_COOKIE) continue;
    const candidate = part.slice(separator+1).trim();
    if (TOKEN_PATTERN.test(candidate)) token = candidate;
    break;
  }
  if (!token) return request;
  const headers = new Headers(request.headers);
  headers.set('Authorization',`Bearer ${token}`);
  return new Request(request,{headers});
}

async function schemaResponse(request: Request, env: Env) {
  const cache = (globalThis.caches as any)?.default;
  const cacheKeyUrl = new URL(request.url);
  cacheKeyUrl.hostname = CENTRAL_HOST;
  cacheKeyUrl.pathname = '/api/profile-schema';
  cacheKeyUrl.search = '';
  const cacheKey = new Request(cacheKeyUrl.toString(), { method: 'GET' });
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
  }

  const bundle = await readProfileSchemaBundle(env as any);
  const body = JSON.stringify(bundle);
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': `public, max-age=${SCHEMA_TTL_SECONDS}, s-maxage=${SCHEMA_TTL_SECONDS}, stale-while-revalidate=86400`,
    'ETag': `"starry-profile-schema-${bundle.version}"`,
    'X-Starry-Schema-Version': String(bundle.version),
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
    'Access-Control-Allow-Origin': '*'
  });
  const response = new Response(body, { status: 200, headers });
  if (cache) await cache.put(cacheKey, response.clone()).catch(() => undefined);
  return response;
}

async function extensionValues(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: '不允許跨站修改中央會員資料' }, 403, { 'Cache-Control': 'no-store' });
  }
  const user = await resolveEchoSessionUser(withEchoCookieAuthorization(request), env);
  if (!user?.id) return json({ error: '請先登入繁星回聲會員' }, 401, { 'Cache-Control': 'no-store' });
  const method = request.method.toUpperCase();
  if (method === 'GET') {
    const values = await readExtensionProfileValues(env as any, String(user.id));
    return json({ values }, 200, { 'Cache-Control': 'no-store' });
  }
  if (method === 'PUT') {
    const input: any = await request.clone().json().catch(() => ({}));
    if (!input?.values || typeof input.values !== 'object' || Array.isArray(input.values)) {
      return json({ error: '中央會員欄位資料格式錯誤' }, 400, { 'Cache-Control': 'no-store' });
    }
    try {
      const values = await writeExtensionProfileValues(env as any, String(user.id), input.values);
      return json({ success: true, values }, 200, { 'Cache-Control': 'no-store' });
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : '中央會員欄位儲存失敗' }, 400, { 'Cache-Control': 'no-store' });
    }
  }
  return json({ error: 'Method not allowed' }, 405, { 'Cache-Control': 'no-store' });
}

export async function handleStarryProfileSchema(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  if (isSchemaPath(url)) {
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' } });
    if (method !== 'GET' && method !== 'HEAD') return json({ error: 'Method not allowed' }, 405, { 'Cache-Control': 'no-store' });
    const response = await schemaResponse(request, env);
    return method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response;
  }
  if (isEchoValuePath(url)) return extensionValues(request, env);
  return null;
}
