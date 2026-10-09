const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const SUPER_ADMIN_EMAIL = 'yukidu@gmail.com';
const ECHO_DEFAULT = 'https://echostars.yukidu.workers.dev';
const schemaReady = new WeakMap();

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { ...jsonHeaders, ...headers } });

function now() { return Date.now(); }
function id(prefix = 'id') { return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`; }
function normalizeEmail(v) { return String(v || '').trim().toLowerCase(); }
function safeName(v, fallback = 'file') {
  const s = String(v || fallback).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim();
  return (s || fallback).slice(0, 180);
}
function base64Url(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function randomToken(bytes = 32) { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return base64Url(a); }
function parseCookies(request) {
  const raw = request.headers.get('Cookie') || '';
  const out = {};
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function sessionCookie(token, maxAge = Math.floor(SESSION_TTL_MS / 1000)) {
  return `sb_session=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
function clearSessionCookie() { return 'sb_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'; }
function isStaff(user) { return ['teacher', 'admin', 'superadmin'].includes(String(user?.role || '')); }
function isAdmin(user) { return ['admin', 'superadmin'].includes(String(user?.role || '')); }

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 database binding missing');
  const key = env.DB;
  if (!schemaReady.has(key)) {
    const p = env.DB.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        avatar TEXT DEFAULT '',
        role TEXT NOT NULL DEFAULT 'student',
        lineUserId TEXT UNIQUE,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email);
      CREATE TABLE IF NOT EXISTS sessions (
        tokenHash TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        expiresAt INTEGER NOT NULL,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(userId);
      CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expiresAt);
      CREATE TABLE IF NOT EXISTS courses (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1,
        createdBy TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS course_members (
        courseId TEXT NOT NULL,
        userId TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        PRIMARY KEY(courseId, userId),
        FOREIGN KEY(courseId) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS assignments (
        id TEXT PRIMARY KEY,
        courseId TEXT,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        kind TEXT NOT NULL DEFAULT 'general',
        openAt INTEGER,
        dueAt INTEGER,
        allowLate INTEGER NOT NULL DEFAULT 1,
        allowResubmit INTEGER NOT NULL DEFAULT 1,
        maxFiles INTEGER NOT NULL DEFAULT 10,
        requireReview INTEGER NOT NULL DEFAULT 1,
        active INTEGER NOT NULL DEFAULT 1,
        createdBy TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY(courseId) REFERENCES courses(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS assignments_course_idx ON assignments(courseId, active);
      CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        assignmentId TEXT NOT NULL,
        userId TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        note TEXT DEFAULT '',
        version INTEGER NOT NULL DEFAULT 1,
        source TEXT NOT NULL DEFAULT 'web',
        receiptDate TEXT,
        merchant TEXT,
        amount REAL,
        invoiceNumber TEXT,
        category TEXT,
        submittedAt INTEGER,
        reviewedAt INTEGER,
        reviewedBy TEXT,
        score REAL,
        feedback TEXT DEFAULT '',
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY(assignmentId) REFERENCES assignments(id),
        FOREIGN KEY(userId) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS submissions_user_idx ON submissions(userId, createdAt DESC);
      CREATE INDEX IF NOT EXISTS submissions_assignment_idx ON submissions(assignmentId, createdAt DESC);
      CREATE TABLE IF NOT EXISTS submission_files (
        id TEXT PRIMARY KEY,
        submissionId TEXT NOT NULL,
        userId TEXT NOT NULL,
        objectKey TEXT NOT NULL UNIQUE,
        fileName TEXT NOT NULL,
        contentType TEXT DEFAULT 'application/octet-stream',
        size INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'web',
        createdAt INTEGER NOT NULL,
        FOREIGN KEY(submissionId) REFERENCES submissions(id) ON DELETE CASCADE,
        FOREIGN KEY(userId) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS submission_files_submission_idx ON submission_files(submissionId);
      CREATE TABLE IF NOT EXISTS upload_sessions (
        fileId TEXT PRIMARY KEY,
        submissionId TEXT NOT NULL,
        userId TEXT NOT NULL,
        objectKey TEXT NOT NULL UNIQUE,
        fileName TEXT NOT NULL,
        contentType TEXT DEFAULT 'application/octet-stream',
        size INTEGER NOT NULL DEFAULT 0,
        uploadId TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY(submissionId) REFERENCES submissions(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        readAt INTEGER,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(userId, createdAt DESC);
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        actorUserId TEXT,
        action TEXT NOT NULL,
        targetType TEXT,
        targetId TEXT,
        detail TEXT DEFAULT '',
        createdAt INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS audit_logs_time_idx ON audit_logs(createdAt DESC);
      CREATE TABLE IF NOT EXISTS line_link_codes (
        codeHash TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        expiresAt INTEGER NOT NULL,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS line_link_expiry_idx ON line_link_codes(expiresAt);
      CREATE TABLE IF NOT EXISTS line_inbox (
        id TEXT PRIMARY KEY,
        lineUserId TEXT NOT NULL,
        userId TEXT NOT NULL,
        objectKey TEXT NOT NULL,
        fileName TEXT NOT NULL,
        contentType TEXT DEFAULT 'application/octet-stream',
        size INTEGER NOT NULL DEFAULT 0,
        messageId TEXT NOT NULL UNIQUE,
        createdAt INTEGER NOT NULL,
        assignedAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS line_messages (
        messageId TEXT PRIMARY KEY,
        processedAt INTEGER NOT NULL
      );
    `);
    schemaReady.set(key, p);
    p.catch(() => schemaReady.delete(key));
  }
  await schemaReady.get(key);
}

async function audit(env, actorUserId, action, targetType = '', targetId = '', detail = '') {
  try {
    await env.DB.prepare('INSERT INTO audit_logs (id, actorUserId, action, targetType, targetId, detail, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id('log'), actorUserId || null, action, targetType || null, targetId || null, String(detail || '').slice(0, 2000), now()).run();
  } catch {}
}
async function notify(env, userId, type, title, body) {
  await env.DB.prepare('INSERT INTO notifications (id, userId, type, title, body, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id('ntf'), userId, type, title, body, now()).run();
}
async function createSession(env, userId) {
  const token = randomToken();
  const hash = await sha256Hex(token);
  const t = now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expiresAt <= ?').bind(t),
    env.DB.prepare('INSERT INTO sessions (tokenHash, userId, expiresAt, createdAt) VALUES (?, ?, ?, ?)')
      .bind(hash, userId, t + SESSION_TTL_MS, t)
  ]);
  return token;
}
async function currentUser(request, env) {
  await ensureSchema(env);
  const token = parseCookies(request).sb_session || '';
  if (!token) return null;
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(`
    SELECT u.*, s.expiresAt AS sessionExpiresAt
    FROM sessions s JOIN users u ON u.id=s.userId
    WHERE s.tokenHash=? LIMIT 1
  `).bind(hash).first();
  if (!row) return null;
  if (Number(row.sessionExpiresAt) <= now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE tokenHash=?').bind(hash).run().catch(() => {});
    return null;
  }
  return row;
}
async function requireUser(request, env, staff = false, admin = false) {
  const user = await currentUser(request, env);
  if (!user) return { response: json({ error: '請先登入' }, 401) };
  if (staff && !isStaff(user)) return { response: json({ error: '沒有管理權限' }, 403) };
  if (admin && !isAdmin(user)) return { response: json({ error: '沒有管理權限' }, 403) };
  return { user };
}

async function echoExchange(code, env) {
  const base = String(env.ECHO_BASE_URL || ECHO_DEFAULT).replace(/\/$/, '');
  const res = await fetch(`${base}/api/auth/starbeauty-exchange`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }), redirect: 'manual'
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.user?.id) throw new Error(data?.error || '繁星回聲會員驗證失敗');
  return data.user;
}
async function handleAuthCallback(request, env) {
  await ensureSchema(env);
  const url = new URL(request.url);
  const code = url.searchParams.get('code') || '';
  if (!code) return new Response('缺少登入授權碼', { status: 400 });
  try {
    const profile = await echoExchange(code, env);
    const email = normalizeEmail(profile.email);
    if (!email) throw new Error('會員 Email 無效');
    const role = email === SUPER_ADMIN_EMAIL ? 'superadmin' : 'student';
    const t = now();
    await env.DB.prepare(`
      INSERT INTO users (id,email,name,avatar,role,createdAt,updatedAt)
      VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,avatar=excluded.avatar,updatedAt=excluded.updatedAt
    `).bind(String(profile.id), email, String(profile.name || email), String(profile.avatar || ''), role, t, t).run();
    if (role === 'superadmin') await env.DB.prepare('UPDATE users SET role=? WHERE id=?').bind('superadmin', String(profile.id)).run();
    const token = await createSession(env, String(profile.id));
    await audit(env, String(profile.id), 'login', 'user', String(profile.id), 'EchoStars SSO');
    return new Response(null, { status: 302, headers: { Location: '/', 'Set-Cookie': sessionCookie(token), 'Cache-Control': 'no-store' } });
  } catch (e) {
    return new Response(`登入失敗：${e instanceof Error ? e.message : '未知錯誤'}`, { status: 401, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function listAssignments(env, user) {
  const staff = isStaff(user) ? 1 : 0;
  const { results } = await env.DB.prepare(`
    SELECT a.*, c.title AS courseTitle,
      (SELECT s.status FROM submissions s WHERE s.assignmentId=a.id AND s.userId=? ORDER BY s.version DESC, s.createdAt DESC LIMIT 1) AS myStatus,
      (SELECT s.id FROM submissions s WHERE s.assignmentId=a.id AND s.userId=? ORDER BY s.version DESC, s.createdAt DESC LIMIT 1) AS mySubmissionId
    FROM assignments a LEFT JOIN courses c ON c.id=a.courseId
    WHERE a.active=1 AND (
      ?=1 OR a.courseId IS NULL OR
      NOT EXISTS(SELECT 1 FROM course_members cm0 WHERE cm0.courseId=a.courseId) OR
      EXISTS(SELECT 1 FROM course_members cm WHERE cm.courseId=a.courseId AND cm.userId=?)
    )
    ORDER BY CASE WHEN a.dueAt IS NULL THEN 1 ELSE 0 END, a.dueAt ASC, a.createdAt DESC
  `).bind(user.id, user.id, staff, user.id).all();
  return results || [];
}
async function assignmentVisible(env, user, assignmentId) {
  const rows = await listAssignments(env, user);
  return rows.find(r => r.id === assignmentId) || null;
}
async function latestSubmission(env, userId, assignmentId) {
  return env.DB.prepare('SELECT * FROM submissions WHERE userId=? AND assignmentId=? ORDER BY version DESC, createdAt DESC LIMIT 1').bind(userId, assignmentId).first();
}
async function createSubmission(env, user, body, source = 'web') {
  const assignment = await assignmentVisible(env, user, String(body.assignmentId || ''));
  if (!assignment) throw new Error('找不到作業或沒有權限');
  const t = now();
  if (assignment.openAt && t < Number(assignment.openAt)) throw new Error('作業尚未開放');
  if (assignment.dueAt && t > Number(assignment.dueAt) && !Number(assignment.allowLate)) throw new Error('作業已截止');
  const previous = await latestSubmission(env, user.id, assignment.id);
  if (previous && !Number(assignment.allowResubmit) && !['needs_revision', 'rejected'].includes(String(previous.status))) throw new Error('此作業不允許重新繳交');
  const version = previous ? Number(previous.version || 0) + 1 : 1;
  const sid = id('sub');
  await env.DB.prepare(`
    INSERT INTO submissions (id,assignmentId,userId,status,note,version,source,receiptDate,merchant,amount,invoiceNumber,category,createdAt,updatedAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(sid, assignment.id, user.id, 'draft', String(body.note || '').slice(0, 5000), version, source,
    body.receiptDate || null, body.merchant || null, body.amount === '' || body.amount == null ? null : Number(body.amount),
    body.invoiceNumber || null, body.category || null, t, t).run();
  await audit(env, user.id, 'submission.create', 'submission', sid, `assignment=${assignment.id};source=${source}`);
  return { id: sid, assignment, version };
}

async function getSubmission(env, submissionId) {
  return env.DB.prepare('SELECT * FROM submissions WHERE id=?').bind(submissionId).first();
}
async function canAccessSubmission(user, sub) { return Boolean(sub && (isStaff(user) || sub.userId === user.id)); }

async function uploadStart(request, env, user) {
  const body = await request.json().catch(() => ({}));
  const sub = await getSubmission(env, String(body.submissionId || ''));
  if (!sub || sub.userId !== user.id || sub.status !== 'draft') return json({ error: '無法上傳到這份作業' }, 403);
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM submission_files WHERE submissionId=?').bind(sub.id).first();
  const a = await env.DB.prepare('SELECT maxFiles FROM assignments WHERE id=?').bind(sub.assignmentId).first();
  if (Number(count?.n || 0) >= Number(a?.maxFiles || 10)) return json({ error: '檔案數量已達上限' }, 400);
  const fileId = id('file');
  const fileName = safeName(body.fileName, 'upload.bin');
  const contentType = String(body.contentType || 'application/octet-stream').slice(0, 150);
  const size = Math.max(0, Number(body.size || 0));
  const objectKey = `submissions/${user.id}/${sub.id}/${fileId}-${fileName}`;
  const mp = await env.FILES.createMultipartUpload(objectKey, { httpMetadata: { contentType } });
  await env.DB.prepare(`INSERT INTO upload_sessions (fileId,submissionId,userId,objectKey,fileName,contentType,size,uploadId,createdAt) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(fileId, sub.id, user.id, objectKey, fileName, contentType, size, mp.uploadId, now()).run();
  return json({ fileId, chunkSize: 8 * 1024 * 1024 });
}
async function uploadPart(request, env, user, fileId, partNumber) {
  const row = await env.DB.prepare('SELECT * FROM upload_sessions WHERE fileId=?').bind(fileId).first();
  if (!row || row.userId !== user.id) return json({ error: '上傳工作不存在' }, 404);
  if (!request.body) return json({ error: '缺少檔案內容' }, 400);
  const mp = env.FILES.resumeMultipartUpload(row.objectKey, row.uploadId);
  const part = await mp.uploadPart(partNumber, request.body);
  return json({ partNumber: part.partNumber, etag: part.etag });
}
async function uploadComplete(request, env, user, fileId) {
  const row = await env.DB.prepare('SELECT * FROM upload_sessions WHERE fileId=?').bind(fileId).first();
  if (!row || row.userId !== user.id) return json({ error: '上傳工作不存在' }, 404);
  const body = await request.json().catch(() => ({}));
  const parts = Array.isArray(body.parts) ? body.parts.map(p => ({ partNumber: Number(p.partNumber), etag: String(p.etag) })) : [];
  if (!parts.length) return json({ error: '缺少分段資訊' }, 400);
  const mp = env.FILES.resumeMultipartUpload(row.objectKey, row.uploadId);
  await mp.complete(parts);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO submission_files (id,submissionId,userId,objectKey,fileName,contentType,size,source,createdAt) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(row.fileId, row.submissionId, row.userId, row.objectKey, row.fileName, row.contentType, row.size, 'web', now()),
    env.DB.prepare('DELETE FROM upload_sessions WHERE fileId=?').bind(row.fileId)
  ]);
  return json({ success: true, fileId: row.fileId });
}
async function submitDraft(env, user, submissionId) {
  const sub = await getSubmission(env, submissionId);
  if (!sub || sub.userId !== user.id || sub.status !== 'draft') return json({ error: '無法送出這份作業' }, 403);
  const a = await env.DB.prepare('SELECT * FROM assignments WHERE id=?').bind(sub.assignmentId).first();
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM submission_files WHERE submissionId=?').bind(sub.id).first();
  if (String(a?.kind || '') !== 'text' && Number(count?.n || 0) < 1) return json({ error: '請至少上傳一個檔案' }, 400);
  const t = now();
  await env.DB.prepare("UPDATE submissions SET status='submitted', submittedAt=?, updatedAt=? WHERE id=?").bind(t, t, sub.id).run();
  await notify(env, user.id, 'submitted', '作業已繳交', `「${a?.title || '作業'}」已成功送出。`);
  await audit(env, user.id, 'submission.submit', 'submission', sub.id, `files=${Number(count?.n || 0)}`);
  return json({ success: true });
}

async function handleFile(request, env, user, fileId) {
  const row = await env.DB.prepare(`SELECT f.*, s.userId AS ownerId FROM submission_files f JOIN submissions s ON s.id=f.submissionId WHERE f.id=?`).bind(fileId).first();
  if (!row || (!isStaff(user) && row.ownerId !== user.id)) return new Response('檔案不存在', { status: 404 });
  const obj = await env.FILES.get(row.objectKey, { range: request.headers });
  if (!obj) return new Response('檔案不存在', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('ETag', obj.httpEtag);
  headers.set('Cache-Control', 'private, max-age=60');
  headers.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.fileName)}`);
  return new Response(obj.body, { status: obj.range ? 206 : 200, headers });
}

async function verifyLineSignature(raw, signature, secret) {
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  let binary = ''; for (const b of sig) binary += String.fromCharCode(b);
  return btoa(binary) === signature;
}
async function lineReply(env, replyToken, messages) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN || !replyToken) return;
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST', headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages })
  });
}
async function lineContent(env, messageId) {
  return fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`, { headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` } });
}
async function assignmentsForLine(env, user) {
  const rows = await listAssignments(env, user);
  const t = now();
  return rows.filter(a => (!a.openAt || t >= Number(a.openAt)) && (!a.dueAt || t <= Number(a.dueAt) || Number(a.allowLate)));
}
async function attachLineInbox(env, user, inbox, assignmentId) {
  const assignment = await assignmentVisible(env, user, assignmentId);
  if (!assignment) throw new Error('找不到指定作業');
  const created = await createSubmission(env, user, { assignmentId }, 'line');
  const t = now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO submission_files (id,submissionId,userId,objectKey,fileName,contentType,size,source,createdAt) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(id('file'), created.id, user.id, inbox.objectKey, inbox.fileName, inbox.contentType, inbox.size, 'line', t),
    env.DB.prepare("UPDATE submissions SET status='submitted', submittedAt=?, updatedAt=? WHERE id=?").bind(t, t, created.id),
    env.DB.prepare('UPDATE line_inbox SET assignedAt=? WHERE id=?').bind(t, inbox.id)
  ]);
  await notify(env, user.id, 'submitted', 'LINE 作業已繳交', `「${assignment.title}」已成功送出。`);
  await audit(env, user.id, 'submission.submit.line', 'submission', created.id, `assignment=${assignmentId}`);
  return assignment;
}
async function handleLineEvent(env, event) {
  const replyToken = event.replyToken;
  const lineUserId = event.source?.userId || '';
  if (!lineUserId) return;
  let user = await env.DB.prepare('SELECT * FROM users WHERE lineUserId=?').bind(lineUserId).first();
  if (event.type === 'message' && event.message?.type === 'text') {
    const text = String(event.message.text || '').trim();
    const bindMatch = text.match(/^綁定\s+([A-Z0-9]{6,12})$/i);
    if (bindMatch) {
      const hash = await sha256Hex(bindMatch[1].toUpperCase());
      const row = await env.DB.prepare('DELETE FROM line_link_codes WHERE codeHash=? AND expiresAt>? RETURNING userId').bind(hash, now()).first();
      if (!row) return lineReply(env, replyToken, [{ type: 'text', text: '綁定碼無效或已過期，請回到美力之星重新產生。' }]);
      await env.DB.prepare('UPDATE users SET lineUserId=?, updatedAt=? WHERE id=?').bind(lineUserId, now(), row.userId).run();
      await audit(env, row.userId, 'line.bind', 'user', row.userId, lineUserId);
      return lineReply(env, replyToken, [{ type: 'text', text: '綁定完成！之後可直接把作業、簡報、照片或影片傳給我。' }]);
    }
    const pick = text.match(/^#交作業\s+(asg_[A-Za-z0-9]+)\s+(lin_[A-Za-z0-9]+)$/);
    if (pick && user) {
      const inbox = await env.DB.prepare('SELECT * FROM line_inbox WHERE id=? AND userId=? AND assignedAt IS NULL').bind(pick[2], user.id).first();
      if (!inbox) return lineReply(env, replyToken, [{ type: 'text', text: '這個檔案已處理或已過期。' }]);
      try {
        const a = await attachLineInbox(env, user, inbox, pick[1]);
        return lineReply(env, replyToken, [{ type: 'text', text: `已成功繳交「${a.title}」。` }]);
      } catch (e) {
        return lineReply(env, replyToken, [{ type: 'text', text: `無法繳交：${e instanceof Error ? e.message : '請稍後再試'}` }]);
      }
    }
    if (!user) return lineReply(env, replyToken, [{ type: 'text', text: '請先到美力之星網站登入，取得 LINE 綁定碼後傳送「綁定 你的代碼」。' }]);
    return lineReply(env, replyToken, [{ type: 'text', text: '你可以直接傳送作業檔案、簡報、照片或影片給我。' }]);
  }
  const msg = event.message;
  if (event.type !== 'message' || !msg || !['file', 'image', 'video'].includes(msg.type)) return;
  if (!user) return lineReply(env, replyToken, [{ type: 'text', text: '我收到檔案了，但你的 LINE 尚未綁定美力之星。請先完成綁定再傳一次。' }]);
  const seen = await env.DB.prepare('SELECT 1 AS ok FROM line_messages WHERE messageId=?').bind(String(msg.id)).first();
  if (seen) return;
  const res = await lineContent(env, String(msg.id));
  if (!res.ok || !res.body) return lineReply(env, replyToken, [{ type: 'text', text: '檔案讀取失敗，請重新傳送。' }]);
  const fileName = safeName(msg.fileName || `${msg.type}-${msg.id}${msg.type === 'image' ? '.jpg' : msg.type === 'video' ? '.mp4' : ''}`);
  const contentType = res.headers.get('Content-Type') || (msg.type === 'image' ? 'image/jpeg' : msg.type === 'video' ? 'video/mp4' : 'application/octet-stream');
  const objectKey = `line/${user.id}/${Date.now()}-${String(msg.id)}-${fileName}`;
  await env.FILES.put(objectKey, res.body, { httpMetadata: { contentType } });
  const inboxId = id('lin');
  const size = Number(res.headers.get('Content-Length') || 0);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO line_inbox (id,lineUserId,userId,objectKey,fileName,contentType,size,messageId,createdAt) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(inboxId, lineUserId, user.id, objectKey, fileName, contentType, size, String(msg.id), now()),
    env.DB.prepare('INSERT INTO line_messages (messageId,processedAt) VALUES (?,?)').bind(String(msg.id), now())
  ]);
  const assignments = await assignmentsForLine(env, user);
  if (assignments.length === 1) {
    const a = await attachLineInbox(env, user, await env.DB.prepare('SELECT * FROM line_inbox WHERE id=?').bind(inboxId).first(), assignments[0].id);
    return lineReply(env, replyToken, [{ type: 'text', text: `已收到 ${fileName}，並繳交到「${a.title}」。` }]);
  }
  if (!assignments.length) return lineReply(env, replyToken, [{ type: 'text', text: `已暫存 ${fileName}，目前沒有可繳交的作業。請稍後到網站查看。` }]);
  const items = assignments.slice(0, 10).map(a => ({ type: 'action', action: { type: 'message', label: String(a.title).slice(0, 20), text: `#交作業 ${a.id} ${inboxId}` } }));
  return lineReply(env, replyToken, [{ type: 'text', text: `已收到 ${fileName}。請選擇要繳交的作業：`, quickReply: { items } }]);
}
async function handleLineWebhook(request, env) {
  await ensureSchema(env);
  if (!env.LINE_CHANNEL_SECRET || !env.LINE_CHANNEL_ACCESS_TOKEN) return json({ error: 'LINE 尚未完成設定' }, 503);
  const raw = await request.text();
  const ok = await verifyLineSignature(raw, request.headers.get('x-line-signature') || '', env.LINE_CHANNEL_SECRET);
  if (!ok) return new Response('Invalid signature', { status: 401 });
  const body = JSON.parse(raw || '{}');
  for (const event of body.events || []) await handleLineEvent(env, event);
  return json({ success: true });
}

async function api(request, env) {
  await ensureSchema(env);
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === '/api/health') return json({ ok: true, service: 'starbeauty', time: new Date().toISOString() });
  if (path === '/api/line/webhook' && method === 'POST') return handleLineWebhook(request, env);
  if (path === '/api/logout' && method === 'POST') {
    const token = parseCookies(request).sb_session || '';
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE tokenHash=?').bind(await sha256Hex(token)).run().catch(() => {});
    return json({ success: true }, 200, { 'Set-Cookie': clearSessionCookie() });
  }

  const auth = await requireUser(request, env);
  if (auth.response) return auth.response;
  const user = auth.user;

  if (path === '/api/me' && method === 'GET') {
    const unread = await env.DB.prepare('SELECT COUNT(*) AS n FROM notifications WHERE userId=? AND readAt IS NULL').bind(user.id).first();
    return json({ user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, role: user.role, lineLinked: Boolean(user.lineUserId) }, unreadNotifications: Number(unread?.n || 0) });
  }
  if (path === '/api/assignments' && method === 'GET') return json({ assignments: await listAssignments(env, user) });
  if (path === '/api/submissions' && method === 'GET') {
    const { results } = await env.DB.prepare(`
      SELECT s.*, a.title AS assignmentTitle, a.kind AS assignmentKind, c.title AS courseTitle
      FROM submissions s JOIN assignments a ON a.id=s.assignmentId LEFT JOIN courses c ON c.id=a.courseId
      WHERE s.userId=? ORDER BY s.createdAt DESC
    `).bind(user.id).all();
    for (const s of results || []) {
      const f = await env.DB.prepare('SELECT id,fileName,contentType,size,source FROM submission_files WHERE submissionId=? ORDER BY createdAt').bind(s.id).all();
      s.files = f.results || [];
    }
    return json({ submissions: results || [] });
  }
  if (path === '/api/submissions' && method === 'POST') {
    try { return json({ submission: await createSubmission(env, user, await request.json().catch(() => ({}))) }); }
    catch (e) { return json({ error: e instanceof Error ? e.message : '無法建立作業' }, 400); }
  }
  const submitMatch = path.match(/^\/api\/submissions\/([^/]+)\/submit$/);
  if (submitMatch && method === 'POST') return submitDraft(env, user, submitMatch[1]);
  if (path === '/api/uploads/start' && method === 'POST') return uploadStart(request, env, user);
  const partMatch = path.match(/^\/api\/uploads\/([^/]+)\/parts\/(\d+)$/);
  if (partMatch && method === 'PUT') return uploadPart(request, env, user, partMatch[1], Number(partMatch[2]));
  const completeMatch = path.match(/^\/api\/uploads\/([^/]+)\/complete$/);
  if (completeMatch && method === 'POST') return uploadComplete(request, env, user, completeMatch[1]);
  const fileMatch = path.match(/^\/api\/files\/([^/]+)$/);
  if (fileMatch && method === 'GET') return handleFile(request, env, user, fileMatch[1]);
  if (path === '/api/notifications' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM notifications WHERE userId=? ORDER BY createdAt DESC LIMIT 100').bind(user.id).all();
    return json({ notifications: results || [] });
  }
  if (path === '/api/notifications/read' && method === 'POST') {
    await env.DB.prepare('UPDATE notifications SET readAt=COALESCE(readAt,?) WHERE userId=?').bind(now(), user.id).run();
    return json({ success: true });
  }
  if (path === '/api/line/link-code' && method === 'POST') {
    const code = randomToken(8).replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8).padEnd(8, 'X');
    const hash = await sha256Hex(code);
    const t = now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM line_link_codes WHERE userId=? OR expiresAt<=?').bind(user.id, t),
      env.DB.prepare('INSERT INTO line_link_codes (codeHash,userId,expiresAt,createdAt) VALUES (?,?,?,?)').bind(hash, user.id, t + LINK_CODE_TTL_MS, t)
    ]);
    return json({ code, expiresAt: t + LINK_CODE_TTL_MS, linked: Boolean(user.lineUserId) });
  }

  if (path.startsWith('/api/admin/')) {
    if (!isStaff(user)) return json({ error: '沒有管理權限' }, 403);
    if (path === '/api/admin/summary' && method === 'GET') {
      const [u,a,s,p,r] = await Promise.all([
        env.DB.prepare('SELECT COUNT(*) AS n FROM users').first(),
        env.DB.prepare('SELECT COUNT(*) AS n FROM assignments WHERE active=1').first(),
        env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE status='submitted'").first(),
        env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE status='approved'").first(),
        env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE status='needs_revision'").first()
      ]);
      return json({ users:Number(u?.n||0), assignments:Number(a?.n||0), pending:Number(s?.n||0), approved:Number(p?.n||0), needsRevision:Number(r?.n||0) });
    }
    if (path === '/api/admin/courses' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM courses ORDER BY active DESC, createdAt DESC').all();
      return json({ courses: results || [] });
    }
    if (path === '/api/admin/courses' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const cid = id('crs'), t = now();
      await env.DB.prepare('INSERT INTO courses (id,title,description,active,createdBy,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)')
        .bind(cid, String(body.title || '未命名課程').slice(0,200), String(body.description || '').slice(0,5000), 1, user.id, t, t).run();
      await audit(env, user.id, 'course.create', 'course', cid, body.title || '');
      return json({ id: cid });
    }
    const membersMatch = path.match(/^\/api\/admin\/courses\/([^/]+)\/members$/);
    if (membersMatch && method === 'PUT') {
      const body = await request.json().catch(() => ({}));
      const ids = [...new Set((Array.isArray(body.userIds) ? body.userIds : []).map(String).filter(Boolean))];
      const statements = [env.DB.prepare('DELETE FROM course_members WHERE courseId=?').bind(membersMatch[1])];
      for (const uid of ids) statements.push(env.DB.prepare('INSERT OR IGNORE INTO course_members (courseId,userId,createdAt) VALUES (?,?,?)').bind(membersMatch[1], uid, now()));
      await env.DB.batch(statements);
      await audit(env, user.id, 'course.members.set', 'course', membersMatch[1], `count=${ids.length}`);
      return json({ success: true });
    }
    if (path === '/api/admin/assignments' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT a.*, c.title AS courseTitle FROM assignments a LEFT JOIN courses c ON c.id=a.courseId ORDER BY a.createdAt DESC').all();
      return json({ assignments: results || [] });
    }
    if (path === '/api/admin/assignments' && method === 'POST') {
      const b = await request.json().catch(() => ({})); const aid = id('asg'), t = now();
      await env.DB.prepare(`INSERT INTO assignments (id,courseId,title,description,kind,openAt,dueAt,allowLate,allowResubmit,maxFiles,requireReview,active,createdBy,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(aid, b.courseId || null, String(b.title || '未命名作業').slice(0,200), String(b.description || '').slice(0,10000), ['general','receipt','presentation','video','text'].includes(b.kind) ? b.kind : 'general',
          b.openAt ? Number(b.openAt) : null, b.dueAt ? Number(b.dueAt) : null, b.allowLate === false ? 0 : 1, b.allowResubmit === false ? 0 : 1,
          Math.max(1, Math.min(30, Number(b.maxFiles || 10))), b.requireReview === false ? 0 : 1, 1, user.id, t, t).run();
      await audit(env, user.id, 'assignment.create', 'assignment', aid, b.title || '');
      return json({ id: aid });
    }
    const assignmentAdminMatch = path.match(/^\/api\/admin\/assignments\/([^/]+)$/);
    if (assignmentAdminMatch && method === 'PUT') {
      const b = await request.json().catch(() => ({}));
      const current = await env.DB.prepare('SELECT * FROM assignments WHERE id=?').bind(assignmentAdminMatch[1]).first();
      if (!current) return json({ error: '作業不存在' }, 404);
      await env.DB.prepare(`UPDATE assignments SET courseId=?,title=?,description=?,kind=?,openAt=?,dueAt=?,allowLate=?,allowResubmit=?,maxFiles=?,requireReview=?,active=?,updatedAt=? WHERE id=?`)
        .bind(b.courseId ?? current.courseId, String(b.title ?? current.title).slice(0,200), String(b.description ?? current.description).slice(0,10000), b.kind ?? current.kind,
          b.openAt === '' ? null : (b.openAt ?? current.openAt), b.dueAt === '' ? null : (b.dueAt ?? current.dueAt), b.allowLate == null ? current.allowLate : (b.allowLate?1:0),
          b.allowResubmit == null ? current.allowResubmit : (b.allowResubmit?1:0), Math.max(1,Math.min(30,Number(b.maxFiles ?? current.maxFiles))),
          b.requireReview == null ? current.requireReview : (b.requireReview?1:0), b.active == null ? current.active : (b.active?1:0), now(), current.id).run();
      await audit(env, user.id, 'assignment.update', 'assignment', current.id, '');
      return json({ success: true });
    }
    if (path === '/api/admin/submissions' && method === 'GET') {
      const { results } = await env.DB.prepare(`
        SELECT s.*, a.title AS assignmentTitle, a.kind AS assignmentKind, u.name AS userName, u.email AS userEmail, c.title AS courseTitle
        FROM submissions s JOIN assignments a ON a.id=s.assignmentId JOIN users u ON u.id=s.userId LEFT JOIN courses c ON c.id=a.courseId
        WHERE s.status<>'draft' ORDER BY COALESCE(s.submittedAt,s.createdAt) DESC LIMIT 500
      `).all();
      for (const s of results || []) { const f=await env.DB.prepare('SELECT id,fileName,contentType,size,source FROM submission_files WHERE submissionId=? ORDER BY createdAt').bind(s.id).all(); s.files=f.results||[]; }
      return json({ submissions: results || [] });
    }
    const reviewMatch = path.match(/^\/api\/admin\/submissions\/([^/]+)\/review$/);
    if (reviewMatch && method === 'POST') {
      const b = await request.json().catch(() => ({}));
      const status = ['approved','needs_revision','rejected'].includes(b.status) ? b.status : '';
      if (!status) return json({ error: '審核狀態無效' }, 400);
      const sub = await getSubmission(env, reviewMatch[1]); if (!sub) return json({ error: '作業不存在' }, 404);
      await env.DB.prepare('UPDATE submissions SET status=?,feedback=?,score=?,reviewedAt=?,reviewedBy=?,updatedAt=? WHERE id=?')
        .bind(status, String(b.feedback || '').slice(0,10000), b.score === '' || b.score == null ? null : Number(b.score), now(), user.id, now(), sub.id).run();
      const a = await env.DB.prepare('SELECT title FROM assignments WHERE id=?').bind(sub.assignmentId).first();
      const title = status === 'approved' ? '作業已通過' : status === 'needs_revision' ? '作業需要補件' : '作業未通過';
      await notify(env, sub.userId, 'review', title, `「${a?.title || '作業'}」${b.feedback ? `：${String(b.feedback).slice(0,300)}` : ''}`);
      await audit(env, user.id, 'submission.review', 'submission', sub.id, status);
      return json({ success: true });
    }
    if (path === '/api/admin/users' && method === 'GET') {
      const { results } = await env.DB.prepare(`SELECT u.id,u.email,u.name,u.avatar,u.role,u.lineUserId,u.createdAt,
        (SELECT COUNT(*) FROM submissions s WHERE s.userId=u.id AND s.status<>'draft') AS submissionCount
        FROM users u ORDER BY u.name COLLATE NOCASE`).all();
      return json({ users: results || [] });
    }
    const roleMatch = path.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
    if (roleMatch && method === 'PUT') {
      if (!isAdmin(user)) return json({ error: '只有管理員可調整角色' }, 403);
      const b = await request.json().catch(() => ({}));
      const role = ['student','teacher','admin'].includes(b.role) ? b.role : '';
      if (!role) return json({ error: '角色無效' }, 400);
      const target = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(roleMatch[1]).first();
      if (!target) return json({ error: '會員不存在' }, 404);
      if (normalizeEmail(target.email) === SUPER_ADMIN_EMAIL) return json({ error: '最高管理員角色不可變更' }, 403);
      await env.DB.prepare('UPDATE users SET role=?,updatedAt=? WHERE id=?').bind(role, now(), target.id).run();
      await audit(env, user.id, 'user.role', 'user', target.id, role);
      return json({ success: true });
    }
  }

  return json({ error: 'API 不存在' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/auth/callback' && request.method === 'GET') return handleAuthCallback(request, env);
    if (url.pathname.startsWith('/api/')) return api(request, env);
    return env.ASSETS.fetch(request);
  }
};
