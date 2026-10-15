import { handleStarryIdV211 } from './starryIdV211Router';
import type { Env } from './index';

type StarryV212Env = Env & { STARRY_ID_DB?: any; STARRY_ID_SUPER_ADMIN_EMAILS?: string };

const STAR_DOMAIN = 'id.starry.phd';
const AMWAY_ID_RE = /^[0-9]+$/;
const SESSION_COOKIE = 'starry_id_session';
const TOKEN_RE = /^[A-Za-z0-9_-]{30,}$/;
const DEFAULT_SUPER_ADMIN_EMAILS = ['yukidu@gmail.com'];
const CARD_LAYOUT_FIELDS = [
  'name','amwayId','email','phone','residence','center','rank','joinReason','stayReason',
  'birthday','motto','zodiac','talentNumber','lifeNumber','sponsor','platinumUpline','diamondUpline','spouse'
] as const;
const LABEL_TO_KEY: Record<string,string> = {
  '姓名':'name','會員編號 / Amway ID':'amwayId','電子名片編號':'cardNumber','Email':'email','手機':'phone','電話':'phone',
  '居住地':'residence','中心':'center','獎銜':'rank','初次如何認識安麗？':'joinReason','什麼原因留在安麗？':'stayReason',
  '生日':'birthday','座右銘':'motto','星座':'zodiac','天賦數':'talentNumber','生命靈數':'lifeNumber','推薦人':'sponsor',
  '白金上線':'platinumUpline','鑽石上線':'diamondUpline','夫妻關係':'spouse'
};
const layoutSchemaReady = new WeakMap<object, Promise<void>>();

function text(value: unknown) {
  return value == null ? '' : String(value).trim();
}
function lower(value: unknown) { return text(value).toLowerCase(); }
function clampColumns(value: unknown) {
  const n = Math.trunc(Number(value));
  return n >= 1 && n <= 3 ? n : 1;
}
function normalizeOrder(value: unknown) {
  let raw: unknown[] = [];
  if (Array.isArray(value)) raw = value;
  else if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) raw = parsed; } catch {}
  }
  const allowed = new Set<string>(CARD_LAYOUT_FIELDS as readonly string[]);
  const out: string[] = [];
  for (const item of raw) {
    const key = text(item) === 'cardNumber' ? 'amwayId' : text(item);
    if (allowed.has(key) && !out.includes(key)) out.push(key);
  }
  for (const key of CARD_LAYOUT_FIELDS) if (!out.includes(key)) out.push(key);
  return out;
}
function cookieValue(request: Request, name: string) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const [key,...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}
async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2,'0')).join('');
}
async function currentUserId(request: Request, db: any) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!TOKEN_RE.test(token)) return '';
  const row: any = await db.prepare('SELECT userId,expiresAt FROM auth_sessions WHERE tokenHash=? LIMIT 1').bind(await hashToken(token)).first();
  if (!row || Number(row.expiresAt || 0) <= Date.now()) return '';
  return text(row.userId);
}
async function ensureLayoutSchema(db: any) {
  const key = db as object;
  if (!layoutSchemaReady.has(key)) {
    const task = (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS public_card_layouts (
        userId TEXT PRIMARY KEY,
        fieldOrder TEXT NOT NULL,
        mobileColumns INTEGER NOT NULL DEFAULT 1 CHECK(mobileColumns BETWEEN 1 AND 3),
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      )`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS public_card_layout_defaults (
        id INTEGER PRIMARY KEY CHECK(id=1),
        fieldOrder TEXT NOT NULL,
        mobileColumns INTEGER NOT NULL DEFAULT 1 CHECK(mobileColumns BETWEEN 1 AND 3),
        updatedBy TEXT,
        updatedAt INTEGER NOT NULL
      )`).run();
    })();
    layoutSchemaReady.set(key, task);
    task.catch(() => layoutSchemaReady.delete(key));
  }
  await layoutSchemaReady.get(key);
}
async function readLayout(db: any, userId: string) {
  await ensureLayoutSchema(db);
  const personal: any = userId ? await db.prepare('SELECT fieldOrder,mobileColumns FROM public_card_layouts WHERE userId=? LIMIT 1').bind(userId).first() : null;
  const global: any = personal ? null : await db.prepare('SELECT fieldOrder,mobileColumns FROM public_card_layout_defaults WHERE id=1 LIMIT 1').first();
  const row = personal || global || {};
  return {
    fieldOrder: normalizeOrder(row.fieldOrder),
    mobileColumns: clampColumns(row.mobileColumns),
    source: personal ? 'personal' : global ? 'global' : 'built-in'
  };
}
async function writeLayout(db: any, userId: string, layout: any) {
  await ensureLayoutSchema(db);
  const current = await readLayout(db, userId);
  const fieldOrder = normalizeOrder(layout?.fieldOrder ?? current.fieldOrder);
  const mobileColumns = clampColumns(layout?.mobileColumns ?? current.mobileColumns);
  await db.prepare(`INSERT INTO public_card_layouts (userId,fieldOrder,mobileColumns,updatedAt)
    VALUES (?,?,?,?) ON CONFLICT(userId) DO UPDATE SET fieldOrder=excluded.fieldOrder,mobileColumns=excluded.mobileColumns,updatedAt=excluded.updatedAt`)
    .bind(userId, JSON.stringify(fieldOrder), mobileColumns, Date.now()).run();
  return { fieldOrder, mobileColumns, source:'personal' };
}
async function isSuperAdmin(db: any, userId: string, env: StarryV212Env) {
  if (!userId) return false;
  const row: any = await db.prepare(`SELECT u.primaryEmail,a.role
    FROM users u LEFT JOIN app_memberships a ON a.userId=u.id AND a.appId='starry-id'
    WHERE u.id=? LIMIT 1`).bind(userId).first();
  const configured = text(env.STARRY_ID_SUPER_ADMIN_EMAILS)
    ? text(env.STARRY_ID_SUPER_ADMIN_EMAILS).split(',').map(lower)
    : DEFAULT_SUPER_ADMIN_EMAILS.map(lower);
  return row?.role === 'super-admin' || configured.includes(lower(row?.primaryEmail));
}
async function writeGlobalDefault(db: any, userId: string, layout: any) {
  const current = await readLayout(db, userId);
  const fieldOrder = normalizeOrder(layout?.fieldOrder ?? current.fieldOrder);
  const mobileColumns = clampColumns(layout?.mobileColumns ?? current.mobileColumns);
  await db.prepare(`INSERT INTO public_card_layout_defaults (id,fieldOrder,mobileColumns,updatedBy,updatedAt)
    VALUES (1,?,?,?,?) ON CONFLICT(id) DO UPDATE SET fieldOrder=excluded.fieldOrder,mobileColumns=excluded.mobileColumns,updatedBy=excluded.updatedBy,updatedAt=excluded.updatedAt`)
    .bind(JSON.stringify(fieldOrder), mobileColumns, userId, Date.now()).run();
  return { fieldOrder, mobileColumns };
}

/**
 * v212 only fills the legacy-member gap for numeric Amway-ID public URLs.
 * Existing n1/n2/... cards and every API route stay entirely in v211.
 */
export function v212PublicAmwaySlug(request: Request) {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN || request.method.toUpperCase() !== 'GET') return '';
  if (url.pathname === '/' || url.pathname.startsWith('/api/')) return '';

  let raw = '';
  try {
    raw = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ''));
  } catch {
    return '';
  }

  if (!raw || raw.includes('/') || !AMWAY_ID_RE.test(raw)) return '';
  return raw;
}

async function findUniqueActiveMember(db: any, amwayId: string) {
  const result: any = await db.prepare(`SELECT u.id,p.amwayId
    FROM users u
    JOIN profiles p ON p.userId=u.id
    WHERE u.status='active' AND TRIM(COALESCE(p.amwayId,''))=?
    LIMIT 2`).bind(amwayId).all();
  const rows = result?.results || [];
  if (rows.length !== 1 || text(rows[0].amwayId) !== amwayId) return null;
  return rows[0];
}

async function materializeCard(db: any, member: any, slug: string) {
  const collision: any = await db.prepare(
    'SELECT userId FROM public_cards WHERE slug=? LIMIT 1'
  ).bind(slug).first();
  if (collision && text(collision.userId) !== text(member.id)) return false;

  let card: any = await db.prepare(
    'SELECT seq,userId,slug,cardNumber FROM public_cards WHERE userId=? LIMIT 1'
  ).bind(member.id).first();

  const now = Date.now();
  if (card) {
    if (text(card.slug) !== slug) {
      await db.prepare('UPDATE public_cards SET slug=?,updatedAt=? WHERE userId=?')
        .bind(slug, now, member.id).run();
    }
    return true;
  }

  const pending = `pending-${crypto.randomUUID()}`;
  try {
    await db.prepare(
      'INSERT INTO public_cards (userId,slug,cardNumber,createdAt,updatedAt) VALUES (?,?,?,?,?)'
    ).bind(member.id, pending, pending, now, now).run();
  } catch {
    // Two first-time public requests can race. The unique userId constraint makes
    // one win; the losing request simply reloads the row below.
  }

  card = await db.prepare(
    'SELECT seq,userId,slug,cardNumber FROM public_cards WHERE userId=? LIMIT 1'
  ).bind(member.id).first();
  if (!card) return false;

  const number = /^n[1-9][0-9]*$/.test(text(card.cardNumber))
    ? text(card.cardNumber)
    : `n${Number(card.seq)}`;

  const slugCollision: any = await db.prepare(
    'SELECT userId FROM public_cards WHERE slug=? LIMIT 1'
  ).bind(slug).first();
  if (slugCollision && text(slugCollision.userId) !== text(member.id)) return false;

  await db.prepare('UPDATE public_cards SET slug=?,cardNumber=?,updatedAt=? WHERE userId=?')
    .bind(slug, number, now, member.id).run();
  return true;
}

function responseWithBody(response: Response, body: string, contentType?: string, status = response.status) {
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  if (contentType) headers.set('Content-Type', contentType);
  return new Response(body, { status, statusText:status === response.status ? response.statusText : '', headers });
}

async function enhanceCardSettings(request: Request, env: StarryV212Env, response: Response) {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN || url.pathname !== '/api/card-settings' || !env.STARRY_ID_DB || !response.ok) return response;
  const userId = await currentUserId(request, env.STARRY_ID_DB);
  if (!userId) return response;
  try {
    const method = request.method.toUpperCase();
    const input: any = method === 'PUT' ? await request.clone().json().catch(()=>({})) : {};
    let layout = await readLayout(env.STARRY_ID_DB, userId);
    if (method === 'PUT' && input.layout && typeof input.layout === 'object') {
      layout = await writeLayout(env.STARRY_ID_DB, userId, input.layout);
    }
    const superAdmin = await isSuperAdmin(env.STARRY_ID_DB, userId, env);
    if (method === 'PUT' && input.setAsGlobalDefault === true) {
      if (!superAdmin) return responseWithBody(response, JSON.stringify({error:'只有超級管理員可以設定全體預設值'}), 'application/json; charset=utf-8', 403);
      await writeGlobalDefault(env.STARRY_ID_DB, userId, input.layout || layout);
    }
    const data: any = await response.clone().json().catch(()=>null);
    if (!data || typeof data !== 'object') return response;
    data.layout = layout;
    data.isSuperAdmin = superAdmin;
    return responseWithBody(response, JSON.stringify(data), 'application/json; charset=utf-8');
  } catch (error) {
    console.warn('Starry ID v252 card layout settings:', error);
    return response;
  }
}

function fastLoadPrelude() {
  return `<script id="v252-fast-load">(()=>{const nativeFetch=window.fetch.bind(window),cache=new Map();function keyOf(input,init){try{const u=new URL(typeof input==='string'?input:input.url,location.href);const method=String(init?.method||(typeof input!=='string'&&input.method)||'GET').toUpperCase();if(method!=='GET'||u.origin!==location.origin)return'';if(u.pathname!=='/api/session'&&u.pathname!=='/api/card-settings')return'';return u.pathname+u.search}catch{return''}}window.fetch=(input,init)=>{const key=keyOf(input,init);if(!key)return nativeFetch(input,init);let entry=cache.get(key);if(!entry){const promise=nativeFetch(input,init);entry={promise};cache.set(key,entry);promise.finally(()=>setTimeout(()=>{if(cache.get(key)===entry)cache.delete(key)},1800))}return entry.promise.then(r=>r.clone())};try{window.__v252WarmCardSettings=window.fetch('/api/card-settings',{credentials:'same-origin'}).catch(()=>null)}catch{}})();</script>`;
}

function memberLayoutStyle() {
  return `<style id="v252-layout-style">
    .v252-layout-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:12px 0 14px;padding:10px 12px;border:1px solid #314869;border-radius:14px;background:#0d192d}.v252-layout-hint{font-size:13px;color:#b9c8df;margin-right:auto}.v252-layout-bar label{display:flex;align-items:center;gap:7px;font-size:13px}.v252-layout-bar select{border:1px solid #516b93;background:#14243c;color:#fff;border-radius:9px;padding:7px 9px}.v252-drag-handle{position:absolute;left:7px;top:7px;z-index:3;width:29px;height:29px;border:1px solid #3b557a;border-radius:9px;background:#172742;color:#b9c9df;display:grid;place-items:center;cursor:grab;touch-action:none;font-size:15px;line-height:1}.v252-drag-handle:active{cursor:grabbing}.v216-preview-field{position:relative;padding-left:43px!important}.v252-dragging{opacity:.55;outline:2px solid #8eb1ee}.v216-preview-grid{--v252-mobile-columns:1}.v252-default-btn{white-space:nowrap}
    html[data-starry-theme="light"] .v252-layout-bar{background:#f7faff;border-color:#c5d1e0;color:#14213d}html[data-starry-theme="light"] .v252-layout-bar select,html[data-starry-theme="light"] .v252-drag-handle{background:#fff;color:#14213d;border-color:#b8c8dd}
    @media(max-width:760px){.v216-preview-grid{grid-template-columns:repeat(var(--v252-mobile-columns,1),minmax(0,1fr))!important}.v252-layout-bar{align-items:stretch}.v252-layout-hint{width:100%;margin-right:0}.v252-layout-bar label{flex:1}.v252-layout-bar select{flex:1}.v216-preview-field{min-width:0;padding-left:38px!important;padding-right:8px!important}.v252-drag-handle{left:5px;top:6px;width:27px;height:27px}}
  </style>`;
}

function memberLayoutScript() {
  const labels = JSON.stringify(LABEL_TO_KEY);
  return `<script id="v252-layout-script">(()=>{if(location.pathname!=='/my-card')return;const LABELS=${labels};let settings=null,drag=null,busy=false;const q=(s,r=document)=>r.querySelector(s);async function api(opt={}){const r=await fetch('/api/card-settings',{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'操作失敗');return d}function notify(msg,error=false){const t=q('#toast');if(t){t.textContent=msg;t.className='toast'+(error?' error':'');clearTimeout(notify.t);notify.t=setTimeout(()=>t.classList.add('hidden'),2400)}}function orderIndex(key){const order=settings?.layout?.fieldOrder||[];const effective=key==='cardNumber'?'amwayId':key;const i=order.indexOf(effective);return i<0?999:i}function identify(field){if(field.dataset.v252Key)return field.dataset.v252Key;const label=q('.v216-preview-label',field)?.textContent?.trim()||'';const key=LABELS[label]||'';if(key)field.dataset.v252Key=key==='cardNumber'?'amwayId':key;return field.dataset.v252Key||''}function grid(){return q('.v216-preview-grid')}function apply(){const g=grid();if(!g||!settings?.layout)return false;g.style.setProperty('--v252-mobile-columns',String(settings.layout.mobileColumns||1));const items=Array.from(g.children).filter(el=>el.classList?.contains('v216-preview-field'));items.forEach(identify);items.sort((a,b)=>orderIndex(identify(a))-orderIndex(identify(b))).forEach(el=>g.appendChild(el));for(const field of items){if(q('.v252-drag-handle',field))continue;const h=document.createElement('button');h.type='button';h.className='v252-drag-handle';h.textContent='⋮⋮';h.title='拖曳調整欄位位置';h.setAttribute('aria-label','拖曳調整欄位位置');field.prepend(h)}installBar();return true}function installBar(){const page=q('#myCardPage'),g=grid();if(!page||!g||q('#v252LayoutBar'))return;const bar=document.createElement('div');bar.id='v252LayoutBar';bar.className='v252-layout-bar';const hint=document.createElement('div');hint.className='v252-layout-hint';hint.textContent='按住 ⋮⋮ 拖曳欄位，公開名片會同步位置';const label=document.createElement('label');label.append('手機每列');const select=document.createElement('select');select.setAttribute('aria-label','手機每列欄位數');for(const n of [1,2,3]){const o=document.createElement('option');o.value=String(n);o.textContent=n+' 欄';if(Number(settings.layout.mobileColumns)===n)o.selected=true;select.appendChild(o)}select.onchange=async()=>{settings.layout.mobileColumns=Number(select.value);g.style.setProperty('--v252-mobile-columns',select.value);await save(false)};label.appendChild(select);bar.append(hint,label);if(settings.isSuperAdmin){const b=document.createElement('button');b.type='button';b.className='btn v252-default-btn';b.textContent='設定為全體預設值';b.onclick=async()=>{if(busy)return;b.disabled=true;try{await save(true);notify('已設定為全體預設值')}catch(e){notify(e.message||'設定失敗',true)}finally{b.disabled=false}};bar.appendChild(b)}g.parentElement?.insertBefore(bar,g)}function currentOrder(){const keys=Array.from(grid()?.children||[]).map(el=>identify(el)).filter(Boolean);const old=settings.layout.fieldOrder||[];return [...keys,...old.filter(k=>!keys.includes(k))]}async function save(asDefault){if(busy)return;busy=true;settings.layout.fieldOrder=currentOrder();try{const d=await api({method:'PUT',body:JSON.stringify({layout:{fieldOrder:settings.layout.fieldOrder,mobileColumns:settings.layout.mobileColumns},setAsGlobalDefault:Boolean(asDefault)})});settings.layout=d.layout||settings.layout;if(!asDefault)notify('名片版面已同步')}finally{busy=false}}function endDrag(){if(!drag)return;drag.field.classList.remove('v252-dragging');try{drag.handle.releasePointerCapture(drag.pointerId)}catch{}drag=null;save(false).catch(e=>notify(e.message||'版面儲存失敗',true))}document.addEventListener('pointerdown',e=>{const h=e.target?.closest?.('.v252-drag-handle');if(!h)return;const field=h.closest('.v216-preview-field'),g=grid();if(!field||field.parentElement!==g)return;e.preventDefault();drag={field,handle:h,pointerId:e.pointerId};field.classList.add('v252-dragging');try{h.setPointerCapture(e.pointerId)}catch{}},{capture:true});document.addEventListener('pointermove',e=>{if(!drag)return;e.preventDefault();const target=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('.v216-preview-field');const g=grid();if(!target||target===drag.field||target.parentElement!==g)return;const r=target.getBoundingClientRect();const before=e.clientY<r.top+r.height/2;g.insertBefore(drag.field,before?target:target.nextSibling)},{capture:true});document.addEventListener('pointerup',endDrag,{capture:true});document.addEventListener('pointercancel',endDrag,{capture:true});async function start(){try{settings=await api();for(const delay of [0,80,180,350,700,1300,2400,4000])setTimeout(apply,delay)}catch(e){notify(e.message||'名片版面讀取失敗',true)}}start()})();</script>`;
}

async function enhanceMemberCenter(request: Request, response: Response) {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN || request.method.toUpperCase() !== 'GET' || (url.pathname !== '/' && url.pathname !== '/my-card')) return response;
  if (!(response.headers.get('Content-Type') || '').includes('text/html')) return response;
  const html = await response.text();
  const enhanced = html
    .replace('</head>', fastLoadPrelude() + memberLayoutStyle() + '</head>')
    .replace('</body>', memberLayoutScript() + '</body>');
  return responseWithBody(response, enhanced, 'text/html; charset=utf-8');
}

async function enhancePublicCard(request: Request, env: StarryV212Env, response: Response) {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN || request.method.toUpperCase() !== 'GET' || !env.STARRY_ID_DB) return response;
  if (url.pathname === '/' || url.pathname === '/my-card' || url.pathname.startsWith('/api/')) return response;
  if (!response.ok || !(response.headers.get('Content-Type') || '').includes('text/html')) return response;
  let slug = '';
  try { slug = lower(decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g,''))); } catch { return response; }
  if (!slug || slug.includes('/')) return response;
  try {
    const card: any = await env.STARRY_ID_DB.prepare('SELECT userId FROM public_cards WHERE slug=? LIMIT 1').bind(slug).first();
    if (!card?.userId) return response;
    const layout = await readLayout(env.STARRY_ID_DB, text(card.userId));
    const order = layout.fieldOrder;
    let html = await response.text();
    for (const [label,key] of Object.entries(LABEL_TO_KEY)) {
      const effectiveKey = key === 'cardNumber' ? 'amwayId' : key;
      const index = order.indexOf(effectiveKey);
      const from = `<div class="field"><div class="label">${label}</div>`;
      const to = `<div class="field" data-v252-key="${effectiveKey}" style="order:${index < 0 ? 999 : index}"><div class="label">${label}</div>`;
      html = html.split(from).join(to);
    }
    const style = `<style id="v252-public-layout">@media(max-width:560px){.fields{grid-template-columns:repeat(${layout.mobileColumns},minmax(0,1fr))!important}}</style>`;
    html = html.replace('</head>', style + '</head>');
    return responseWithBody(response, html, 'text/html; charset=utf-8');
  } catch (error) {
    console.warn('Starry ID v252 public-card layout:', error);
    return response;
  }
}

/**
 * Called after v211 returns. Besides keeping the original v212 legacy-card bridge,
 * v252 adds member-owned card ordering/mobile density and keeps public rendering in sync.
 */
export async function handleStarryIdV212PublicCardFallback(
  request: Request,
  env: StarryV212Env,
  v211Response: Response
): Promise<Response | null> {
  let response = v211Response;
  if (response.status === 404 && env.STARRY_ID_DB) {
    const slug = v212PublicAmwaySlug(request);
    if (slug) {
      try {
        const member = await findUniqueActiveMember(env.STARRY_ID_DB, slug);
        if (member) {
          const ready = await materializeCard(env.STARRY_ID_DB, member, slug);
          if (ready) {
            const rendered = await handleStarryIdV211(request, env);
            if (rendered && rendered.status !== 404) response = rendered;
          }
        }
      } catch (error) {
        console.warn('Starry ID v212 public-card fallback:', error);
      }
    }
  }

  response = await enhanceCardSettings(request, env, response);
  response = await enhanceMemberCenter(request, response);
  response = await enhancePublicCard(request, env, response);
  return response;
}
