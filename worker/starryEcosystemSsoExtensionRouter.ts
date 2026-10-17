import type { Env } from './index';
import appWorker from './starryMainInlineLoginRouter';

const ID_HOST = 'id.starry.phd';
const CENTRAL_COOKIE = 'starry_id_session';
const TOKEN_RE = /^[A-Za-z0-9_-]{30,}$/;
const TICKET_TTL_MS = 5 * 60 * 1000;
const GOOGLE_CLIENT_ID = '661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com';

const APPS = {
  boxstarry: { origin: 'https://eye.starry.phd', label: '繁星視界', loginAliases: ['/auth/boxstarry', '/auth/starry-eye'] },
  'starry-sync': { origin: 'https://sync.starry.phd', label: '繁星共振', loginAliases: ['/auth/starry-sync'] }
} as const;

type AppId = keyof typeof APPS;

type CentralIdentity = { userId:string; email:string; name:string; avatar:string; rank:string };

function cookieValue(request: Request, name: string) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0 || part.slice(0, i).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(i + 1).trim()); }
    catch { return part.slice(i + 1).trim(); }
  }
  return '';
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

function appFromTicketPath(pathname: string): AppId | null {
  const match = pathname.match(/^\/api\/apps\/(boxstarry|starry-sync)\/ticket$/);
  return match ? match[1] as AppId : null;
}

function appFromLoginPath(pathname: string): AppId | null {
  for (const [appId, config] of Object.entries(APPS) as [AppId, (typeof APPS)[AppId]][]) {
    if ((config.loginAliases as readonly string[]).includes(pathname)) return appId;
  }
  return null;
}

function cors(request: Request, appId: AppId) {
  const origin = request.headers.get('Origin') || '';
  const headers = new Headers({ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Vary':'Origin' });
  if (origin === APPS[appId].origin || origin === `https://${ID_HOST}`) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Accept');
    headers.set('Access-Control-Max-Age', '600');
  }
  return headers;
}

function json(request: Request, appId: AppId, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors(request, appId) });
}

async function identity(request: Request, env: Env): Promise<CentralIdentity | null> {
  const db = (env as any).STARRY_ID_DB;
  const token = cookieValue(request, CENTRAL_COOKIE);
  if (!db || !TOKEN_RE.test(token)) return null;
  const tokenHash = await hashToken(token);
  const row:any = await db.prepare(`SELECT s.userId,s.expiresAt,u.primaryEmail,u.status,p.name,p.avatar,p.googleAvatar,p.rank,p.approvedRank FROM auth_sessions s JOIN users u ON u.id=s.userId LEFT JOIN profiles p ON p.userId=u.id WHERE s.tokenHash=? LIMIT 1`).bind(tokenHash).first().catch(() => null);
  if (!row || row.status !== 'active' || Number(row.expiresAt || 0) <= Date.now()) return null;
  return {
    userId: String(row.userId || ''),
    email: String(row.primaryEmail || '').trim().toLowerCase(),
    name: String(row.name || '').trim() || String(row.primaryEmail || '').split('@')[0] || 'Starry Member',
    avatar: String(row.avatar || row.googleAvatar || ''),
    rank: String(row.approvedRank || row.rank || '3%')
  };
}

async function ensureMembership(env: Env, userId: string, appId: AppId) {
  const db = (env as any).STARRY_ID_DB;
  const existing:any = await db.prepare('SELECT status FROM app_memberships WHERE userId=? AND appId=? LIMIT 1').bind(userId, appId).first().catch(() => null);
  if (existing) return existing.status === 'active';
  const now = Date.now();
  await db.prepare(`INSERT INTO app_memberships (userId,appId,status,role,isAdminUser,isContributor,canUpload,joinedAt,updatedAt) VALUES (?,?,'active','member',0,0,0,?,?)`).bind(userId, appId, now, now).run();
  return true;
}

async function ensureTicketSchema(env: Env) {
  const db = (env as any).STARRY_ID_DB;
  await db.prepare(`CREATE TABLE IF NOT EXISTS starry_app_auth_codes (codeHash TEXT PRIMARY KEY,appId TEXT NOT NULL,userId TEXT NOT NULL,expiresAt INTEGER NOT NULL,createdAt INTEGER NOT NULL)`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS starry_app_auth_codes_expiry ON starry_app_auth_codes(expiresAt)').run();
}

async function issueTicket(request: Request, env: Env, appId: AppId) {
  const origin = request.headers.get('Origin') || '';
  if (origin && origin !== APPS[appId].origin && origin !== `https://${ID_HOST}`) return json(request, appId, { error:'Origin not allowed' }, 403);
  const current = await identity(request, env);
  if (!current) return json(request, appId, { authenticated:false, error:'請先登入繁星通行證' }, 401);
  if (!await ensureMembership(env, current.userId, appId)) return json(request, appId, { authenticated:false, error:`${APPS[appId].label}會員資格不可用` }, 403);
  await ensureTicketSchema(env);
  const db = (env as any).STARRY_ID_DB;
  const code = randomToken();
  const codeHash = await hashToken(code);
  const now = Date.now();
  await db.batch([
    db.prepare('DELETE FROM starry_app_auth_codes WHERE expiresAt<=?').bind(now),
    db.prepare('INSERT INTO starry_app_auth_codes(codeHash,appId,userId,expiresAt,createdAt) VALUES(?,?,?,?,?)').bind(codeHash, appId, current.userId, now + TICKET_TTL_MS, now)
  ]);
  return json(request, appId, { authenticated:true, code, redirect:`${APPS[appId].origin}/auth/callback?code=${encodeURIComponent(code)}`, user:current });
}

function loginPage(appId: AppId) {
  const config = APPS[appId];
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><title>${config.label}｜繁星通行證</title><script src="https://accounts.google.com/gsi/client" async defer></script><style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#050714;color:#f5fbff;font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif}body{display:grid;place-items:center;padding:18px}.card{width:min(420px,100%);padding:28px 18px;text-align:center;border:1px solid #294762;border-radius:22px;background:#091124}h1{margin:0 0 8px;font-size:23px}p{color:#aecbe0;line-height:1.65}.google{min-height:44px;display:flex;justify-content:center;margin-top:20px}.status{min-height:22px;margin-top:14px;color:#bfeaff;font-size:13px}.error{color:#ffb6bd}</style></head><body><main class="card"><h1>繁星通行證</h1><p>${config.label} 與所有繁星 App 共用同一個會員身份。<br>選擇 Google 帳號後會自動返回。</p><div id="google" class="google"></div><div id="status" class="status">正在準備登入…</div></main><script>const APP_ID=${JSON.stringify(appId)},CLIENT_ID=${JSON.stringify(GOOGLE_CLIENT_ID)};const s=document.getElementById('status');async function done(r){const credential=String(r&&r.credential||'');if(!credential)return;s.textContent='正在同步繁星通行證…';try{const login=await fetch('/api/google-sync',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential,appId:APP_ID})});const ld=await login.json().catch(()=>({}));if(!login.ok||!ld.success)throw new Error(ld.error||'登入失敗');const ticket=await fetch('/api/apps/'+APP_ID+'/ticket',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'}});const td=await ticket.json().catch(()=>({}));if(!ticket.ok||!td.redirect)throw new Error(td.error||'同步失敗');location.replace(td.redirect)}catch(e){s.textContent=e&&e.message?e.message:'登入失敗';s.className='status error'}}function boot(){if(!window.google||!google.accounts||!google.accounts.id){setTimeout(boot,80);return}google.accounts.id.disableAutoSelect();google.accounts.id.initialize({client_id:CLIENT_ID,callback:done,ux_mode:'popup',auto_select:false,itp_support:true});google.accounts.id.renderButton(document.getElementById('google'),{theme:'filled_black',size:'large',shape:'pill',text:'continue_with',width:300,locale:'zh_TW'});s.textContent='請選擇 Google 帳號'}addEventListener('load',boot,{once:true});</script></body></html>`;
  return new Response(html, { headers:{ 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'X-Robots-Tag':'noindex, nofollow, noarchive', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer' } });
}

export default {
  async fetch(request: Request, env: Env, ctx?: any): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname === ID_HOST) {
      const ticketApp = appFromTicketPath(url.pathname);
      if (ticketApp) {
        if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:cors(request, ticketApp) });
        if (request.method !== 'POST') return json(request, ticketApp, { error:'Method not allowed' }, 405);
        try { return await issueTicket(request, env, ticketApp); }
        catch (error) { console.error('Extended ecosystem ticket error:', error); return json(request, ticketApp, { authenticated:false, error:'登入同步暫時無法使用' }, 503); }
      }
      const loginApp = appFromLoginPath(url.pathname);
      if (loginApp && request.method === 'GET') return loginPage(loginApp);
    }
    return appWorker.fetch(request, env, ctx);
  }
};
