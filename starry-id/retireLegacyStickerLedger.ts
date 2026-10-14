const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const sourceDbId = String(process.env.ECHOSTARS_D1_ID || 'e0a696a9-0233-4186-be4d-229435b19a27').trim();
const targetDbId = String(process.env.STARRY_ID_D1_ID || '01195c92-555e-4816-bddc-5b8cb2e795db').trim();

if (!accountId || !apiToken) throw new Error('Cloudflare credentials are required');

type ApiResult = { success?: boolean; results?: any[] };

async function query(databaseId: string, sql: string, params: string[] = []) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params })
  });
  const payload: any = await response.json().catch(() => null);
  if (!response.ok || !payload?.success || !Array.isArray(payload.result)) {
    throw new Error(`D1 API request failed (${response.status})`);
  }
  if (payload.result.some((item: ApiResult) => item?.success === false)) throw new Error('D1 statement failed');
  return payload.result[0]?.results || [];
}

async function main() {
  const state: any = (await query(targetDbId,
    "SELECT * FROM battery_migration_state WHERE sourceApp='echostars' LIMIT 1"))[0];
  if (!state || state.status !== 'completed') {
    throw new Error('Central battery migration is not verified as completed');
  }

  const sourceTable = await query(sourceDbId,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='sticker_transactions'");
  if (!sourceTable.length) {
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      source: 'echoes_db.sticker_transactions',
      target: 'starry_id_db.battery_transactions',
      sourceLedgerPresent: false,
      sourceRetired: true,
      idempotent: true,
      status: 'completed'
    }, null, 2));
    return;
  }

  const source: any = (await query(sourceDbId, `SELECT COUNT(*) AS n,
    COALESCE(SUM(deltaUnits),0) AS balance,COALESCE(MAX(rowid),0) AS maxRowId
    FROM sticker_transactions`))[0] || {};

  const sourceCount = Number(source.n || 0);
  const sourceBalance = Number(source.balance || 0);
  const sourceMaxRowId = Number(source.maxRowId || 0);
  const migratedCount = Number(state.migratedCount || 0);

  const exact =
    sourceCount === Number(state.sourceCount || 0) &&
    sourceBalance === Number(state.sourceBalanceUnits || 0) &&
    sourceMaxRowId === Number(state.sourceMaxRowId || 0) &&
    migratedCount === sourceCount;

  if (!exact) {
    throw new Error('Legacy ledger changed after verification; refusing to remove source data');
  }

  // The preceding migrateBatteries step performs row-by-row and per-member balance
  // verification. Only after its completed state still matches the frozen source do
  // we physically remove the old member asset ledger from EchoStars.
  await query(sourceDbId, 'DROP TABLE sticker_transactions');

  const remains = await query(sourceDbId,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='sticker_transactions'");
  if (remains.length) throw new Error('Legacy sticker ledger still exists after retirement');

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'echoes_db.sticker_transactions',
    target: 'starry_id_db.battery_transactions',
    verifiedRows: migratedCount,
    verifiedBalanceUnits: sourceBalance,
    sourceLedgerPresent: false,
    sourceRetired: true,
    status: 'completed'
  }, null, 2));
}

main().catch(error => {
  console.error(`Legacy ledger retirement failed: ${String((error as Error)?.message || error)}`);
  process.exit(1);
});
