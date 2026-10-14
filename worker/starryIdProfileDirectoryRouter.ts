import type { Env } from './index';

const STAR_DOMAIN = 'id.starry.phd';
const SESSION_COOKIE = 'starry_id_session';
const TOKEN_RE = /^[A-Za-z0-9_-]{30,}$/;
const optionSchemaReady = new WeakMap<object, Promise<void>>();

const PROFILE_OPTIONS = {
  residence: [
    '臺北','新北','基隆','桃園','新竹','苗栗','臺中','彰化','南投','雲林',
    '嘉義','臺南','高雄','屏東','宜蘭','花蓮','臺東','澎湖','金門','連江','海外'
  ],
  center: [
    '無','非寰宇體系','飛登','南京','自強','明星','民權','中山','桃園','新竹','台中',
    '彰化','員林','嘉義','台南','高雄','屏東','香港','澳門','中國','美國','澳洲',
    '加拿大','英國','義大利','日本','韓國','馬來西亞','泰國','越南','印尼'
  ],
  rank: [
    '無','3%','6%','9%','12%','12%初階','15%','15%銅章','18%','21%','銀章','金章',
    '白金','紅寶石','創辦人白金','創辦人紅寶石','藍寶石','創辦人藍寶石','明珠','翡翠',
    '創辦人翡翠','鑽石級以上'
  ],
  joinReason: [
    '尚未加入','購買產品','事業','捧場人情','商業餐會','匹克球','參加吃喝玩樂活動',
    '參加營養課','參加美容課','參加生涯規劃','參加其它課程','參加大會','忘記了','其他'
  ],
  stayReason: [
    '商業餐會','匹克球','可以增加收入','打造自己的事業與團隊','課程活動多元豐富',
    '認識人脈','學習健康','助人','擁有舞台','熱愛產品好用','喜歡分享好東西','其它'
  ]
} as const;

type OptionCategory = keyof typeof PROFILE_OPTIONS;
type RelationField = 'sponsor' | 'platinumUpline' | 'diamondUpline';

const RELATION_TYPE: Record<RelationField, string> = {
  sponsor: 'sponsor',
  platinumUpline: 'platinum_upline',
  diamondUpline: 'diamond_upline'
};

const ECHO_FIELD: Record<RelationField, string> = {
  sponsor: 'sponsor',
  platinumUpline: 'platinumUpline',
  diamondUpline: 'diamondUpline'
};

const PLATINUM_PLUS = new Set([
  '白金','紅寶石','創辦人白金','創辦人紅寶石','藍寶石','創辦人藍寶石','明珠','翡翠','創辦人翡翠',
  '鑽石級以上','鑽石','創辦人鑽石','執行專才鑽石','創辦人執行專才鑽石','雙鑽石','創辦人雙鑽石',
  '參鑽石','創辦人參鑽石','皇冠','創辦人皇冠','皇冠大使','創辦人皇冠大使'
]);
const DIAMOND_PLUS = new Set([
  '鑽石級以上','鑽石','創辦人鑽石','執行專才鑽石','創辦人執行專才鑽石','雙鑽石','創辦人雙鑽石',
  '參鑽石','創辦人參鑽石','皇冠','創辦人皇冠','皇冠大使','創辦人皇冠大使'
]);

function text(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function cookieValue(request: Request, name: string) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function corsOrigin(request: Request) {
  const origin = request.headers.get('Origin') || '';
  if (!origin) return '';
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === 'https:' && (parsed.hostname === 'starry.phd' || parsed.hostname.endsWith('.starry.phd'))) return origin;
  } catch {
    return '';
  }
  return '';
}

function json(request: Request, data: unknown, status = 200) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow'
  });
  const origin = corsOrigin(request);
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Vary', 'Origin');
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function ensureProfileOptionSchema(env: Env) {
  const db = (env as any).STARRY_ID_DB;
  if (!db) throw new Error('STARRY_ID_DB not bound');
  const key = db as object;
  if (!optionSchemaReady.has(key)) {
    const task = (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS profile_option_values (
        category TEXT NOT NULL,
        value TEXT NOT NULL,
        sortOrder INTEGER NOT NULL,
        isActive INTEGER NOT NULL DEFAULT 1,
        sourceApp TEXT NOT NULL DEFAULT 'starry-id',
        updatedAt INTEGER NOT NULL,
        PRIMARY KEY(category,value)
      )`).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS profile_option_values_active ON profile_option_values(category,isActive,sortOrder)').run();
      const now = Date.now();
      const statements: any[] = [];
      for (const [category, values] of Object.entries(PROFILE_OPTIONS) as [OptionCategory, readonly string[]][]) {
        values.forEach((value, index) => {
          statements.push(db.prepare(`INSERT OR IGNORE INTO profile_option_values
            (category,value,sortOrder,isActive,sourceApp,updatedAt) VALUES (?,?,?,1,'echostars',?)`)
            .bind(category, value, index, now));
        });
      }
      if (statements.length) await db.batch(statements);
    })();
    optionSchemaReady.set(key, task);
    task.catch(() => optionSchemaReady.delete(key));
  }
  await optionSchemaReady.get(key);
}

async function readProfileOptions(env: Env) {
  await ensureProfileOptionSchema(env);
  const db = (env as any).STARRY_ID_DB;
  const rows: any = await db.prepare(`SELECT category,value,sortOrder
    FROM profile_option_values WHERE isActive=1
    ORDER BY category,sortOrder,value`).all();
  const options: Record<string, string[]> = {
    residence: [], center: [], rank: [], joinReason: [], stayReason: []
  };
  for (const row of rows?.results || []) {
    if (Object.prototype.hasOwnProperty.call(options, row.category)) options[row.category].push(String(row.value));
  }
  return options;
}

function configuredSuperAdminEmails(env: Env) {
  const raw = text((env as any).STARRY_ID_SUPER_ADMIN_EMAILS);
  return new Set((raw ? raw.split(',') : ['yukidu@gmail.com']).map(item => item.trim().toLowerCase()).filter(Boolean));
}

export async function sessionContext(request: Request, env: Env) {
  const db = (env as any).STARRY_ID_DB;
  if (!db) return null;
  const token = cookieValue(request, SESSION_COOKIE);
  if (!TOKEN_RE.test(token)) return null;
  const tokenHash = await hashToken(token);
  const session: any = await db.prepare(`SELECT userId,appId,expiresAt FROM auth_sessions
    WHERE tokenHash=? LIMIT 1`).bind(tokenHash).first();
  if (!session || Number(session.expiresAt || 0) <= Date.now()) return null;
  const user: any = await db.prepare(`SELECT u.id,u.primaryEmail,u.status,p.name,p.amwayId
    FROM users u LEFT JOIN profiles p ON p.userId=u.id WHERE u.id=? LIMIT 1`).bind(session.userId).first();
  if (!user || user.status !== 'active') return null;
  const membership: any = await db.prepare(`SELECT status,role,isAdminUser FROM app_memberships
    WHERE userId=? AND appId=? LIMIT 1`).bind(session.userId, session.appId).first();
  if (!membership || membership.status !== 'active') return null;
  const isSuperAdmin = membership.role === 'super-admin' || configuredSuperAdminEmails(env).has(text(user.primaryEmail).toLowerCase());
  return { userId: text(user.id), email: text(user.primaryEmail), isSuperAdmin };
}

function eligibleRank(field: RelationField, approvedRank: string) {
  if (field === 'sponsor') return true;
  if (field === 'platinumUpline') return PLATINUM_PLUS.has(approvedRank);
  return DIAMOND_PLUS.has(approvedRank);
}

async function searchDirectory(request: Request, env: Env) {
  const session = await sessionContext(request, env);
  if (!session) return json(request, { error: '請先登入 Starry ID' }, 401);
  const url = new URL(request.url);
  const field = text(url.searchParams.get('field')) as RelationField;
  if (!Object.prototype.hasOwnProperty.call(RELATION_TYPE, field)) return json(request, { error: '不支援的關係欄位' }, 400);
  const query = text(url.searchParams.get('search')).slice(0, 60);
  if (!query) return json(request, { members: [] });
  const excludeUserId = text(url.searchParams.get('excludeUserId'));
  const like = `%${query}%`;
  const db = (env as any).STARRY_ID_DB;
  const rows: any = await db.prepare(`SELECT u.id,p.name,p.amwayId,p.avatar,p.googleAvatar,p.center,p.rank,p.approvedRank,p.rankApproved,
      (SELECT pp.name FROM spouse_links sl JOIN profiles pp ON pp.userId=CASE WHEN sl.userA=u.id THEN sl.userB ELSE sl.userA END WHERE sl.status='active' AND (sl.userA=u.id OR sl.userB=u.id) LIMIT 1) AS spouseName
    FROM users u LEFT JOIN profiles p ON p.userId=u.id
    WHERE u.status='active'
      AND (LOWER(COALESCE(p.name,'')) LIKE LOWER(?) OR LOWER(COALESCE(p.amwayId,'')) LIKE LOWER(?))
    ORDER BY LOWER(COALESCE(p.name,'')),LOWER(COALESCE(p.amwayId,''))
    LIMIT 250`).bind(like, like).all();
  const members = (rows?.results || [])
    .filter((row: any) => !excludeUserId || text(row.id) !== excludeUserId)
    .map((row: any) => ({
      id: text(row.id),
      name: text(row.name),
      displayName: field === 'sponsor' ? text(row.name) : [text(row.name),text(row.spouseName)].filter(Boolean).join('&'),
      amwayId: text(row.amwayId),
      avatar: text(row.avatar || row.googleAvatar),
      center: text(row.center),
      approvedRank: Number(row.rankApproved || 0) === 1 ? text(row.approvedRank || row.rank) : ''
    }))
    .filter((row: any) => Boolean(row.name || row.amwayId))
    .filter((row: any) => eligibleRank(field, row.approvedRank))
    .slice(0, 40);
  return json(request, { members });
}

async function existingRelationship(db: any, userId: string, relationType: string) {
  return db.prepare(`SELECT mr.relatedUserId,mr.legacyLabel,mr.resolutionStatus,
      COALESCE(NULLIF(TRIM(p.name),''),mr.legacyLabel,'') AS displayName
    FROM member_relationships mr LEFT JOIN profiles p ON p.userId=mr.relatedUserId
    WHERE mr.userId=? AND mr.relationType=? LIMIT 1`).bind(userId, relationType).first();
}

async function updateRelationship(request: Request, env: Env) {
  const session = await sessionContext(request, env);
  if (!session) return json(request, { error: '請先登入 Starry ID' }, 401);
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return json(request, { error: 'Origin not allowed' }, 403);
  const input: any = await request.clone().json().catch(() => ({}));
  const field = text(input.field) as RelationField;
  if (!Object.prototype.hasOwnProperty.call(RELATION_TYPE, field)) return json(request, { error: '不支援的關係欄位' }, 400);
  const targetUserId = text(input.targetUserId) || session.userId;
  if (targetUserId !== session.userId && !session.isSuperAdmin) return json(request, { error: '只有超級管理員可以修改其他會員' }, 403);
  const relatedUserId = text(input.relatedUserId);
  const typedLabel = text(input.legacyLabel);
  if (relatedUserId && relatedUserId === targetUserId) return json(request, { error: '不能把自己設定成自己的上線或推薦人' }, 400);

  const db = (env as any).STARRY_ID_DB;
  const relationType = RELATION_TYPE[field];
  const before: any = await existingRelationship(db, targetUserId, relationType);
  const beforeLabel = text(before?.displayName || before?.legacyLabel);
  let label = typedLabel;
  let resolvedId = '';

  if (relatedUserId) {
    const candidate: any = await db.prepare(`SELECT u.id,u.status,p.name,p.amwayId,p.rank,p.approvedRank,p.rankApproved
      FROM users u LEFT JOIN profiles p ON p.userId=u.id WHERE u.id=? LIMIT 1`).bind(relatedUserId).first();
    if (!candidate || candidate.status !== 'active') return json(request, { error: '找不到這位 Starry ID 會員' }, 404);
    const approvedRank = Number(candidate.rankApproved || 0) === 1 ? text(candidate.approvedRank || candidate.rank) : '';
    if (!eligibleRank(field, approvedRank)) {
      return json(request, { error: field === 'platinumUpline' ? '這位會員尚未有白金以上的已審核獎銜' : field === 'diamondUpline' ? '這位會員尚未有鑽石以上的已審核獎銜' : '此會員不符合關聯資格' }, 409);
    }
    resolvedId = text(candidate.id);
    label = text(candidate.name) || text(candidate.amwayId);
  }

  const now = Date.now();
  if (!resolvedId && !label) {
    await db.prepare('DELETE FROM member_relationships WHERE userId=? AND relationType=?').bind(targetUserId, relationType).run();
  } else if (resolvedId) {
    await db.prepare(`INSERT INTO member_relationships
      (userId,relationType,relatedUserId,legacyLabel,resolutionStatus,updatedAt)
      VALUES (?,?,?,?,'resolved',?)
      ON CONFLICT(userId,relationType) DO UPDATE SET
        relatedUserId=excluded.relatedUserId,legacyLabel=excluded.legacyLabel,resolutionStatus='resolved',updatedAt=excluded.updatedAt`)
      .bind(targetUserId, relationType, resolvedId, label, now).run();
  } else {
    await db.prepare(`INSERT INTO member_relationships
      (userId,relationType,relatedUserId,legacyLabel,resolutionStatus,updatedAt)
      VALUES (?,?,NULL,?,'unresolved',?)
      ON CONFLICT(userId,relationType) DO UPDATE SET
        relatedUserId=NULL,legacyLabel=excluded.legacyLabel,resolutionStatus='unresolved',updatedAt=excluded.updatedAt`)
      .bind(targetUserId, relationType, label, now).run();
  }

  await db.prepare(`INSERT INTO profile_audit_logs
    (id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt)
    VALUES (?,?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(), targetUserId, 'starry-id', session.userId, field, beforeLabel, label, now
    ).run().catch(() => undefined);

  if ((env as any).DB) {
    try {
      await (env as any).DB.prepare(`UPDATE users SET ${ECHO_FIELD[field]}=? WHERE id=?`).bind(label, targetUserId).run();
    } catch (error) {
      console.warn('Starry ID relationship legacy dual-write skipped', {
        code: error instanceof Error ? error.message : 'unknown'
      });
    }
  }

  return json(request, {
    success: true,
    relationship: {
      field,
      relatedUserId: resolvedId || null,
      label,
      resolutionStatus: resolvedId ? 'resolved' : label ? 'unresolved' : 'empty'
    }
  });
}

export async function handleStarryIdProfileDirectory(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.hostname !== STAR_DOMAIN) return null;
  const method = request.method.toUpperCase();

  if (url.pathname === '/' && method === 'GET') {
    await ensureProfileOptionSchema(env).catch(() => undefined);
    return null;
  }

  if (url.pathname === '/api/profile-options') {
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: json(request, {}).headers });
    if (method === 'GET') {
      try {
        return json(request, { options: await readProfileOptions(env), source: 'starry-id-central' });
      } catch {
        return json(request, { error: '中央選項資料暫時無法讀取' }, 503);
      }
    }
    return json(request, { error: 'Method not allowed' }, 405);
  }

  if (url.pathname === '/api/profile-directory') {
    if (method === 'GET') return searchDirectory(request, env);
    return json(request, { error: 'Method not allowed' }, 405);
  }

  if (url.pathname === '/api/profile-relationship') {
    if (method === 'PUT') return updateRelationship(request, env);
    return json(request, { error: 'Method not allowed' }, 405);
  }

  return null;
}

export { PROFILE_OPTIONS };
