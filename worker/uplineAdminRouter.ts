import type { Env } from './index';

const SUPER_ADMIN_EMAIL = 'yukidu@gmail.com';
const SESSION_COOKIE = 'echostars_session';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,}$/;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function bearerToken(request: Request) {
  return request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i)?.[1] || '';
}

function cookieToken(request: Request) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    const token = part.slice(separator + 1).trim();
    return TOKEN_PATTERN.test(token) ? token : '';
  }
  return '';
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function verifiedActor(request: Request, env: Env) {
  if (!env.DB) return null;
  const token = bearerToken(request) || cookieToken(request);
  if (!TOKEN_PATTERN.test(token)) return null;
  const actor: any = await env.DB.prepare(`
    SELECT u.id,u.email,u.role,u.isAdminUser,u.isBlocked,s.expiresAt
    FROM auth_sessions s
    JOIN users u ON u.id=s.userId
    WHERE s.tokenHash=? LIMIT 1
  `).bind(await hashToken(token)).first();
  if (!actor || actor.isBlocked || Number(actor.expiresAt || 0) <= Date.now()) return null;
  return actor;
}

function canManageRules(actor: any) {
  return String(actor?.email || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL ||
    Boolean(actor?.isAdminUser) || actor?.role === '管理員' || actor?.role === '超級管理員';
}

async function ensureUplineTables(db: any) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS upline_owners (kind TEXT NOT NULL,name TEXT NOT NULL,userId TEXT NOT NULL,PRIMARY KEY(kind,name))'),
    db.prepare('CREATE TABLE IF NOT EXISTS upline_names (kind TEXT NOT NULL,name TEXT NOT NULL,PRIMARY KEY(kind,name))')
  ]);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.DB) return json({ error: '資料庫尚未連線' }, 503);
    const actor = await verifiedActor(request, env);
    if (!canManageRules(actor)) return json({ error: '需要管理員權限' }, 403);
    await ensureUplineTables(env.DB);

    const columns = { platinum: 'platinumUpline', diamond: 'diamondUpline' } as const;
    if (request.method === 'GET') {
      const results: any[] = [];
      for (const [kind, column] of Object.entries(columns)) {
        const rows = (await env.DB.prepare(`SELECT n.name,COUNT(u.id) AS members FROM
          (SELECT TRIM(${column}) AS name FROM users WHERE TRIM(COALESCE(${column},''))<>''
           UNION SELECT name FROM upline_names WHERE kind=?) n
          LEFT JOIN users u ON TRIM(u.${column})=n.name
          GROUP BY n.name ORDER BY n.name`).bind(kind).all()).results || [];
        results.push(...rows.map((row: any) => ({ ...row, kind })));
      }
      return json({ uplines: results });
    }

    if (request.method !== 'POST') return json({ error: '不支援此操作' }, 405);
    const body: any = await request.json().catch(() => ({}));
    const column = columns[body.kind as keyof typeof columns];
    const names = Array.isArray(body.names)
      ? [...new Set(body.names.map((value: any) => String(value).trim()).filter(Boolean))] as string[]
      : [];
    const target = String(body.target || '').trim();
    if (!column || !['save', 'merge', 'delete'].includes(body.action) || names.length > 200 ||
        target.length > 100 || names.some(name => name.length > 100) ||
        (body.action !== 'delete' && !target) || (body.action !== 'save' && !names.length)) {
      return json({ error: '請選擇名單與有效名稱' }, 400);
    }

    const statements: any[] = [];
    if (body.action !== 'delete') {
      const targetOwner: any = await env.DB.prepare('SELECT id FROM users WHERE TRIM(name)=?').bind(target).first();
      const owners = new Set<string>();
      for (const name of names) {
        const existing = await env.DB.prepare(
          'SELECT userId AS id FROM upline_owners WHERE kind=? AND name=? UNION SELECT id FROM users WHERE TRIM(name)=?'
        ).bind(body.kind, name, name).all();
        for (const row of existing.results || []) owners.add(String((row as any).id));
      }
      if (!targetOwner && owners.size > 1) {
        return json({ error: '所選姓名屬於不同會員，請以正確上手會員姓名作為合併目標' }, 409);
      }
      const ownerId = targetOwner?.id || [...owners][0];
      if (ownerId) statements.push(
        env.DB.prepare('INSERT OR REPLACE INTO upline_owners VALUES (?,?,?)').bind(body.kind, target, ownerId)
      );
    }

    if (body.action !== 'delete') {
      statements.push(env.DB.prepare('INSERT OR IGNORE INTO upline_names VALUES (?,?)').bind(body.kind, target));
    }
    for (const name of names) {
      statements.push(
        env.DB.prepare(`UPDATE users SET ${column}=? WHERE TRIM(${column})=?`)
          .bind(body.action === 'delete' ? '' : target, name)
      );
      if (name !== target || body.action === 'delete') {
        statements.push(env.DB.prepare('DELETE FROM upline_names WHERE kind=? AND name=?').bind(body.kind, name));
        statements.push(env.DB.prepare('DELETE FROM upline_owners WHERE kind=? AND name=?').bind(body.kind, name));
      }
    }
    if (statements.length) await env.DB.batch(statements);
    return json({ success: true });
  }
};
