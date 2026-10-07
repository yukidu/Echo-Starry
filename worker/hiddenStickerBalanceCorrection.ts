import { normalizeMemberName } from '../shared/stickers';

export const HIDDEN_BALANCE_CORRECTION_TYPE = 'balance_correction';

export type HiddenBalanceTarget = {
  memberNameHash: string;
  targetUnits: number;
};

// Only irreversible hashes are stored in the public repository. The member-facing
// application never receives these mappings and correction transactions stay hidden.
export const HIDDEN_BALANCE_TARGETS_V111: HiddenBalanceTarget[] = [
  { memberNameHash: 'e5ac816c42dcc65366df37f14662523ae508418cc5b771c7f69074e5558eb821', targetUnits: 3060 },
  { memberNameHash: '4ef0f2491370e12d02e983194a63cd99f813e42c57a15b093335619058b20993', targetUnits: -1000 },
  { memberNameHash: '486d6d2f11d2e3ddfa57c3950bfdff0b89ce50436af46773abb64f6a7f5a5a90', targetUnits: 3160 }
];

export async function hashNormalizedMemberName(value: unknown): Promise<string> {
  const normalized = normalizeMemberName(value);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function applyHiddenBalanceCorrections(
  db: any,
  migrationName: string,
  targets: HiddenBalanceTarget[]
): Promise<{ applied: boolean; pending: boolean; corrected: number }> {
  await db.prepare('CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY)').run();
  if (await db.prepare('SELECT name FROM app_migrations WHERE name = ? LIMIT 1').bind(migrationName).first()) {
    return { applied: false, pending: false, corrected: 0 };
  }

  const users = (await db.prepare('SELECT id,name FROM users').all()).results || [];
  const matches = new Map<string, any[]>();
  for (const target of targets) matches.set(target.memberNameHash, []);

  for (const user of users as any[]) {
    const hash = await hashNormalizedMemberName(user.name);
    if (matches.has(hash)) matches.get(hash)!.push(user);
  }

  // Never guess when a member is missing or a normalized name is ambiguous. Leaving
  // the migration pending allows a later request to retry safely after data is fixed.
  if (targets.some(target => (matches.get(target.memberNameHash) || []).length !== 1)) {
    return { applied: false, pending: true, corrected: 0 };
  }

  let corrected = 0;
  for (const target of targets) {
    const user = matches.get(target.memberNameHash)![0];
    const current: any = await db.prepare(
      'SELECT COALESCE(SUM(deltaUnits),0) AS balanceUnits FROM sticker_transactions WHERE userId = ?'
    ).bind(user.id).first();
    const currentUnits = Number(current?.balanceUnits || 0);
    const deltaUnits = target.targetUnits - currentUnits;
    if (deltaUnits === 0) continue;

    const uniqueKey = `${migrationName}:${user.id}`;
    const now = Date.now();
    const result: any = await db.prepare(`INSERT OR IGNORE INTO sticker_transactions
      (id,userId,deltaUnits,balanceAfterUnits,type,sourceId,description,actorUserId,uniqueKey,createdAt)
      VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(uniqueKey, user.id, deltaUnits, target.targetUnits, HIDDEN_BALANCE_CORRECTION_TYPE,
        null, '管理員隱藏餘額校正', 'system', uniqueKey, now).run();
    if (Number(result?.meta?.changes || 0) > 0) corrected += 1;
  }

  await db.prepare('INSERT OR IGNORE INTO app_migrations(name) VALUES (?)').bind(migrationName).run();
  return { applied: true, pending: false, corrected };
}
