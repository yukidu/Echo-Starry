import appWorker from './categoryIntegrityRouter';
import type { Env } from './index';
import { deleteOrganizationStateForUser } from './organizationModel';

const SUPER_ADMIN_EMAIL = 'yukidu@gmail.com';
const SESSION_COOKIE = 'echostars_session';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,}$/;
const DISPLAY_SETTING_ID = 'global';

const DEFAULT_DISPLAY_SETTINGS = {
  mobile: { columns: 1, gap: 6, maxWidth: 760, fontScale: 1 },
  tablet: { portraitColumns: 1, landscapeColumns: 3, gap: 8, maxWidth: 1180, fontScale: 1 },
  desktop: { columns: 3, gap: 10, maxWidth: 1440, fontScale: 1 }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function displayJson(data: unknown, status = 200, cache = false) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache ? 'public, max-age=300' : 'no-store'
    }
  });
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  return Math.round(clampNumber(value, min, max, fallback));
}

function normalizeDisplaySettings(input: any) {
  return {
    mobile: {
      columns: clampInteger(input?.mobile?.columns, 1, 2, 1),
      gap: clampInteger(input?.mobile?.gap, 2, 24, 6),
      maxWidth: clampInteger(input?.mobile?.maxWidth, 320, 900, 760),
      fontScale: clampNumber(input?.mobile?.fontScale, 0.8, 1.4, 1)
    },
    tablet: {
      portraitColumns: clampInteger(input?.tablet?.portraitColumns, 1, 3, 1),
      landscapeColumns: clampInteger(input?.tablet?.landscapeColumns, 1, 4, 3),
      gap: clampInteger(input?.tablet?.gap, 2, 24, 8),
      maxWidth: clampInteger(input?.tablet?.maxWidth, 700, 1600, 1180),
      fontScale: clampNumber(input?.tablet?.fontScale, 0.8, 1.4, 1)
    },
    desktop: {
      columns: clampInteger(input?.desktop?.columns, 1, 4, 3),
      gap: clampInteger(input?.desktop?.gap, 2, 32, 10),
      maxWidth: clampInteger(input?.desktop?.maxWidth, 960, 2000, 1440),
      fontScale: clampNumber(input?.desktop?.fontScale, 0.8, 1.4, 1)
    }
  };
}

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function bearerToken(request: Request) {
  const match = request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i);
  return match?.[1] || '';
}

function cookieToken(request: Request) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    const token = part.slice(separator + 1).trim();
    return TOKEN_PATTERN.test(token) ? token : '';
  }
  return '';
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function verifiedActor(request: Request, env: Env) {
  if (!env.DB) return null;
  const token = bearerToken(request) || cookieToken(request);
  if (!TOKEN_PATTERN.test(token)) return null;

  const tokenHash = await hashToken(token);
  const row: any = await env.DB.prepare(`
    SELECT u.id, u.email, u.role, u.isBlocked, s.expiresAt
    FROM auth_sessions s
    JOIN users u ON u.id = s.userId
    WHERE s.tokenHash = ?
    LIMIT 1
  `).bind(tokenHash).first();

  if (!row || row.isBlocked || Number(row.expiresAt || 0) <= Date.now()) return null;
  return row;
}

async function readDisplaySettings(env: Env) {
  if (!env.DB) return DEFAULT_DISPLAY_SETTINGS;
  try {
    const row: any = await env.DB.prepare('SELECT value FROM site_display_settings WHERE id = ? LIMIT 1')
      .bind(DISPLAY_SETTING_ID).first();
    if (!row?.value) return DEFAULT_DISPLAY_SETTINGS;
    return normalizeDisplaySettings(JSON.parse(String(row.value)));
  } catch {
    // The table is created only when the super admin saves custom values.
    // Until then GET stays read-only and returns code defaults, saving D1 writes.
    return DEFAULT_DISPLAY_SETTINGS;
  }
}

async function saveDisplaySettings(request: Request, env: Env) {
  if (!env.DB) return displayJson({ error: '資料庫尚未連線' }, 503);
  const actor = await verifiedActor(request, env);
  if (!actor || normalizeEmail(actor.email) !== SUPER_ADMIN_EMAIL) {
    return displayJson({ error: '只有超級管理員可修改全站顯示設定' }, 403);
  }
  const body: any = await request.json().catch(() => ({}));
  const settings = normalizeDisplaySettings(body?.settings || body);
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS site_display_settings (
    id TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updatedAt INTEGER NOT NULL,
    updatedBy TEXT
  )`).run();
  await env.DB.prepare(`INSERT INTO site_display_settings(id,value,updatedAt,updatedBy)
    VALUES (?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt,updatedBy=excluded.updatedBy`)
    .bind(DISPLAY_SETTING_ID, JSON.stringify(settings), Date.now(), actor.id).run();
  return displayJson({ success: true, settings });
}

async function tableExists(db: any, name: string) {
  const row = await db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
  ).bind(name).first();
  return Boolean(row);
}

async function deleteMember(request: Request, env: Env, targetKey: string) {
  if (!env.DB) return json({ error: '資料庫尚未連線' }, 503);

  const actor = await verifiedActor(request, env);
  if (!actor || normalizeEmail(actor.email) !== SUPER_ADMIN_EMAIL) {
    return json({ error: '只有超級管理員可刪除會員' }, 403);
  }

  const normalizedKey = normalizeEmail(targetKey);
  const target: any = await env.DB.prepare(`
    SELECT id, email, name
    FROM users
    WHERE id = ? OR LOWER(TRIM(email)) = ?
    LIMIT 1
  `).bind(targetKey, normalizedKey).first();
  if (!target) return json({ error: '找不到此會員' }, 404);

  const targetEmail = normalizeEmail(target.email);
  if (targetEmail === SUPER_ADMIN_EMAIL || String(target.id) === String(actor.id)) {
    return json({ error: '超級管理員帳號不可刪除' }, 403);
  }

  const statements: any[] = [];
  if (await tableExists(env.DB, 'auth_sessions')) {
    statements.push(env.DB.prepare('DELETE FROM auth_sessions WHERE userId = ?').bind(target.id));
  }
  if (await tableExists(env.DB, 'playback_identity_aliases')) {
    statements.push(env.DB.prepare('DELETE FROM playback_identity_aliases WHERE memberId = ?').bind(target.id));
  }
  if (await tableExists(env.DB, 'playback_memories')) {
    statements.push(
      env.DB.prepare(`
        DELETE FROM playback_memories
        WHERE memberId = ? OR userIdentifier = ? OR LOWER(TRIM(userIdentifier)) = ?
      `).bind(target.id, target.id, targetEmail)
    );
  }
  if (await tableExists(env.DB, 'share_events')) {
    statements.push(
      env.DB.prepare('DELETE FROM share_events WHERE userId = ? OR LOWER(TRIM(userEmail)) = ?')
        .bind(target.id, targetEmail)
    );
  }
  if (await tableExists(env.DB, 'user_activity_logs')) {
    statements.push(
      env.DB.prepare('DELETE FROM user_activity_logs WHERE userId = ? OR LOWER(TRIM(userEmail)) = ?')
        .bind(target.id, targetEmail)
    );
  }
  for (const table of ['sticker_lucky_draws','upline_owners']) if(await tableExists(env.DB,table)) statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE userId = ?`).bind(target.id));
  if (await tableExists(env.DB, 'sticker_comment_rewards')) {
    statements.push(env.DB.prepare('DELETE FROM sticker_comment_rewards WHERE userId = ?').bind(target.id));
  }
  if (await tableExists(env.DB, 'sticker_unlocks')) {
    statements.push(env.DB.prepare('DELETE FROM sticker_unlocks WHERE userId = ?').bind(target.id));
  }
  if (await tableExists(env.DB, 'sticker_transactions')) {
    statements.push(env.DB.prepare('DELETE FROM sticker_transactions WHERE userId = ?').bind(target.id));
    statements.push(env.DB.prepare('UPDATE sticker_transactions SET actorUserId = NULL WHERE actorUserId = ?').bind(target.id));
  }
  if (await tableExists(env.DB, 'member_notifications')) {
    statements.push(env.DB.prepare('DELETE FROM member_notifications WHERE userId = ?').bind(target.id));
  }

  statements.push(env.DB.prepare('DELETE FROM users WHERE id = ?').bind(target.id));
  await env.DB.batch(statements);
  await deleteOrganizationStateForUser(env.DB, target.id);

  return json({
    success: true,
    deletedUser: {
      id: target.id,
      email: target.email,
      name: target.name
    }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (url.pathname === '/api/display-settings') {
      if (method === 'GET') {
        const settings = await readDisplaySettings(env);
        return displayJson({ settings }, 200, true);
      }
      if (method === 'PUT') return saveDisplaySettings(request, env);
      return displayJson({ error: 'Method not allowed' }, 405);
    }

    const match = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (match && method === 'DELETE') {
      try {
        return await deleteMember(request, env, decodeURIComponent(match[1]));
      } catch (error) {
        console.error('Admin member deletion failed:', error);
        return json({ error: '刪除會員失敗，請稍後再試' }, 500);
      }
    }

    return appWorker.fetch(request, env);
  }
};
