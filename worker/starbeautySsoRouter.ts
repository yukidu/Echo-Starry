import sessionWorker from './sessionCookieRouter';
import type { Env } from './index';

const STARBEAUTY_URL = 'https://starbeauty.yukidu.workers.dev';
const GOOGLE_CLIENT_ID = '400699489182-lb412nhvj4s6t1qr5ovkg40hc646dq79.apps.googleusercontent.com';
const TICKET_TTL_MS = 5 * 60 * 1000;
const ticketSchemaReady = new WeakMap<object, Promise<void>>();

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: jsonHeaders }); }
function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function randomCode() { const raw = new Uint8Array(32); crypto.getRandomValues(raw); return bytesToBase64Url(raw); }

async function ensureTicketSchema(env: Env) {
  if (!env.DB) throw new Error('資料庫尚未連線');
  const key = env.DB as unknown as object;
  if (!ticketSchemaReady.has(key)) {
    const promise = (async () => {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS external_auth_codes (
          codeHash TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          audience TEXT NOT NULL,
          expiresAt INTEGER NOT NULL,
          createdAt INTEGER NOT NULL
        )
      `).run();
      await env.DB.prepare('CREATE INDEX IF NOT EXISTS external_auth_codes_expiry ON external_auth_codes(expiresAt)').run();
    })();
    ticketSchemaReady.set(key, promise);
    promise.catch(() => ticketSchemaReady.delete(key));
  }
  await ticketSchemaReady.get(key);
}

async function verifiedSession(request: Request, env: Env) {
  const url = new URL(request.url);
  url.pathname = '/api/auth/session';
  url.search = '';
  const probe = new Request(url.toString(), {
    method: 'GET',
    headers: request.headers,
    redirect: 'manual'
  });
  const response = await sessionWorker.fetch(probe, env);
  if (!response.ok) return null;
  const data: any = await response.json().catch(() => null);
  return data?.authenticated && data?.user?.id ? data.user : null;
}

async function issueTicket(request: Request, env: Env) {
  await ensureTicketSchema(env);
  const user = await verifiedSession(request, env);
  if (!user) return json({ error: '請先登入繁星回聲會員' }, 401);
  const code = randomCode();
  const codeHash = await hash(code);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM external_auth_codes WHERE expiresAt <= ?').bind(now),
    env.DB.prepare('INSERT INTO external_auth_codes (codeHash,userId,audience,expiresAt,createdAt) VALUES (?,?,?,?,?)')
      .bind(codeHash, String(user.id), 'starbeauty', now + TICKET_TTL_MS, now)
  ]);
  return json({ code, redirect: `${STARBEAUTY_URL}/auth/callback?code=${encodeURIComponent(code)}` });
}

function starBeautyProfile(row: any) {
  // 繁星回聲是會員主資料庫；這裡輸出「基本資料頁」完整快照與必要會員狀態。
  // StarBeauty 將快照存成 JSON，所以往後新增基本資料欄位，不需要重做 StarBeauty D1 表結構。
  // StarBeauty 自己的 student / teacher / admin / superadmin 權限不由這個 profile 覆蓋。
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatar: row.avatar,
    googleAvatar: row.googleAvatar,
    amwayId: row.amwayId,
    phone: row.phone,
    residence: row.residence,
    center: row.center,
    rank: row.rank,
    approvedRank: row.approvedRank,
    rankApproved: Boolean(row.rankApproved),
    rankAuditStatus: row.rankAuditStatus,
    rankAuditType: row.rankAuditType,
    rankUpdatedAt: row.rankUpdatedAt,
    role: row.role,
    joinReason: row.joinReason,
    stayReason: row.stayReason,
    sponsor: row.sponsor,
    platinumUpline: row.platinumUpline,
    diamondUpline: row.diamondUpline,
    birthday: row.birthday || row.birthDate || '',
    birthDate: row.birthDate,
    zodiac: row.zodiac,
    talentNumber: row.talentNumber,
    lifeNumber: row.lifeNumber,
    registerDate: row.registerDate,
    auditedBy: row.auditedBy,
    auditedAt: row.auditedAt,
    isContributor: Boolean(row.isContributor),
    isAdminUser: Boolean(row.isAdminUser),
    canUpload: Boolean(row.canUpload),
    isBlocked: Boolean(row.isBlocked),
    avatarUploadCount: Number(row.avatarUploadCount || 0),
    avatarUploadMonth: row.avatarUploadMonth,
    profileEditCount: Number(row.profileEditCount || 0),
    profileEditMonth: row.profileEditMonth,
    playCount: Number(row.playCount || 0),
    lastActive: row.lastActive
  };
}

async function exchangeTicket(request: Request, env: Env) {
  await ensureTicketSchema(env);
  const body: any = await request.clone().json().catch(() => ({}));
  const code = String(body.code || '').trim();
  if (!code) return json({ error: '缺少授權碼' }, 400);
  const codeHash = await hash(code);
  const row: any = await env.DB.prepare(`
    DELETE FROM external_auth_codes
    WHERE codeHash = ? AND audience = 'starbeauty' AND expiresAt > ?
    RETURNING userId
  `).bind(codeHash, Date.now()).first();
  if (!row?.userId) return json({ error: '授權碼無效或已過期' }, 401);

  const user: any = await env.DB.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').bind(String(row.userId)).first();
  if (!user || Number(user.isBlocked || 0) !== 0) return json({ error: '會員不存在或已停權' }, 401);

  const profile = starBeautyProfile(user);
  const profileHash = await hash(JSON.stringify(profile));
  const profileUpdatedAt = String(user.rankUpdatedAt || user.auditedAt || user.registerDate || '');
  return json({
    user: {
      id: String(user.id),
      email: String(user.email || ''),
      name: String(user.name || user.email || ''),
      avatar: String(user.avatar || user.googleAvatar || '')
    },
    profile,
    profileHash,
    profileUpdatedAt
  });
}

function loginPage() {
  const html = `<!doctype html>
<html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>美力之星會員登入</title><script src="https://accounts.google.com/gsi/client" async defer></script><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff8fc;font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif;color:#342534}.card{width:min(92vw,460px);background:#fff;border:1px solid #eadce7;border-radius:28px;padding:30px;box-shadow:0 20px 60px rgba(86,40,78,.14);text-align:center}.logo{width:74px;height:74px;margin:0 auto 16px;border-radius:25px;display:grid;place-items:center;background:linear-gradient(135deg,#b95d9f,#6e2f69);color:#fff;font-size:38px}.title{font-size:26px;font-weight:900;letter-spacing:.08em}.muted{color:#7b6b78;line-height:1.7}.status{margin-top:16px;min-height:24px;font-weight:800;color:#7b2f6f}.google{display:grid;place-items:center;margin-top:18px}.btn{border:0;background:#7b2f6f;color:#fff;padding:13px 18px;border-radius:14px;font-weight:900;width:100%;margin-top:16px}</style></head><body><main class="card"><div class="logo">★</div><div class="title">美力之星</div><p class="muted">使用「繁星回聲」同一個 Google 會員身分登入。</p><div id="google" class="google"></div><button id="continue" class="btn" style="display:none">繼續前往美力之星</button><div id="status" class="status">正在確認會員狀態…</div></main><script>
const USER_KEY='sq_current_user_v1';const CLIENT_ID='${GOOGLE_CLIENT_ID}';const statusEl=document.getElementById('status');const btn=document.getElementById('continue');
function readUser(){try{return JSON.parse(localStorage.getItem(USER_KEY)||'null')}catch{return null}}
async function go(){const u=readUser();if(!u?._authToken){renderGoogle();return}statusEl.textContent='正在建立安全登入連結…';const r=await fetch('/api/auth/starbeauty-ticket',{method:'POST',headers:{Authorization:'Bearer '+u._authToken},cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok){localStorage.removeItem(USER_KEY);renderGoogle();return}location.replace(d.redirect)}
function renderGoogle(){statusEl.textContent='請使用 Google 帳戶登入';btn.style.display='none';const timer=setInterval(()=>{if(!window.google?.accounts?.id)return;clearInterval(timer);google.accounts.id.initialize({client_id:CLIENT_ID,callback:async x=>{statusEl.textContent='登入中…';const r=await fetch('/api/users/google-sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:x.credential}),cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok||!d?.user?.id||!d?.authToken){statusEl.textContent=d.error||'登入失敗，請再試一次';return}localStorage.setItem(USER_KEY,JSON.stringify({...d.user,_authToken:d.authToken,_sessionExpiresAt:d.sessionExpiresAt}));go()}});google.accounts.id.renderButton(document.getElementById('google'),{theme:'outline',size:'large',shape:'pill',text:'continue_with',width:300})},80)}
btn.onclick=go;go().catch(()=>renderGoogle());
</script></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' } });
}

export async function handleStarbeautySso(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/auth/starbeauty' && request.method === 'GET') return loginPage();
  if (url.pathname === '/api/auth/starbeauty-ticket' && request.method === 'POST') return issueTicket(request, env);
  if (url.pathname === '/api/auth/starbeauty-exchange' && request.method === 'POST') return exchangeTicket(request, env);
  return null;
}

export default { handleStarbeautySso };
