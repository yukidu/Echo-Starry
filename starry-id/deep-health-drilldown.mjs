const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const databaseId = String(process.env.STARRY_ID_D1_ID || '01195c92-555e-4816-bddc-5b8cb2e795db').trim();
if (!accountId || !apiToken || !databaseId) throw new Error('Cloudflare D1 audit credentials are required');

async function query(sql) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success || !Array.isArray(payload.result)) throw new Error(`D1 query failed (${response.status})`);
  const item = payload.result[0];
  if (item?.success === false) throw new Error('D1 statement failed');
  return item?.results || [];
}

const coreTables = new Set([
  'users','identities','profiles','member_relationships','app_memberships','auth_sessions','public_cards',
  'profile_field_visibility','profile_option_values','legacy_links','profile_audit_logs','migration_batches',
  'migration_issues','profile_field_schema','profile_extension_values','profile_schema_meta','starry_notifications',
  'card_visit_events','starry_push_subscriptions','starry_push_vapid','battery_transactions','battery_accounts',
  'battery_migration_state','battery_hundredth_transactions'
]);
const quoteIdent = name => `"${String(name).replaceAll('"','""')}"`;

const tables = (await query(`SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%' ORDER BY name`)).map(r => String(r.name));
const extraTables = tables.filter(name => !coreTables.has(name));
const extraTableRows = [];
for (const name of extraTables) {
  const rows = await query(`SELECT COUNT(*) AS value FROM ${quoteIdent(name)}`);
  extraTableRows.push({ table: name, rows: Number(rows?.[0]?.value || 0) });
}

const migrationIssueTypes = (await query(`SELECT issueType,COUNT(*) AS count,COUNT(DISTINCT COALESCE(sourceUserId,'')) AS distinctSources FROM migration_issues WHERE resolvedAt IS NULL GROUP BY issueType ORDER BY count DESC,issueType`)).map(r => ({
  issueType: String(r.issueType || ''), count: Number(r.count || 0), distinctSources: Number(r.distinctSources || 0)
}));

const migrationIssuesStillLinked = Number((await query(`SELECT COUNT(DISTINCT i.sourceUserId) AS value FROM migration_issues i WHERE i.resolvedAt IS NULL AND TRIM(COALESCE(i.sourceUserId,''))<>'' AND EXISTS (SELECT 1 FROM legacy_links l WHERE l.sourceApp=i.sourceApp AND l.sourceUserId=i.sourceUserId)`))?.[0]?.value || 0);

const invalidStayReasonValues = (await query(`SELECT p.stayReason AS value,COUNT(*) AS count FROM profiles p WHERE TRIM(COALESCE(p.stayReason,''))<>'' AND NOT EXISTS (SELECT 1 FROM profile_option_values o WHERE o.category='stayReason' AND o.value=p.stayReason AND o.isActive=1) GROUP BY p.stayReason ORDER BY count DESC,p.stayReason`)).map(r => ({ value: String(r.value || ''), count: Number(r.count || 0) }));

const duplicateAmwayGroupSizes = (await query(`SELECT cnt AS groupSize,COUNT(*) AS groups FROM (SELECT LOWER(TRIM(amwayId)) k,COUNT(*) cnt FROM profiles WHERE TRIM(COALESCE(amwayId,''))<>'' GROUP BY k HAVING COUNT(*)>1) GROUP BY cnt ORDER BY cnt`)).map(r => ({ groupSize: Number(r.groupSize || 0), groups: Number(r.groups || 0) }));

const approvedRankAnomaly = (await query(`SELECT COALESCE(NULLIF(TRIM(rankAuditStatus),''),'(blank)') AS auditStatus,COUNT(*) AS count FROM profiles WHERE rankApproved=1 AND TRIM(COALESCE(approvedRank,''))='' GROUP BY COALESCE(NULLIF(TRIM(rankAuditStatus),''),'(blank)') ORDER BY count DESC`)).map(r => ({ auditStatus: String(r.auditStatus || ''), count: Number(r.count || 0) }));

const invalidBirthdayShapes = (await query(`SELECT LENGTH(TRIM(COALESCE(birthday,''))) AS length,COUNT(*) AS count FROM profiles WHERE TRIM(COALESCE(birthday,''))<>'' AND (LENGTH(birthday)<>10 OR date(birthday) IS NULL) GROUP BY LENGTH(TRIM(COALESCE(birthday,''))) ORDER BY length`)).map(r => ({ length: Number(r.length || 0), count: Number(r.count || 0) }));

const orphanBatteryTransactions = (await query(`SELECT sourceApp,type,COUNT(*) AS rows,COUNT(DISTINCT t.userId) AS users FROM battery_transactions t LEFT JOIN users u ON u.id=t.userId WHERE u.id IS NULL GROUP BY sourceApp,type ORDER BY rows DESC,sourceApp,type`)).map(r => ({ sourceApp: String(r.sourceApp || ''), type: String(r.type || ''), rows: Number(r.rows || 0), users: Number(r.users || 0) }));

const orphanBatteryMappedRows = Number((await query(`SELECT COUNT(*) AS value FROM battery_transactions t LEFT JOIN users u ON u.id=t.userId WHERE u.id IS NULL AND EXISTS (SELECT 1 FROM legacy_links l JOIN users mapped ON mapped.id=l.userId WHERE l.sourceApp='echostars' AND l.sourceUserId=t.userId)`))?.[0]?.value || 0);
const orphanBatteryMappedUsers = Number((await query(`SELECT COUNT(DISTINCT t.userId) AS value FROM battery_transactions t LEFT JOIN users u ON u.id=t.userId WHERE u.id IS NULL AND EXISTS (SELECT 1 FROM legacy_links l JOIN users mapped ON mapped.id=l.userId WHERE l.sourceApp='echostars' AND l.sourceUserId=t.userId)`))?.[0]?.value || 0);
const orphanBatteryAccountMappedUsers = Number((await query(`SELECT COUNT(DISTINCT a.userId) AS value FROM battery_accounts a LEFT JOIN users u ON u.id=a.userId WHERE u.id IS NULL AND EXISTS (SELECT 1 FROM legacy_links l JOIN users mapped ON mapped.id=l.userId WHERE l.sourceApp='echostars' AND l.sourceUserId=a.userId)`))?.[0]?.value || 0);

const runningBalanceMismatchTypes = (await query(`WITH x AS (SELECT userId,id,sourceApp,type,balanceAfterUnits,SUM(deltaUnits) OVER (PARTITION BY userId ORDER BY createdAt,id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) calc FROM battery_transactions) SELECT sourceApp,type,COUNT(*) AS count FROM x WHERE balanceAfterUnits<>calc GROUP BY sourceApp,type ORDER BY count DESC,sourceApp,type`)).map(r => ({ sourceApp: String(r.sourceApp || ''), type: String(r.type || ''), count: Number(r.count || 0) }));

const usersWithoutGoogleIdentity = Number((await query(`SELECT COUNT(*) AS value FROM users u WHERE NOT EXISTS (SELECT 1 FROM identities i WHERE i.userId=u.id AND i.provider='google')`))?.[0]?.value || 0);
const usersWithoutGoogleIdentityButLegacyLinked = Number((await query(`SELECT COUNT(*) AS value FROM users u WHERE NOT EXISTS (SELECT 1 FROM identities i WHERE i.userId=u.id AND i.provider='google') AND EXISTS (SELECT 1 FROM legacy_links l WHERE l.userId=u.id)`))?.[0]?.value || 0);
const usersWithoutPublicCard = Number((await query(`SELECT COUNT(*) AS value FROM users u LEFT JOIN public_cards c ON c.userId=u.id WHERE c.userId IS NULL`))?.[0]?.value || 0);

const fkCoverage = [];
for (const table of ['starry_notifications','card_visit_events','starry_push_subscriptions','battery_transactions','battery_accounts','battery_hundredth_transactions']) {
  if (!tables.includes(table)) continue;
  const rows = await query(`PRAGMA foreign_key_list(${quoteIdent(table)})`);
  fkCoverage.push({ table, foreignKeys: rows.length });
}

const report = {
  generatedAt: new Date().toISOString(),
  database: 'starry_id_db',
  mode: 'read-only-drilldown',
  containsPII: false,
  extraTables: extraTableRows,
  migrationIssueTypes,
  migrationIssuesStillLinked,
  invalidStayReasonValues,
  duplicateAmwayGroupSizes,
  approvedRankAnomaly,
  invalidBirthdayShapes,
  orphanBatteryTransactions,
  orphanBatteryMappedRows,
  orphanBatteryMappedUsers,
  orphanBatteryAccountMappedUsers,
  runningBalanceMismatchTypes,
  usersWithoutGoogleIdentity,
  usersWithoutGoogleIdentityButLegacyLinked,
  usersWithoutPublicCard,
  fkCoverage
};
console.log(JSON.stringify(report, null, 2));
