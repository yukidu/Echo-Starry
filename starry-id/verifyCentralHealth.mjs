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
  'guard_users_central_dependents_delete',
  'guard_profiles_rank_approved_insert','guard_profiles_rank_approved_update',
  'guard_profiles_birthday_insert','guard_profiles_birthday_update',
  'guard_member_relationship_self_insert','guard_member_relationship_self_update'
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
  duplicateGoogleSubjects: await count(`SELECT COUNT(*) AS value FROM (SELECT provider,providerSubject FROM identities GROUP BY provider,providerSubject HAVING COUNT(*)>1)`),
  usersWithoutProfile: await count(`SELECT COUNT(*) AS value FROM users u LEFT JOIN profiles p ON p.userId=u.id WHERE p.userId IS NULL`),
  profilesWithoutUser: await count(`SELECT COUNT(*) AS value FROM profiles p LEFT JOIN users u ON u.id=p.userId WHERE u.id IS NULL`),
  identityOrphans: await count(`SELECT COUNT(*) AS value FROM identities i LEFT JOIN users u ON u.id=i.userId WHERE u.id IS NULL`),
  appMembershipOrphans: await count(`SELECT COUNT(*) AS value FROM app_memberships a LEFT JOIN users u ON u.id=a.userId WHERE u.id IS NULL`),
  legacyLinkOrphans: await count(`SELECT COUNT(*) AS value FROM legacy_links l LEFT JOIN users u ON u.id=l.userId WHERE u.id IS NULL`),
  relationshipOrphans: await count(`SELECT COUNT(*) AS value FROM member_relationships r LEFT JOIN users u ON u.id=r.userId WHERE u.id IS NULL OR (r.relatedUserId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM users u2 WHERE u2.id=r.relatedUserId))`),
  relationshipSelfLinks: await count(`SELECT COUNT(*) AS value FROM member_relationships WHERE relatedUserId=userId`),
  spouseSelfLinks: await count(`SELECT COUNT(*) AS value FROM spouse_links WHERE userA=userB`),
  duplicateActiveSpouseUsers: await count(`SELECT COUNT(*) AS value FROM (SELECT userId,COUNT(*) c FROM (SELECT userA userId FROM spouse_links WHERE status='active' UNION ALL SELECT userB FROM spouse_links WHERE status='active') GROUP BY userId HAVING c>1)`),
  badSpouseSlots: await count(`SELECT COUNT(*) AS value FROM spouse_slots ss LEFT JOIN spouse_links sl ON sl.id=ss.linkId WHERE sl.id IS NULL OR (ss.userId<>sl.userA AND ss.userId<>sl.userB)`),
  orphanBatteryTransactions: await count(`SELECT COUNT(*) AS value FROM battery_transactions t LEFT JOIN users u ON u.id=t.userId WHERE u.id IS NULL`),
  orphanBatteryAccounts: await count(`SELECT COUNT(*) AS value FROM battery_accounts a LEFT JOIN users u ON u.id=a.userId WHERE u.id IS NULL`),
  batteryAccountBalanceMismatches: await count(`SELECT COUNT(*) AS value FROM (SELECT a.userId,a.balanceUnits,COALESCE(SUM(t.deltaUnits),0) calc FROM battery_accounts a LEFT JOIN battery_transactions t ON t.userId=a.userId GROUP BY a.userId,a.balanceUnits HAVING a.balanceUnits<>calc)`),
  runningBalanceMismatches: await count(`SELECT COUNT(*) AS value FROM (SELECT userId,id,balanceAfterUnits,SUM(deltaUnits) OVER (PARTITION BY userId ORDER BY createdAt,id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) calc FROM battery_transactions) x WHERE balanceAfterUnits<>calc`),
  invalidStayReasons: await count(`SELECT COUNT(*) AS value FROM profiles p WHERE TRIM(COALESCE(p.stayReason,''))<>'' AND NOT EXISTS (SELECT 1 FROM profile_option_values o WHERE o.category='stayReason' AND o.value=p.stayReason AND o.isActive=1)`),
  invalidBirthdays: await count(`SELECT COUNT(*) AS value FROM profiles WHERE TRIM(COALESCE(birthday,''))<>'' AND (LENGTH(birthday)<>10 OR date(birthday) IS NULL)`),
  approvedRankMissingValue: await count(`SELECT COUNT(*) AS value FROM profiles WHERE rankApproved=1 AND TRIM(COALESCE(approvedRank,''))=''`),
  approvedRankStateInvalid: await count(`SELECT COUNT(*) AS value FROM profiles WHERE rankAuditStatus='approved' AND (COALESCE(rankApproved,0)<>1 OR TRIM(COALESCE(approvedRank,''))='')`),
  pendingRankStateInvalid: await count(`SELECT COUNT(*) AS value FROM profiles WHERE rankAuditStatus='pending' AND COALESCE(rankApproved,0)<>0`),
  activeLegacyBlankOverwrites: await count(`WITH latest AS (SELECT l.*,ROW_NUMBER() OVER(PARTITION BY userId,fieldName ORDER BY createdAt DESC,id DESC) rn FROM profile_audit_logs l) SELECT COUNT(*) AS value FROM latest WHERE rn=1 AND appId='echostars' AND actorUserId='echostars' AND TRIM(COALESCE(oldValue,''))<>'' AND TRIM(COALESCE(newValue,''))=''`),
  relationshipAuditMismatches: await count(`WITH latest AS (SELECT l.*,ROW_NUMBER() OVER(PARTITION BY userId,fieldName ORDER BY createdAt DESC,id DESC) rn FROM profile_audit_logs l WHERE fieldName IN ('sponsor','platinumUpline','diamondUpline')) SELECT COUNT(*) AS value FROM latest l LEFT JOIN member_relationships r ON r.userId=l.userId AND r.relationType=CASE l.fieldName WHEN 'sponsor' THEN 'sponsor' WHEN 'platinumUpline' THEN 'platinum_upline' ELSE 'diamond_upline' END WHERE l.rn=1 AND COALESCE(l.actorUserId,'')<>'echostars' AND TRIM(COALESCE(l.newValue,''))<>TRIM(COALESCE(r.legacyLabel,''))`),
  unresolvedMigrationIssues: await count(`SELECT COUNT(*) AS value FROM migration_issues WHERE resolvedAt IS NULL`),
  notificationOrphans: await count(`SELECT COUNT(*) AS value FROM starry_notifications n LEFT JOIN users u ON u.id=n.userId WHERE u.id IS NULL`),
  cardOwnerOrphans: await count(`SELECT COUNT(*) AS value FROM card_visit_events e LEFT JOIN users u ON u.id=e.ownerUserId WHERE u.id IS NULL`),
  cardViewerOrphans: await count(`SELECT COUNT(*) AS value FROM card_visit_events e LEFT JOIN users u ON u.id=e.viewerUserId WHERE TRIM(COALESCE(e.viewerUserId,''))<>'' AND u.id IS NULL`),
  pushOrphans: await count(`SELECT COUNT(*) AS value FROM starry_push_subscriptions s LEFT JOIN users u ON u.id=s.userId WHERE u.id IS NULL`),
  hundredthBatteryOrphans: await count(`SELECT COUNT(*) AS value FROM battery_hundredth_transactions t LEFT JOIN users u ON u.id=t.userId WHERE u.id IS NULL`)
};

const review = {
  approvedRankValueMismatches: await count(`SELECT COUNT(*) AS value FROM profiles WHERE rankApproved=1 AND TRIM(COALESCE(approvedRank,''))<>'' AND TRIM(COALESCE(rank,''))<>TRIM(COALESCE(approvedRank,''))`),
  duplicateAmwayGroups: await count(`SELECT COUNT(*) AS value FROM (SELECT LOWER(TRIM(amwayId)) k FROM profiles WHERE TRIM(COALESCE(amwayId,''))<>'' GROUP BY k HAVING COUNT(*)>1)`),
  duplicateAmwayGroupsNeedingReview: await count(`WITH d AS (SELECT LOWER(TRIM(amwayId)) k,COUNT(*) c FROM profiles WHERE TRIM(COALESCE(amwayId,''))<>'' GROUP BY LOWER(TRIM(amwayId)) HAVING COUNT(*)>1), classified AS (SELECT d.k,d.c,(SELECT COUNT(*) FROM spouse_links s WHERE s.status='active' AND EXISTS(SELECT 1 FROM profiles p1 WHERE p1.userId=s.userA AND LOWER(TRIM(p1.amwayId))=d.k) AND EXISTS(SELECT 1 FROM profiles p2 WHERE p2.userId=s.userB AND LOWER(TRIM(p2.amwayId))=d.k)) spouseLinks FROM d) SELECT COUNT(*) AS value FROM classified WHERE NOT(c=2 AND spouseLinks=1)`),
  historicalLegacyBlankOverwrites: await count(`SELECT COUNT(*) AS value FROM profile_audit_logs WHERE appId='echostars' AND actorUserId='echostars' AND TRIM(COALESCE(oldValue,''))<>'' AND TRIM(COALESCE(newValue,''))=''`)
};

const criticalKeys = [
  'blankUserIds','blankEmails','duplicateEmails','duplicateGoogleSubjects','usersWithoutProfile','profilesWithoutUser',
  'identityOrphans','appMembershipOrphans','legacyLinkOrphans','relationshipOrphans','relationshipSelfLinks',
  'spouseSelfLinks','duplicateActiveSpouseUsers','badSpouseSlots',
  'orphanBatteryTransactions','orphanBatteryAccounts','batteryAccountBalanceMismatches','runningBalanceMismatches',
  'invalidStayReasons','invalidBirthdays','approvedRankMissingValue','approvedRankStateInvalid','pendingRankStateInvalid',
  'activeLegacyBlankOverwrites','relationshipAuditMismatches','unresolvedMigrationIssues','notificationOrphans',
  'cardOwnerOrphans','cardViewerOrphans','pushOrphans','hundredthBatteryOrphans'
];
const failedChecks = criticalKeys.filter(key => checks[key] !== 0);
if (quickCheck !== 'ok') failedChecks.push('sqliteQuickCheck');
if (foreignKeyViolations !== 0) failedChecks.push('foreignKeyViolations');
if (missingProtectionTriggers.length) failedChecks.push('missingProtectionTriggers');

const needsReview = review.approvedRankValueMismatches || review.duplicateAmwayGroupsNeedingReview;
const status = failedChecks.length ? 'critical' : (needsReview ? 'healthy_with_review' : 'healthy');
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
