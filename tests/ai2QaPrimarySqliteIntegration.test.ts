import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { resolveQaCentralSuperAdmin } from '../worker/aiSpeakerQaRouter';

/**
 * P0: exercise the production SELECT/JOIN against actual SQLite tables.
 * Unlike stub-only tests, catches bad SQL and database revocation issues.
 * Disposable in-memory data only: no Cloudflare calls or genuine identity.
 */
function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec([
    "CREATE TABLE users (id TEXT PRIMARY KEY, primaryEmail TEXT NOT NULL, status TEXT NOT NULL);",
    "CREATE TABLE app_memberships (userId TEXT NOT NULL, appId TEXT NOT NULL, status TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY (userId, appId));",
    "CREATE TABLE legacy_links (sourceApp TEXT NOT NULL, sourceUserId TEXT NOT NULL, userId TEXT NOT NULL, PRIMARY KEY (sourceApp, sourceUserId));",
    "CREATE TABLE starry_app_access_decisions (userId TEXT NOT NULL, appId TEXT NOT NULL, decision TEXT NOT NULL, PRIMARY KEY (userId, appId));",
    "INSERT INTO users VALUES ('member-central-1','verified@example.test','active');",
    "INSERT INTO legacy_links VALUES ('echostars','local-echo-1','member-central-1');",
    "INSERT INTO app_memberships VALUES ('member-central-1','starry-id','active','super-admin'),('member-central-1','echostars','active','member');"
  ].join('\n'));
  const issued: string[] = [];
  const env = {
    STARRY_ID_DB: {
      withSession(mode: string) {
        issued.push(mode);
        return {
          prepare(sql: string) {
            return {
              bind(...args: unknown[]) {
                return {
                  async first() {
                    return sqlite.prepare(sql).get(...(args as Array<string | number | null>)) ?? null;
                  }
                };
              }
            };
          }
        };
      }
    }
  };
  const user = { id: 'local-echo-1', email: 'verified@example.test', role: 'member' };
  return { sqlite, env, issued, user, close: () => sqlite.close() };
}

test('AI2/B: real SQLite central+Echo memberships permit verified administrator', async () => {
  const s = setup();
  try {
    assert.equal(await resolveQaCentralSuperAdmin(s.env as never, s.user), true);
    assert.deepEqual(s.issued, ['first-primary']);
  } finally { s.close(); }
});

test('AI2/B: live central, Echo membership and explicit access revocation take effect', async () => {
  const s = setup();
  try {
    assert.equal(await resolveQaCentralSuperAdmin(s.env as never, s.user), true);
    s.sqlite.exec("UPDATE app_memberships SET role='member' WHERE appId='starry-id'");
    assert.equal(await resolveQaCentralSuperAdmin(s.env as never, s.user), false);
    s.sqlite.exec("UPDATE app_memberships SET role='super-admin' WHERE appId='starry-id'");
    s.sqlite.exec("UPDATE app_memberships SET status='blocked' WHERE appId='echostars'");
    assert.equal(await resolveQaCentralSuperAdmin(s.env as never, s.user), false);
    s.sqlite.exec("UPDATE app_memberships SET status='active' WHERE appId='echostars'");
    s.sqlite.exec("INSERT INTO starry_app_access_decisions VALUES ('member-central-1','echostars','deny')");
    assert.equal(await resolveQaCentralSuperAdmin(s.env as never, s.user), false);
    s.sqlite.exec("UPDATE starry_app_access_decisions SET decision='allow' WHERE appId='echostars'");
    assert.equal(await resolveQaCentralSuperAdmin(s.env as never, s.user), true);
  } finally { s.close(); }
});

test('AI2/B: local Echo elevated role cannot override central revoked authority', async () => {
  const s = setup();
  try {
    const local = { ...s.user, role: '超級管理員' };
    s.sqlite.exec("UPDATE app_memberships SET role='member' WHERE appId='starry-id'");
    assert.equal(await resolveQaCentralSuperAdmin(s.env as never, local), false);
    s.sqlite.exec("UPDATE app_memberships SET role='super-admin' WHERE appId='echostars'");
    assert.equal(await resolveQaCentralSuperAdmin(s.env as never, local), false);
  } finally { s.close(); }
});

test('AI2/B: email mismatch, suspended central member and deleted mapping deny', async () => {
  const s = setup();
  try {
    assert.equal(await resolveQaCentralSuperAdmin(s.env as never, { ...s.user, email: 'other@example.test' }), false);
    s.sqlite.exec("UPDATE users SET status='blocked'");
    assert.equal(await resolveQaCentralSuperAdmin(s.env as never, s.user), false);
    s.sqlite.exec("UPDATE users SET status='active'");
    s.sqlite.exec("DELETE FROM legacy_links");
    assert.equal(await resolveQaCentralSuperAdmin(s.env as never, s.user), false);
  } finally { s.close(); }
});

test('AI2/B: missing central authorization table fails closed', async () => {
  const s = setup();
  try {
    s.sqlite.exec('DROP TABLE starry_app_access_decisions');
    assert.equal(await resolveQaCentralSuperAdmin(s.env as never, s.user), false);
  } finally { s.close(); }
});

test('AI2/B: central administrator proof is read-only', async () => {
  const s = setup();
  try {
    const snapshot = () => JSON.stringify({
      users: s.sqlite.prepare('SELECT * FROM users').all(),
      memberships: s.sqlite.prepare('SELECT * FROM app_memberships ORDER BY appId').all(),
      links: s.sqlite.prepare('SELECT * FROM legacy_links').all()
    });
    const before = snapshot();
    for (let i = 0; i < 10; i++) assert.equal(await resolveQaCentralSuperAdmin(s.env as never, s.user), true);
    assert.equal(snapshot(), before);
  } finally { s.close(); }
});
