const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const databaseId = String(process.env.STARRY_ID_D1_ID || '01195c92-555e-4816-bddc-5b8cb2e795db').trim();

if (!accountId || !apiToken || !databaseId) throw new Error('Cloudflare D1 audit credentials are required');

async function query(sql) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success || !Array.isArray(payload.result)) {
    throw new Error(`D1 query failed (${response.status})`);
  }
  const item = payload.result[0];
  if (item?.success === false) throw new Error('D1 statement failed');
  return item?.results || [];
}

const requiredTables = [
  'users','identities','profiles','member_relationships','app_memberships','auth_sessions',
  'public_cards','profile_field_visibility','profile_option_values','legacy_links','profile_audit_logs',
  'migration_batches','migration_issues','profile_field_schema','profile_extension_values','profile_schema_meta',
  'starry_notifications','card_visit_events','starry_push_subscriptions','starry_push_vapid',
  'battery_transactions','battery_accounts','battery_migration_state','battery_hundredth_transactions'
];

const expectedIndexes = [
  'users_email_unique','identities_user','profiles_amway_id','member_relationships_related',
  'app_memberships_app','auth_sessions_user','auth_sessions_expiry','public_cards_slug','public_cards_number',
  'profile_field_visibility_user','profile_option_values_active','legacy_links_user',
  'profile_audit_logs_user_created','migration_issues_batch','profile_field_schema_active',
  'profile_extension_values_user','starry_notifications_user_time','card_visit_events_owner_time',
  'starry_push_subscriptions_user','battery_transactions_user_history','battery_transactions_source',
  'battery_hundredth_user_history'
];

const checks = [
  ['blank_user_id','critical',`SELECT COUNT(*) AS value FROM users WHERE TRIM(COALESCE(id,''))=''`],
  ['blank_primary_email','critical',`SELECT COUNT(*) AS value FROM users WHERE TRIM(COALESCE(primaryEmail,''))=''`],
  ['duplicate_normalized_email','critical',`SELECT COUNT(*) AS value FROM (SELECT LOWER(TRIM(primaryEmail)) k FROM users GROUP BY k HAVING COUNT(*)>1)`],
  ['users_without_profile','critical',`SELECT COUNT(*) AS value FROM users u LEFT JOIN profiles p ON p.userId=u.id WHERE p.userId IS NULL`],
  ['profiles_without_user','critical',`SELECT COUNT(*) AS value FROM profiles p LEFT JOIN users u ON u.id=p.userId WHERE u.id IS NULL`],
  ['identities_without_user','critical',`SELECT COUNT(*) AS value FROM identities i LEFT JOIN users u ON u.id=i.userId WHERE u.id IS NULL`],
  ['duplicate_google_subject','critical',`SELECT COUNT(*) AS value FROM (SELECT provider,providerSubject FROM identities GROUP BY provider,providerSubject HAVING COUNT(*)>1)`],
  ['duplicate_nonblank_amway_id','review',`SELECT COUNT(*) AS value FROM (SELECT LOWER(TRIM(amwayId)) k FROM profiles WHERE TRIM(COALESCE(amwayId,''))<>'' GROUP BY k HAVING COUNT(*)>1)`],
  ['invalid_residence_option','warning',`SELECT COUNT(*) AS value FROM profiles p WHERE TRIM(COALESCE(p.residence,''))<>'' AND NOT EXISTS (SELECT 1 FROM profile_option_values o WHERE o.category='residence' AND o.value=p.residence AND o.isActive=1)`],
  ['invalid_center_option','warning',`SELECT COUNT(*) AS value FROM profiles p WHERE TRIM(COALESCE(p.center,''))<>'' AND NOT EXISTS (SELECT 1 FROM profile_option_values o WHERE o.category='center' AND o.value=p.center AND o.isActive=1)`],
  ['invalid_rank_option','warning',`SELECT COUNT(*) AS value FROM profiles p WHERE TRIM(COALESCE(p.rank,''))<>'' AND NOT EXISTS (SELECT 1 FROM profile_option_values o WHERE o.category='rank' AND o.value=p.rank AND o.isActive=1)`],
  ['invalid_join_reason_option','warning',`SELECT COUNT(*) AS value FROM profiles p WHERE TRIM(COALESCE(p.joinReason,''))<>'' AND NOT EXISTS (SELECT 1 FROM profile_option_values o WHERE o.category='joinReason' AND o.value=p.joinReason AND o.isActive=1)`],
  ['invalid_stay_reason_option','warning',`SELECT COUNT(*) AS value FROM profiles p WHERE TRIM(COALESCE(p.stayReason,''))<>'' AND NOT EXISTS (SELECT 1 FROM profile_option_values o WHERE o.category='stayReason' AND o.value=p.stayReason AND o.isActive=1)`],
  ['approved_rank_missing_value','warning',`SELECT COUNT(*) AS value FROM profiles WHERE rankApproved=1 AND TRIM(COALESCE(approvedRank,''))=''`],
  ['invalid_birthday','warning',`SELECT COUNT(*) AS value FROM profiles WHERE TRIM(COALESCE(birthday,''))<>'' AND (LENGTH(birthday)<>10 OR date(birthday) IS NULL)`],
  ['self_member_relationship','critical',`SELECT COUNT(*) AS value FROM member_relationships WHERE relatedUserId IS NOT NULL AND relatedUserId=userId`],
  ['relationship_missing_owner','critical',`SELECT COUNT(*) AS value FROM member_relationships r LEFT JOIN users u ON u.id=r.userId WHERE u.id IS NULL`],
  ['relationship_missing_related_user','critical',`SELECT COUNT(*) AS value FROM member_relationships r LEFT JOIN users u ON u.id=r.relatedUserId WHERE r.relatedUserId IS NOT NULL AND u.id IS NULL`],
  ['extension_value_missing_user','critical',`SELECT COUNT(*) AS value FROM profile_extension_values e LEFT JOIN users u ON u.id=e.userId WHERE u.id IS NULL`],
  ['extension_value_unknown_field','warning',`SELECT COUNT(*) AS value FROM profile_extension_values e LEFT JOIN profile_field_schema s ON s.fieldKey=e.fieldKey WHERE s.fieldKey IS NULL`],
  ['invalid_schema_validation_json','warning',`SELECT COUNT(*) AS value FROM profile_field_schema WHERE json_valid(validationJson)=0`],
  ['select_field_without_active_options','warning',`SELECT COUNT(*) AS value FROM profile_field_schema s WHERE s.isActive=1 AND s.optionCategory IS NOT NULL AND NOT EXISTS (SELECT 1 FROM profile_option_values o WHERE o.category=s.optionCategory AND o.isActive=1)`],
  ['public_card_missing_user','critical',`SELECT COUNT(*) AS value FROM public_cards c LEFT JOIN users u ON u.id=c.userId WHERE u.id IS NULL`],
  ['blank_public_card_slug','critical',`SELECT COUNT(*) AS value FROM public_cards WHERE TRIM(COALESCE(slug,''))='' OR TRIM(COALESCE(cardNumber,''))=''`],
  ['duplicate_public_card_slug_casefold','critical',`SELECT COUNT(*) AS value FROM (SELECT LOWER(TRIM(slug)) k FROM public_cards GROUP BY k HAVING COUNT(*)>1)`],
  ['invalid_public_card_number','warning',`SELECT COUNT(*) AS value FROM public_cards WHERE NOT (cardNumber GLOB 'n[0-9]*' AND SUBSTR(cardNumber,2) NOT GLOB '*[^0-9]*' AND LENGTH(SUBSTR(cardNumber,2))>0)`],
  ['legacy_link_missing_user','critical',`SELECT COUNT(*) AS value FROM legacy_links l LEFT JOIN users u ON u.id=l.userId WHERE u.id IS NULL`],
  ['audit_log_missing_user','critical',`SELECT COUNT(*) AS value FROM profile_audit_logs a LEFT JOIN users u ON u.id=a.userId WHERE u.id IS NULL`],
  ['audit_log_blank_field','warning',`SELECT COUNT(*) AS value FROM profile_audit_logs WHERE TRIM(COALESCE(fieldName,''))=''`],
  ['migration_batch_count_mismatch','warning',`SELECT COUNT(*) AS value FROM migration_batches WHERE scannedCount<>(migratedCount+skippedCount)`],
  ['stuck_migration_batch','warning',`SELECT COUNT(*) AS value FROM migration_batches WHERE status='running' AND startedAt < (CAST(strftime('%s','now') AS INTEGER)*1000 - 3600000)`],
  ['unresolved_migration_issue','warning',`SELECT COUNT(*) AS value FROM migration_issues WHERE resolvedAt IS NULL`],
  ['notification_orphan_user','warning',`SELECT COUNT(*) AS value FROM starry_notifications n LEFT JOIN users u ON u.id=n.userId WHERE u.id IS NULL`],
  ['notification_invalid_metadata_json','warning',`SELECT COUNT(*) AS value FROM starry_notifications WHERE json_valid(metadata)=0`],
  ['notification_invalid_read_flag','warning',`SELECT COUNT(*) AS value FROM starry_notifications WHERE isRead NOT IN (0,1)`],
  ['card_visit_orphan_owner','warning',`SELECT COUNT(*) AS value FROM card_visit_events e LEFT JOIN users u ON u.id=e.ownerUserId WHERE u.id IS NULL`],
  ['card_visit_orphan_viewer','review',`SELECT COUNT(*) AS value FROM card_visit_events e LEFT JOIN users u ON u.id=e.viewerUserId WHERE e.viewerUserId IS NOT NULL AND TRIM(e.viewerUserId)<>'' AND u.id IS NULL`],
  ['push_subscription_orphan_user','warning',`SELECT COUNT(*) AS value FROM starry_push_subscriptions s LEFT JOIN users u ON u.id=s.userId WHERE u.id IS NULL`],
  ['push_subscription_missing_crypto','warning',`SELECT COUNT(*) AS value FROM starry_push_subscriptions WHERE TRIM(COALESCE(p256dh,''))='' OR TRIM(COALESCE(auth,''))=''`],
  ['battery_transaction_orphan_user','critical',`SELECT COUNT(*) AS value FROM battery_transactions t LEFT JOIN users u ON u.id=t.userId WHERE u.id IS NULL`],
  ['battery_account_orphan_user','critical',`SELECT COUNT(*) AS value FROM battery_accounts a LEFT JOIN users u ON u.id=a.userId WHERE u.id IS NULL`],
  ['battery_transaction_without_account','critical',`SELECT COUNT(*) AS value FROM (SELECT DISTINCT t.userId FROM battery_transactions t LEFT JOIN battery_accounts a ON a.userId=t.userId WHERE a.userId IS NULL)`],
  ['battery_account_balance_mismatch','critical',`SELECT COUNT(*) AS value FROM (SELECT a.userId,a.balanceUnits,COALESCE(SUM(t.deltaUnits),0) calc FROM battery_accounts a LEFT JOIN battery_transactions t ON t.userId=a.userId GROUP BY a.userId,a.balanceUnits HAVING a.balanceUnits<>calc)`],
  ['battery_running_balance_mismatch','critical',`SELECT COUNT(*) AS value FROM (SELECT userId,id,balanceAfterUnits,SUM(deltaUnits) OVER (PARTITION BY userId ORDER BY createdAt,id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) calc FROM battery_transactions) x WHERE balanceAfterUnits<>calc`],
  ['battery_hundredth_orphan_user','critical',`SELECT COUNT(*) AS value FROM battery_hundredth_transactions t LEFT JOIN users u ON u.id=t.userId WHERE u.id IS NULL`]
];

function numericValue(rows) {
  const row = rows?.[0] || {};
  const value = Number(row.value ?? Object.values(row)[0] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

const generatedAt = new Date().toISOString();
const findings = [];
const queryErrors = [];

async function runCountCheck(name, severity, sql) {
  try {
    const count = numericValue(await query(sql));
    if (count > 0) findings.push({ name, severity, count });
    return count;
  } catch (error) {
    queryErrors.push({ name, error: String(error?.message || error) });
    return null;
  }
}

const tables = await query(`SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
const tableNames = tables.map(row => String(row.name));
const missingTables = requiredTables.filter(name => !tableNames.includes(name));
const indexes = await query(`SELECT name FROM sqlite_schema WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
const indexNames = indexes.map(row => String(row.name));
const missingIndexes = expectedIndexes.filter(name => !indexNames.includes(name));

let quickCheck = 'unknown';
try {
  const rows = await query('PRAGMA quick_check');
  quickCheck = String(rows?.[0]?.quick_check ?? rows?.[0]?.integrity_check ?? Object.values(rows?.[0] || {})[0] ?? 'unknown');
} catch (error) {
  queryErrors.push({ name: 'pragma_quick_check', error: String(error?.message || error) });
}

let foreignKeyViolations = null;
try {
  foreignKeyViolations = (await query('PRAGMA foreign_key_check')).length;
  if (foreignKeyViolations > 0) findings.push({ name: 'foreign_key_violations', severity: 'critical', count: foreignKeyViolations });
} catch (error) {
  queryErrors.push({ name: 'pragma_foreign_key_check', error: String(error?.message || error) });
}

if (missingTables.length) findings.push({ name: 'missing_required_tables', severity: 'critical', count: missingTables.length, items: missingTables });
if (missingIndexes.length) findings.push({ name: 'missing_expected_indexes', severity: 'warning', count: missingIndexes.length, items: missingIndexes });
if (quickCheck !== 'ok') findings.push({ name: 'sqlite_quick_check', severity: 'critical', value: quickCheck });

const metrics = {};
for (const table of requiredTables) {
  if (!tableNames.includes(table)) continue;
  try {
    metrics[`rows_${table}`] = numericValue(await query(`SELECT COUNT(*) AS value FROM ${table}`));
  } catch (error) {
    queryErrors.push({ name: `count_${table}`, error: String(error?.message || error) });
  }
}

for (const [name,severity,sql] of checks) {
  const neededTables = [...sql.matchAll(/(?:FROM|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)/gi)].map(m => m[1]);
  if (neededTables.some(t => !tableNames.includes(t) && t !== 'sqlite_sequence')) continue;
  const value = await runCountCheck(name,severity,sql);
  if (value !== null) metrics[name] = value;
}

try {
  const rows = await query(`SELECT appId,COUNT(*) AS value FROM app_memberships GROUP BY appId ORDER BY appId`);
  metrics.appMembershipsByApp = rows.map(r => ({ appId: String(r.appId), count: Number(r.value || 0) }));
} catch (error) {
  queryErrors.push({ name: 'app_memberships_by_app', error: String(error?.message || error) });
}

try {
  const rows = await query(`SELECT category,COUNT(*) AS value FROM profile_option_values WHERE isActive=1 GROUP BY category ORDER BY category`);
  metrics.activeProfileOptions = rows.map(r => ({ category: String(r.category), count: Number(r.value || 0) }));
} catch (error) {
  queryErrors.push({ name: 'active_profile_options', error: String(error?.message || error) });
}

try {
  const rows = await query(`SELECT status,COUNT(*) AS value FROM migration_batches GROUP BY status ORDER BY status`);
  metrics.migrationBatchesByStatus = rows.map(r => ({ status: String(r.status), count: Number(r.value || 0) }));
} catch (error) {
  queryErrors.push({ name: 'migration_batches_by_status', error: String(error?.message || error) });
}

try {
  const rows = await query(`SELECT COUNT(*) AS value FROM auth_sessions WHERE expiresAt < CAST(strftime('%s','now') AS INTEGER)*1000`);
  metrics.expiredAuthSessions = numericValue(rows);
} catch (error) {
  queryErrors.push({ name: 'expired_auth_sessions', error: String(error?.message || error) });
}

try {
  const rows = await query(`SELECT seq AS currentSeq FROM sqlite_sequence WHERE name='public_cards'`);
  const maxRows = await query(`SELECT COALESCE(MAX(CAST(SUBSTR(cardNumber,2) AS INTEGER)),0) AS maxNumber FROM public_cards WHERE cardNumber GLOB 'n[0-9]*' AND SUBSTR(cardNumber,2) NOT GLOB '*[^0-9]*' AND LENGTH(SUBSTR(cardNumber,2))>0`);
  const currentSeq = Number(rows?.[0]?.currentSeq || 0);
  const maxNumber = Number(maxRows?.[0]?.maxNumber || 0);
  metrics.publicCardSequence = { currentSeq, maxNumber };
  if (currentSeq < maxNumber) findings.push({ name: 'public_card_sequence_behind', severity: 'critical', currentSeq, maxNumber });
} catch (error) {
  queryErrors.push({ name: 'public_card_sequence', error: String(error?.message || error) });
}

const severityRank = { critical: 3, warning: 2, review: 1 };
findings.sort((a,b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0) || String(a.name).localeCompare(String(b.name)));
const criticalCount = findings.filter(f => f.severity === 'critical').length;
const warningCount = findings.filter(f => f.severity === 'warning').length;
const reviewCount = findings.filter(f => f.severity === 'review').length;

const report = {
  generatedAt,
  database: 'starry_id_db',
  databaseId,
  mode: 'read-only',
  containsPII: false,
  quickCheck,
  foreignKeyViolations,
  schema: {
    discoveredTableCount: tableNames.length,
    requiredTableCount: requiredTables.length,
    missingTables,
    missingIndexes
  },
  summary: {
    status: criticalCount ? 'critical' : warningCount ? 'warning' : queryErrors.length ? 'incomplete' : 'healthy',
    criticalFindings: criticalCount,
    warningFindings: warningCount,
    reviewFindings: reviewCount,
    queryErrors: queryErrors.length
  },
  findings,
  metrics,
  queryErrors
};

console.log(JSON.stringify(report, null, 2));
if (criticalCount || queryErrors.length) process.exitCode = 2;
