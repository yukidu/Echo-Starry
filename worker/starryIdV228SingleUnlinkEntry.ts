import privacyCrawlerRouter from './privacyCrawlerRouter';
import type { Env } from './index';
import { sessionContext } from './starryIdProfileDirectoryRouter';
import { ensureSpouseSchema } from './starryIdSpouseSchema';

const STAR_DOMAIN = 'id.starry.phd';
const numeric = /^[0-9]+$/;
const synthetic = /^n[0-9]{7}$/;
const clean = (value: unknown) => value == null ? '' : String(value).trim();

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet, noimageindex'
    }
  });
}

function copyHeaders(response: Response) {
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  return headers;
}

async function activeLink(db: any, userId: string) {
  return db.prepare(
    "SELECT * FROM spouse_links WHERE (userA=? OR userB=?) AND status IN ('active','unlink_pending') LIMIT 1"
  ).bind(userId, userId).first();
}

async function member(db: any, userId: string) {
  return db.prepare('SELECT userId,name,amwayId FROM profiles WHERE userId=?').bind(userId).first();
}

async function numberOwner(db: any, number: string, excludeUserId: string) {
  return db.prepare('SELECT userId FROM profiles WHERE amwayId=? AND userId<>? LIMIT 1')
    .bind(number, excludeUserId).first();
}

async function generateNonDistributorNumber(db: any) {
  for (let i = 0; i < 40; i++) {
    const bits = new Uint32Array(1);
    crypto.getRandomValues(bits);
    const number = 'n' + String(bits[0] % 10000000).padStart(7, '0');
    const exists = await db.prepare('SELECT userId FROM profiles WHERE amwayId=? LIMIT 1').bind(number).first();
    const reserved = await db.prepare('SELECT userId FROM non_distributor_ids WHERE number=? LIMIT 1').bind(number).first();
    const card = await db.prepare('SELECT userId FROM public_cards WHERE slug=? OR cardNumber=? LIMIT 1')
      .bind(number, number).first().catch(() => null);
    if (!exists && !reserved && !card) return number;
  }
  throw new Error('no_available_non_distributor_number');
}

async function audit(db: any, userId: string, actorUserId: string, before: string, after: string, fieldName: string) {
  await db.prepare(
    'INSERT INTO profile_audit_logs (id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(crypto.randomUUID(), userId, 'starry-id', actorUserId, fieldName, before, after, Date.now()).run().catch(() => undefined);
}

async function unlinkImmediately(request: Request, env: Env, input: any): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return json({ error: 'Origin not allowed' }, 403);

  const session = await sessionContext(request, env);
  if (!session) return json({ error: '請先登入 Starry ID' }, 401);

  const targetUserId = clean(input.targetUserId);
  if (targetUserId && targetUserId !== session.userId && !session.isSuperAdmin) {
    return json({ error: '沒有管理權限' }, 403);
  }

  const actorUserId = targetUserId && session.isSuperAdmin ? targetUserId : session.userId;
  const db = (env as any).STARRY_ID_DB;
  if (!db) return json({ error: '中央會員資料庫未設定' }, 503);
  await ensureSpouseSchema(db);

  const link: any = await activeLink(db, actorUserId);
  if (!link) return json({ error: '目前沒有可解除的夫妻關係' }, 404);

  const otherUserId = link.userA === actorUserId ? link.userB : link.userA;
  const keepUserId = clean(input.keepUserId);
  if (keepUserId !== actorUserId && keepUserId !== otherUserId) {
    return json({ error: '請指定解除後誰保留原直銷商編號' }, 400);
  }

  const losingUserId = keepUserId === link.userA ? link.userB : link.userA;
  const losingMember: any = await member(db, losingUserId);
  const beforeNumber = clean(losingMember?.amwayId);
  let replacement = clean(input.replacement);
  let autoAssigned = false;

  if (losingUserId !== actorUserId && !session.isSuperAdmin) {
    replacement = await generateNonDistributorNumber(db);
    autoAssigned = true;
  } else {
    if (!replacement) {
      return json({ error: '若由對方保留原編號，請先選擇自己的新編號或改為非直銷商' }, 400);
    }
    if (replacement === 'nonDistributor') {
      replacement = await generateNonDistributorNumber(db);
    } else if (!numeric.test(replacement)) {
      return json({ error: '新編號只能輸入純數字，或選擇非直銷商' }, 400);
    }
    if (await numberOwner(db, replacement, losingUserId)) {
      return json({ error: '新編號已被使用' }, 409);
    }
  }

  const now = Date.now();
  const statements = [
    db.prepare('UPDATE profiles SET amwayId=?,updatedAt=? WHERE userId=?').bind(replacement, now, losingUserId),
    db.prepare('DELETE FROM spouse_links WHERE id=?').bind(link.id),
    db.prepare('DELETE FROM spouse_slots WHERE linkId=?').bind(link.id),
    db.prepare('DELETE FROM non_distributor_ids WHERE userId=?').bind(losingUserId)
  ];

  if (synthetic.test(replacement)) {
    statements.push(
      db.prepare('INSERT INTO non_distributor_ids(userId,number,createdAt) VALUES(?,?,?)').bind(losingUserId, replacement, now),
      db.prepare('INSERT INTO non_distributor_history(userId,lastNumber,updatedAt) VALUES(?,?,?) ON CONFLICT(userId) DO UPDATE SET lastNumber=excluded.lastNumber,updatedAt=excluded.updatedAt')
        .bind(losingUserId, replacement, now)
    );
  }

  await db.batch(statements);
  await audit(db, losingUserId, actorUserId, beforeNumber, replacement, 'spouse-single-unlink');
  await audit(db, actorUserId, actorUserId, otherUserId, '', 'spouse-relation');

  return json({
    success: true,
    status: 'unlinked',
    keptByUserId: keepUserId,
    reassignedUserId: losingUserId,
    replacement,
    autoAssigned
  });
}

async function normalizeLegacyUnlinkStatus(request: Request, env: Env, ctx?: any) {
  const response = await privacyCrawlerRouter.fetch(request, env, ctx);
  if (!response.ok || !(response.headers.get('Content-Type') || '').includes('application/json')) return response;
  const data: any = await response.clone().json().catch(() => null);
  if (data?.spouse?.status !== 'unlink_pending') return response;

  data.spouse = {
    ...data.spouse,
    status: 'active',
    unlinkRequestedBy: null,
    keepUserId: null
  };
  return new Response(JSON.stringify(data), {
    status: response.status,
    statusText: response.statusText,
    headers: copyHeaders(response)
  });
}

async function polishMemberCenterCopy(request: Request, env: Env, ctx?: any) {
  const response = await privacyCrawlerRouter.fetch(request, env, ctx);
  if (!(response.headers.get('Content-Type') || '').includes('text/html')) return response;
  let html = await response.text();
  html = html
    .replace(
      '解除夫妻關係：按「確定」由你保留原直銷商編號；按「取消」由對方保留。下一步仍需另一方確認。',
      '解除夫妻關係：按「確定」由你保留原直銷商編號；按「取消」由對方保留。解除後立即生效，不需要另一方確認。'
    )
    .replace('已提出解除申請，待另一位會員確認', '夫妻關係已解除');
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers: copyHeaders(response)
  });
}

export default {
  async fetch(request: Request, env: Env, ctx?: any): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname !== STAR_DOMAIN) return privacyCrawlerRouter.fetch(request, env, ctx);

    if (request.method === 'POST' && url.pathname === '/api/spouse-action') {
      const input: any = await request.clone().json().catch(() => ({}));
      const action = clean(input.action);
      if (action === 'request-unlink' || action === 'unlink') {
        try {
          return await unlinkImmediately(request, env, input);
        } catch (error) {
          console.warn('v228 unilateral spouse unlink failed', { code: error instanceof Error ? error.message : 'unknown' });
          return json({ error: '解除夫妻關係失敗，請稍後再試' }, 503);
        }
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/spouse-status') {
      return normalizeLegacyUnlinkStatus(request, env, ctx);
    }

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/my-card')) {
      return polishMemberCenterCopy(request, env, ctx);
    }

    return privacyCrawlerRouter.fetch(request, env, ctx);
  }
};
