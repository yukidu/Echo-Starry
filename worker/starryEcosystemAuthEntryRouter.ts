import type { Env } from './index';

const ID_HOST = 'id.starry.phd';
const DEFAULT_GOOGLE_CLIENT_ID = '661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com';

const AUTH_APPS = {
  echostars: { appId: 'echostars', label: '繁星回聲' },
  gostarry: { appId: 'gostarry', label: '繁星任意門' },
  downloadstarry: { appId: 'downloadstarry', label: '繁星捕手' },
  boxstarry: { appId: 'boxstarry', label: '繁星視界' },
  'starry-eye': { appId: 'boxstarry', label: '繁星視界' },
  'starry-sync': { appId: 'starry-sync', label: '繁星共振' },
  'starry-ai': { appId: 'starry-ai', label: '繁星副官' }
} as const;

type AuthAlias = keyof typeof AUTH_APPS;

function safeClientId(env: Env) {
  const raw = String((env as any).STARRY_ID_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID).trim();
  return /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(raw) ? raw : DEFAULT_GOOGLE_CLIENT_ID;
}

function authAlias(pathname: string): AuthAlias | null {
  const match = pathname.match(/^\/auth\/([a-z0-9-]+)\/?$/i);
  const alias = String(match?.[1] || '').toLowerCase() as AuthAlias;
  return alias && Object.prototype.hasOwnProperty.call(AUTH_APPS, alias) ? alias : null;
}

function loginPage(env: Env, alias: AuthAlias, chooseAccount: boolean) {
  const config = AUTH_APPS[alias];
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><meta name="robots" content="noindex,nofollow,noarchive"><title>登入${config.label}｜繁星通行證</title><style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#050714;color:#f5fbff;font-family:system-ui,-apple-system,"Noto Sans TC","Segoe UI",sans-serif}body{min-height:100dvh;display:grid;place-items:center;padding:18px;background:radial-gradient(circle at 50% 12%,rgba(75,135,255,.18),transparent 34%),#050714}.card{width:min(430px,100%);padding:30px 20px 26px;border:1px solid rgba(146,221,255,.22);border-radius:24px;background:rgba(9,15,35,.97);box-shadow:0 24px 80px rgba(0,0,0,.38);text-align:center}.mark{width:68px;height:68px;margin:0 auto 16px;display:grid;place-items:center;border-radius:22px;border:1px solid rgba(146,221,255,.35);font-size:32px;background:rgba(74,128,255,.12)}h1{margin:0 0 8px;font-size:24px}p{margin:0 0 20px;color:#abc7da;font-size:14px;line-height:1.7}.google{min-height:46px;display:flex;justify-content:center}.status{min-height:42px;margin-top:16px;color:#bfe9ff;font-size:13px;line-height:1.65}.error{color:#ffb8b8}.spinner{display:inline-block;width:14px;height:14px;margin-right:7px;border:2px solid rgba(255,255,255,.25);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;vertical-align:-2px}@keyframes spin{to{transform:rotate(360deg)}}</style><script src="https://accounts.google.com/gsi/client" async defer></script></head><body><main class="card"><div class="mark">✦</div><h1>繁星通行證</h1><p>登入後會自動前往「${config.label}」。<br>同一個繁星帳號可通行整個 Starry.phd 生態系。</p><div id="googleButton" class="google"></div><div id="status" class="status">正在確認登入狀態…</div></main><script nonce="${nonce}">
const APP_ID=${JSON.stringify(config.appId)},APP_LABEL=${JSON.stringify(config.label)},CLIENT_ID=${JSON.stringify(safeClientId(env))},FORCE_CHOOSE=${chooseAccount ? 'true' : 'false'},statusEl=document.getElementById('status');
function status(text,error=false){statusEl.textContent=text;statusEl.className=error?'status error':'status'}
async function openTarget(){statusEl.innerHTML='<span class="spinner"></span>正在進入'+APP_LABEL+'…';const response=await fetch('/api/apps/'+encodeURIComponent(APP_ID)+'/ticket',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},body:'{}'});const data=await response.json().catch(()=>({}));if(!response.ok||!data.redirect)throw new Error(data.error||'無法開啟應用');location.replace(String(data.redirect))}
async function centralSession(){const response=await fetch('/api/session',{credentials:'include',cache:'no-store'});return response.ok?await response.json().catch(()=>({authenticated:false})):{authenticated:false}}
async function onCredential(result){const credential=String(result&&result.credential||'');if(!credential){status('沒有取得 Google 登入資料，請再試一次。',true);return}statusEl.innerHTML='<span class="spinner"></span>正在登入繁星通行證…';try{const response=await fetch('/api/google-sync',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential,appId:APP_ID})});const data=await response.json().catch(()=>({}));if(!response.ok||!data.success)throw new Error(data.error||'登入失敗');await openTarget()}catch(error){status(error instanceof Error?error.message:'登入失敗，請再試一次。',true)}}
function showGoogle(){if(!window.google?.accounts?.id){setTimeout(showGoogle,80);return}google.accounts.id.initialize({client_id:CLIENT_ID,callback:onCredential,ux_mode:'popup',auto_select:false,cancel_on_tap_outside:false,itp_support:true});google.accounts.id.renderButton(document.getElementById('googleButton'),{type:'standard',theme:'filled_black',size:'large',shape:'pill',text:'continue_with',width:300,locale:'zh_TW'});status('請選擇 Google 帳號')}
async function boot(){try{if(!FORCE_CHOOSE){const current=await centralSession();if(current&&current.authenticated){await openTarget();return}}}catch(_){}showGoogle()}addEventListener('load',boot,{once:true});
</script></body></html>`;

  return new Response(html, { status: 200, headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}' https://accounts.google.com/gsi/client; style-src 'unsafe-inline' https://accounts.google.com/gsi/style; frame-src https://accounts.google.com; connect-src 'self' https://accounts.google.com https://www.googleapis.com; img-src data: https:; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
  }});
}

export function handleStarryEcosystemAuthEntry(request: Request, env: Env): Response | null {
  const url = new URL(request.url);
  if (url.hostname !== ID_HOST) return null;
  const alias = authAlias(url.pathname);
  if (!alias) return null;
  if (request.method.toUpperCase() !== 'GET') return new Response('Method not allowed', { status: 405 });
  return loginPage(env, alias, url.searchParams.get('choose') === '1');
}
