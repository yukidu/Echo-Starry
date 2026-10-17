import type { Env } from './index';
import transcriptWorker from './transcriptMemberNotificationsRouter';
import { queueAllPendingTranscripts, transcriptBulkStatus } from './transcriptBulkScheduler';

const SESSION_COOKIE = 'echostars_session';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,}$/;

function text(value: unknown) { return value == null ? '' : String(value).trim(); }
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options':'nosniff' }
  });
}
function bearerToken(request: Request) {
  return request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i)?.[1] || '';
}
function cookieToken(request: Request) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== SESSION_COOKIE) continue;
    const token = part.slice(index + 1).trim();
    if (TOKEN_PATTERN.test(token)) return token;
  }
  return '';
}
async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}
async function superAdmin(request: Request, env: Env) {
  const token = bearerToken(request) || cookieToken(request);
  if (!(env as any).DB || !TOKEN_PATTERN.test(token)) return null;
  const actor: any = await (env as any).DB.prepare(`SELECT u.id,u.email,u.name,u.role,u.isBlocked,s.expiresAt
    FROM auth_sessions s JOIN users u ON u.id=s.userId WHERE s.tokenHash=? LIMIT 1`)
    .bind(await hashToken(token)).first();
  if (!actor || actor.isBlocked || Number(actor.expiresAt || 0) <= Date.now()) return null;
  const allowed = text(actor.email).toLowerCase() === 'yukidu@gmail.com' || text(actor.role) === '超級管理員';
  return allowed ? actor : null;
}

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/v281/transcripts/bulk-start') {
      if (request.method.toUpperCase() !== 'POST') return json({ error: 'Method not allowed' }, 405);
      const actor = await superAdmin(request, env);
      if (!actor) return json({ error: '只有超級管理員可以啟動整批逐字稿' }, 403);
      const result = await queueAllPendingTranscripts(env as any);
      return json({ success: true, ...result });
    }
    if (url.pathname === '/api/v281/transcripts/bulk-status') {
      if (request.method.toUpperCase() !== 'GET') return json({ error: 'Method not allowed' }, 405);
      const actor = await superAdmin(request, env);
      if (!actor) return json({ error: '只有超級管理員可以查看整批逐字稿狀態' }, 403);
      return json({ success: true, ...(await transcriptBulkStatus(env as any)) });
    }
    const item = url.pathname.match(/^\/api\/v281\/transcripts\/([^/]+)$/);
    const translate = text(url.searchParams.get('translate'));
    if (item && translate && request.method.toUpperCase() === 'POST') {
      return json({
        error: '外語 AI 翻譯目前已停用，請使用瀏覽器的整頁翻譯功能',
        aiTranslationDisabled: true,
        futureReenableReady: true
      }, 410);
    }
    return transcriptWorker.fetch(request, env, ctx);
  }
};
