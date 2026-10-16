const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const databaseId = String(process.env.STARRY_ID_D1_ID || '01195c92-555e-4816-bddc-5b8cb2e795db').trim();
if (!accountId || !apiToken || !databaseId) throw new Error('Cloudflare D1 verification credentials are required');

async function query(sql) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success || !Array.isArray(payload.result) || payload.result.some(item => item?.success === false)) {
    throw new Error(`D1 verification query failed (${response.status})`);
  }
  return payload.result[0]?.results || [];
}

const number = rows => Number(rows?.[0]?.value ?? Object.values(rows?.[0] || {})[0] ?? 0);
async function count(sql) { return number(await query(sql)); }

const expectedTriggers = [
  'guard_starry_notifications_user_insert','guard_starry_notifications_user_update',
  'guard_card_visit_owner_insert','guard_card_visit_owner_update',
  'guard_card_visit_viewer_insert','guard_card_visit_viewer_update',
  'guard_starry_push_user_insert','guard_starry_push_user_update',
  'guard_battery_transactions_user_insert','guard_battery_transactions_user_update',
  'guard_battery_accounts_user_insert','guard_battery_accounts_user_update',
  'guard_battery_hundredth_user_insert','guard_battery_hundredth_user_update',
  'guard_users_central_dependents_delete'
];

const quickRows = await query('PRAGMA quick_check');
const quickCheck = String(quickRows?.[0]?.quick_check ?? Object.values(quickRows?.[0] || {})[0] ?? 'unknown');
const foreignKeyViolations = (await query('PRAGMA foreign_key_check')).length;
const triggerRows = await query(`SELECT name FROM sqlite_schema WHERE type='trigger' ORDER BY name`);
const triggerNames = new Set(triggerRows.map(row => String(row.name)));
const missingProtectionTriggers = expectedTriggers.filter(name => !triggerNames.has(name));

const checks = {
  blankUserIds: await count(`SELECT COUNT(*) AS value FROM users WHERE TRIM(COALESCE(id,''))=''`),
  blankEmails: await count(`SELECT COUNT(*) AS value FROM users WHERE TRIM(COALESCE(primaryEmail,''))=''`),
  duplicateEmails: await count(`SELECT COUNT(*) AS value FROM (SELECT LOWER(TRIM(primaryEmail)) k FROM users GROUP BY k HAVING COUNT(*)>1)`),
  usersWithoutProfile: await count(`SELECT COUNT(*) AS value FROM users u LEFT JOIN profiles p ON p.userId=u.id WHERE p.userId IS NULL`),
  profilesWithoutUser: await count(`SELECT COUNT(*) AS value FROM profiles p LEFT JOIN users u ON u.id=p.userId WHERE u.id IS NULL`),
  orphanBatteryTransactions: await count(`SELECT COUNT(*) AS value FROM battery_transactions t LEFT JOIN users u ON u.id=t.userId WHERE u.id IS NULL`),
  orphanBatteryAccounts: await count(`SELECT COUNT(*) AS value FROM battery_accounts a LEFT JOIN users u ON u.id=a.userId WHERE u.id IS NULL`),
  batteryAccountBalanceMismatches: await count(`SELECT COUNT(*) AS value FROM (SELECT a.userId,a.balanceUnits,COALESCE(SUM(t.deltaUnits),0) calc FROM battery_accounts a LEFT JOIN battery_transactions t ON t.userId=a.userId GROUP BY a.userId,a.balanceUnits HAVING a.balanceUnits<>calc)`),
  runningBalanceMismatches: await count(`SELECT COUNT(*) AS value FROM (SELECT userId,id,balanceAfterUnits,SUM(deltaUnits) OVER (PARTITION BY userId ORDER BY createdAt,id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) calc FROM battery_transactions) x WHERE balanceAfterUnits<>calc`),
  invalidStayReasons: await count(`SELECT COUNT(*) AS value FROM profiles p WHERE TRIM(COALESCE(p.stayReason,''))<>'' AND NOT EXISTS (SELECT 1 FROM profile_option_values o WHERE o.category='stayReason' AND o.value=p.stayReason AND o.isActive=1)`),
  approvedRankMissingValue: await count(`SELECT COUNT(*) AS value FROM profiles WHERE rankApproved=1 AND TRIM(COALESCE(approvedRank,''))=''`),
  unresolvedMigrationIssues: await count(`SELECT COUNT(*) AS value FROM migration_issues WHERE resolvedAt IS NULL`),
  notificationOrphans: await count(`SELECT COUNT(*) AS value FROM starry_notifications n LEFT JOIN users u ON u.id=n.userId WHERE u.id IS NULL`),
  cardOwnerOrphans: await count(`SELECT COUNT(*) AS value FROM card_visit_events e LEFT JOIN users u ON u.id=e.ownerUserId WHERE u.id IS NULL`),
  cardViewerOrphans: await count(`SELECT COUNT(*) AS value FROM card_visit_events e LEFT JOIN users u ON u.id=e.viewerUserId WHERE TRIM(COALESCE(e.viewerUserId,''))<>'' AND u.id IS NULL`),
  pushOrphans: await count(`SELECT COUNT(*) AS value FROM starry_push_subscriptions s LEFT JOIN users u ON u.id=s.userId WHERE u.id IS NULL`),
  hundredthBatteryOrphans: await count(`SELECT COUNT(*) AS value FROM battery_hundredth_transactions t LEFT JOIN users u ON u.id=t.userId WHERE u.id IS NULL`)
};

const review = {
  invalidBirthdays: await count(`SELECT COUNT(*) AS value FROM profiles WHERE TRIM(COALESCE(birthday,''))<>'' AND (LENGTH(birthday)<>10 OR date(birthday) IS NULL)`),
  duplicateAmwayGroups: await count(`SELECT COUNT(*) AS value FROM (SELECT LOWER(TRIM(amwayId)) k FROM profiles WHERE TRIM(COALESCE(amwayId,''))<>'' GROUP BY k HAVING COUNT(*)>1)`)
};

const criticalKeys = [
  'blankUserIds','blankEmails','duplicateEmails','usersWithoutProfile','profilesWithoutUser',
  'orphanBatteryTransactions','orphanBatteryAccounts','batteryAccountBalanceMismatches','runningBalanceMismatches',
  'invalidStayReasons','approvedRankMissingValue','unresolvedMigrationIssues','notificationOrphans',
  'cardOwnerOrphans','cardViewerOrphans','pushOrphans','hundredthBatteryOrphans'
];
const failedChecks = criticalKeys.filter(key => checks[key] !== 0);
if (quickCheck !== 'ok') failedChecks.push('sqliteQuickCheck');
if (foreignKeyViolations !== 0) failedChecks.push('foreignKeyViolations');
if (missingProtectionTriggers.length) failedChecks.push('missingProtectionTriggers');

const status = failedChecks.length ? 'critical' : (review.invalidBirthdays || review.duplicateAmwayGroups ? 'healthy_with_review' : 'healthy');
const report = {
  generatedAt: new Date().toISOString(),
  database: 'starry_id_db',
  databaseId,
  containsPII: false,
  status,
  quickCheck,
  foreignKeyViolations,
  protection: {
    expectedTriggerCount: expectedTriggers.length,
    missingProtectionTriggers
  },
  checks,
  review,
  failedChecks
};
console.log(JSON.stringify(report, null, 2));
if (failedChecks.length) process.exitCode = 1;
