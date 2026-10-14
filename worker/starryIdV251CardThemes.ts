import type { Env } from './index';

type StarryCardEnv = Env & { STARRY_ID_DB?: any };

type ThemeDefinition = { id: string; name: string; note: string };

export const STARRY_CARD_THEMES: ThemeDefinition[] = [
  { id: 'starry-cosmos', name: '繁星深空', note: '深藍星空・玻璃卡片・星光呼吸' },
  { id: 'golden-prestige', name: '曜金尊爵', note: '黑金精品・側欄名片・金光掃過' },
  { id: 'aurora-realm', name: '極光秘境', note: '紫青極光・霧面層次・漸層流動' },
  { id: 'sunrise-paper', name: '晨曦紙境', note: '暖白橙光・雜誌編排・紙張淡入' },
  { id: 'neon-pulse', name: '霓虹脈衝', note: '桃青霓虹・科技格線・掃描脈衝' },
  { id: 'forest-whisper', name: '森語自然', note: '森林綠・有機圓角・輕柔漂浮' },
  { id: 'ocean-flow', name: '海洋流光', note: '海藍水光・波浪層次・水泡上浮' },
  { id: 'sakura-ink', name: '緋櫻和風', note: '櫻粉墨色・直線留白・花瓣飄落' },
  { id: 'lunar-minimal', name: '月白極簡', note: '月白灰黑・極簡資訊列・淡光呼吸' },
  { id: 'royal-gem', name: '皇家寶石', note: '紫晶祖母綠・雙框珠寶・寶石閃耀' }
];

const THEME_IDS = new Set(STARRY_CARD_THEMES.map(theme => theme.id));
const DEFAULT_THEME = 'starry-cosmos';
const STAR_DOMAIN = 'id.starry.phd';
const SESSION_COOKIE = 'starry_id_session';
const TOKEN_RE = /^[A-Za-z0-9_-]{30,}$/;
const schemaReady = new WeakMap<object, Promise<void>>();

function text(value: unknown) {
  return value == null ? '' : String(value).trim();
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function cookieValue(request: Request, name: string) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

async function currentUserId(request: Request, db: any) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!TOKEN_RE.test(token)) return '';
  const row: any = await db.prepare('SELECT userId,expiresAt FROM auth_sessions WHERE tokenHash=? LIMIT 1')
    .bind(await hashToken(token)).first();
  if (!row || Number(row.expiresAt || 0) <= Date.now()) return '';
  return text(row.userId);
}

async function ensureThemeSchema(db: any) {
  const key = db as object;
  if (!schemaReady.has(key)) {
    const task = db.prepare(`CREATE TABLE IF NOT EXISTS public_card_preferences (
      userId TEXT PRIMARY KEY,
      theme TEXT NOT NULL DEFAULT 'starry-cosmos' CHECK(theme IN (
        'starry-cosmos','golden-prestige','aurora-realm','sunrise-paper','neon-pulse',
        'forest-whisper','ocean-flow','sakura-ink','lunar-minimal','royal-gem'
      )),
      updatedAt INTEGER NOT NULL,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
    )`).run().then(() => undefined);
    schemaReady.set(key, task);
    task.catch(() => schemaReady.delete(key));
  }
  await schemaReady.get(key);
}

function normalizeTheme(value: unknown) {
  const theme = text(value).toLowerCase();
  return THEME_IDS.has(theme) ? theme : DEFAULT_THEME;
}

async function readTheme(db: any, userId: string) {
  await ensureThemeSchema(db);
  const row: any = await db.prepare('SELECT theme FROM public_card_preferences WHERE userId=? LIMIT 1').bind(userId).first();
  return normalizeTheme(row?.theme);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive'
    }
  });
}

export async function handleStarryIdV251CardTheme(request: Request, env: StarryCardEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN || url.pathname !== '/api/card-theme') return null;
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return json({ error: 'Method not allowed' }, 405);
  const db = env.STARRY_ID_DB;
  if (!db) return json({ error: 'Starry ID service unavailable' }, 503);
  const userId = await currentUserId(request, db);
  if (!userId) return json({ error: '請先登入 Starry ID' }, 401);

  if (method === 'PUT') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: '不允許跨站修改名片樣式' }, 403);
    const body: any = await request.clone().json().catch(() => null);
    const requested = text(body?.theme).toLowerCase();
    if (!THEME_IDS.has(requested)) return json({ error: '找不到這個名片樣式' }, 400);
    await ensureThemeSchema(db);
    await db.prepare(`INSERT INTO public_card_preferences (userId,theme,updatedAt) VALUES (?,?,?)
      ON CONFLICT(userId) DO UPDATE SET theme=excluded.theme,updatedAt=excluded.updatedAt`)
      .bind(userId, requested, Date.now()).run();
  }

  return json({
    theme: await readTheme(db, userId),
    themes: STARRY_CARD_THEMES
  });
}

function themeCss() {
  return `<style id="v251-card-theme-style">
  .v251-theme-picker{display:flex;align-items:center;gap:7px;min-width:0}.v251-theme-picker label{font-size:12px;font-weight:800;white-space:nowrap;color:#cbd7eb}.v251-theme-select{max-width:172px;border:1px solid #536b93;border-radius:11px;padding:8px 28px 8px 9px;background:#101d33;color:#f7f9ff;font:inherit;font-size:13px;outline:none;cursor:pointer}.v251-theme-select:focus{box-shadow:0 0 0 2px #8ba9ff55}
  #profileCard[data-card-theme],body[data-card-theme] .card{position:relative!important;isolation:isolate!important;overflow:hidden!important;transition:background .35s ease,border-color .35s ease,box-shadow .35s ease,transform .35s ease!important}
  #profileCard[data-card-theme]>* ,body[data-card-theme] .card>*{position:relative;z-index:2}
  #profileCard[data-card-theme]::before,#profileCard[data-card-theme]::after,body[data-card-theme] .card::before,body[data-card-theme] .card::after{content:"";position:absolute;pointer-events:none;z-index:0}
  #profileCard[data-card-theme] .field,body[data-card-theme] .field{transition:transform .25s ease,background .25s ease,border-color .25s ease,box-shadow .25s ease!important}
  #profileCard[data-card-theme] .avatar,#profileCard[data-card-theme] .avatar-fallback,body[data-card-theme] .avatar{transition:border-radius .35s ease,transform .35s ease,box-shadow .35s ease!important}

  body[data-card-preview-theme="starry-cosmos"],body[data-card-theme="starry-cosmos"]{background:radial-gradient(circle at 18% 0,#253b79 0,transparent 34%),radial-gradient(circle at 90% 15%,#482d79 0,transparent 28%),#050b18!important;color:#f8fbff!important}
  #profileCard[data-card-theme="starry-cosmos"],body[data-card-theme="starry-cosmos"] .card{background:linear-gradient(155deg,#12203ceF,#080f20f7)!important;border:1px solid #6687c766!important;border-radius:30px!important;box-shadow:0 28px 80px #0009,0 0 45px #6b86ff1f!important;color:#f8fbff!important}
  #profileCard[data-card-theme="starry-cosmos"]::before,body[data-card-theme="starry-cosmos"] .card::before{inset:0;background-image:radial-gradient(circle,#fff 0 1px,transparent 1.7px),radial-gradient(circle,#9fbaff 0 1px,transparent 1.6px);background-size:43px 43px,67px 67px;background-position:0 0,18px 24px;opacity:.24;animation:v251Twinkle 5s ease-in-out infinite alternate}
  #profileCard[data-card-theme="starry-cosmos"] .identity,body[data-card-theme="starry-cosmos"] .head{justify-content:center;text-align:center;flex-direction:column!important}
  #profileCard[data-card-theme="starry-cosmos"] .fields,body[data-card-theme="starry-cosmos"] .fields{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  #profileCard[data-card-theme="starry-cosmos"] .field,body[data-card-theme="starry-cosmos"] .field{background:#0b1730cc!important;border-color:#48659a88!important;box-shadow:inset 0 1px #ffffff0d!important;color:#f8fbff!important}
  #profileCard[data-card-theme="starry-cosmos"] .avatar,#profileCard[data-card-theme="starry-cosmos"] .avatar-fallback,body[data-card-theme="starry-cosmos"] .avatar{border-radius:50%!important;box-shadow:0 0 0 5px #8da7ff22,0 0 34px #819cff55!important;animation:v251CosmosPulse 3.8s ease-in-out infinite}

  body[data-card-preview-theme="golden-prestige"],body[data-card-theme="golden-prestige"]{background:radial-gradient(circle at 50% -15%,#574018 0,transparent 34%),#090806!important;color:#f8e9ba!important}
  #profileCard[data-card-theme="golden-prestige"],body[data-card-theme="golden-prestige"] .card{display:grid!important;grid-template-columns:minmax(170px,230px) 1fr!important;gap:24px!important;background:linear-gradient(145deg,#16130d,#080706)!important;border:1px solid #c89b43!important;border-radius:10px!important;box-shadow:0 30px 75px #000b,inset 0 0 0 3px #3a2a12!important;color:#f8e9ba!important}
  #profileCard[data-card-theme="golden-prestige"]::after,body[data-card-theme="golden-prestige"] .card::after{top:-80%;left:-30%;width:34%;height:260%;background:linear-gradient(90deg,transparent,#ffe8a345,transparent);transform:rotate(18deg);animation:v251GoldSweep 7s linear infinite}
  #profileCard[data-card-theme="golden-prestige"] .identity,body[data-card-theme="golden-prestige"] .head{grid-column:1!important;align-self:start!important;flex-direction:column!important;text-align:center!important;border:0!important;border-right:1px solid #80652f88!important;padding:12px 20px 12px 0!important}
  #profileCard[data-card-theme="golden-prestige"] .section-title{grid-column:2!important;margin:0!important;color:#d7b86f!important}
  #profileCard[data-card-theme="golden-prestige"] .fields,body[data-card-theme="golden-prestige"] .fields{grid-column:2!important;grid-template-columns:1fr!important;margin-top:0!important}
  #profileCard[data-card-theme="golden-prestige"] .field,body[data-card-theme="golden-prestige"] .field{background:transparent!important;border:0!important;border-bottom:1px solid #8b6e3280!important;border-radius:0!important;color:#fff2ca!important}
  #profileCard[data-card-theme="golden-prestige"] .avatar,#profileCard[data-card-theme="golden-prestige"] .avatar-fallback,body[data-card-theme="golden-prestige"] .avatar{border-radius:8px!important;border:2px solid #d6aa50!important;box-shadow:0 15px 35px #0009!important}

  body[data-card-preview-theme="aurora-realm"],body[data-card-theme="aurora-realm"]{background:linear-gradient(120deg,#071d27,#25205f,#431a56,#07343b)!important;background-size:300% 300%!important;animation:v251AuroraBg 14s ease infinite;color:#efffff!important}
  #profileCard[data-card-theme="aurora-realm"],body[data-card-theme="aurora-realm"] .card{background:linear-gradient(145deg,#ffffff1a,#ffffff08)!important;backdrop-filter:blur(20px)!important;border:1px solid #9fe7ef66!important;border-radius:34px 12px 34px 12px!important;box-shadow:0 28px 80px #06172c99,0 0 55px #9f7aea24!important;color:#f1ffff!important}
  #profileCard[data-card-theme="aurora-realm"]::before,body[data-card-theme="aurora-realm"] .card::before{inset:-35%;background:conic-gradient(from 0deg,#52ffd520,#916cff30,#ff7ad020,#52ffd520);filter:blur(35px);animation:v251AuroraSpin 18s linear infinite}
  #profileCard[data-card-theme="aurora-realm"] .fields,body[data-card-theme="aurora-realm"] .fields{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:14px!important}
  #profileCard[data-card-theme="aurora-realm"] .field,body[data-card-theme="aurora-realm"] .field{background:#071c2c66!important;border:1px solid #a0fff650!important;border-radius:22px 7px 22px 7px!important;color:#f1ffff!important;backdrop-filter:blur(10px)!important}
  #profileCard[data-card-theme="aurora-realm"] .field:nth-child(even),body[data-card-theme="aurora-realm"] .field:nth-child(even){transform:translateY(10px)}
  #profileCard[data-card-theme="aurora-realm"] .avatar,#profileCard[data-card-theme="aurora-realm"] .avatar-fallback,body[data-card-theme="aurora-realm"] .avatar{border-radius:28% 72% 64% 36%/45% 38% 62% 55%!important;box-shadow:0 0 30px #70ffe866!important}

  body[data-card-preview-theme="sunrise-paper"],body[data-card-theme="sunrise-paper"]{background:linear-gradient(135deg,#f7ead9,#efc8a7)!important;color:#3c281d!important}
  #profileCard[data-card-theme="sunrise-paper"],body[data-card-theme="sunrise-paper"] .card{background:#fff9ef!important;border:0!important;border-radius:2px!important;box-shadow:0 25px 60px #7d4b2d33!important;color:#3c281d!important;font-family:Georgia,"Times New Roman",serif!important}
  #profileCard[data-card-theme="sunrise-paper"]::before,body[data-card-theme="sunrise-paper"] .card::before{inset:0;background:repeating-linear-gradient(0deg,#6b4b2a08 0 1px,transparent 1px 6px);opacity:.35}
  #profileCard[data-card-theme="sunrise-paper"] .identity,body[data-card-theme="sunrise-paper"] .head{border-bottom:3px solid #e9824d!important;align-items:flex-end!important}
  #profileCard[data-card-theme="sunrise-paper"] .fields,body[data-card-theme="sunrise-paper"] .fields{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:0!important;border-top:1px solid #b98b6d55!important;border-left:1px solid #b98b6d55!important}
  #profileCard[data-card-theme="sunrise-paper"] .field,body[data-card-theme="sunrise-paper"] .field{background:transparent!important;border:0!important;border-right:1px solid #b98b6d55!important;border-bottom:1px solid #b98b6d55!important;border-radius:0!important;color:#3c281d!important;animation:v251PaperIn .55s ease both}
  #profileCard[data-card-theme="sunrise-paper"] .field-label,body[data-card-theme="sunrise-paper"] .label{color:#a64f2e!important;text-transform:uppercase!important;letter-spacing:.08em!important}
  #profileCard[data-card-theme="sunrise-paper"] .avatar,#profileCard[data-card-theme="sunrise-paper"] .avatar-fallback,body[data-card-theme="sunrise-paper"] .avatar{border-radius:0!important;filter:sepia(.08) contrast(1.03)!important;box-shadow:8px 8px 0 #e4a177!important}

  body[data-card-preview-theme="neon-pulse"],body[data-card-theme="neon-pulse"]{background:#05060c!important;background-image:linear-gradient(#15f4ee0d 1px,transparent 1px),linear-gradient(90deg,#ff27c80d 1px,transparent 1px)!important;background-size:30px 30px!important;color:#ecffff!important}
  #profileCard[data-card-theme="neon-pulse"],body[data-card-theme="neon-pulse"] .card{background:#080a12f2!important;border:1px solid #17f7ee!important;border-radius:18px!important;box-shadow:0 0 22px #16f5ef3d,inset 0 0 28px #ff2ac817!important;color:#ecffff!important}
  #profileCard[data-card-theme="neon-pulse"]::after,body[data-card-theme="neon-pulse"] .card::after{left:0;right:0;height:2px;top:0;background:linear-gradient(90deg,transparent,#16fff5,#ff35cf,transparent);box-shadow:0 0 18px #16fff5;animation:v251Scan 4.5s linear infinite}
  #profileCard[data-card-theme="neon-pulse"] .identity,body[data-card-theme="neon-pulse"] .head{border-bottom:1px solid #ff30ccaa!important}
  #profileCard[data-card-theme="neon-pulse"] .fields,body[data-card-theme="neon-pulse"] .fields{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  #profileCard[data-card-theme="neon-pulse"] .field,body[data-card-theme="neon-pulse"] .field{background:#0b1020!important;border:1px solid #16eee066!important;border-left:3px solid #ff34cd!important;border-radius:4px 14px 4px 14px!important;color:#efffff!important;box-shadow:inset 0 0 14px #16eee00d!important}
  #profileCard[data-card-theme="neon-pulse"] .avatar,#profileCard[data-card-theme="neon-pulse"] .avatar-fallback,body[data-card-theme="neon-pulse"] .avatar{border-radius:14px!important;border:2px solid #1afff2!important;box-shadow:0 0 22px #20fbea77,0 0 42px #ff2ac83d!important}

  body[data-card-preview-theme="forest-whisper"],body[data-card-theme="forest-whisper"]{background:radial-gradient(circle at 10% 0,#78946d 0,transparent 25%),linear-gradient(150deg,#dce4cf,#8da287)!important;color:#173024!important}
  #profileCard[data-card-theme="forest-whisper"],body[data-card-theme="forest-whisper"] .card{background:linear-gradient(145deg,#f6f1df,#e6edd8)!important;border:1px solid #75906b!important;border-radius:44px 18px 44px 18px!important;box-shadow:0 26px 60px #1d38252e!important;color:#173024!important}
  #profileCard[data-card-theme="forest-whisper"]::before,body[data-card-theme="forest-whisper"] .card::before{right:-45px;top:-55px;width:170px;height:170px;border-radius:48% 52% 68% 32%;background:#52765322;transform:rotate(25deg);animation:v251LeafFloat 7s ease-in-out infinite}
  #profileCard[data-card-theme="forest-whisper"] .identity,body[data-card-theme="forest-whisper"] .head{border-bottom:1px dashed #71866b!important}
  #profileCard[data-card-theme="forest-whisper"] .fields,body[data-card-theme="forest-whisper"] .fields{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important}
  #profileCard[data-card-theme="forest-whisper"] .field,body[data-card-theme="forest-whisper"] .field{background:#ffffff8f!important;border:1px solid #78906f77!important;border-radius:28px 12px 28px 12px!important;color:#173024!important}
  #profileCard[data-card-theme="forest-whisper"] .field-label,body[data-card-theme="forest-whisper"] .label{color:#59705a!important}
  #profileCard[data-card-theme="forest-whisper"] .avatar,#profileCard[data-card-theme="forest-whisper"] .avatar-fallback,body[data-card-theme="forest-whisper"] .avatar{border-radius:50%!important;border:5px solid #f4f0df!important;box-shadow:0 10px 25px #28472f40!important;animation:v251ForestFloat 4.8s ease-in-out infinite}

  body[data-card-preview-theme="ocean-flow"],body[data-card-theme="ocean-flow"]{background:linear-gradient(180deg,#63c5df 0,#11628f 45%,#06304f 100%)!important;color:#effcff!important}
  #profileCard[data-card-theme="ocean-flow"],body[data-card-theme="ocean-flow"] .card{background:linear-gradient(180deg,#d9fbffed,#8bd8eac9 35%,#0e6289e8)!important;border:1px solid #d9fbff99!important;border-radius:36px!important;box-shadow:0 30px 70px #07395566!important;color:#06334a!important}
  #profileCard[data-card-theme="ocean-flow"]::before,body[data-card-theme="ocean-flow"] .card::before{left:-15%;right:-15%;bottom:-110px;height:210px;border-radius:45%;background:#d7fbff45;animation:v251Wave 8s ease-in-out infinite}
  #profileCard[data-card-theme="ocean-flow"]::after,body[data-card-theme="ocean-flow"] .card::after{width:12px;height:12px;border:2px solid #e9ffff99;border-radius:50%;right:18%;bottom:15%;box-shadow:-70px 35px 0 2px #e9ffff4d,45px -80px 0 5px #e9ffff42,-130px -55px 0 1px #e9ffff55;animation:v251Bubble 6s linear infinite}
  #profileCard[data-card-theme="ocean-flow"] .identity,body[data-card-theme="ocean-flow"] .head{border-bottom:2px solid #ffffff80!important}
  #profileCard[data-card-theme="ocean-flow"] .field,body[data-card-theme="ocean-flow"] .field{background:#e9ffffb8!important;border:1px solid #ffffffaa!important;border-radius:18px!important;color:#06334a!important;box-shadow:0 8px 22px #07567a1f!important}
  #profileCard[data-card-theme="ocean-flow"] .field-label,body[data-card-theme="ocean-flow"] .label{color:#176080!important}
  #profileCard[data-card-theme="ocean-flow"] .avatar,#profileCard[data-card-theme="ocean-flow"] .avatar-fallback,body[data-card-theme="ocean-flow"] .avatar{border-radius:50% 50% 45% 55%!important;border:3px solid #efffff!important;box-shadow:0 0 0 7px #4bb6d24d!important}

  body[data-card-preview-theme="sakura-ink"],body[data-card-theme="sakura-ink"]{background:linear-gradient(135deg,#f7e8ec,#dbc6ce)!important;color:#372c32!important}
  #profileCard[data-card-theme="sakura-ink"],body[data-card-theme="sakura-ink"] .card{background:#fffaf9!important;border:0!important;border-left:7px solid #b84f6f!important;border-radius:0 24px 24px 0!important;box-shadow:0 25px 65px #5d354533!important;color:#372c32!important}
  #profileCard[data-card-theme="sakura-ink"]::after,body[data-card-theme="sakura-ink"] .card::after{top:-20px;right:7%;width:11px;height:11px;border-radius:70% 30% 70% 30%;background:#dd8ca6;box-shadow:35px 80px #edb4c5,-60px 135px #cf6f8d,20px 210px #e7a4b9;animation:v251Petal 8s linear infinite}
  #profileCard[data-card-theme="sakura-ink"] .identity,body[data-card-theme="sakura-ink"] .head{border-bottom:1px solid #b84f6f55!important;padding-left:12px!important}
  #profileCard[data-card-theme="sakura-ink"] .fields,body[data-card-theme="sakura-ink"] .fields{grid-template-columns:1fr!important;gap:0!important;margin-left:12px!important}
  #profileCard[data-card-theme="sakura-ink"] .field,body[data-card-theme="sakura-ink"] .field{background:transparent!important;border:0!important;border-bottom:1px solid #7c5d6840!important;border-radius:0!important;color:#372c32!important;padding-left:4px!important}
  #profileCard[data-card-theme="sakura-ink"] .field-label,body[data-card-theme="sakura-ink"] .label{color:#a14a67!important;letter-spacing:.1em!important}
  #profileCard[data-card-theme="sakura-ink"] .avatar,#profileCard[data-card-theme="sakura-ink"] .avatar-fallback,body[data-card-theme="sakura-ink"] .avatar{border-radius:50%!important;filter:saturate(.88)!important;box-shadow:0 0 0 5px #f3d8e1,0 8px 24px #7e526044!important}

  body[data-card-preview-theme="lunar-minimal"],body[data-card-theme="lunar-minimal"]{background:#e9eaec!important;color:#111316!important}
  #profileCard[data-card-theme="lunar-minimal"],body[data-card-theme="lunar-minimal"] .card{background:#fafafa!important;border:1px solid #c8c9cc!important;border-radius:0!important;box-shadow:0 22px 55px #00000018!important;color:#111316!important;animation:v251LunarBreath 8s ease-in-out infinite}
  #profileCard[data-card-theme="lunar-minimal"] .identity,body[data-card-theme="lunar-minimal"] .head{border-bottom:1px solid #17191d!important;padding-bottom:28px!important}
  #profileCard[data-card-theme="lunar-minimal"] .fields,body[data-card-theme="lunar-minimal"] .fields{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:0!important;margin-top:26px!important}
  #profileCard[data-card-theme="lunar-minimal"] .field,body[data-card-theme="lunar-minimal"] .field{background:transparent!important;border:0!important;border-right:1px solid #d1d1d1!important;border-bottom:1px solid #d1d1d1!important;border-radius:0!important;color:#111316!important;min-height:86px!important}
  #profileCard[data-card-theme="lunar-minimal"] .field-label,body[data-card-theme="lunar-minimal"] .label{color:#777b82!important;font-size:10px!important;letter-spacing:.14em!important}
  #profileCard[data-card-theme="lunar-minimal"] .avatar,#profileCard[data-card-theme="lunar-minimal"] .avatar-fallback,body[data-card-theme="lunar-minimal"] .avatar{border-radius:2px!important;filter:grayscale(1)!important;box-shadow:none!important;border:1px solid #222!important}

  body[data-card-preview-theme="royal-gem"],body[data-card-theme="royal-gem"]{background:radial-gradient(circle at 50% 0,#552a66 0,transparent 35%),linear-gradient(150deg,#130b1c,#082c27)!important;color:#fff4d7!important}
  #profileCard[data-card-theme="royal-gem"],body[data-card-theme="royal-gem"] .card{background:linear-gradient(145deg,#25122f,#0d302d)!important;border:2px solid #d7bd74!important;border-radius:22px!important;box-shadow:0 0 0 5px #261331,0 0 0 7px #8f7742,0 30px 85px #000b!important;color:#fff4d7!important}
  #profileCard[data-card-theme="royal-gem"]::after,body[data-card-theme="royal-gem"] .card::after{top:18px;right:20px;width:10px;height:10px;background:#fff5b8;transform:rotate(45deg);box-shadow:0 0 24px #fff4a8;animation:v251Gem 3.2s ease-in-out infinite}
  #profileCard[data-card-theme="royal-gem"] .identity,body[data-card-theme="royal-gem"] .head{justify-content:center!important;text-align:center!important;border-bottom:1px solid #d7bd7480!important}
  #profileCard[data-card-theme="royal-gem"] .fields,body[data-card-theme="royal-gem"] .fields{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important}
  #profileCard[data-card-theme="royal-gem"] .field,body[data-card-theme="royal-gem"] .field{background:linear-gradient(135deg,#ffffff0c,#0b5c4e33)!important;border:1px solid #b99f6266!important;border-radius:8px 20px 8px 20px!important;color:#fff4d7!important;box-shadow:inset 0 0 20px #071e1b55!important}
  #profileCard[data-card-theme="royal-gem"] .field-label,body[data-card-theme="royal-gem"] .label{color:#dfc87f!important}
  #profileCard[data-card-theme="royal-gem"] .avatar,#profileCard[data-card-theme="royal-gem"] .avatar-fallback,body[data-card-theme="royal-gem"] .avatar{border-radius:18px!important;border:3px solid #d8c073!important;box-shadow:0 0 0 4px #633e69,0 15px 38px #0008!important}

  @keyframes v251Twinkle{from{opacity:.14}to{opacity:.36}}@keyframes v251CosmosPulse{50%{transform:scale(1.035);box-shadow:0 0 0 7px #8da7ff18,0 0 42px #819cff70}}
  @keyframes v251GoldSweep{0%{transform:translateX(-260%) rotate(18deg)}55%,100%{transform:translateX(520%) rotate(18deg)}}
  @keyframes v251AuroraBg{0%,100%{background-position:0 50%}50%{background-position:100% 50%}}@keyframes v251AuroraSpin{to{transform:rotate(360deg)}}
  @keyframes v251PaperIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  @keyframes v251Scan{0%{top:0;opacity:0}10%{opacity:1}90%{opacity:1}100%{top:100%;opacity:0}}
  @keyframes v251LeafFloat{50%{transform:translate(-14px,10px) rotate(33deg)}}@keyframes v251ForestFloat{50%{transform:translateY(-5px)}}
  @keyframes v251Wave{50%{transform:translateX(7%) rotate(4deg)}}@keyframes v251Bubble{0%{transform:translateY(80px);opacity:0}20%{opacity:1}100%{transform:translateY(-180px);opacity:0}}
  @keyframes v251Petal{0%{transform:translateY(-35px) rotate(0);opacity:0}15%{opacity:1}100%{transform:translate(-70px,520px) rotate(360deg);opacity:0}}
  @keyframes v251LunarBreath{50%{box-shadow:0 24px 65px #00000023}}
  @keyframes v251Gem{0%,100%{opacity:.35;transform:rotate(45deg) scale(.75)}50%{opacity:1;transform:rotate(45deg) scale(1.35)}}

  @media(max-width:760px){.v251-theme-picker label{display:none}.v251-theme-select{max-width:132px;padding:7px 24px 7px 8px;font-size:12px}
    #profileCard[data-card-theme="golden-prestige"],body[data-card-theme="golden-prestige"] .card{grid-template-columns:1fr!important}
    #profileCard[data-card-theme="golden-prestige"] .identity,body[data-card-theme="golden-prestige"] .head{grid-column:1!important;border-right:0!important;border-bottom:1px solid #80652f88!important;padding-right:0!important}
    #profileCard[data-card-theme="golden-prestige"] .section-title,#profileCard[data-card-theme="golden-prestige"] .fields,body[data-card-theme="golden-prestige"] .fields{grid-column:1!important}
    #profileCard[data-card-theme="starry-cosmos"] .fields,body[data-card-theme="starry-cosmos"] .fields,#profileCard[data-card-theme="aurora-realm"] .fields,body[data-card-theme="aurora-realm"] .fields,#profileCard[data-card-theme="sunrise-paper"] .fields,body[data-card-theme="sunrise-paper"] .fields,#profileCard[data-card-theme="neon-pulse"] .fields,body[data-card-theme="neon-pulse"] .fields,#profileCard[data-card-theme="forest-whisper"] .fields,body[data-card-theme="forest-whisper"] .fields,#profileCard[data-card-theme="lunar-minimal"] .fields,body[data-card-theme="lunar-minimal"] .fields,#profileCard[data-card-theme="royal-gem"] .fields,body[data-card-theme="royal-gem"] .fields{grid-template-columns:1fr!important}
    #profileCard[data-card-theme="aurora-realm"] .field:nth-child(even),body[data-card-theme="aurora-realm"] .field:nth-child(even){transform:none}
  }
  @media(prefers-reduced-motion:reduce){#profileCard[data-card-theme] *,#profileCard[data-card-theme]::before,#profileCard[data-card-theme]::after,body[data-card-theme] .card,body[data-card-theme] .card *,body[data-card-theme] .card::before,body[data-card-theme] .card::after,body[data-card-preview-theme]{animation:none!important;transition:none!important}}
  </style>`;
}

function memberCenterScript() {
  const options = JSON.stringify(STARRY_CARD_THEMES);
  return `<script id="v251-card-theme-script">(()=>{
    const themes=${options};
    let current='${DEFAULT_THEME}',busy=false;
    function apply(theme){current=theme;document.body.dataset.cardPreviewTheme=theme;const card=document.getElementById('profileCard');if(card)card.dataset.cardTheme=theme;const select=document.getElementById('v251CardThemeSelect');if(select&&select.value!==theme)select.value=theme}
    async function api(method,body){const r=await fetch('/api/card-theme',{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'名片樣式操作失敗');return d}
    function ensurePicker(){const actions=document.getElementById('topActions');if(!actions||document.getElementById('v251CardThemePicker'))return;const wrap=document.createElement('div');wrap.id='v251CardThemePicker';wrap.className='v251-theme-picker';const label=document.createElement('label');label.htmlFor='v251CardThemeSelect';label.textContent='名片樣式';const select=document.createElement('select');select.id='v251CardThemeSelect';select.className='v251-theme-select';select.title='選擇公開電子名片版面';for(const item of themes){const o=document.createElement('option');o.value=item.id;o.textContent=item.name;select.appendChild(o)}select.value=current;select.addEventListener('change',async()=>{if(busy)return;const previous=current,next=select.value;apply(next);busy=true;select.disabled=true;try{const data=await api('PUT',{theme:next});apply(data.theme||next)}catch(err){apply(previous);alert(err?.message||'名片樣式儲存失敗')}finally{busy=false;select.disabled=false}});wrap.append(label,select);const burger=document.getElementById('v216Menu');if(burger)actions.insertBefore(wrap,burger);else actions.appendChild(wrap)}
    async function boot(){ensurePicker();apply(current);try{const data=await api('GET');if(data?.theme)apply(data.theme)}catch{}ensurePicker()}
    const observer=new MutationObserver(()=>{ensurePicker();const card=document.getElementById('profileCard');if(card&&card.dataset.cardTheme!==current)card.dataset.cardTheme=current});observer.observe(document.documentElement,{childList:true,subtree:true});boot();
  })();</script>`;
}

function withHtml(response: Response, html: string) {
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

function publicSlug(url: URL) {
  if (url.pathname === '/' || url.pathname === '/my-card' || url.pathname.startsWith('/api/') || url.pathname === '/robots.txt') return '';
  let slug = '';
  try { slug = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, '')).trim().toLowerCase(); } catch { return ''; }
  return slug && !slug.includes('/') ? slug : '';
}

export async function enhanceStarryIdV251CardThemeResponse(
  request: Request,
  response: Response,
  env: StarryCardEnv
): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN || request.method.toUpperCase() !== 'GET') return response;
  if (!(response.headers.get('Content-Type') || '').includes('text/html')) return response;

  if (url.pathname === '/' || url.pathname === '/my-card') {
    let html = await response.text();
    if (!html.includes('v251-card-theme-style')) html = html.replace('</head>', themeCss() + '</head>');
    if (!html.includes('v251-card-theme-script')) html = html.replace('</body>', memberCenterScript() + '</body>');
    return withHtml(response, html);
  }

  const slug = publicSlug(url);
  const db = env.STARRY_ID_DB;
  if (!slug || !db) return response;
  try {
    await ensureThemeSchema(db);
    const card: any = await db.prepare('SELECT userId FROM public_cards WHERE slug=? LIMIT 1').bind(slug).first();
    if (!card?.userId) return response;
    const theme = await readTheme(db, text(card.userId));
    let html = await response.text();
    if (!html.includes('v251-card-theme-style')) html = html.replace('</head>', themeCss() + '</head>');
    html = html.replace('<body>', `<body data-card-theme="${theme}">`);
    return withHtml(response, html);
  } catch (error) {
    console.warn('Starry ID v251 card theme enhancer:', error);
    return response;
  }
}
