import sessionWorker from './sessionCookieRouter';
import { syncEchoMemberToStarryBestEffort } from './starryIdSync';
import type { Env } from './index';

const DOWNLOAD_STARRY_URL = 'https://download.starry.phd';
const GOOGLE_CLIENT_ID = '400699489182-lb412nhvj4s6t1qr5ovkg40hc646dq79.apps.googleusercontent.com';
const TICKET_TTL_MS = 5 * 60 * 1000;
const ticketSchemaReady = new WeakMap<object, Promise<void>>();

type DownloadStarryEnv = Env & { STARRY_ID_DB?: any };

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomCode() {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  return bytesToBase64Url(raw);
}

async function ensureTicketSchema(env: DownloadStarryEnv) {
  if (!env.DB) throw new Error('會員資料庫尚未連線');
  const key = env.DB as object;
  if (!ticketSchemaReady.has(key)) {
    const task = (async () => {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS external_app_auth_codes (
          codeHash TEXT PRIMARY KEY,
          app TEXT NOT NULL,
          userId TEXT NOT NULL,
          expiresAt INTEGER NOT NULL,
          createdAt INTEGER NOT NULL
        )
      `).run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS external_app_auth_codes_expiry ON external_app_auth_codes(expiresAt)').run();
    })();
    ticketSchemaReady.set(key, task);
    task.catch(() => ticketSchemaReady.delete(key));
  }
  await ticketSchemaReady.get(key);
}

async function verifiedSession(request: Request, env: DownloadStarryEnv) {
  const url = new URL(request.url);
  url.pathname = '/api/auth/session';
  url.search = '';
  const response = await sessionWorker.fetch(new Request(url.toString(), {
    method: 'GET',
    headers: request.headers,
    redirect: 'manual'
  }), env);
  if (!response.ok) return null;
  const data: any = await response.json().catch(() => null);
  return data?.authenticated && data?.user?.id ? data.user : null;
}

async function centralMember(env: DownloadStarryEnv, userId: string) {
  if (!env.STARRY_ID_DB) return null;
  const row: any = await env.STARRY_ID_DB.prepare(`
    SELECT u.id, u.primaryEmail, u.status,
      p.name, p.avatar, p.googleAvatar, p.center, p.rank, p.approvedRank,
      p.rankApproved, p.residence, p.birthday, p.motto
    FROM users u
    LEFT JOIN profiles p ON p.userId = u.id
    WHERE u.id = ?
    LIMIT 1
  `).bind(userId).first();
  if (!row || String(row.status || 'active') !== 'active') return null;
  return row;
}

async function issueTicket(request: Request, env: DownloadStarryEnv) {
  if (!env.STARRY_ID_DB) return json({ error: 'Starry ID 中央會員服務尚未連線' }, 503);
  await ensureTicketSchema(env);
  const user = await verifiedSession(request, env);
  if (!user) return json({ error: '請先使用 Google 登入 Starry ID' }, 401);

  await syncEchoMemberToStarryBestEffort(env as any, String(user.id), String(user.id), 'downloadstarry-sso');
  if (!await centralMember(env, String(user.id))) {
    return json({ error: 'Starry ID 會員資料暫時無法讀取，請稍後再試' }, 503);
  }

  const code = randomCode();
  const codeHash = await hash(code);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM external_app_auth_codes WHERE expiresAt <= ?').bind(now),
    env.DB.prepare('INSERT INTO external_app_auth_codes (codeHash, app, userId, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?)')
      .bind(codeHash, 'downloadstarry', String(user.id), now + TICKET_TTL_MS, now)
  ]);
  return json({
    code,
    redirect: `${DOWNLOAD_STARRY_URL}/auth/callback?code=${encodeURIComponent(code)}`
  });
}

async function consumeTicket(env: DownloadStarryEnv, codeHash: string) {
  if (!env.DB) return null;
  return env.DB.prepare(`
    DELETE FROM external_app_auth_codes
    WHERE codeHash = ? AND app = 'downloadstarry' AND expiresAt > ?
    RETURNING userId
  `).bind(codeHash, Date.now()).first();
}

async function exchangeTicket(request: Request, env: DownloadStarryEnv) {
  if (!env.STARRY_ID_DB) return json({ error: 'Starry ID 中央會員服務尚未連線' }, 503);
  await ensureTicketSchema(env);
  const body: any = await request.clone().json().catch(() => ({}));
  const code = String(body.code || '').trim();
  if (!code) return json({ error: '缺少授權碼' }, 400);

  const ticket: any = await consumeTicket(env, await hash(code));
  if (!ticket?.userId) return json({ error: '授權碼無效或已過期' }, 401);
  const member: any = await centralMember(env, String(ticket.userId));
  if (!member) return json({ error: 'Starry ID 會員不存在或已停用' }, 401);

  return json({
    user: {
      id: String(member.id),
      email: String(member.primaryEmail || ''),
      name: String(member.name || member.primaryEmail || '會員'),
      avatar: String(member.avatar || member.googleAvatar || '')
    },
    profile: {
      center: String(member.center || ''),
      rank: String(member.approvedRank || member.rank || ''),
      rankApproved: Boolean(member.rankApproved),
      residence: String(member.residence || ''),
      birthday: String(member.birthday || ''),
      motto: String(member.motto || '')
    }
  });
}

async function health(env: DownloadStarryEnv) {
  if (!env.DB || !env.STARRY_ID_DB) return json({ ok: false, service: 'downloadstarry-sso' }, 503);
  try {
    await ensureTicketSchema(env);
    const central = await env.STARRY_ID_DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users' LIMIT 1").first();
    return json({ ok: Boolean(central), service: 'downloadstarry-sso', identity: 'starry-id' }, central ? 200 : 503);
  } catch {
    return json({ ok: false, service: 'downloadstarry-sso' }, 503);
  }
}

function loginPage() {
  const html = `<!doctype html>
<html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Starry ID｜繁星下載登入</title><script src="https://accounts.google.com/gsi/client" async defer></script><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1026;font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif;color:#eef2ff}.card{width:min(90vw,440px);background:#111938;border:1px solid #27325f;border-radius:26px;padding:30px;box-shadow:0 24px 70px #0008;text-align:center}.logo{width:72px;height:72px;margin:0 auto 16px;border-radius:22px;display:grid;place-items:center;background:linear-gradient(145deg,#2f49d8,#101b58);font-size:34px}.title{font-size:25px;font-weight:900;letter-spacing:.06em}.muted{color:#b7c0dc;line-height:1.7}.status{margin-top:16px;min-height:24px;font-weight:800;color:#a9b9ff}.google{display:grid;place-items:center;margin-top:18px}</style></head><body><main class="card"><div class="logo">↓</div><div class="title">Starry ID × 繁星下載</div><p class="muted">使用中央 Starry ID 的同一個 Google 會員身分登入。</p><div id="google" class="google"></div><div id="status" class="status">正在確認會員狀態…</div></main><script>
const CLIENT_ID='${GOOGLE_CLIENT_ID}',statusEl=document.getElementById('status');
async function issue(){statusEl.textContent='正在建立安全登入連結…';const r=await fetch('/api/auth/downloadstarry-ticket',{method:'POST',cache:'no-store'});const d=await r.json().catch(()=>({}));if(r.ok&&d.redirect){location.replace(d.redirect);return true}if(r.status!==401)statusEl.textContent=d.error||'登入服務暫時無法使用';return false}
function renderGoogle(){statusEl.textContent='請使用 Google 帳戶登入';const timer=setInterval(()=>{if(!window.google?.accounts?.id)return;clearInterval(timer);google.accounts.id.initialize({client_id:CLIENT_ID,callback:async x=>{statusEl.textContent='登入中…';const r=await fetch('/api/users/google-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:x.credential}),cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok){statusEl.textContent=d.error||'登入失敗，請再試一次';return}if(!await issue())renderGoogle()}});google.accounts.id.renderButton(document.getElementById('google'),{theme:'outline',size:'large',shape:'pill',text:'continue_with',width:300})},80)}
issue().then(ok=>{if(!ok)renderGoogle()}).catch(()=>renderGoogle());
</script></body></html>`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer'
    }
  });
}

export async function handleDownloadStarrySso(request: Request, env: DownloadStarryEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  if (url.pathname === '/auth/downloadstarry' && method === 'GET') return loginPage();
  if (url.pathname === '/api/auth/downloadstarry-ticket' && method === 'POST') return issueTicket(request, env);
  if (url.pathname === '/api/auth/downloadstarry-exchange' && method === 'POST') return exchangeTicket(request, env);
  if (url.pathname === '/api/auth/downloadstarry-health' && method === 'GET') return health(env);
  return null;
}

export default { handleDownloadStarrySso };
