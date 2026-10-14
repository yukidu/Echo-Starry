import type { Env } from './index';
import { sessionContext } from './starryIdProfileDirectoryRouter';
import { handleStarryIdV230Client } from './starryIdV230ClientRouter';
import { unitsToBatteries } from '../shared/battery';

const STAR_DOMAIN = 'id.starry.phd';
const schemaReady = new WeakMap<object, Promise<void>>();
const APP_LABELS: Record<string,string> = {
  echostars: '繁星回聲',
  'starry-id': 'Starry ID',
  downloadstarry: '繁星下載',
  gostarry: '繁星任意門',
  quotes: '繁星雞湯',
  boxstarry: '繁星膠囊',
  starbeauty: '美力之星'
};

function text(value: unknown) { return value == null ? '' : String(value).trim(); }
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow, noarchive'
  }});
}
function escapeHtml(value: unknown) {
  return text(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c));
}
function appLabel(appId: unknown) {
  const id = text(appId) || 'unknown';
  return APP_LABELS[id] || id;
}
function formatBattery(units: unknown) {
  const amount = unitsToBatteries(Number(units || 0));
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1).replace(/\.0$/, '');
}

export function stabilizeStarryIdV230ClientSource(source: string) {
  return source
    .replace(
      "if(display){display.textContent=next||'尚未填寫';display.classList.toggle('empty',!next)}",
      "if(display){const nextText=next||'尚未填寫';if(display.textContent!==nextText)display.textContent=nextText;const empty=!next;if(display.classList.contains('empty')!==empty)display.classList.toggle('empty',empty)}"
    )
    .replace(
      "async function syncV242ProfileFields(){const emailSource=q('#displayEmail');if(emailSource)emailSource.style.display='none';",
      "async function syncV242ProfileFields(){const emailSource=q('#displayEmail');if(emailSource&&emailSource.style.display!=='none')emailSource.style.display='none';"
    )
    .replace(
      'let rankTimer=0;function scheduleRank(){clearTimeout(rankTimer);rankTimer=setTimeout(syncRank,260)}',
      'let rankTimer=0;function scheduleRank(){if(rankTimer)return;rankTimer=setTimeout(()=>{rankTimer=0;void syncRank()},260)}'
    )
    .replace(
      "const observer=new MutationObserver(sync);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});sync();void syncRank();setInterval(()=>syncBell(true),45000);",
      "let observerTimer=0;function scheduleSync(){if(observerTimer)return;observerTimer=setTimeout(()=>{observerTimer=0;sync()},32)}const observer=new MutationObserver(scheduleSync);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});sync();void syncRank();setInterval(()=>syncBell(true),45000);"
    );
}

async function stabilizedV230Client(request: Request, env: Env) {
  const response = await handleStarryIdV230Client(request, env);
  if (!response) return null;
  const source = stabilizeStarryIdV230ClientSource(await response.text());
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control','no-store');
  return new Response(source,{status:response.status,statusText:response.statusText,headers});
}

async function ensureSchema(env: Env) {
  const db = (env as any).STARRY_ID_DB;
  if (!db) throw new Error('STARRY_ID_DB not bound');
  const key = db as object;
  if (!schemaReady.has(key)) {
    const task = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS battery_transactions (
        id TEXT PRIMARY KEY,userId TEXT NOT NULL,deltaUnits INTEGER NOT NULL,balanceAfterUnits INTEGER NOT NULL,
        type TEXT NOT NULL,sourceApp TEXT NOT NULL DEFAULT 'echostars',sourceId TEXT,description TEXT NOT NULL,
        actorUserId TEXT,uniqueKey TEXT NOT NULL UNIQUE,createdAt INTEGER NOT NULL,trackId TEXT,commentId TEXT,relatedUserId TEXT,sourceLabel TEXT)`),
      db.prepare('CREATE INDEX IF NOT EXISTS battery_transactions_user_history ON battery_transactions(userId,createdAt DESC,id DESC)'),
      db.prepare('CREATE INDEX IF NOT EXISTS battery_transactions_source ON battery_transactions(sourceApp,sourceId,type)'),
      db.prepare('CREATE TABLE IF NOT EXISTS battery_accounts (userId TEXT PRIMARY KEY,balanceUnits INTEGER NOT NULL DEFAULT 0,updatedAt INTEGER NOT NULL)'),
      db.prepare(`CREATE TABLE IF NOT EXISTS battery_migration_state (
        sourceApp TEXT PRIMARY KEY,status TEXT NOT NULL,sourceCount INTEGER NOT NULL DEFAULT 0,migratedCount INTEGER NOT NULL DEFAULT 0,
        sourceBalanceUnits INTEGER NOT NULL DEFAULT 0,centralBalanceUnits INTEGER NOT NULL DEFAULT 0,sourceMaxRowId INTEGER NOT NULL DEFAULT 0,
        startedAt INTEGER NOT NULL,completedAt INTEGER,updatedAt INTEGER NOT NULL)`)
    ]).then(() => undefined);
    schemaReady.set(key, task);
    task.catch(() => schemaReady.delete(key));
  }
  await schemaReady.get(key);
}

async function balanceUnits(db: any, userId: string) {
  const account: any = await db.prepare('SELECT balanceUnits FROM battery_accounts WHERE userId=? LIMIT 1').bind(userId).first().catch(() => null);
  if (account) return Number(account.balanceUnits || 0);
  const sum: any = await db.prepare('SELECT COALESCE(SUM(deltaUnits),0) AS balanceUnits FROM battery_transactions WHERE userId=?').bind(userId).first();
  return Number(sum?.balanceUnits || 0);
}

function parseBefore(raw: string | null): [number,string] | null {
  if (!raw) return null;
  if (raw.length > 360) throw new Error('invalid_cursor');
  const value = JSON.parse(raw);
  if (!Array.isArray(value) || value.length !== 2 || !Number.isSafeInteger(value[0]) || value[0] < 0 || typeof value[1] !== 'string' || !value[1]) throw new Error('invalid_cursor');
  return [value[0], value[1]];
}

async function targetSession(request: Request, env: Env) {
  const session = await sessionContext(request, env);
  if (!session) return null;
  const url = new URL(request.url);
  const requested = text(url.searchParams.get('targetUserId'));
  const targetUserId = requested || session.userId;
  if (targetUserId !== session.userId && !session.isSuperAdmin) return { forbidden: true, session, targetUserId } as any;
  return { session, targetUserId };
}

async function summary(request: Request, env: Env) {
  const context: any = await targetSession(request, env);
  if (!context) return json({ error: '請先登入 Starry ID' }, 401);
  if (context.forbidden) return json({ error: '沒有權限查看其他會員的電池' }, 403);
  await ensureSchema(env);
  const db = (env as any).STARRY_ID_DB;
  const units = await balanceUnits(db, context.targetUserId);
  const sources: any = await db.prepare(`SELECT sourceApp,COUNT(*) AS count FROM battery_transactions
    WHERE userId=? GROUP BY sourceApp ORDER BY COUNT(*) DESC,sourceApp`).bind(context.targetUserId).all();
  return json({
    userId: context.targetUserId,
    balanceUnits: units,
    balance: unitsToBatteries(units),
    sourceApps: (sources?.results || []).map((row: any) => ({ id: text(row.sourceApp) || 'unknown', label: appLabel(row.sourceApp), count: Number(row.count || 0) }))
  });
}

async function history(request: Request, env: Env) {
  const session = await sessionContext(request, env);
  if (!session) return json({ error: '請先登入 Starry ID' }, 401);
  await ensureSchema(env);
  const db = (env as any).STARRY_ID_DB;
  const url = new URL(request.url);
  const sourceApp = text(url.searchParams.get('app')).slice(0,80);
  let before: [number,string] | null = null;
  try { before = parseBefore(url.searchParams.get('before')); }
  catch { return json({ error: '紀錄分頁無效，請重新整理' }, 400); }
  const where = ['userId=?'];
  const binds: any[] = [session.userId];
  if (sourceApp) { where.push('sourceApp=?'); binds.push(sourceApp); }
  if (before) { where.push('(createdAt,id)<(?,?)'); binds.push(before[0],before[1]); }
  const rows: any = await db.prepare(`SELECT id,deltaUnits,balanceAfterUnits,type,sourceApp,sourceId,description,createdAt,trackId,commentId,sourceLabel
    FROM battery_transactions WHERE ${where.join(' AND ')} ORDER BY createdAt DESC,id DESC LIMIT 51`).bind(...binds).all();
  const page = (rows?.results || []).slice(0,50);
  const last: any = page[page.length - 1];
  const units = await balanceUnits(db, session.userId);
  const sources: any = await db.prepare(`SELECT sourceApp,COUNT(*) AS count FROM battery_transactions
    WHERE userId=? GROUP BY sourceApp ORDER BY COUNT(*) DESC,sourceApp`).bind(session.userId).all();
  return json({
    balanceUnits: units,
    balance: unitsToBatteries(units),
    filter: sourceApp,
    sourceApps: (sources?.results || []).map((row: any) => ({ id: text(row.sourceApp) || 'unknown', label: appLabel(row.sourceApp), count: Number(row.count || 0) })),
    nextCursor: (rows?.results || []).length > 50 && last ? JSON.stringify([Number(last.createdAt || 0), text(last.id)]) : null,
    transactions: page.map((row: any) => ({
      id: text(row.id),
      delta: unitsToBatteries(Number(row.deltaUnits || 0)),
      balanceAfter: unitsToBatteries(Number(row.balanceAfterUnits || 0)),
      type: text(row.type),
      sourceApp: text(row.sourceApp) || 'unknown',
      sourceAppLabel: appLabel(row.sourceApp),
      sourceId: text(row.sourceId),
      description: text(row.description) || '電池異動',
      sourceLabel: text(row.sourceLabel),
      trackId: text(row.trackId),
      commentId: text(row.commentId),
      createdAt: Number(row.createdAt || 0)
    }))
  });
}

function ledgerPage() {
  return new Response(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="theme-color" content="#07101f"><title>電池餘額日誌｜Starry ID</title><style>
  :root{color-scheme:dark;--bg:#07101f;--panel:#101b31;--line:#2b3b5c;--text:#f7f9ff;--muted:#aebbd3;--plus:#6de0af;--minus:#ff9ba7}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% -10%,#1a3263 0,transparent 34%),var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}.wrap{width:min(900px,calc(100% - 24px));margin:auto;padding:18px 0 70px}.top{position:sticky;top:8px;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;border:1px solid var(--line);border-radius:18px;background:#0b1629e8;backdrop-filter:blur(15px)}.top a{color:#fff;text-decoration:none}.balance{margin:18px 0;padding:22px;border:1px solid var(--line);border-radius:24px;background:linear-gradient(145deg,#172b49,#0d182b)}.balance small{color:var(--muted)}.balance strong{display:block;font-size:42px;margin-top:4px}.tools{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.tools select,.tools button{min-height:44px;border:1px solid #49658e;border-radius:12px;background:#142641;color:#fff;padding:8px 12px;font:inherit}.list{display:grid;gap:10px}.entry{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;border:1px solid var(--line);border-radius:18px;background:var(--panel);padding:14px}.app{font-size:12px;color:#a9c8ff}.desc{font-size:16px;font-weight:750;margin-top:3px}.meta{font-size:12px;color:var(--muted);margin-top:6px;line-height:1.5}.delta{text-align:right;font-size:20px;font-weight:900}.delta.plus{color:var(--plus)}.delta.minus{color:var(--minus)}.after{font-size:12px;color:var(--muted);margin-top:5px}.empty{text-align:center;color:var(--muted);padding:40px 12px}.more{width:100%;margin-top:14px;min-height:48px;border:1px solid #49658e;border-radius:14px;background:#142641;color:#fff;font:800 15px system-ui;cursor:pointer}.more[hidden]{display:none}@media(max-width:560px){.balance strong{font-size:35px}.entry{grid-template-columns:1fr auto}.top{top:5px}}
  </style></head><body><main class="wrap"><header class="top"><a href="/">← Starry ID</a><strong>🔋 電池餘額日誌</strong></header><section class="balance"><small>目前中央電池餘額</small><strong id="balance">—</strong></section><div class="tools"><label for="appFilter">來源 App</label><select id="appFilter"><option value="">全部 App</option></select></div><section class="list" id="list"><div class="empty">讀取中…</div></section><button class="more" id="more" hidden>載入更多</button></main><script>
  (()=>{const list=document.getElementById('list'),filter=document.getElementById('appFilter'),more=document.getElementById('more'),balance=document.getElementById('balance');let cursor=null,busy=false;const fmt=n=>Number.isInteger(Number(n))?String(Number(n)):Number(n).toFixed(1).replace(/\\.0$/,'');const date=t=>new Intl.DateTimeFormat('zh-TW',{dateStyle:'medium',timeStyle:'medium'}).format(new Date(Number(t)||0));function row(tx){const e=document.createElement('article');e.className='entry';const left=document.createElement('div');const app=document.createElement('div');app.className='app';app.textContent='來源：'+(tx.sourceAppLabel||tx.sourceApp);const d=document.createElement('div');d.className='desc';d.textContent=tx.description||'電池異動';const meta=document.createElement('div');meta.className='meta';meta.textContent=date(tx.createdAt)+(tx.sourceLabel?'｜'+tx.sourceLabel:'')+(tx.sourceId?'｜帳目 '+tx.sourceId:'');left.append(app,d,meta);const right=document.createElement('div');const delta=document.createElement('div');delta.className='delta '+(Number(tx.delta)>=0?'plus':'minus');delta.textContent=(Number(tx.delta)>=0?'+':'')+fmt(tx.delta)+' 顆';const after=document.createElement('div');after.className='after';after.textContent='結餘 '+fmt(tx.balanceAfter)+' 顆';right.append(delta,after);e.append(left,right);return e}async function load(reset=false){if(busy)return;busy=true;more.disabled=true;try{if(reset){cursor=null;list.innerHTML='<div class="empty">讀取中…</div>'}const p=new URLSearchParams();if(filter.value)p.set('app',filter.value);if(cursor)p.set('before',cursor);const r=await fetch('/api/battery-ledger?'+p,{credentials:'same-origin'});const d=await r.json();if(!r.ok)throw Error(d.error||'讀取失敗');balance.textContent=fmt(d.balance)+' 顆';if(reset){filter.innerHTML='<option value="">全部 App</option>';for(const s of d.sourceApps||[]){const o=document.createElement('option');o.value=s.id;o.textContent=s.label+' ('+s.count+')';filter.append(o)}if(d.filter)filter.value=d.filter;list.replaceChildren()}for(const tx of d.transactions||[])list.append(row(tx));if(!list.children.length)list.innerHTML='<div class="empty">目前沒有電池出入紀錄</div>';cursor=d.nextCursor||null;more.hidden=!cursor}catch(e){list.innerHTML='<div class="empty">'+String(e.message||'讀取失敗')+'</div>';more.hidden=true}finally{busy=false;more.disabled=false}}filter.addEventListener('change',()=>load(true));more.addEventListener('click',()=>load(false));load(true)})();
  </script></body></html>`, { headers: { 'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow, noarchive','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" }});
}

const CLIENT_SOURCE = `(()=>{
  if(window.__starryV245)return;window.__starryV245=true;
  const q=(s,r=document)=>r.querySelector(s);
  async function api(path,opt={}){const r=await fetch(path,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'操作失敗');return d}
  let sessionId='',lastTarget='',loading=false,visibility=null;
  const balanceCache=new Map();
  const BOOT_DELAYS=[0,180,500,1200];
  function targetId(){return q('.member-item.active')?.dataset?.id||sessionId||''}
  function eyeSvg(visible){return visible?'👁':'⊘'}
  function paintEye(button,visible){const next=visible?'1':'0';if(button.dataset.visible!==next)button.dataset.visible=next;const off=!visible;if(button.classList.contains('visibility-off')!==off)button.classList.toggle('visibility-off',off);const icon=eyeSvg(visible);if(button.textContent!==icon)button.textContent=icon}
  function feedback(button,label,visible){q('.v245-feedback')?.remove();const p=document.createElement('div');p.className='v241-eye-feedback v245-feedback';p.textContent=(visible?'已開啟':'已關閉')+label;document.body.append(p);const r=button.getBoundingClientRect(),b=p.getBoundingClientRect();p.style.left=Math.max(8,Math.min(innerWidth-b.width-8,r.right+8))+'px';p.style.top=Math.max(8,Math.min(innerHeight-b.height-8,r.bottom+8))+'px';setTimeout(()=>p.remove(),2000)}
  async function toggleBatteryEye(button){const before=button.dataset.visible!=='0',next=!before;paintEye(button,next);feedback(button,'電池數量',next);try{const d=await api('/api/card-settings',{method:'PUT',body:JSON.stringify({visibility:{battery:next}})});visibility=d.visibility||visibility}catch{paintEye(button,before)}}
  function upsert(root,value,own){let card=q('.field[data-v245-battery="1"]',root);if(!card){card=document.createElement('div');card.className='field readonly v242-readonly';card.dataset.v245Battery='1';card.dataset.field='v245Battery';const l=document.createElement('div');l.className='field-label';l.textContent='電池數量';const v=document.createElement('div');v.className='field-value';const hint=document.createElement('div');hint.className='field-hint';hint.textContent='中央電池餘額，無法手動修改';card.append(l,v,hint);root.append(card)}const v=q('.field-value',card);const nextText=String(value)+' 顆';if(v&&v.textContent!==nextText)v.textContent=nextText;if(v?.classList.contains('empty'))v.classList.remove('empty');let eye=q('.v245-battery-eye',card);if(own){const visibleNow=visibility?.battery!==false;if(!eye){eye=document.createElement('button');eye.type='button';eye.className='v241-eye v245-battery-eye';eye.dataset.v241Eye='1';eye.title='控制電池數量是否顯示在公開名片';eye.onclick=e=>{e.preventDefault();e.stopPropagation();void toggleBatteryEye(eye)};card.append(eye)}paintEye(eye,visibleNow)}else eye?.remove()}
  async function syncBattery(force=false){const root=q('#fields');const target=targetId();if(!root||!sessionId||!target||loading)return;const own=target===sessionId;if(lastTarget!==target){lastTarget=target;visibility=null}loading=true;try{if(own&&!visibility){const s=await api('/api/card-settings');visibility=s.visibility||{}}let data=force?null:balanceCache.get(target);if(!data){data=await api('/api/battery-ledger/summary?targetUserId='+encodeURIComponent(target));balanceCache.set(target,data)}upsert(root,data.balance,own)}catch{}finally{loading=false}}
  function finiteSync(force=false){for(const delay of BOOT_DELAYS)setTimeout(()=>void syncBattery(force),delay)}
  document.addEventListener('click',e=>{const member=e.target?.closest?.('.member-item');if(member){const id=member.dataset?.id||'';if(id)balanceCache.delete(id);lastTarget='';finiteSync(true)}if(!e.target?.closest?.('.v245-battery-eye'))q('.v245-feedback')?.remove()},true);
  window.addEventListener('pageshow',()=>finiteSync(false),{once:true});
  api('/api/session').then(d=>{sessionId=d.user?.id||'';finiteSync(false)}).catch(()=>undefined);
})();`;

export async function handleStarryIdV245Battery(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN) return null;
  if (url.pathname === '/starry-id-v230.js' && request.method === 'GET') return stabilizedV230Client(request, env);
  if (url.pathname === '/starry-id-v245.js' && request.method === 'GET') return new Response(CLIENT_SOURCE,{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
  if (url.pathname === '/battery-ledger' && request.method === 'GET') {
    const session = await sessionContext(request, env);
    if (!session) return Response.redirect(new URL('/', request.url).toString(), 302);
    return ledgerPage();
  }
  if (url.pathname === '/api/battery-ledger/summary' && request.method === 'GET') return summary(request, env);
  if (url.pathname === '/api/battery-ledger' && request.method === 'GET') return history(request, env);
  return null;
}

async function batteryVisibility(db: any, userId: string) {
  const row: any = await db.prepare("SELECT isVisible FROM profile_field_visibility WHERE userId=? AND fieldName='battery' LIMIT 1").bind(userId).first().catch(() => null);
  return row ? Boolean(row.isVisible) : true;
}

async function setBatteryVisibility(request: Request, env: Env) {
  if (request.method.toUpperCase() !== 'PUT') return;
  const input: any = await request.clone().json().catch(() => null);
  if (!input?.visibility || !Object.prototype.hasOwnProperty.call(input.visibility,'battery')) return;
  const session = await sessionContext(request, env);
  if (!session) return;
  const db = (env as any).STARRY_ID_DB;
  await db.prepare(`INSERT INTO profile_field_visibility(userId,fieldName,isVisible,updatedAt) VALUES (?,'battery',?,?)
    ON CONFLICT(userId,fieldName) DO UPDATE SET isVisible=excluded.isVisible,updatedAt=excluded.updatedAt`)
    .bind(session.userId, input.visibility.battery ? 1 : 0, Date.now()).run();
}

async function enhanceCardSettings(request: Request, response: Response, env: Env) {
  if (!response.ok) return response;
  await setBatteryVisibility(request, env);
  const data: any = await response.clone().json().catch(() => null);
  if (!data) return response;
  const session = await sessionContext(request, env);
  if (!session) return response;
  const db = (env as any).STARRY_ID_DB;
  data.visibility = { ...(data.visibility || {}), battery: await batteryVisibility(db, session.userId) };
  const headers = new Headers(response.headers);headers.delete('Content-Length');headers.set('Content-Type','application/json; charset=utf-8');
  return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
}

async function enhancePublicCard(request: Request, response: Response, env: Env) {
  const url = new URL(request.url);
  const slug = decodeURIComponent(url.pathname.replace(/^\//,'')).trim();
  if (!slug || slug.includes('/') || ['my-card','notifications','battery-ledger'].includes(slug)) return response;
  const db = (env as any).STARRY_ID_DB;
  if (!db) return response;
  const owner: any = await db.prepare('SELECT userId FROM public_cards WHERE slug=? LIMIT 1').bind(slug).first().catch(() => null);
  const userId = text(owner?.userId);if (!userId || !await batteryVisibility(db,userId)) return response;
  await ensureSchema(env);
  const units = await balanceUnits(db,userId);
  let html = await response.text();
  const field = `<div class="field"><div class="label">電池數量</div><div class="value">${escapeHtml(formatBattery(units))} 顆</div></div>`;
  html = html.replace('<div class="fields">','<div class="fields">'+field);
  const headers = new Headers(response.headers);headers.delete('Content-Length');
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
}

export async function enhanceStarryIdV245Response(request: Request, response: Response, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN) return response;
  const type = response.headers.get('Content-Type') || '';
  if (url.pathname === '/api/card-settings' && type.includes('application/json')) return enhanceCardSettings(request,response,env);
  if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/my-card') && type.includes('text/html')) {
    let html = await response.text();
    if (!html.includes('/starry-id-v245.js')) html = html.replace('</body>','<script src="/starry-id-v245.js"></script></body>');
    const headers = new Headers(response.headers);headers.delete('Content-Length');
    return new Response(html,{status:response.status,statusText:response.statusText,headers});
  }
  if (request.method === 'GET' && type.includes('text/html')) return enhancePublicCard(request,response,env);
  return response;
}