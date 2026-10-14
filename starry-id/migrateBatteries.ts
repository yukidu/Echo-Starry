const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const sourceDbId = String(process.env.ECHOSTARS_D1_ID || 'e0a696a9-0233-4186-be4d-229435b19a27').trim();
const targetDbId = String(process.env.STARRY_ID_D1_ID || '01195c92-555e-4816-bddc-5b8cb2e795db').trim();

if (!accountId || !apiToken) throw new Error('Cloudflare credentials are required');

type Statement = { sql: string; params?: string[] };
type ApiResult = { success?: boolean; results?: any[] };

async function requestD1(databaseId: string, body: { sql: string; params?: string[] } | { batch: Statement[] }): Promise<ApiResult[]> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload: any = await response.json().catch(() => null);
  if (!response.ok || !payload?.success || !Array.isArray(payload.result)) {
    throw new Error(`D1 API request failed (${response.status})`);
  }
  if (payload.result.some((item: ApiResult) => item?.success === false)) throw new Error('D1 statement failed');
  return payload.result as ApiResult[];
}

async function query(databaseId: string, sql: string, params: string[] = []) {
  const result = await requestD1(databaseId, { sql, params });
  return result[0]?.results || [];
}

async function batch(databaseId: string, statements: Statement[]) {
  if (!statements.length) return;
  await requestD1(databaseId, { batch: statements });
}

const text = (value: unknown) => value == null ? '' : String(value).trim();
const integer = (value: unknown) => String(Math.trunc(Number(value) || 0));

const schemaStatements: Statement[] = [
  { sql: `CREATE TABLE IF NOT EXISTS battery_transactions (
    id TEXT PRIMARY KEY,userId TEXT NOT NULL,deltaUnits INTEGER NOT NULL,balanceAfterUnits INTEGER NOT NULL,
    type TEXT NOT NULL,sourceApp TEXT NOT NULL DEFAULT 'echostars',sourceId TEXT,description TEXT NOT NULL,
    actorUserId TEXT,uniqueKey TEXT NOT NULL UNIQUE,createdAt INTEGER NOT NULL,trackId TEXT,commentId TEXT,
    relatedUserId TEXT,sourceLabel TEXT)` },
  { sql: 'CREATE INDEX IF NOT EXISTS battery_transactions_user_history ON battery_transactions(userId, createdAt DESC, id DESC)' },
  { sql: 'CREATE INDEX IF NOT EXISTS battery_transactions_user_cursor ON battery_transactions(userId)' },
  { sql: 'CREATE INDEX IF NOT EXISTS battery_transactions_source ON battery_transactions(sourceApp, sourceId, type)' },
  { sql: 'CREATE INDEX IF NOT EXISTS battery_transactions_actor_history ON battery_transactions(actorUserId, createdAt DESC, id DESC)' },
  { sql: `CREATE TABLE IF NOT EXISTS battery_accounts (
    userId TEXT PRIMARY KEY,balanceUnits INTEGER NOT NULL DEFAULT 0,updatedAt INTEGER NOT NULL)` },
  { sql: `CREATE TABLE IF NOT EXISTS battery_migration_state (
    sourceApp TEXT PRIMARY KEY,status TEXT NOT NULL,sourceCount INTEGER NOT NULL DEFAULT 0,
    migratedCount INTEGER NOT NULL DEFAULT 0,sourceBalanceUnits INTEGER NOT NULL DEFAULT 0,
    centralBalanceUnits INTEGER NOT NULL DEFAULT 0,sourceMaxRowId INTEGER NOT NULL DEFAULT 0,
    startedAt INTEGER NOT NULL,completedAt INTEGER,updatedAt INTEGER NOT NULL)` }
];

function canonicalKey(row: any, canonicalUserId: string) {
  const old = text(row.uniqueKey) || text(row.id);
  if (row.type === 'initial') return `global:initial:${canonicalUserId}`;
  if (row.type === 'rank_approval_reward') return `global:${old}`;
  return `echostars:${old}`;
}

async function main() {
  const startedAt = Date.now();
  await batch(targetDbId, schemaStatements);

  const links = await query(targetDbId, "SELECT sourceUserId,userId FROM legacy_links WHERE sourceApp='echostars'");
  const memberMap = new Map(links.map((row: any) => [text(row.sourceUserId), text(row.userId)]));
  const mapUser = (value: unknown) => memberMap.get(text(value)) || text(value);

  const sourceSummary = (await query(sourceDbId, `SELECT COUNT(*) AS n,COALESCE(SUM(deltaUnits),0) AS balance,
    COALESCE(MAX(rowid),0) AS maxRowId FROM sticker_transactions`))[0] || {};
  const sourceCount = Number(sourceSummary.n || 0);
  const sourceBalance = Number(sourceSummary.balance || 0);
  const sourceMaxRowId = Number(sourceSummary.maxRowId || 0);

  await query(targetDbId, `INSERT INTO battery_migration_state
    (sourceApp,status,sourceCount,migratedCount,sourceBalanceUnits,centralBalanceUnits,sourceMaxRowId,startedAt,completedAt,updatedAt)
    VALUES ('echostars','running',?,0,?,0,?,?,NULL,?)
    ON CONFLICT(sourceApp) DO UPDATE SET status='running',sourceCount=excluded.sourceCount,
      sourceBalanceUnits=excluded.sourceBalanceUnits,sourceMaxRowId=excluded.sourceMaxRowId,
      startedAt=excluded.startedAt,completedAt=NULL,updatedAt=excluded.updatedAt`,
    [String(sourceCount), String(sourceBalance), String(sourceMaxRowId), String(startedAt), String(startedAt)]);

  let cursor = 0;
  let scanned = 0;
  while (true) {
    const rows = await query(sourceDbId, `SELECT rowid AS sourceRowId,* FROM sticker_transactions
      WHERE rowid>? ORDER BY rowid LIMIT 250`, [String(cursor)]);
    if (!rows.length) break;
    const statements: Statement[] = [];
    for (const row of rows) {
      const userId = mapUser(row.userId);
      if (!userId) throw new Error('Battery migration found a transaction without userId');
      const uniqueKey = canonicalKey(row, userId);
      statements.push({
        sql: `INSERT OR IGNORE INTO battery_transactions
          (id,userId,deltaUnits,balanceAfterUnits,type,sourceApp,sourceId,description,actorUserId,uniqueKey,createdAt,
           trackId,commentId,relatedUserId,sourceLabel)
          VALUES (?,?,?,?,?,'echostars',?,?,?,?,?,?,?,?,?)`,
        params: [
          `echostars:${text(row.id) || uniqueKey}`, userId, integer(row.deltaUnits), integer(row.balanceAfterUnits),
          text(row.type) || 'legacy', text(row.sourceId), text(row.description) || '歷史電池紀錄',
          mapUser(row.actorUserId), uniqueKey, integer(row.createdAt), text(row.trackId), text(row.commentId),
          mapUser(row.relatedUserId), text(row.sourceLabel)
        ]
      });
      cursor = Math.max(cursor, Number(row.sourceRowId || 0));
      scanned += 1;
    }
    await batch(targetDbId, statements);
  }

  const now = Date.now();
  await query(targetDbId, `DELETE FROM battery_accounts`);
  await query(targetDbId, `INSERT INTO battery_accounts(userId,balanceUnits,updatedAt)
    SELECT userId,COALESCE(SUM(deltaUnits),0),? FROM battery_transactions GROUP BY userId`, [String(now)]);

  const centralSummary = (await query(targetDbId, `SELECT COUNT(*) AS n,COALESCE(SUM(deltaUnits),0) AS balance
    FROM battery_transactions WHERE sourceApp='echostars'`))[0] || {};
  const centralCount = Number(centralSummary.n || 0);
  const centralBalance = Number(centralSummary.balance || 0);
  const status = centralCount >= sourceCount && centralBalance === sourceBalance ? 'completed' : 'completed_with_issues';

  await query(targetDbId, `UPDATE battery_migration_state SET status=?,migratedCount=?,centralBalanceUnits=?,
    completedAt=?,updatedAt=? WHERE sourceApp='echostars'`,
    [status, String(centralCount), String(centralBalance), String(now), String(now)]);

  const report = {
    generatedAt: new Date().toISOString(),
    source: 'echoes_db.sticker_transactions',
    target: 'starry_id_db.battery_transactions',
    terminology: 'battery',
    containsPII: false,
    sourcePreservedForRollback: true,
    sourceWritesWillBeDisabledByApplicationCutover: true,
    sourceRows: sourceCount,
    scannedRows: scanned,
    centralEchoRows: centralCount,
    sourceBalanceUnits: sourceBalance,
    centralEchoBalanceUnits: centralBalance,
    status
  };
  console.log(JSON.stringify(report, null, 2));
  if (status !== 'completed') process.exitCode = 1;
}

main().catch(error => {
  console.error(`Battery migration failed: ${String((error as Error)?.message || error)}`);
  process.exit(1);
});
