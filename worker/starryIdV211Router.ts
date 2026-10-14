import { handleStarryIdCentral } from './starryIdCentralRouter';
import { renderStarryIdMemberCenterPage } from './starryIdMemberCenterPage';
import { enhanceStarryIdMemberCenterV216 } from './starryIdV216Enhancer';
import type { Env } from './index';

type StarryEnv = Env & { STARRY_ID_DB?: any; STARRY_ID_GOOGLE_CLIENT_ID?: string };

const STAR_DOMAIN = 'id.starry.phd';
const SESSION_COOKIE = 'starry_id_session';
const TOKEN_RE = /^[A-Za-z0-9_-]{30,}$/;
const DEFAULT_GOOGLE_CLIENT_ID = '661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com';
const RESERVED_SLUGS = new Set(['api','robots.txt','login','logout','admin','my-card','manifest.webmanifest','favicon.ico','assets']);
const PUBLIC_FIELDS = ['name','email','avatar','amwayId','cardNumber','residence','center','rank','motto','zodiac','talentNumber','lifeNumber','sponsor','platinumUpline','diamondUpline','phone','birthday','numerology','spouse'] as const;
const DEFAULT_HIDDEN = new Set(['phone','birthday','spouse']);
const schemaReady = new WeakMap<object, Promise<void>>();

function text(value: unknown) { return value == null ? '' : String(value).trim(); }
function lower(value: unknown) { return text(value).toLowerCase(); }
function escapeHtml(value: unknown) { return text(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c)); }
function slugify(value: unknown) {
  const result = lower(value).normalize('NFKC').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0,64);
  return RESERVED_SLUGS.has(result) ? '' : result;
}
function cardNumber(value: unknown) {
  const normalized = lower(value);
  if (!/^n[1-9][0-9]*$/.test(normalized)) throw new Error('invalid_card_number');
  return normalized;
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2,'0')).join('');
}
function cookieValue(request: Request, name: string) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const [key,...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}
async function currentUserId(request: Request, db: any) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!TOKEN_RE.test(token)) return '';
  const tokenHash = await hashToken(token);
  const row: any = await db.prepare('SELECT userId,expiresAt FROM auth_sessions WHERE tokenHash=? LIMIT 1').bind(tokenHash).first();
  if (!row || Number(row.expiresAt || 0) <= Date.now()) return '';
  return text(row.userId);
}

async function ensureSchema(db: any) {
  const key = db as object;
  if (!schemaReady.has(key)) {
    const task = (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS public_cards (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL UNIQUE,
        slug TEXT NOT NULL UNIQUE,
        cardNumber TEXT NOT NULL UNIQUE,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      )`).run();
      await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS public_cards_slug ON public_cards(slug)').run();
      await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS public_cards_number ON public_cards(cardNumber)').run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS profile_field_visibility (
        userId TEXT NOT NULL,
        fieldName TEXT NOT NULL,
        isVisible INTEGER NOT NULL DEFAULT 1,
        updatedAt INTEGER NOT NULL,
        PRIMARY KEY(userId,fieldName),
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      )`).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS profile_field_visibility_user ON profile_field_visibility(userId)').run();
    })();
    schemaReady.set(key, task);
    task.catch(() => schemaReady.delete(key));
  }
  await schemaReady.get(key);
}

const memberSelect = `SELECT u.id,u.primaryEmail,u.status,p.name,p.avatar,p.googleAvatar,p.amwayId,p.phone,p.residence,p.center,p.rank,p.approvedRank,p.birthday,p.motto,p.zodiac,p.talentNumber,p.lifeNumber,
COALESCE((SELECT NULLIF(TRIM(rp.name),'') FROM member_relationships mr LEFT JOIN profiles rp ON rp.userId=mr.relatedUserId WHERE mr.userId=u.id AND mr.relationType='sponsor' LIMIT 1),(SELECT mr.legacyLabel FROM member_relationships mr WHERE mr.userId=u.id AND mr.relationType='sponsor' LIMIT 1),'') AS sponsor,
COALESCE((SELECT NULLIF(TRIM(rp.name),'')||COALESCE((SELECT '&'||TRIM(sp.name) FROM spouse_links sl JOIN profiles sp ON sp.userId=CASE WHEN sl.userA=rp.userId THEN sl.userB ELSE sl.userA END WHERE sl.status='active' AND (sl.userA=rp.userId OR sl.userB=rp.userId) LIMIT 1),'') FROM member_relationships mr LEFT JOIN profiles rp ON rp.userId=mr.relatedUserId WHERE mr.userId=u.id AND mr.relationType='platinum_upline' LIMIT 1),(SELECT mr.legacyLabel FROM member_relationships mr WHERE mr.userId=u.id AND mr.relationType='platinum_upline' LIMIT 1),'') AS platinumUpline,
COALESCE((SELECT NULLIF(TRIM(rp.name),'')||COALESCE((SELECT '&'||TRIM(sp.name) FROM spouse_links sl JOIN profiles sp ON sp.userId=CASE WHEN sl.userA=rp.userId THEN sl.userB ELSE sl.userA END WHERE sl.status='active' AND (sl.userA=rp.userId OR sl.userB=rp.userId) LIMIT 1),'') FROM member_relationships mr LEFT JOIN profiles rp ON rp.userId=mr.relatedUserId WHERE mr.userId=u.id AND mr.relationType='diamond_upline' LIMIT 1),(SELECT mr.legacyLabel FROM member_relationships mr WHERE mr.userId=u.id AND mr.relationType='diamond_upline' LIMIT 1),'') AS diamondUpline
FROM users u LEFT JOIN profiles p ON p.userId=u.id`;

async function readMember(db: any, userId: string) { return db.prepare(`${memberSelect} WHERE u.id=? LIMIT 1`).bind(userId).first(); }
async function readVisibility(db: any, userId: string) {
  const result: any = await db.prepare('SELECT fieldName,isVisible FROM profile_field_visibility WHERE userId=?').bind(userId).all();
  const visibility: Record<string, boolean> = {};
  for (const field of PUBLIC_FIELDS) visibility[field] = !DEFAULT_HIDDEN.has(field);
  for (const row of result?.results || []) if (PUBLIC_FIELDS.includes(row.fieldName)) visibility[row.fieldName] = Boolean(row.isVisible);
  return visibility;
}
async function slugOwner(db: any, slug: string) { return db.prepare('SELECT userId FROM public_cards WHERE slug=? LIMIT 1').bind(slug).first(); }

async function ensureCard(db: any, member: any) {
  await ensureSchema(db);
  let row: any = await db.prepare('SELECT seq,userId,slug,cardNumber FROM public_cards WHERE userId=? LIMIT 1').bind(member.id).first();
  const now = Date.now();
  if (!row) {
    const temporary = `pending-${crypto.randomUUID()}`;
    await db.prepare('INSERT INTO public_cards (userId,slug,cardNumber,createdAt,updatedAt) VALUES (?,?,?,?,?)').bind(member.id,temporary,temporary,now,now).run();
    row = await db.prepare('SELECT seq,userId,slug,cardNumber FROM public_cards WHERE userId=? LIMIT 1').bind(member.id).first();
    const number = `n${Number(row.seq)}`;
    await db.prepare('UPDATE public_cards SET slug=?,cardNumber=?,updatedAt=? WHERE userId=?').bind(number,number,now,member.id).run();
    row.slug = number; row.cardNumber = number;
  }
  const amwaySlug = slugify(member.amwayId);
  const desired = amwaySlug || row.cardNumber;
  if (desired !== row.slug) {
    const owner: any = await slugOwner(db, desired);
    if (!owner || text(owner.userId) === text(member.id)) {
      await db.prepare('UPDATE public_cards SET slug=?,updatedAt=? WHERE userId=?').bind(desired,now,member.id).run();
      row.slug = desired;
    }
  }
  return row;
}

function memberPayload(member: any) {
  return {
    id: member.id, email: member.primaryEmail || '', name: member.name || '', avatar: member.avatar || member.googleAvatar || '',
    amwayId: member.amwayId || '', phone: member.phone || '', residence: member.residence || '', center: member.center || '',
    rank: member.approvedRank || member.rank || '', birthday: member.birthday || '', motto: member.motto || '', zodiac: member.zodiac || '',
    talentNumber: member.talentNumber ?? null, lifeNumber: member.lifeNumber ?? null, sponsor: member.sponsor || '',
    platinumUpline: member.platinumUpline || '', diamondUpline: member.diamondUpline || ''
  };
}

async function cardSettings(request: Request, env: StarryEnv) {
  const db = env.STARRY_ID_DB; if (!db) return json({error:'Starry ID service unavailable'},503);
  const userId = await currentUserId(request,db); if (!userId) return json({error:'請先登入 Starry ID'},401);
  const member: any = await readMember(db,userId); if (!member) return json({error:'找不到會員'},404);
  const card = await ensureCard(db,member);
  return json({ cardNumber: card.cardNumber, slug: card.slug, url:`https://${STAR_DOMAIN}/${card.slug}`, identifierLabel: text(member.amwayId) ? '會員編號 / Amway ID' : '電子名片編號', visibility: await readVisibility(db,userId) });
}

async function updateCardSettings(request: Request, env: StarryEnv) {
  const db = env.STARRY_ID_DB; if (!db) return json({error:'Starry ID service unavailable'},503);
  const userId = await currentUserId(request,db); if (!userId) return json({error:'請先登入 Starry ID'},401);
  const member: any = await readMember(db,userId); if (!member) return json({error:'找不到會員'},404);
  const card = await ensureCard(db,member);
  const input: any = await request.clone().json().catch(()=>({}));
  if (Object.prototype.hasOwnProperty.call(input,'cardNumber')) {
    if (text(member.amwayId)) return json({error:'安麗會員的網址使用會員編號 / Amway ID。'},409);
    let next = '';
    try { next = cardNumber(input.cardNumber); } catch { return json({error:'電子名片編號格式必須是 n 加上正整數，例如 n1。'},400); }
    const duplicate: any = await db.prepare('SELECT userId FROM public_cards WHERE (cardNumber=? OR slug=?) AND userId<>? LIMIT 1').bind(next,next,userId).first();
    if (duplicate) return json({error:'這個電子名片編號已被使用。'},409);
    await db.prepare('UPDATE public_cards SET cardNumber=?,slug=?,updatedAt=? WHERE userId=?').bind(next,next,Date.now(),userId).run();
  }
  if (input.visibility && typeof input.visibility === 'object') {
    const now = Date.now();
    const statements: any[] = [];
    for (const [field,value] of Object.entries(input.visibility)) {
      if (!PUBLIC_FIELDS.includes(field as any)) continue;
      statements.push(db.prepare(`INSERT INTO profile_field_visibility (userId,fieldName,isVisible,updatedAt) VALUES (?,?,?,?) ON CONFLICT(userId,fieldName) DO UPDATE SET isVisible=excluded.isVisible,updatedAt=excluded.updatedAt`).bind(userId,field,value ? 1 : 0,now));
    }
    if (statements.length) await db.batch(statements);
  }
  return cardSettings(request,env);
}

async function proxyProfileUpdate(request: Request, env: StarryEnv) {
  const db = env.STARRY_ID_DB; if (!db) return null;
  const userId = await currentUserId(request,db); if (!userId) return null;
  const body: any = await request.clone().json().catch(()=>({}));
  if (Object.prototype.hasOwnProperty.call(body,'amwayId')) {
    const desired = slugify(body.amwayId);
    if (text(body.amwayId) && !desired) return json({error:'會員編號無法作為網址，請只使用英文字母、數字、- 或 _。'},400);
    if (desired) {
      await ensureSchema(db);
      const owner: any = await slugOwner(db,desired);
      if (owner && text(owner.userId) !== userId) return json({error:'這個會員編號網址已被其他會員使用。'},409);
    }
  }
  const response = await handleStarryIdCentral(request,env as any);
  if (!response?.ok) return response;
  const data: any = await response.clone().json().catch(()=>null);
  if (data?.user?.id) {
    const member: any = await readMember(db,data.user.id);
    if (member) {
      const card = await ensureCard(db,member);
      data.cardUrl = `https://${STAR_DOMAIN}/${card.slug}`;
      const headers = new Headers(response.headers); headers.set('Content-Type','application/json; charset=utf-8');
      return new Response(JSON.stringify(data),{status:response.status,headers});
    }
  }
  return response;
}

function calculateNumerology(birthday: string) {
  const clean = text(birthday).replace(/[^0-9]/g,''); if (clean.length !== 8) return null;
  const month = Number(clean.slice(4,6)), day = Number(clean.slice(6,8)); if (month<1||month>12||day<1||day>31) return null;
  const digits = clean.split('').map(Number); const talentNumber = digits.reduce((a,b)=>a+b,0); let lifeNumber=talentNumber;
  while (lifeNumber>=10) lifeNumber=String(lifeNumber).split('').reduce((a,b)=>a+Number(b),0);
  const counts: Record<number,number>={1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0,9:0}; digits.forEach(d=>{if(d>=1&&d<=9)counts[d]++;});
  const talentDigits=String(talentNumber).split('').map(Number); let birthdayNumber=day; while(birthdayNumber>=10) birthdayNumber=String(birthdayNumber).split('').reduce((a,b)=>a+Number(b),0);
  const zodiac = ((month===3&&day>=21)||(month===4&&day<=19))?'牡羊座':((month===4&&day>=20)||(month===5&&day<=20))?'金牛座':((month===5&&day>=21)||(month===6&&day<=21))?'雙子座':((month===6&&day>=22)||(month===7&&day<=22))?'巨蟹座':((month===7&&day>=23)||(month===8&&day<=22))?'獅子座':((month===8&&day>=23)||(month===9&&day<=22))?'處女座':((month===9&&day>=23)||(month===10&&day<=23))?'天秤座':((month===10&&day>=24)||(month===11&&day<=22))?'天蠍座':((month===11&&day>=23)||(month===12&&day<=21))?'射手座':((month===12&&day>=22)||(month===1&&day<=19))?'摩羯座':((month===1&&day>=20)||(month===2&&day<=18))?'水瓶座':'雙魚座';
  const zodiacNumber: Record<string,number>={'牡羊座':1,'金牛座':2,'雙子座':3,'巨蟹座':4,'獅子座':5,'處女座':6,'天秤座':7,'天蠍座':8,'射手座':9,'摩羯座':1,'水瓶座':2,'雙魚座':3};
  return {talentNumber,lifeNumber,counts,talentDigits,birthdayNumber,zodiac,zodiacNumber:zodiacNumber[zodiac]};
}
function numerologyHtml(birthday: string) {
  const r=calculateNumerology(birthday); if(!r) return '';
  const layout=[1,4,7,2,5,8,3,6,9];
  return `<section class="num"><h3>生命靈數九宮格</h3><div class="num-meta">${escapeHtml(r.zodiac)} · 天賦數 ${r.talentNumber} · 加總命數 ${r.lifeNumber}</div><div class="num-grid">${layout.map(n=>{const rings=['birth'.repeat(r.counts[n])];const classes=[...Array(r.counts[n]).fill('birth'),...(n===r.birthdayNumber?['birthday']:[]),...(n===r.zodiacNumber?['zodiac']:[]),...Array(r.talentDigits.filter(d=>d===n).length).fill('talent'),...(n===r.lifeNumber?['life']:[])];return `<div class="num-cell"><svg viewBox="0 0 100 100">${classes.map((c,i)=>`<circle cx="50" cy="50" r="${classes.length===1?26:19+i*(25/Math.max(1,classes.length-1))}" class="ring ${c}"/>`).join('')}<text x="50" y="50" dominant-baseline="central" text-anchor="middle">${n}</text></svg></div>`;}).join('')}</div></section>`;
}

async function publicCard(request: Request, env: StarryEnv, slug: string) {
  const db=env.STARRY_ID_DB; if(!db) return null; await ensureSchema(db);
  const card: any = await db.prepare('SELECT userId,slug,cardNumber FROM public_cards WHERE slug=? LIMIT 1').bind(slug).first(); if(!card) return null;
  const member: any = await readMember(db,card.userId); if(!member||member.status!=='active') return null;
  const visibility=await readVisibility(db,card.userId); const data:any=memberPayload(member); data.cardNumber=card.cardNumber;
  const partner:any=await db.prepare("SELECT p.name FROM spouse_links s JOIN profiles p ON p.userId=CASE WHEN s.userA=? THEN s.userB ELSE s.userA END WHERE s.status='active' AND (s.userA=? OR s.userB=?) LIMIT 1").bind(card.userId,card.userId,card.userId).first().catch(()=>null);
  data.spouse=partner?.name?'已與 '+text(partner.name)+' 綁定夫妻':'';
  const viewer=await currentUserId(request,db); const owner=viewer===card.userId;
  const rows=[['name','姓名'],[text(member.amwayId)?'amwayId':'cardNumber',text(member.amwayId)?'會員編號 / Amway ID':'電子名片編號'],['email','Email'],['phone','手機'],['residence','居住地'],['center','中心'],['rank','獎銜'],['birthday','生日'],['motto','座右銘'],['zodiac','星座'],['sponsor','推薦人'],['platinumUpline','白金上線'],['diamondUpline','鑽石上線'],['spouse','夫妻關係']];
  const visibleRows=rows.filter(([key])=>visibility[key]!==false).filter(([key])=>data[key]!==''&&data[key]!=null);
  const avatar=visibility.avatar!==false&&data.avatar?`<img class="avatar" src="${escapeHtml(data.avatar)}" alt="會員頭像" referrerpolicy="no-referrer">`:`<div class="avatar fallback">✦</div>`;
  const grid=visibility.numerology!==false&&data.birthday?numerologyHtml(data.birthday):'';
  return new Response(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="theme-color" content="#07101f"><title>${escapeHtml(data.name||'繁星會員')}｜Starry ID</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0,#21386b,transparent 35%),#07101f;color:#f7f9ff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}.wrap{width:min(720px,calc(100% - 28px));margin:0 auto;padding:46px 0 90px}.card{background:#101b31eF;border:1px solid #2b3b5c;border-radius:28px;padding:26px;box-shadow:0 24px 70px #0006}.head{display:flex;align-items:center;gap:18px;padding-bottom:20px;border-bottom:1px solid #2b3b5c}.avatar{width:92px;height:92px;border-radius:26px;object-fit:cover;background:#223250}.fallback{display:grid;place-items:center;font-size:34px}.head h1{margin:0 0 6px;font-size:28px}.muted{color:#aebbd3}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:20px}.field{background:#0e1a2e;border:1px solid #263a5a;border-radius:16px;padding:12px}.label{font-size:12px;color:#91a2c0;margin-bottom:6px}.value{font-size:16px;white-space:pre-wrap;overflow-wrap:anywhere}.login{position:fixed;right:18px;bottom:18px;background:#182945c9;backdrop-filter:blur(12px);border:1px solid #536b93;color:#fff;text-decoration:none;padding:11px 15px;border-radius:999px;box-shadow:0 12px 35px #0005}.owner{position:sticky;top:0;padding:10px;text-align:center;background:#0b1528e8;backdrop-filter:blur(12px);z-index:4}.owner a{color:#dce7ff}.num{margin-top:18px;background:#0e1a2e;border:1px solid #263a5a;border-radius:20px;padding:16px}.num h3{margin:0 0 5px}.num-meta{color:#aebbd3;font-size:13px;margin-bottom:12px}.num-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;max-width:330px;margin:auto}.num-cell{aspect-ratio:1;background:#111f36;border:1px solid #314667;border-radius:16px;padding:6px}.num-cell svg{width:100%;height:100%}.ring{fill:none;stroke-width:2}.ring.birth{stroke:#e6edf9}.ring.birthday{stroke:#fbbf24}.ring.zodiac{stroke:#a855f7}.ring.talent{stroke:#84cc16}.ring.life{stroke:#ef4444}.num-cell text{fill:#f7f9ff;font-size:25px;font-weight:900}@media(max-width:560px){.wrap{padding-top:22px}.card{padding:18px}.fields{grid-template-columns:1fr}.avatar{width:76px;height:76px}.head h1{font-size:23px}}</style></head><body>${owner?'<div class="owner"><a href="/">← 回到我的 Starry ID 會員中心</a></div>':''}<main class="wrap"><article class="card"><div class="head">${avatar}<div><h1>${escapeHtml(data.name||'繁星會員')}</h1><div class="muted">Starry ID 電子名片</div></div></div><div class="fields">${visibleRows.map(([key,label])=>`<div class="field"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(data[key])}</div></div>`).join('')}</div>${grid}</article></main>${owner?'':`<a class="login" href="/">登入 Starry ID</a>`}</body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow, noarchive','Content-Security-Policy':"default-src 'self'; img-src 'self' data: https:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
}

function json(data: unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});}

async function enhancedMemberCenter(env: StarryEnv) {
  const base=renderStarryIdMemberCenterPage(text(env.STARRY_ID_GOOGLE_CLIENT_ID)||DEFAULT_GOOGLE_CLIENT_ID); const html=await base.text();
  const extraStyle=`<style id="v211-style">.topbar{position:sticky;top:0;z-index:12;padding:10px 0;background:linear-gradient(180deg,#07101ff0,#07101fc7 75%,transparent);backdrop-filter:blur(14px)}.v211-menu{position:fixed;right:16px;top:78px;z-index:30;width:min(300px,calc(100% - 32px));padding:12px;border-radius:18px;border:1px solid #314869;background:#0d192deF;box-shadow:0 22px 60px #0008}.v211-menu a{display:block;color:#eef4ff;text-decoration:none;padding:11px;border-radius:11px}.v211-menu a:hover{background:#1b2c49}.v211-settings{position:fixed;inset:0;z-index:40;background:#0008;display:grid;place-items:center;padding:16px}.v211-box{width:min(600px,100%);max-height:82vh;overflow:auto;background:#101b31;border:1px solid #34496b;border-radius:24px;padding:18px;box-shadow:0 24px 70px #0009}.v211-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 4px;border-bottom:1px solid #253752}.v211-eye{min-width:42px}.v211-url{overflow-wrap:anywhere;color:#aebbd3;font-size:13px}.v211-grid{margin-top:14px}.v211-numgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:300px;margin:auto}.v211-numcell{aspect-ratio:1;border:1px solid #314667;border-radius:15px;display:grid;place-items:center;font-size:24px;font-weight:800;background:#0d192d}html[data-starry-theme="light"] body{background:#eef3fb;color:#15213a}html[data-starry-theme="light"] .card,html[data-starry-theme="light"] .admin-panel,html[data-starry-theme="light"] .v211-box,html[data-starry-theme="light"] .v211-menu{background:#fff;color:#15213a}html[data-starry-theme="light"] .field,html[data-starry-theme="light"] .member-item,html[data-starry-theme="light"] .v211-numcell{background:#f4f7fc;color:#15213a}</style>`;
  const script=`<script>(()=>{const APPS=[['Starry ID','https://id.starry.phd'],['繁星回聲','https://echo.starry.phd'],['繁星下載','https://download.starry.phd'],['繁星短網址','https://go.starry.phd']];const labels={name:'姓名',email:'Email',avatar:'頭像',amwayId:'會員編號 / Amway ID',cardNumber:'電子名片編號',phone:'手機',residence:'居住地',center:'中心',rank:'獎銜',birthday:'生日',motto:'座右銘',zodiac:'星座',talentNumber:'天賦數',lifeNumber:'生命靈數',sponsor:'推薦人',platinumUpline:'白金上線',diamondUpline:'鑽石上線',numerology:'生命靈數九宮格'};let menu,modal;function top(){const actions=document.getElementById('topActions');if(!actions||document.getElementById('v211Theme'))return;const theme=document.createElement('button');theme.id='v211Theme';theme.className='btn';theme.textContent='☀︎/☾';theme.title='開燈 / 關燈';theme.onclick=()=>{const root=document.documentElement;root.dataset.starryTheme=root.dataset.starryTheme==='light'?'dark':'light'};const burger=document.createElement('button');burger.className='btn';burger.textContent='☰';burger.title='繁星生態系';burger.onclick=()=>{if(menu){menu.remove();menu=null;return}menu=document.createElement('nav');menu.className='v211-menu';for(const [name,url] of APPS){const a=document.createElement('a');a.href=url;a.textContent=name;menu.appendChild(a)}document.body.appendChild(menu)};actions.prepend(theme,burger)}async function api(path,opt={}){const r=await fetch(path,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'操作失敗');return d}function close(){modal?.remove();modal=null}async function openSettings(){try{const d=await api('/api/card-settings');modal=document.createElement('div');modal.className='v211-settings';const box=document.createElement('section');box.className='v211-box';box.innerHTML='<div style="display:flex;justify-content:space-between;gap:8px"><div><h3 style="margin:0">電子名片公開設定</h3><div class="v211-url">'+d.url+'</div></div><button class="btn" id="v211Close">✕</button></div>';const link=document.createElement('div');link.style.margin='12px 0';link.innerHTML='<a class="btn primary" style="display:inline-block;text-decoration:none" target="_blank" rel="noopener" href="'+d.url+'">查看公開名片</a>';box.appendChild(link);if(d.identifierLabel==='電子名片編號'){const row=document.createElement('div');row.className='v211-row';row.innerHTML='<span>電子名片編號</span><input id="v211Number" class="search" style="max-width:180px" value="'+d.cardNumber+'">';box.appendChild(row);row.querySelector('input').addEventListener('change',async e=>{try{const next=await api('/api/card-settings',{method:'PUT',body:JSON.stringify({cardNumber:e.target.value})});box.querySelector('.v211-url').textContent=next.url}catch(err){alert(err.message)}})}for(const [field,visible] of Object.entries(d.visibility)){const row=document.createElement('div');row.className='v211-row';const name=document.createElement('span');name.textContent=labels[field]||field;const eye=document.createElement('button');eye.className='btn v211-eye';eye.textContent=visible?'👁':'◉̸';eye.title=visible?'目前公開，按一下隱藏':'目前隱藏，按一下公開';eye.onclick=async()=>{try{const next=!visible;await api('/api/card-settings',{method:'PUT',body:JSON.stringify({visibility:{[field]:next}})});close();openSettings()}catch(err){alert(err.message)}};row.append(name,eye);box.appendChild(row)}modal.appendChild(box);document.body.appendChild(modal);box.querySelector('#v211Close').onclick=close;modal.addEventListener('click',e=>{if(e.target===modal)close()})}catch(e){alert(e.message)}}top();})();</script>`;
  const v211Body=html.replace('</head>',extraStyle+'</head>').replace('</body>',script+'</body>');
  const body=enhanceStarryIdMemberCenterV216(v211Body);
  const headers=new Headers(base.headers); headers.delete('Content-Length'); return new Response(body,{status:base.status,headers});
}

export async function handleStarryIdV211(request: Request, env: StarryEnv): Promise<Response|null> {
  const url=new URL(request.url); if(url.hostname!==STAR_DOMAIN) return null; const method=request.method.toUpperCase();
  if((url.pathname==='/'||url.pathname==='/my-card')&&method==='GET') return enhancedMemberCenter(env);
  if(url.pathname==='/api/card-settings'&&method==='GET') return cardSettings(request,env);
  if(url.pathname==='/api/card-settings'&&method==='PUT') return updateCardSettings(request,env);
  if(url.pathname==='/api/profile'&&method==='PUT') return proxyProfileUpdate(request,env);
  if(method==='GET'&&!url.pathname.startsWith('/api/')&&url.pathname!=='/robots.txt') {
    const slug=lower(decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g,''))); if(slug&&!slug.includes('/')) return publicCard(request,env,slug);
  }
  return null;
}
