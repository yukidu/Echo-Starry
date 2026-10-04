import { legacyData } from '../shared/legacyData';
import type { Env } from './index';

// These endpoints share one persistent contract with the development server.
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
const parse = (value: any, fallback: any) => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value ?? fallback;
    if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : fallback;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch { return fallback; }
};
const boolFields = ['rankApproved', 'isContributor', 'isAdminUser', 'isBlocked', 'canUpload'];
const userColumns: Record<string, string> = {
  auditedBy: 'TEXT', auditedAt: 'TEXT',
  residence: 'TEXT', birthday: 'TEXT', approvedRank: 'TEXT', rankAuditType: 'TEXT', canUpload: 'INTEGER DEFAULT 0',
  playCount: 'INTEGER DEFAULT 0', googleAvatar: 'TEXT', avatarUploadCount: 'INTEGER DEFAULT 0', avatarUploadMonth: 'TEXT',
  profileEditCount: 'INTEGER DEFAULT 0', profileEditMonth: 'TEXT', zodiac: 'TEXT', talentNumber: 'INTEGER', lifeNumber: 'INTEGER'
};
const editable = ['name', 'avatar', 'phone', 'amwayId', 'center', 'rank', 'approvedRank', 'rankApproved', 'rankAuditStatus', 'rankAuditType',
  'joinReason', 'stayReason', 'sponsor', 'platinumUpline', 'diamondUpline', 'birthDate', 'notes', 'rankUpdatedAt', ...Object.keys(userColumns).filter(k => k !== 'googleAvatar')];
const initialized = new WeakMap<object, Promise<void>>();

async function ensureSchema(db: any) {
  if (!initialized.has(db)) {
    const promise = (async () => {
      for (const [table, fields] of Object.entries({ users: userColumns, tracks: { keywordMeta: "TEXT DEFAULT '{}'" }, playback_memories: { lastListenDate: 'TEXT', finishDate: 'TEXT' } })) {
        const { results } = await db.prepare(`PRAGMA table_info(${table})`).all();
        if (!results?.length) throw new Error(`Missing database table: ${table}`);
        const existing = new Set(results.map((r: any) => r.name));
        for (const [name, type] of Object.entries(fields)) {
          if (!existing.has(name)) {
            try { await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`).run(); }
            catch (error) { // Another Worker may have added the same column concurrently.
              const check = await db.prepare(`PRAGMA table_info(${table})`).all();
              if (!check.results.some((r: any) => r.name === name)) throw error;
            }
          }
        }
      }
      await db.prepare('CREATE TABLE IF NOT EXISTS keyword_catalog (name TEXT PRIMARY KEY, createdAt INTEGER NOT NULL)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS comments_track_created ON comments(trackId, createdAt)').run();
      await db.prepare('CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY)').run();
      if (!await db.prepare("SELECT name FROM app_migrations WHERE name = 'remove-demo-v3'").first()) {
        const statements = [
          ...legacyData.comments.map(c => db.prepare('DELETE FROM comments WHERE id = ? AND content = ?').bind(c.id,c.content)),
          ...legacyData.tracks.map(t => db.prepare('DELETE FROM tracks WHERE id = ? AND title = ? AND audioUrl = ?').bind(t.id,t.title,t.audioUrl)),
          ...legacyData.users.filter(u=>u.email.endsWith('@example.com')).map(u => db.prepare('DELETE FROM users WHERE id = ? AND email = ? AND name = ?').bind(u.id,u.email,u.name)),
          ...Object.entries({sponsor:'創辦人團隊',platinumUpline:'杜鑽石',diamondUpline:'杜鑽石',phone:'0912-345-678',amwayId:'TW-888888',center:'台北旗艦中心'}).map(([field,value])=>db.prepare(`UPDATE users SET ${field} = '' WHERE id = 'u-admin' AND email = 'yukidu@gmail.com' AND ${field} = ?`).bind(value)),
          db.prepare("INSERT OR IGNORE INTO app_migrations(name) VALUES ('remove-demo-v3')")
        ];
        await db.batch(statements);
      }
      if (!await db.prepare("SELECT name FROM app_migrations WHERE name = 'rename-center-v3-5'").first()) {
        await db.batch([
          db.prepare("UPDATE users SET center = '非寰宇體系' WHERE center = '非繁星體系'"),
          db.prepare("INSERT OR IGNORE INTO app_migrations(name) VALUES ('rename-center-v3-5')")
        ]);
      }
    })();
    initialized.set(db, promise);
    promise.catch(() => initialized.delete(db));
  }
  await initialized.get(db);
}

function normalizeUser(row: any) {
  const user = { ...row, birthday: row.birthday ?? row.birthDate ?? '' };
  if (user.center === '非繁星體系') user.center = '非寰宇體系';
  boolFields.forEach(k => user[k] = Boolean(user[k]));
  user.canUpload = Boolean(row.canUpload || row.isContributor);
  if (user.email?.toLowerCase().trim() === 'yukidu@gmail.com') Object.assign(user, { role: '超級管理員', isAdminUser: true, isContributor: true, canUpload: true });
  return user;
}
function normalizeTrack(row: any) {
  const track = { ...row, isPrivateVip: Boolean(row.isPrivateVip) };
  ['categories', 'keywords', 'externalVideos', 'externalPpts', 'externalFiles', 'likedBy'].forEach(k => track[k] = parse(row[k], []));
  track.ratings = parse(row.ratings, {});
  track.keywordMeta = parse(row.keywordMeta, {});
  return track;
}

function looksLikeLegacyPartialUpdateDamage(row: any) {
  const emptyArray = (value: any) => {
    const parsed = parse(value, []);
    return Array.isArray(parsed) && parsed.length === 0;
  };
  return row?.title === '無標題'
    && row?.speaker === '未知講者'
    && !String(row?.speakerAvatar || '').trim()
    && emptyArray(row?.categories)
    && !String(row?.series || '').trim()
    && !String(row?.speechDate || '').trim()
    && !String(row?.seriesOrder || '').trim()
    && !String(row?.description || '').trim()
    && Boolean(String(row?.audioUrl || '').match(/ES\d{4,}-/i));
}

function cleanCoverSpeakerName(key: string) {
  const fileName = decodeURIComponent(String(key || '')).split('/').pop() || '';
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/^cover-/i, '')
    .replace(/-\d{10,14}-[a-z0-9]{4,8}$/i, '')
    .replace(/\d+$/, '')
    .replace(/-/g, ' ')
    .trim();
}

function recoverTrackIdentityFromAudioUrl(audioUrl: string, coverObjects: any[]) {
  let decoded = String(audioUrl || '');
  try { decoded = decodeURIComponent(decoded); } catch {}
  const fileName = decoded.split('/').pop() || '';
  const withoutExt = fileName.replace(/\.[^.]+$/, '');
  const match = withoutExt.match(/^ES\d{4,}-(.+?)-(.+)$/i);
  if (!match) return null;

  const speakerPart = match[1].trim();
  const title = match[2].trim();
  if (!speakerPart || !title) return null;

  const compact = (value: string) => value.replace(/[\s-]+/g, '').toLowerCase();
  const compactSpeakerPart = compact(speakerPart);
  const candidates = (coverObjects || [])
    .map((obj: any) => ({ obj, name: cleanCoverSpeakerName(obj.key) }))
    .filter((item: any) => item.name && compactSpeakerPart.startsWith(compact(item.name)))
    .sort((a: any, b: any) => compact(b.name).length - compact(a.name).length);

  const coverMatch = candidates[0];
  const speaker = coverMatch?.name || speakerPart;
  const normalizedSpeaker = compact(speaker);
  const rankSuffix = compactSpeakerPart.startsWith(normalizedSpeaker)
    ? speakerPart.slice(Math.min(speakerPart.length, speaker.replace(/[\s-]+/g, '').length)).trim()
    : '';

  return {
    title,
    speaker,
    speakerRank: rankSuffix || '無',
    speakerAvatar: coverMatch?.obj?.key
      ? `/api/r2/file/${encodeURIComponent(coverMatch.obj.key)}`
      : ''
  };
}
const normalizeComment = (row: any) => ({ ...row, isAdmin: Boolean(row.isAdmin), likedBy: parse(row.likedBy, []) });
const keysFor = (body: any) => [...new Set([body.identifier, body.userEmail, body.userId, body.deviceId].filter(x => typeof x === 'string' && x.trim()).map(x => x.includes('@') ? x.toLowerCase().trim() : x))];

async function seedTracks(db: any, defaults: any[]) {
  // Persist the initial demo list once; deliberately deleted tracks stay deleted.
  const done = await db.prepare("SELECT name FROM app_migrations WHERE name = 'persistent-initial-tracks'").first();
  if (done) return;
  const count = await db.prepare('SELECT COUNT(*) AS count FROM tracks').first();
  const statements = [];
  if (!count.count) {
    for (const track of defaults) {
      const columns = ['id', 'title', 'speaker', 'speakerRank', 'speakerAvatar', 'categories', 'keywords', 'rating', 'ratingCount', 'commentsCount', 'likes', 'duration', 'durationSeconds', 'audioUrl', 'series', 'speechDate', 'requiredRank', 'seriesOrder', 'uploadDate', 'description', 'uploaderId', 'uploaderEmail', 'playCount', 'likedBy', 'ratings'];
      const values = columns.map(k => ['categories', 'keywords', 'likedBy'].includes(k) ? JSON.stringify(track[k] || []) : k === 'ratings' ? JSON.stringify(track[k] || {}) : track[k] ?? (['ratingCount', 'commentsCount', 'likes', 'playCount'].includes(k) ? 0 : ''));
      statements.push(db.prepare(`INSERT OR IGNORE INTO tracks (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).bind(...values));
    }
  }
  statements.push(db.prepare("INSERT OR IGNORE INTO app_migrations(name) VALUES ('persistent-initial-tracks')"));
  await db.batch(statements);
}

export async function communityApi(request: Request, env: Env, defaults: any[]): Promise<Response | null> {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  const trackAction = path.match(/^\/api\/tracks\/([^/]+)\/(like|rate)$/);
  const commentList = path.match(/^\/api\/tracks\/([^/]+)\/comments$/);
  const commentAction = path.match(/^\/api\/comments\/([^/]+)(\/like)?$/);
  const userUpdate = path.match(/^\/api\/users\/([^/]+)$/);
  const auditAction = path.match(/^\/api\/users\/([^/]+)\/audit-rank$/);
  const keywordAction = path.match(/^\/api\/tracks\/([^/]+)\/keywords(?:\/(.+))?$/);
  const keywordAdmin = ['/api/keywords/rename', '/api/keywords/delete'].includes(path);
  const permissionAction = path.match(/^\/api\/users\/([^/]+)\/(contributor|admin-role|block)$/);
  const batchUsers = path === '/api/admin/users/batch' && method === 'PUT';
  const trackWrite = (path === '/api/tracks' && method === 'POST') || (/^\/api\/tracks\/[^/]+$/.test(path) && method === 'PUT');
  const keywordList = path === '/api/keywords' && method === 'GET';
  const handled = trackWrite || keywordList || batchUsers || (permissionAction && method === 'PUT') || (auditAction && method === 'PUT') || keywordAction || keywordAdmin || (path === '/api/tracks' && method === 'GET') || (trackAction && method === 'POST') ||
    ((path === '/api/comments' || commentList) && ['GET', 'POST'].includes(method)) ||
    (commentAction && ['POST', 'PUT', 'DELETE'].includes(method)) ||
    (['/api/users', '/api/users/profile', '/api/users/google-sync'].includes(path) && ['GET', 'POST'].includes(method)) || (userUpdate && method === 'PUT');
  if (!handled) return null;
  if (!env.DB) return json({ error: '資料庫尚未連線，請稍後重試或聯絡管理員。' }, 503);
  const db = env.DB;
  try {
    await ensureSchema(db);
    if (trackWrite) return null;
    if (path.startsWith('/api/tracks')) await seedTracks(db, defaults);
    if (batchUsers) {
      const body: any = await request.json();
      const actor = await db.prepare('SELECT * FROM users WHERE LOWER(TRIM(email)) = ?').bind(String(body.actorEmail || '').toLowerCase().trim()).first();
      if (!actor || actor.isBlocked || actor.email.toLowerCase().trim() !== 'yukidu@gmail.com') return json({ error: '只有超級管理員可批次修改會員' }, 403);
      if (!Array.isArray(body.userIds) || !body.userIds.length || body.userIds.some((id: any) => typeof id !== 'string' || !id)) return json({ error: '請選擇會員' }, 400);
      const ids: string[] = [...new Set<string>(body.userIds)];
      const patch = body.updates;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return json({ error: '缺少修改內容' }, 400);
      const allowed = ['center', 'rank', 'diamondUpline', 'isContributor'];
      if (Object.keys(patch).some(key => !allowed.includes(key))) return json({ error: '不支援的批次欄位' }, 400);
      const fields = allowed.filter(key => patch[key] !== undefined);
      if (!fields.length || fields.some(key => typeof patch[key] !== (key === 'isContributor' ? 'boolean' : 'string'))) return json({ error: '修改內容格式錯誤' }, 400);
      const { results: existing } = await db.prepare(`SELECT * FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
      if (existing.length !== ids.length) return json({ error: '部分會員已不存在，請重新整理後再試' }, 409);
      if (patch.isContributor === false && existing.some((u: any) => u.email?.toLowerCase().trim() === 'yukidu@gmail.com')) return json({ error: '不可取消超級管理員的上傳權限' }, 400);
      const columns = [...fields];
      const values = fields.map(key => key === 'isContributor' ? Number(patch[key]) : patch[key]);
      if (fields.includes('isContributor')) { columns.push('canUpload'); values.push(Number(patch.isContributor)); }
      await db.batch(ids.map(id => db.prepare(`UPDATE users SET ${columns.map(key => `${key} = ?`).join(',')} WHERE id = ?`).bind(...values, id)));
      const { results } = await db.prepare(`SELECT * FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all();
      return json({ success: true, count: results.length, users: results.map(normalizeUser) });
    }
    if (permissionAction) {
      const body: any = await request.json();
      const actor = await db.prepare('SELECT * FROM users WHERE LOWER(TRIM(email)) = ?').bind(String(body.actorEmail||'').trim().toLowerCase()).first();
      if (!actor || actor.email.toLowerCase().trim() !== 'yukidu@gmail.com' || actor.isBlocked) return json({error:'只有超級管理員可調整會員權限'},403);
      const id = decodeURIComponent(permissionAction[1]);
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
      if (!user) return json({error:'會員不存在'},404);
      if (user.email?.toLowerCase().trim()==='yukidu@gmail.com') return json({error:'超級管理員不可被封鎖或變更權限'},400);
      const action = permissionAction[2];
      if (action==='contributor') {
        const value=typeof body.isContributor==='boolean'?body.isContributor:!user.isContributor;
        await db.prepare('UPDATE users SET isContributor = ?, canUpload = ? WHERE id = ?').bind(Number(value),Number(value),id).run();
      } else if (action==='admin-role') {
        const value=typeof body.isAdminUser==='boolean'?body.isAdminUser:!user.isAdminUser;
        await db.prepare('UPDATE users SET isAdminUser = ?, role = ? WHERE id = ?').bind(Number(value),value?'獎銜審核員':'繁星家人',id).run();
      } else {
        const value=typeof body.isBlocked==='boolean'?body.isBlocked:!user.isBlocked;
        await db.prepare('UPDATE users SET isBlocked = ? WHERE id = ?').bind(Number(value),id).run();
      }
      return json(normalizeUser(await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()));
    }
    if (auditAction) {
      const body: any = await request.json();
      const auditor = await db.prepare('SELECT * FROM users WHERE LOWER(TRIM(email)) = ?').bind((body.auditorEmail || '').toLowerCase().trim()).first();
      if (!auditor || (!auditor.isAdminUser && auditor.email !== 'yukidu@gmail.com')) return json({error:'沒有獎銜審核權限'},403);
      const id = decodeURIComponent(auditAction[1]);
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
      if (!user) return json({error:'會員不存在'},404);
      const rank = body.rank || user.rank || '無';
      await db.prepare("UPDATE users SET rank = ?, approvedRank = ?, rankApproved = 1, rankAuditStatus = 'approved', auditedBy = ?, auditedAt = ? WHERE id = ?")
        .bind(rank, rank, auditor.name, new Date().toISOString(), id).run();
      return json(normalizeUser(await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()));
    }
    if (keywordList) {
      const rows = (await db.prepare('SELECT keywords FROM tracks').all()).results;
      const catalog = (await db.prepare('SELECT name FROM keyword_catalog ORDER BY createdAt DESC').all()).results;
      return json([...new Set([...catalog.map((r: any) => r.name), ...rows.flatMap((r: any) => parse(r.keywords, []))])]);
    }
    if (keywordAction || keywordAdmin) {
      const body: any = method === 'DELETE' ? {keyword:url.searchParams.get('keyword'), userEmail:url.searchParams.get('userEmail'), userId:url.searchParams.get('userId'), ...await request.json().catch(()=>({}))} : await request.json();
      const actor = await keywordActor(db, body);
      if (!actor) return json({error:'請先登入會員'},403);
      const superAdmin = actor.email.toLowerCase().trim() === 'yukidu@gmail.com';
      if (keywordAdmin && !superAdmin) return json({error:'只有超級管理員可批次管理關鍵字'},403);
      const rows = keywordAction
        ? (await db.prepare('SELECT id, keywords, keywordMeta FROM tracks WHERE id = ?').bind(decodeURIComponent(keywordAction[1])).all()).results
        : (await db.prepare('SELECT id, keywords, keywordMeta FROM tracks').all()).results;
      if (keywordAction && !rows.length) return json({error:'音檔不存在'},404);
      const statements = [], changed = [];
      for (const row of rows) {
        let keywords: string[] = parse(row.keywords, []);
        const meta = Object.assign(Object.create(null), parse(row.keywordMeta, {}));
        const old = method === 'PUT' ? body.oldKeyword : keywordAction?.[2] ? decodeURIComponent(keywordAction[2]) : body.keyword;
        const name = String(method === 'PUT' ? body.newKeyword || '' : body.keyword || '').trim();
        if (!['POST','PUT','DELETE'].includes(method)) return json({error:'不支援此操作'},405);
        if (method !== 'DELETE' && (!name || name.length > 80)) return json({error:'關鍵字需為 1 至 80 字'},400);
        if (method !== 'POST' && !keywords.includes(old)) { if (keywordAdmin) continue; return json({error:'關鍵字不存在'},404); }
        if (method !== 'POST' && !superAdmin && meta[old]?.creatorId !== actor.id) return json({error:'只能修改或刪除自己新增的關鍵字'},403);
        if (method === 'POST') {
          if (keywords.includes(name)) return json({error:'此關鍵字已存在'},409);
          if (keywords.length >= 50) return json({error:'每首最多50個關鍵字'},400);
          keywords.push(name); meta[name] = {creatorId:actor.id,createdAt:Date.now()};
        } else if (method === 'PUT') {
          if (name !== old && keywords.includes(name)) return json({error:'此關鍵字已存在'},409);
          keywords = keywords.map(k => k === old ? name : k);
          const ownership = meta[old] || {creatorId:'',createdAt:0}; delete meta[old]; meta[name] = ownership;
        } else { keywords = keywords.filter(k=>k!==old); delete meta[old]; }
        if (method !== 'POST') statements.push(db.prepare('INSERT OR IGNORE INTO keyword_catalog(name,createdAt) VALUES (?,?)').bind(old,0));
        if (method !== 'DELETE') statements.push(db.prepare('INSERT OR IGNORE INTO keyword_catalog(name,createdAt) VALUES (?,?)').bind(name,meta[name]?.createdAt || Date.now()));
        statements.push(db.prepare('UPDATE tracks SET keywords = ?, keywordMeta = ? WHERE id = ?').bind(JSON.stringify(keywords),JSON.stringify(meta),row.id));
        changed.push({id:row.id,keywords,keywordMeta:meta});
      }
      if (statements.length) await db.batch(statements);
      return json({success:true,keywords:changed[0]?.keywords || [],keywordMeta:changed[0]?.keywordMeta || {},tracks:changed});
    }
    if (path === '/api/tracks') {
      const { results } = await db.prepare('SELECT * FROM tracks ORDER BY uploadDate DESC').all();

      // One-time self-healing for rows damaged by the old generic PUT bug.
      // That bug replaced omitted metadata with placeholders/empty values, but
      // audioUrl remained intact, so title/speaker can be reconstructed from the
      // stable R2 audio filename and the speaker photo can be matched from cover/.
      const damagedRows = results.filter(looksLikeLegacyPartialUpdateDamage);
      if (damagedRows.length > 0) {
        let coverObjects: any[] = [];
        try {
          if (env.R2_BUCKET) {
            const listed = await env.R2_BUCKET.list({ prefix: 'cover/', limit: 1000 });
            coverObjects = listed.objects || [];
          }
        } catch (error) {
          console.warn('R2 cover lookup for track recovery failed:', error);
        }

        for (const row of damagedRows) {
          const recovered = recoverTrackIdentityFromAudioUrl(row.audioUrl, coverObjects);
          if (!recovered) continue;
          try {
            await db.prepare(
              'UPDATE tracks SET title = ?, speaker = ?, speakerRank = ?, speakerAvatar = ? WHERE id = ?'
            ).bind(
              recovered.title,
              recovered.speaker,
              recovered.speakerRank,
              recovered.speakerAvatar || row.speakerAvatar || '',
              row.id
            ).run();
            Object.assign(row, recovered);
          } catch (error) {
            console.warn('Track metadata recovery failed:', row.id, error);
          }
        }
      }

      return json(results.map(normalizeTrack));
    }
    if (trackAction || (commentAction && commentAction[2] && method === 'POST')) {
      const body: any = await request.json();
      const keys = keysFor(body), identifier = keys[0];
      if (!identifier) return json({ error: '缺少使用者識別資料' }, 400);
      const table = trackAction ? 'tracks' : 'comments', id = decodeURIComponent((trackAction || commentAction)![1]);
      const action = trackAction?.[2] || 'like';
      if (action === 'rate' && (!Number.isInteger(body.score) || body.score < 0 || body.score > 5)) return json({ error: '評分必須是 0 至 5 的整數' }, 400);
      // Compare-and-swap prevents parallel likes/ratings from losing another visitor's update.
      for (let attempt = 0; attempt < 5; attempt++) {
        const row = await db.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
        if (!row) return json({ error: '找不到此項目' }, 404);
        if (action === 'rate') {
          const ratings = parse(row.ratings, {});
          // Legacy cached clients used score=0 to cancel a rating. Treat it as a
          // no-op so an accidental repeat tap cannot reset the aggregate to 0.0.
          if (body.score === 0) {
            return json({
              rating: Number(row.rating) || 0,
              ratingCount: Number(row.ratingCount) || 0,
              ratings,
              ignoredZero: true
            });
          }
          keys.forEach(k => delete ratings[k]);
          ratings[identifier] = body.score;
          const scores = Object.values(ratings)
            .map((n: any) => Number(n))
            .filter((n: number) => Number.isFinite(n) && n >= 1 && n <= 5);
          const ratingCount = scores.length, rating = ratingCount ? Math.round(scores.reduce((a, b) => a + b, 0) / ratingCount * 10) / 10 : Number(row.rating) || 0;
          const update = await db.prepare("UPDATE tracks SET ratings = ?, rating = ?, ratingCount = ? WHERE id = ? AND COALESCE(ratings, '') = ?")
            .bind(JSON.stringify(ratings), rating, ratingCount, id, row.ratings ?? '').run();
          if (update.meta.changes) return json({ rating, ratingCount, ratings, canceled: body.score === 0 });
        } else {
          const previous: string[] = parse(row.likedBy, []), hasLiked = !previous.some(k => keys.includes(k));
          const likedBy = previous.filter(k => !keys.includes(k));
          if (hasLiked) likedBy.push(identifier);
          const likes = Math.max(0, (row.likes || 0) + (hasLiked ? 1 : -1));
          const update = await db.prepare(`UPDATE ${table} SET likedBy = ?, likes = ? WHERE id = ? AND COALESCE(likedBy, '') = ? AND COALESCE(likes, 0) = ?`)
            .bind(JSON.stringify(likedBy), likes, id, row.likedBy ?? '', row.likes || 0).run();
          if (update.meta.changes) return json({ likes, hasLiked, likedBy });
        }
      }
      return json({ error: '同時操作過多，請再試一次。' }, 409);
    }
    if (path === '/api/comments' || commentList) {
      const trackId = commentList ? decodeURIComponent(commentList[1]) : null;
      if (method === 'GET') {
        const statement = trackId ? db.prepare('SELECT * FROM comments WHERE trackId = ? ORDER BY createdAt DESC').bind(trackId) : db.prepare('SELECT * FROM comments ORDER BY createdAt DESC');
        return json((await statement.all()).results.map(normalizeComment));
      }
      const body: any = await request.json();
      const target = trackId || body.trackId;
      if (typeof body.content !== 'string' || body.content.length > 2000) return json({ error: '心得最多 2000 字' }, 400);
      if (!target || !body.content?.trim()) return json({ error: '請輸入心得內容與音檔' }, 400);
      if (!await db.prepare('SELECT id FROM tracks WHERE id = ?').bind(target).first()) return json({ error: '找不到音檔' }, 404);
      if (body.replyToId && !await db.prepare('SELECT id FROM comments WHERE id = ? AND trackId = ?').bind(body.replyToId, target).first()) return json({ error: '回覆的心得已不存在' }, 400);
      const comment = { id: `c-${crypto.randomUUID()}`, trackId: target, authorName: body.authorName || '訪客', authorAvatar: body.authorAvatar || '👤', authorBadge: body.authorBadge || '', authorEmail: body.authorEmail || '', deviceId: body.deviceId || '', content: body.content.trim(), timestamp: '剛剛', createdAt: Date.now(), replyToId: body.replyToId || null, replyToAuthor: body.replyToAuthor || null, isAdmin: !!body.isAdmin, likes: 0, likedBy: [] };
      const columns = Object.keys(comment);
      await db.batch([
        db.prepare(`INSERT INTO comments (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).bind(...columns.map(k => k === 'likedBy' ? '[]' : k === 'isAdmin' ? (comment.isAdmin ? 1 : 0) : (comment as any)[k])),
        db.prepare('UPDATE tracks SET commentsCount = (SELECT COUNT(*) FROM comments WHERE trackId = ?) WHERE id = ?').bind(target, target)
      ]);
      return json(comment, 201);
    }
    if (commentAction) {
      const id = decodeURIComponent(commentAction[1]);
      const row = await db.prepare('SELECT * FROM comments WHERE id = ?').bind(id).first();
      if (!row) return json({ error: '心得不存在' }, 404);
      if (method === 'PUT') {
        const body: any = await request.json();
        const owns = row.authorEmail
          ? body.userEmail && row.authorEmail.toLowerCase().trim() === body.userEmail.toLowerCase().trim()
          : row.deviceId && row.deviceId === body.deviceId;
        if (!owns) return json({error:'只能修改自己的心得'},403);
        if (typeof body.content !== 'string' || body.content.length > 2000) return json({ error: '心得最多 2000 字' }, 400);
        if (!body.content?.trim()) return json({ error: '心得不可空白' }, 400);
        await db.prepare('UPDATE comments SET content = ? WHERE id = ?').bind(body.content.trim(), id).run();
        return json(normalizeComment({ ...row, content: body.content.trim() }));
      }
      if (method === 'DELETE') {
        const body: any = await request.json().catch(() => ({}));
        const userEmail = String(body.userEmail || '').toLowerCase().trim();
        const owns = row.authorEmail
          ? Boolean(userEmail && String(row.authorEmail).toLowerCase().trim() === userEmail)
          : Boolean(row.deviceId && body.deviceId && row.deviceId === body.deviceId);

        const isVisitorComment = !String(row.authorEmail || '').trim();
        let isSuperAdminActor = userEmail === 'yukidu@gmail.com';
        let isAdminActor = isSuperAdminActor;

        if (!isSuperAdminActor && userEmail) {
          const actor: any = await db.prepare(
            'SELECT role, isAdminUser, isBlocked FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1'
          ).bind(userEmail).first();

          if (actor && !actor.isBlocked) {
            isSuperAdminActor = actor.role === '超級管理員';
            isAdminActor =
              isSuperAdminActor ||
              Boolean(actor.isAdminUser) ||
              actor.role === '管理員';
          }
        }

        // Preserve super-admin moderation for all comments. Regular admins gain
        // only the requested ability to remove visitor comments.
        const canModerate = isSuperAdminActor || (isAdminActor && isVisitorComment);

        if (!owns && !canModerate) {
          return json({ error: '沒有刪除此心得的權限' }, 403);
        }

        await db.batch([
          db.prepare('UPDATE comments SET replyToId = NULL WHERE replyToId = ?').bind(id),
          db.prepare('DELETE FROM comments WHERE id = ?').bind(id),
          db.prepare('UPDATE tracks SET commentsCount = (SELECT COUNT(*) FROM comments WHERE trackId = ?) WHERE id = ?').bind(row.trackId, row.trackId)
        ]);
        return json({ success: true });
      }
      return json({ error: '不支援此操作' }, 405);
    }
    if (method === 'GET') {
      if (path === '/api/users') return json((await db.prepare('SELECT * FROM users ORDER BY registerDate DESC').all()).results.map(normalizeUser));
      const email = url.searchParams.get('email')?.toLowerCase().trim(), id = url.searchParams.get('id');
      const row = email ? await db.prepare('SELECT * FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1').bind(email).first() : id ? await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first() : null;
      return row ? json({ success: true, user: normalizeUser(row) }) : json({ error: '找不到此會員' }, 404);
    }
    const body: any = await request.json();
    if (method === 'POST') {
      const email = body.email?.toLowerCase().trim();
      if (!email) return json({ error: '會員 Email 為必填欄位' }, 400);
      const existing = await db.prepare('SELECT * FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1').bind(email).first();
      const googleLogin = path === '/api/users/google-sync';
      const owner = email === 'yukidu@gmail.com';
      if (existing) {
        if (googleLogin) {
          const customAvatar = existing.avatarUploadCount > 0 || existing.avatar?.startsWith('data:') || (existing.avatar?.startsWith('http') && !existing.googleAvatar && !/googleusercontent|unsplash/.test(existing.avatar));
          await db.prepare('UPDATE users SET googleAvatar = ?, avatar = ?, lastActive = ? WHERE id = ?').bind(body.avatar || existing.googleAvatar || '', customAvatar ? existing.avatar : body.avatar || existing.avatar || '👤', new Date().toISOString(), existing.id).run();
        }
        return json({ success: true, user: normalizeUser(await db.prepare('SELECT * FROM users WHERE id = ?').bind(existing.id).first()), isNewUser: false });
      }
      const date = new Date().toISOString();
      const user: any = { id: owner ? 'u-admin' : `u-${crypto.randomUUID()}`, email, name: body.name || email.split('@')[0], avatar: body.avatar || '👤', googleAvatar: googleLogin ? body.avatar || '' : '', role: owner ? '超級管理員' : '繁星家人', rank: owner ? '鑽石' : '無', approvedRank: owner ? '鑽石' : '無', rankApproved: owner ? 1 : 0, rankAuditStatus: owner ? 'approved' : 'pending', isAdminUser: owner ? 1 : 0, isContributor: owner ? 1 : 0, canUpload: owner ? 1 : 0, registerDate: date, lastActive: date, birthday: '', residence: '', center: '' };
      if (!googleLogin) editable.forEach(k => { if (body[k] !== undefined) user[k] = boolFields.includes(k) ? Number(!!body[k]) : body[k]; });
      const columns = Object.keys(user);
      await db.prepare(`INSERT INTO users (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).bind(...columns.map(k => user[k])).run();
      return json({ success: true, user: normalizeUser(user), isNewUser: true });
    }
    const id = decodeURIComponent(userUpdate![1]);
    const existing = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: '會員不存在，請重新登入' }, 404);
    const fields = editable.filter(k => body[k] !== undefined);
    if (fields.length) {
      const changes = fields.map(k => boolFields.includes(k) ? Number(!!body[k]) : body[k]);
      await db.prepare(`UPDATE users SET ${fields.map(k => `${k} = ?`).join(',')}, lastActive = ? WHERE id = ?`).bind(...changes, new Date().toISOString(), id).run();
      if (body.name !== undefined || body.avatar !== undefined) await db.prepare('UPDATE comments SET authorName = COALESCE(?, authorName), authorAvatar = COALESCE(?, authorAvatar) WHERE LOWER(TRIM(authorEmail)) = ?').bind(body.name ?? null, body.avatar ?? null, existing.email?.toLowerCase().trim() || '').run();
    }
    return json(normalizeUser(await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()));
  } catch (error) {
    console.error('Persistent community API failed:', error);
    return json({ error: '資料讀取或儲存失敗，請稍後重試。' }, 500);
  }
}

export async function keywordActor(db: any, body: any) {
  const email = String(body.userEmail || '').trim().toLowerCase();
  if (!email) return null;
  const actor = await db.prepare('SELECT * FROM users WHERE LOWER(TRIM(email)) = ?').bind(email).first();
  return actor && !actor.isBlocked && (!body.userId || body.userId === actor.id) ? actor : null;
}
export async function keywordPatch(db: any, existing: any, next: string[], body: any) {
  const previous: string[] = parse(existing.keywords, []), meta = Object.assign(Object.create(null), parse(existing.keywordMeta, {}));
  const removed = previous.filter(k => !next.includes(k)), added = next.filter(k => !previous.includes(k));
  if (!removed.length && !added.length) return { meta };
  const actor = await keywordActor(db, body);
  if (!actor) return { error: '請先登入會員' };
  if (actor.email.toLowerCase().trim() !== 'yukidu@gmail.com' && removed.some(k => meta[k]?.creatorId !== actor.id)) return { error: '只能修改或刪除自己新增的關鍵字' };
  removed.forEach(k => delete meta[k]);
  added.forEach(k => meta[k] = {creatorId:actor.id,createdAt:Date.now()});
  return {meta};
}
