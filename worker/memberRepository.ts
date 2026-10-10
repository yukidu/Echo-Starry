import type { Env } from './index';

export type VerifiedGoogleIdentity = { email: string; subject: string; name: string; avatar: string };
export class MemberIdentityError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const MEMBER_SCHEMA_VERSION = 'member-profile-v172-motto';
const ready = new WeakMap<object, Promise<void>>();
export const userColumns: Record<string, string> = {
  auditedBy: 'TEXT', auditedAt: 'TEXT', residence: 'TEXT', birthday: 'TEXT',
  approvedRank: 'TEXT', rankAuditType: 'TEXT', canUpload: 'INTEGER DEFAULT 0',
  playCount: 'INTEGER DEFAULT 0', googleAvatar: 'TEXT', avatarUploadCount: 'INTEGER DEFAULT 0',
  avatarUploadMonth: 'TEXT', profileEditCount: 'INTEGER DEFAULT 0', profileEditMonth: 'TEXT',
  zodiac: 'TEXT', talentNumber: 'INTEGER', lifeNumber: 'INTEGER', motto: 'TEXT'
};
export function normalizeMember(row: any) {
  const { googleSubject: _subject, __sessionExpiresAt: _expiry, ...fields } = row;
  const user = { ...fields, birthday: row.birthday ?? row.birthDate ?? '' };
  for (const key of ['rankApproved', 'isContributor', 'isAdminUser', 'isBlocked', 'canUpload']) user[key] = Boolean(row[key]);
  user.canUpload = Boolean(row.canUpload || row.isContributor);
  if (user.center === '非繁星體系') user.center = '非寰宇體系';
  if (String(user.email || '').trim().toLowerCase() === 'yukidu@gmail.com') {
    Object.assign(user, { role: '超級管理員', isAdminUser: true, isContributor: true, canUpload: true });
  }
  return user;
}
export async function ensureMemberSchema(db: NonNullable<Env['DB']>) {
  if (!ready.has(db)) {
    const task = (async () => {
      await db.prepare('CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY)').run();
      if (await db.prepare('SELECT name FROM app_migrations WHERE name = ?').bind(MEMBER_SCHEMA_VERSION).first()) return;
      const columns = (await db.prepare('PRAGMA table_info(users)').all()).results || [];
      if (!columns.length) throw new Error('Missing database table: users');
      for (const [name, type] of Object.entries(userColumns)) {
        if (columns.some((column: any) => column.name === name)) continue;
        try { await db.prepare(`ALTER TABLE users ADD COLUMN ${name} ${type}`).run(); }
        catch (error) {
          const check = await db.prepare('PRAGMA table_info(users)').all();
          if (!check.results.some((column: any) => column.name === name)) throw error;
        }
      }
      await db.prepare('CREATE INDEX IF NOT EXISTS users_normalized_email ON users(LOWER(TRIM(email)))').run();
      await db.prepare('INSERT OR IGNORE INTO app_migrations(name) VALUES (?)').bind(MEMBER_SCHEMA_VERSION).run();
    })();
    ready.set(db, task);
    task.catch(() => ready.delete(db));
  }
  await ready.get(db);
}

/** Canonical read path for internal and external member adapters. */
export async function getMemberById(db: NonNullable<Env['DB']>, userId: string) {
  await ensureMemberSchema(db);
  const row: any = await db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').bind(userId).first();
  return row ? normalizeMember(row) : null;
}

/** Called only after cryptographic Google verification; never accepts raw browser profile data. */
export async function syncVerifiedMember(db: NonNullable<Env['DB']>, identity: VerifiedGoogleIdentity) {
  await ensureMemberSchema(db);
  const { results: owners } = await db.prepare(
    'SELECT * FROM users WHERE googleSubject = ? OR LOWER(TRIM(email)) = ? LIMIT 3'
  ).bind(identity.subject, identity.email).all();
  if (owners.length > 1) throw new MemberIdentityError(409, '會員綁定資料衝突，請聯絡管理員。');
  const existing: any = owners[0];
  if (existing) {
    if (existing.isBlocked) throw new MemberIdentityError(403, '此會員帳號目前已停用，請聯絡管理員。');
    if (String(existing.email || '').trim().toLowerCase() !== identity.email ||
      (existing.googleSubject && existing.googleSubject !== identity.subject)) {
      throw new MemberIdentityError(409, 'Google 帳號綁定資料不同，請聯絡管理員。');
    }
    const customAvatar = existing.avatarUploadCount > 0 || existing.avatar?.startsWith('data:') ||
      (existing.avatar?.startsWith('http') && !existing.googleAvatar && !/googleusercontent|unsplash/.test(existing.avatar));
    await db.prepare(`UPDATE users SET googleSubject = ?, googleAvatar = ?, avatar = ?, lastActive = ?
      WHERE id = ? AND (googleSubject IS NULL OR googleSubject = '' OR googleSubject = ?)`)
      .bind(identity.subject, identity.avatar || existing.googleAvatar || '',
        customAvatar ? existing.avatar : identity.avatar || existing.avatar || '👤',
        new Date().toISOString(), existing.id, identity.subject).run();
    const saved: any = await db.prepare('SELECT * FROM users WHERE id = ?').bind(existing.id).first();
    if (!saved || saved.googleSubject !== identity.subject) throw new MemberIdentityError(409, 'Google 帳號綁定衝突，請聯絡管理員。');
    if (saved.isBlocked) throw new MemberIdentityError(403, '此會員帳號目前已停用。');
    return { success: true, user: normalizeMember(saved), isNewUser: false };
  }
  const owner = identity.email === 'yukidu@gmail.com';
  const now = new Date().toISOString();
  const member: any = {
    id: owner ? 'u-admin' : `u-${crypto.randomUUID()}`, email: identity.email,
    googleSubject: identity.subject, name: identity.name, avatar: identity.avatar || '👤',
    googleAvatar: identity.avatar, role: owner ? '超級管理員' : '繁星家人',
    rank: owner ? '鑽石' : '無', approvedRank: owner ? '鑽石' : '無', rankApproved: owner ? 1 : 0,
    rankAuditStatus: owner ? 'approved' : 'pending', isAdminUser: owner ? 1 : 0,
    isContributor: owner ? 1 : 0, canUpload: owner ? 1 : 0,
    registerDate: now, lastActive: now, birthday: '', residence: '', center: '', motto: ''
  };
  const columns = Object.keys(member);
  try {
    await db.prepare(`INSERT INTO users (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`)
      .bind(...columns.map(key => member[key])).run();
  } catch (error) {
    // A simultaneous login may have created the same verified account.
    const saved: any = await db.prepare('SELECT * FROM users WHERE googleSubject = ?').bind(identity.subject).first();
    if (saved && String(saved.email).trim().toLowerCase() === identity.email && !saved.isBlocked) {
      return { success: true, user: normalizeMember(saved), isNewUser: false };
    }
    throw error;
  }
  return { success: true, user: normalizeMember(member), isNewUser: true };
}
