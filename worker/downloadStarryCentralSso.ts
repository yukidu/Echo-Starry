import { handleStarryIdCentral } from './starryIdCentralRouter';
import type { Env } from './index';

const STARRY_ID_HOST = 'id.starry.phd';
const DOWNLOAD_ORIGIN = 'https://download.starry.phd';
const DOWNLOAD_APP_ID = 'downloadstarry';
const DEFAULT_GOOGLE_CLIENT_ID = '661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com';
const TICKET_TTL_MS = 5 * 60 * 1000;
const schemaReady = new WeakMap<object, Promise<void>>();

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
  });
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomCode() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function ensureSchema(env: Env) {
  const db = (env as any).STARRY_ID_DB;
  if (!db) throw new Error('STARRY_ID_DB not bound');
  const key = db as object;
  if (!schemaReady.has(key)) {
    const task = (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS starry_app_auth_codes (
        codeHash TEXT PRIMARY KEY,
        appId TEXT NOT NULL,
        userId TEXT NOT NULL,
        expiresAt INTEGER NOT NULL,
        createdAt INTEGER NOT NULL
      )`).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS starry_app_auth_codes_expiry ON starry_app_auth_codes(expiresAt)').run();
    })();
    schemaReady.set(key, task);
    task.catch(() => schemaReady.delete(key));
  }
  await schemaReady.get(key);
}

function rejectCrossSite(request: Request) {
  const origin = request.headers.get('Origin');
  const ownOrigin = new URL(request.url).origin;
  if ((origin && origin !== ownOrigin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return json({ error: 'Origin not allowed' }, 403);
  }
  return null;
}

async function centralSession(request: Request, env: Env) {
  const url = new URL(request.url);
  url.pathname = '/api/session';
  url.search = '';
  const probe = new Request(url.toString(), {
    method: 'GET',
    headers: request.headers,
    redirect: 'manual'
  });
  const response = await handleStarryIdCentral(probe, env as any);
  if (!response || !response.ok) return null;
  const data: any = await response.json().catch(() => null);
  if (!data?.authenticated || !data?.user?.id || data?.appId !== DOWNLOAD_APP_ID) return null;
  if (data?.membership?.status !== 'active') return null;
  return data;
}

async function issueTicket(request: Request, env: Env) {
  const rejected = rejectCrossSite(request);
  if (rejected) return rejected;
  const session = await centralSession(request, env);
  if (!session) return json({ error: '請先使用 Starry ID 登入繁星下載' }, 401);
  await ensureSchema(env);
  const db = (env as any).STARRY_ID_DB;
  const code = randomCode();
  const codeHash = await hash(code);
  const now = Date.now();
  await db.batch([
    db.prepare('DELETE FROM starry_app_auth_codes WHERE expiresAt <= ?').bind(now),
    db.prepare('INSERT INTO starry_app_auth_codes (codeHash,appId,userId,expiresAt,createdAt) VALUES (?,?,?,?,?)')
      .bind(codeHash, DOWNLOAD_APP_ID, String(session.user.id), now + TICKET_TTL_MS, now)
  ]);
  return json({
    code,
    redirect: `${DOWNLOAD_ORIGIN}/auth/callback?code=${encodeURIComponent(code)}`
  });
}

function loginPage(env: Env) {
  const clientId = text((env as any).STARRY_ID_GOOGLE_CLIENT_ID) || DEFAULT_GOOGLE_CLIENT_ID;
  const html = `<!doctype html>
<html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Starry ID × 繁星下載</title><script src="https://accounts.google.com/gsi/client" async defer></script><style>
:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1026;font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif;color:#eef2ff}.card{width:min(92vw,480px);background:#111833;border:1px solid #2f3b68;border-radius:28px;padding:30px;box-shadow:0 24px 80px rgba(0,0,0,.38);text-align:center}.logo{width:76px;height:76px;margin:0 auto 16px;border-radius:24px;display:grid;place-items:center;background:linear-gradient(135deg,#445cff,#7656db);color:#fff;font-size:36px;font-weight:900}.title{font-size:26px;font-weight:900}.muted{color:#aeb8dc;line-height:1.8}.status{margin-top:16px;min-height:24px;font-weight:800;color:#c8d0ff}.google{display:grid;place-items:center;margin-top:20px}.back{display:inline-block;margin-top:20px;color:#bfc9ff;text-decoration:none;font-weight:800}</style></head><body><main class="card"><div class="logo">ID</div><div class="title">Starry ID × 繁星下載</div><p class="muted">使用繁星生態系中央會員登入。登入完成後會安全返回繁星下載。</p><div id="google" class="google"></div><div id="status" class="status">正在確認登入狀態…</div><a class="back" href="${DOWNLOAD_ORIGIN}/account">返回繁星下載</a></main><script>
const CLIENT_ID=${JSON.stringify(clientId)};const statusEl=document.getElementById('status');const googleEl=document.getElementById('google');let rendered=false;
async function ticket(){const r=await fetch('/api/apps/downloadstarry/ticket',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'});const d=await r.json().catch(()=>({}));if(r.ok&&d.redirect){location.replace(d.redirect);return true}return false}
function renderGoogle(){if(rendered)return;rendered=true;statusEl.textContent='請使用 Google 帳戶繼續';const timer=setInterval(()=>{if(!window.google?.accounts?.id)return;clearInterval(timer);google.accounts.id.initialize({client_id:CLIENT_ID,callback:async x=>{statusEl.textContent='正在登入 Starry ID…';const r=await fetch('/api/google-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:x.credential,appId:'downloadstarry'}),cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok){statusEl.textContent=d.error||'登入失敗，請再試一次';return}statusEl.textContent='正在返回繁星下載…';if(!await ticket())statusEl.textContent='無法建立繁星下載登入授權，請再試一次';}});google.accounts.id.renderButton(googleEl,{theme:'outline',size:'large',shape:'pill',text:'continue_with',width:300})},80)}
(async()=>{try{if(await ticket())return}catch{}renderGoogle()})();
</script></body></html>`;
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow'
    }
  });
}

export async function handleDownloadStarryCentralSso(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.hostname !== STARRY_ID_HOST) return null;
  const method = request.method.toUpperCase();
  if (url.pathname === '/auth/downloadstarry' && method === 'GET') return loginPage(env);
  if (url.pathname === '/api/apps/downloadstarry/ticket' && method === 'POST') return issueTicket(request, env);
  return null;
}
