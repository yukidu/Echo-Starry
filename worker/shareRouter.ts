import { pinyin } from 'pinyin-pro';
import appWorker, { type Env } from './index';
import { shareMetadata } from '../shared/shareMetadata';

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*'
};

const schemaReady = new WeakMap<object, Promise<void>>();

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

async function ensureShareSchema(db: any) {
  if (!db) return;
  const key = db as object;
  if (!schemaReady.has(key)) {
    const promise = (async () => {
      const { results } = await db.prepare('PRAGMA table_info(tracks)').all();
      if (!results?.length) throw new Error('Missing database table: tracks');
      if (!results.some((row: any) => row.name === 'shareSlug')) {
        try {
          await db.prepare('ALTER TABLE tracks ADD COLUMN shareSlug TEXT').run();
        } catch (error) {
          const check = await db.prepare('PRAGMA table_info(tracks)').all();
          if (!check.results.some((row: any) => row.name === 'shareSlug')) throw error;
        }
      }
      await db.prepare(`
        CREATE UNIQUE INDEX IF NOT EXISTS tracks_share_slug_unique
        ON tracks(shareSlug)
        WHERE shareSlug IS NOT NULL AND shareSlug <> ''
      `).run();
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS vip_share_access (
          trackId TEXT PRIMARY KEY,
          password TEXT NOT NULL,
          updatedAt INTEGER NOT NULL
        )
      `).run();
    })();
    schemaReady.set(key, promise);
    promise.catch(() => schemaReady.delete(key));
  }
  await schemaReady.get(key);
}

export function romanizeSpeakerName(name: string) {
  const source = String(name || '').trim();
  if (!source) return 'SPEAKER';

  const syllables = pinyin(source, {
    toneType: 'none',
    type: 'array',
    surname: 'head',
    traditional: true,
    nonZh: 'consecutive',
    v: false
  }) as string[];

  const tokens = syllables.flatMap(part =>
    String(part)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ü/gi, 'u')
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter(Boolean)
  );

  return tokens.join('-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'SPEAKER';
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function randomVipPassword() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return String(value[0] % 10000).padStart(4, '0');
}

function validVipPassword(value: string) {
  return /^\d{4,12}$/.test(value);
}

async function assignShareSlug(db: any, trackId: string) {
  await ensureShareSchema(db);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const track: any = await db.prepare(
      'SELECT id, speaker, shareSlug, isPrivateVip FROM tracks WHERE id = ?'
    ).bind(trackId).first();
    if (!track) return { error: '音檔不存在', status: 404 } as const;
    if (Boolean(track.isPrivateVip)) {
      return { error: '私秘 VIP 音檔請使用 VIP 專屬分享連結', status: 409 } as const;
    }

    const base = romanizeSpeakerName(track.speaker || 'SPEAKER');
    const normalPattern = new RegExp(`^${escapeRegExp(base)}-(\\d{3})$`);
    const current = String(track.shareSlug || '').trim();
    if (normalPattern.test(current)) return { shareSlug: current } as const;

    const { results } = await db.prepare(
      'SELECT shareSlug FROM tracks WHERE shareSlug LIKE ?'
    ).bind(`${base}-%`).all();
    const used = new Set<number>();
    for (const row of results || []) {
      const match = String((row as any).shareSlug || '').match(normalPattern);
      if (match) used.add(Number(match[1]));
    }

    let sequence = 1;
    while (used.has(sequence)) sequence += 1;
    if (sequence > 999) return { error: '此講者分享序號已達 999 筆上限', status: 409 } as const;
    const shareSlug = `${base}-${String(sequence).padStart(3, '0')}`;

    try {
      await db.prepare('UPDATE tracks SET shareSlug = ? WHERE id = ?').bind(shareSlug, trackId).run();
      const saved: any = await db.prepare('SELECT shareSlug FROM tracks WHERE id = ?').bind(trackId).first();
      if (String(saved?.shareSlug || '').trim() === shareSlug) return { shareSlug } as const;
    } catch (error) {
      const message = String((error as Error)?.message || error || '');
      if (/unique|constraint/i.test(message)) continue;
      throw error;
    }
  }

  return { error: '分享序號建立失敗，請重試', status: 409 } as const;
}

async function getAuthorizedVipTrack(db: any, trackId: string, userEmail: string) {
  await ensureShareSchema(db);
  const track: any = await db.prepare(`
    SELECT id, title, speaker, shareSlug, isPrivateVip, uploaderEmail,
           vipExpiresAt, vipDurationDays
    FROM tracks WHERE id = ?
  `).bind(trackId).first();
  if (!track) return { error: '音檔不存在', status: 404 } as const;
  if (!Boolean(track.isPrivateVip)) return { error: '此音檔不是私秘 VIP 音檔', status: 409 } as const;

  const actor = String(userEmail || '').trim().toLowerCase();
  const uploader = String(track.uploaderEmail || '').trim().toLowerCase();
  if (actor !== 'yukidu@gmail.com' && (!actor || actor !== uploader)) {
    return { error: '只能管理自己上傳的 VIP 音檔', status: 403 } as const;
  }
  return { track } as const;
}

async function assignVipShareSlug(db: any, track: any) {
  const base = romanizeSpeakerName(track.speaker || 'SPEAKER');
  const vipPattern = new RegExp(`^${escapeRegExp(base)}-S(\\d{3})$`);
  const current = String(track.shareSlug || '').trim();
  if (vipPattern.test(current)) return current;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { results } = await db.prepare(
      'SELECT shareSlug FROM tracks WHERE shareSlug LIKE ?'
    ).bind(`${base}-S%`).all();
    const used = new Set<number>();
    for (const row of results || []) {
      const match = String((row as any).shareSlug || '').match(vipPattern);
      if (match) used.add(Number(match[1]));
    }

    let sequence = 1;
    while (used.has(sequence)) sequence += 1;
    if (sequence > 999) throw new Error('此講者 VIP 分享序號已達 999 筆上限');
    const candidate = `${base}-S${String(sequence).padStart(3, '0')}`;

    try {
      // Retire the old UUID token at the same time the VIP short URL is born.
      await db.prepare('UPDATE tracks SET shareSlug = ?, vipToken = NULL WHERE id = ?')
        .bind(candidate, track.id).run();
      return candidate;
    } catch (error) {
      const message = String((error as Error)?.message || error || '');
      if (/unique|constraint/i.test(message)) continue;
      throw error;
    }
  }

  throw new Error('VIP 分享序號建立失敗，請重試');
}

async function upsertVipPassword(db: any, trackId: string, requestedPassword?: string) {
  const existing: any = await db.prepare(
    'SELECT password FROM vip_share_access WHERE trackId = ?'
  ).bind(trackId).first();
  const existingPassword = String(existing?.password || '').trim();

  if (requestedPassword === undefined && validVipPassword(existingPassword)) {
    return { password: existingPassword } as const;
  }

  const password = requestedPassword !== undefined
    ? String(requestedPassword).trim()
    : randomVipPassword();

  if (!validVipPassword(password)) {
    return { error: 'VIP 密碼需為 4–12 位純數字', status: 400 } as const;
  }
  if (password === existingPassword) return { password } as const;

  await db.prepare(`
    INSERT INTO vip_share_access (trackId, password, updatedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(trackId) DO UPDATE SET
      password = excluded.password,
      updatedAt = excluded.updatedAt
  `).bind(trackId, password, Date.now()).run();

  return { password } as const;
}

async function prepareVipShare(db: any, trackId: string, userEmail: string, requestedPassword?: string) {
  const authorization = await getAuthorizedVipTrack(db, trackId, userEmail);
  if ('error' in authorization) return { error: authorization.error, status: authorization.status } as const;

  const shareSlug = await assignVipShareSlug(db, authorization.track);
  const passwordResult = await upsertVipPassword(db, trackId, requestedPassword);
  if ('error' in passwordResult) return { error: passwordResult.error, status: passwordResult.status } as const;

  return {
    shareSlug,
    password: passwordResult.password,
    vipExpiresAt: authorization.track.vipExpiresAt ?? null,
    vipDurationDays: Number(authorization.track.vipDurationDays || 0)
  } as const;
}

function escapeAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function vipUnlockScript(trackId: string, password: string) {
  const safeId = JSON.stringify(String(trackId)).replace(/</g, '\\u003c');
  const safePassword = JSON.stringify(password);
  return `<script>try{const passwords=JSON.parse(localStorage.getItem('sq_vip_passwords')||'{}');passwords[${safeId}]=${safePassword};localStorage.setItem('sq_vip_passwords',JSON.stringify(passwords));const id=${safeId};const key='sq_unlocked_vip_tracks';const list=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(list)&&!list.includes(id)){list.push(id);localStorage.setItem(key,JSON.stringify(list));}}catch{}</script>`;
}

async function serveSharePage(request: Request, env: Env, slug: string) {
  if (!env.DB) return new Response('分享服務暫時無法使用', { status: 503 });
  await ensureShareSchema(env.DB);
  const track: any = await env.DB.prepare(`
    SELECT id, title, speaker, speakerAvatar, shareSlug, isPrivateVip, vipExpiresAt
    FROM tracks WHERE shareSlug = ?
  `).bind(slug).first();
  if (!track) return new Response('分享連結不存在', { status: 404 });

  const isPrivateVip = Boolean(track.isPrivateVip);
  const isVipSlug = /-S\d{3}$/.test(slug);
  const url = new URL(request.url);
  let suppliedPassword = '';

  if (isPrivateVip) {
    if (!isVipSlug) return new Response('分享連結不存在', { status: 404 });
    if (track.vipExpiresAt && Date.now() > Number(track.vipExpiresAt)) {
      return new Response('VIP 分享連結已過期', { status: 410 });
    }

    try {
      suppliedPassword = decodeURIComponent(url.search.startsWith('?') ? url.search.slice(1) : '');
    } catch {
      suppliedPassword = '';
    }
    if (!validVipPassword(suppliedPassword)) {
      return new Response('VIP 密碼格式錯誤', { status: 403 });
    }

    const access: any = await env.DB.prepare(
      'SELECT password FROM vip_share_access WHERE trackId = ?'
    ).bind(track.id).first();
    if (!access || String(access.password) !== suppliedPassword) {
      return new Response('VIP 密碼錯誤', { status: 403 });
    }
  } else if (isVipSlug) {
    return new Response('分享連結不存在', { status: 404 });
  }

  if (!env.ASSETS) return new Response('網站建置未完成', { status: 503 });
  const shellRequest = new Request(new URL('/index.html', url.origin), {
    method: 'GET',
    headers: { Accept: 'text/html' }
  });
  const shell = await env.ASSETS.fetch(shellRequest);
  if (!shell.ok) return new Response('網站建置未完成', { status: 503 });

  const metadataHtml = shareMetadata(
    await shell.text(),
    track,
    url.origin,
    slug,
    isPrivateVip ? suppliedPassword : ''
  );
  const vipMeta = isPrivateVip ? '<meta name="echostars-share-vip" content="1">' : '';
  const unlockScript = isPrivateVip ? vipUnlockScript(String(track.id), suppliedPassword) : '';
  const html = metadataHtml.replace(
    '</head>',
    `<meta name="echostars-share-track" content="${escapeAttribute(String(track.id))}">${vipMeta}${unlockScript}</head>`
  );
  const headers = new Headers(shell.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', isPrivateVip ? 'no-store' : 'public, max-age=60');
  if (isPrivateVip) {
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  headers.delete('Content-Length');
  headers.delete('ETag');
  headers.delete('Content-Encoding');
  return new Response(html, { status: 200, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    const vipShareResetApi = path.match(/^\/api\/tracks\/([^/]+)\/vip-share\/reset$/);
    if (vipShareResetApi) {
      if (method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      if (!env.DB) return json({ error: '資料庫尚未連線' }, 503);
      try {
        const trackId = decodeURIComponent(vipShareResetApi[1]);
        const body: any = await request.json().catch(() => ({}));
        const durationDays = Number(body.durationDays ?? 0);
        if (!Number.isSafeInteger(durationDays) || durationDays < 0 || durationDays > 36500) {
          return json({ error: 'VIP 有效天數格式錯誤' }, 400);
        }

        const authorization = await getAuthorizedVipTrack(env.DB, trackId, body.userEmail || '');
        if ('error' in authorization) return json({ error: authorization.error }, authorization.status);
        const shareSlug = await assignVipShareSlug(env.DB, authorization.track);
        const passwordResult = await upsertVipPassword(env.DB, trackId, randomVipPassword());
        if ('error' in passwordResult) return json({ error: passwordResult.error }, passwordResult.status);
        const vipExpiresAt = durationDays === 0 ? null : Date.now() + durationDays * 86400000;
        await env.DB.prepare(`
          UPDATE tracks
          SET vipToken = NULL, vipExpiresAt = ?, vipDurationDays = ?
          WHERE id = ?
        `).bind(vipExpiresAt, durationDays, trackId).run();

        return json({
          success: true,
          shareSlug,
          password: passwordResult.password,
          vipExpiresAt,
          vipDurationDays: durationDays,
          url: `${url.origin}/share/${shareSlug}?${passwordResult.password}`
        });
      } catch (error) {
        console.error('VIP share reset failed:', error);
        return json({ error: 'VIP 連結重置失敗，請重試' }, 500);
      }
    }

    const vipShareApi = path.match(/^\/api\/tracks\/([^/]+)\/vip-share$/);
    if (vipShareApi) {
      if (method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      if (!env.DB) return json({ error: '資料庫尚未連線' }, 503);
      try {
        const trackId = decodeURIComponent(vipShareApi[1]);
        const body: any = await request.json().catch(() => ({}));
        const requestedPassword = body.password === undefined ? undefined : String(body.password);
        const result = await prepareVipShare(env.DB, trackId, body.userEmail || '', requestedPassword);
        if ('error' in result) return json({ error: result.error }, result.status);
        return json({
          success: true,
          shareSlug: result.shareSlug,
          password: result.password,
          vipExpiresAt: result.vipExpiresAt,
          vipDurationDays: result.vipDurationDays,
          url: `${url.origin}/share/${result.shareSlug}?${result.password}`
        });
      } catch (error) {
        console.error('VIP share preparation failed:', error);
        return json({ error: '建立 VIP 分享連結失敗' }, 500);
      }
    }

    const slugApi = path.match(/^\/api\/tracks\/([^/]+)\/share-slug$/);
    if (slugApi) {
      if (method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      if (!env.DB) return json({ error: '資料庫尚未連線' }, 503);
      try {
        const trackId = decodeURIComponent(slugApi[1]);
        const result = await assignShareSlug(env.DB, trackId);
        if ('error' in result) return json({ error: result.error }, result.status);
        return json({
          success: true,
          shareSlug: result.shareSlug,
          url: `${url.origin}/share/${result.shareSlug}`
        });
      } catch (error) {
        console.error('Share slug allocation failed:', error);
        return json({ error: '建立分享連結失敗' }, 500);
      }
    }

    if (path.startsWith('/share/') && method === 'GET') {
      const slug = decodeURIComponent(path.slice('/share/'.length)).trim();
      // Public links: NAME-001. Private VIP links: NAME-S001?1234.
      if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)*-(?:S)?\d{3}$/.test(slug)) {
        return new Response('分享連結不存在', { status: 404 });
      }
      try {
        return await serveSharePage(request, env, slug);
      } catch (error) {
        console.error('Share page failed:', error);
        return new Response('分享頁載入失敗', { status: 500 });
      }
    }

    return appWorker.fetch(request, env);
  }
};
