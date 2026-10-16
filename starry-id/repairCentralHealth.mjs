import fs from 'node:fs';
import path from 'node:path';

const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const databaseId = String(process.env.STARRY_ID_D1_ID || '01195c92-555e-4816-bddc-5b8cb2e795db').trim();

if (!accountId || !apiToken || !databaseId) throw new Error('Cloudflare D1 repair credentials are required');

typePlaceholder();
function typePlaceholder() {}

async function requestD1(body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success || !Array.isArray(payload.result)) {
    throw new Error(`D1 request failed (${response.status})`);
  }
  if (payload.result.some(item => item?.success === false)) throw new Error('D1 statement failed');
  return payload.result;
}

async function query(sql, params = []) {
  const result = await requestD1({ sql, params: params.map(value => String(value)) });
  return result[0]?.results || [];
}

async function batch(statements) {
  if (!statements.length) return;
  await requestD1({ batch: statements.map(statement => ({
    sql: statement.sql,
    params: (statement.params || []).map(value => String(value))
  })) });
}

const text = value => value == null ? '' : String(value).trim();
const num = value => Number(value || 0);
const now = Date.now();
const runId = crypto.randomUUID();
const outputDir = path.resolve('starry-id/audit-output');
fs.mkdirSync(outputDir, { recursive: true });

function validIsoDate(value) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const [year,month,day] = raw.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

async function count(sql, params = []) {
  const rows = await query(sql, params);
  return num(rows?.[0]?.value ?? Object.values(rows?.[0] || {})[0]);
}

async function snapshotCounts() {
  return {
    orphanBatteryTransactions: await count(`SELECT COUNT(*) AS value FROM battery_transactions t LEFT JOIN users u ON u.id=t.userId WHERE u.id IS NULL`),
    orphanBatteryAccounts: await count(`SELECT COUNT(*) AS value FROM battery_accounts a LEFT JOIN users u ON u.id=a.userId WHERE u.id IS NULL`),
    runningBalanceMismatches: await count(`SELECT COUNT(*) AS value FROM (SELECT userId,id,balanceAfterUnits,SUM(deltaUnits) OVER (PARTITION BY userId ORDER BY createdAt,id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) calc FROM battery_transactions) x WHERE balanceAfterUnits<>calc`),
    invalidStayReasons: await count(`SELECT COUNT(*) AS value FROM profiles p WHERE TRIM(COALESCE(p.stayReason,''))<>'' AND NOT EXISTS (SELECT 1 FROM profile_option_values o WHERE o.category='stayReason' AND o.value=p.stayReason AND o.isActive=1)`),
    approvedRankMissingValue: await count(`SELECT COUNT(*) AS value FROM profiles WHERE rankApproved=1 AND TRIM(COALESCE(approvedRank,''))=''`),
    invalidBirthdays: await count(`SELECT COUNT(*) AS value FROM profiles WHERE TRIM(COALESCE(birthday,''))<>'' AND (LENGTH(birthday)<>10 OR date(birthday) IS NULL)`),
    unresolvedMigrationIssues: await count(`SELECT COUNT(*) AS value FROM migration_issues WHERE resolvedAt IS NULL`),
    duplicateAmwayGroups: await count(`SELECT COUNT(*) AS value FROM (SELECT LOWER(TRIM(amwayId)) k FROM profiles WHERE TRIM(COALESCE(amwayId,''))<>'' GROUP BY k HAVING COUNT(*)>1)`)
  };
}

const before = await snapshotCounts();
const statements = [];
const batteryDecision = {
  orphanUsersSeen: 0,
  usersMappedToCurrentMember: 0,
  usersWithoutSafeMapping: 0,
  transactionsRemapped: 0,
  duplicateTransactionsRemoved: 0,
  unjudgeableTransactionsRemoved: 0,
  unmappedTransactionsRemoved: 0,
  orphanAccountsRemoved: 0
};

// B1: recover orphan battery rows only when the legacy link proves the current member.
// If a logical duplicate already exists, keep the canonical row and remove the orphan duplicate.
// If a row cannot be judged safely, the user explicitly chose to delete it after backup.
const orphanUsers = await query(`
  SELECT userId FROM (
    SELECT DISTINCT t.userId AS userId FROM battery_transactions t LEFT JOIN users u ON u.id=t.userId WHERE u.id IS NULL
    UNION
    SELECT DISTINCT a.userId AS userId FROM battery_accounts a LEFT JOIN users u ON u.id=a.userId WHERE u.id IS NULL
  ) ORDER BY userId
`);

for (const orphan of orphanUsers) {
  const oldUserId = text(orphan.userId);
  if (!oldUserId) continue;
  batteryDecision.orphanUsersSeen += 1;
  const mappings = await query(`SELECT DISTINCT l.userId
    FROM legacy_links l JOIN users u ON u.id=l.userId
    WHERE l.sourceApp='echostars' AND l.sourceUserId=?`, [oldUserId]);
  const canonicalIds = [...new Set(mappings.map(row => text(row.userId)).filter(Boolean))];
  const rows = await query(`SELECT id,type,sourceApp,sourceId,uniqueKey,deltaUnits,createdAt
    FROM battery_transactions WHERE userId=? ORDER BY createdAt,id`, [oldUserId]);

  if (canonicalIds.length !== 1 || canonicalIds[0] === oldUserId) {
    batteryDecision.usersWithoutSafeMapping += 1;
    if (rows.length) {
      statements.push({ sql: 'DELETE FROM battery_transactions WHERE userId=?', params: [oldUserId] });
      batteryDecision.unmappedTransactionsRemoved += rows.length;
    }
  } else {
    const canonicalUserId = canonicalIds[0];
    batteryDecision.usersMappedToCurrentMember += 1;
    for (const row of rows) {
      const txId = text(row.id);
      const txType = text(row.type);
      const sourceApp = text(row.sourceApp);
      const sourceId = text(row.sourceId);
      let duplicate = false;
      let safeToRemap = false;

      if (txType === 'initial') {
        duplicate = await count(`SELECT COUNT(*) AS value FROM battery_transactions WHERE userId=? AND type='initial'`, [canonicalUserId]) > 0;
        safeToRemap = !duplicate;
      } else if (sourceId) {
        duplicate = await count(`SELECT COUNT(*) AS value FROM battery_transactions
          WHERE userId=? AND sourceApp=? AND type=? AND sourceId=?`, [canonicalUserId, sourceApp, txType, sourceId]) > 0;
        safeToRemap = !duplicate;
      }

      if (duplicate) {
        statements.push({ sql: 'DELETE FROM battery_transactions WHERE id=? AND userId=?', params: [txId, oldUserId] });
        batteryDecision.duplicateTransactionsRemoved += 1;
      } else if (safeToRemap) {
        statements.push({ sql: 'UPDATE battery_transactions SET userId=? WHERE id=? AND userId=?', params: [canonicalUserId, txId, oldUserId] });
        batteryDecision.transactionsRemapped += 1;
      } else {
        statements.push({ sql: 'DELETE FROM battery_transactions WHERE id=? AND userId=?', params: [txId, oldUserId] });
        batteryDecision.unjudgeableTransactionsRemoved += 1;
      }
    }
  }

  statements.push({ sql: 'DELETE FROM battery_accounts WHERE userId=?', params: [oldUserId] });
  batteryDecision.orphanAccountsRemoved += 1;
}

// C1: safe, deterministic profile repairs only.
const invalidStayRows = await query(`SELECT userId,stayReason FROM profiles p
  WHERE TRIM(COALESCE(p.stayReason,''))<>''
    AND NOT EXISTS (SELECT 1 FROM profile_option_values o WHERE o.category='stayReason' AND o.value=p.stayReason AND o.isActive=1)`);
let stayReasonFixed = 0;
for (const row of invalidStayRows) {
  const userId = text(row.userId);
  const oldValue = text(row.stayReason);
  if (!userId || oldValue !== '未填寫') continue;
  statements.push({ sql: `UPDATE profiles SET stayReason='',updatedAt=? WHERE userId=? AND stayReason='未填寫'`, params: [now, userId] });
  statements.push({ sql: `INSERT INTO profile_audit_logs(id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt)
    VALUES (?,?,'starry-id-health-repair',NULL,'stayReason',?,'',?)`, params: [crypto.randomUUID(), userId, oldValue, now] });
  stayReasonFixed += 1;
}

const approvedRankRows = await query(`SELECT p.userId,p.rank,p.approvedRank,p.rankApproved,p.rankAuditStatus
  FROM profiles p
  WHERE p.rankApproved=1 AND TRIM(COALESCE(p.approvedRank,''))=''
    AND p.rankAuditStatus='approved'
    AND TRIM(COALESCE(p.rank,''))<>''
    AND EXISTS (SELECT 1 FROM profile_option_values o WHERE o.category='rank' AND o.isActive=1 AND o.value=p.rank)`);
let approvedRankFixed = 0;
for (const row of approvedRankRows) {
  const userId = text(row.userId);
  const rank = text(row.rank);
  if (!userId || !rank) continue;
  statements.push({ sql: `UPDATE profiles SET approvedRank=rank,updatedAt=?
    WHERE userId=? AND rankApproved=1 AND rankAuditStatus='approved' AND TRIM(COALESCE(approvedRank,''))=''`, params: [now, userId] });
  statements.push({ sql: `INSERT INTO profile_audit_logs(id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt)
    VALUES (?,?,'starry-id-health-repair',NULL,'approvedRank','',?,?)`, params: [crypto.randomUUID(), userId, rank, now] });
  approvedRankFixed += 1;
}

// Birthday is repaired only if audit history contains exactly one unambiguous valid ISO date.
const invalidBirthdayRows = await query(`SELECT userId FROM profiles
  WHERE TRIM(COALESCE(birthday,''))<>'' AND (LENGTH(birthday)<>10 OR date(birthday) IS NULL)`);
let birthdaysFixed = 0;
let birthdaysLeftForReview = 0;
for (const row of invalidBirthdayRows) {
  const userId = text(row.userId);
  const history = await query(`SELECT oldValue,newValue FROM profile_audit_logs WHERE userId=? AND fieldName='birthday' ORDER BY createdAt DESC`, [userId]);
  const candidates = new Set();
  for (const item of history) {
    for (const value of [item.oldValue, item.newValue]) if (validIsoDate(value)) candidates.add(text(value));
  }
  if (candidates.size === 1) {
    const restored = [...candidates][0];
    statements.push({ sql: 'UPDATE profiles SET birthday=?,updatedAt=? WHERE userId=?', params: [restored, now, userId] });
    statements.push({ sql: `INSERT INTO profile_audit_logs(id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt)
      SELECT ?,userId,'starry-id-health-repair',NULL,'birthday',birthday,?,? FROM profiles WHERE userId=?`,
      params: [crypto.randomUUID(), restored, now, userId] });
    birthdaysFixed += 1;
  } else {
    birthdaysLeftForReview += 1;
  }
}

// D1: close historical migration issues only when the old source member now has a valid central user + profile.
const resolvableMigrationIssues = await count(`SELECT COUNT(*) AS value FROM migration_issues m
  WHERE m.resolvedAt IS NULL AND m.sourceApp='echostars' AND m.sourceUserId IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM legacy_links l
      JOIN users u ON u.id=l.userId
      JOIN profiles p ON p.userId=u.id
      WHERE l.sourceApp='echostars' AND l.sourceUserId=m.sourceUserId
    )`);
statements.push({ sql: `UPDATE migration_issues SET resolvedAt=?
  WHERE resolvedAt IS NULL AND sourceApp='echostars' AND sourceUserId IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM legacy_links l
      JOIN users u ON u.id=l.userId
      JOIN profiles p ON p.userId=u.id
      WHERE l.sourceApp='echostars' AND l.sourceUserId=migration_issues.sourceUserId
    )`, params: [now] });

// Rebuild the display-only running balance metadata and the account summary from immutable deltas.
statements.push({ sql: `WITH running AS (
  SELECT id,SUM(deltaUnits) OVER (PARTITION BY userId ORDER BY createdAt,id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS calc
  FROM battery_transactions
) UPDATE battery_transactions
SET balanceAfterUnits=(SELECT calc FROM running WHERE running.id=battery_transactions.id)` });
statements.push({ sql: 'DELETE FROM battery_accounts' });
statements.push({ sql: `INSERT INTO battery_accounts(userId,balanceUnits,updatedAt)
  SELECT userId,COALESCE(SUM(deltaUnits),0),? FROM battery_transactions GROUP BY userId`, params: [now] });

await batch(statements);

const after = await snapshotCounts();

// E2: keep duplicate distributor IDs unchanged. The actual list is written only to a private file,
// which the workflow encrypts before any artifact upload. Nothing from this object is printed.
const duplicateGroups = await query(`SELECT amwayId,COUNT(*) AS memberCount
  FROM profiles WHERE TRIM(COALESCE(amwayId,''))<>''
  GROUP BY LOWER(TRIM(amwayId)) HAVING COUNT(*)>1 ORDER BY LOWER(TRIM(amwayId))`);
const privateGroups = [];
for (const group of duplicateGroups) {
  const amwayId = text(group.amwayId);
  const members = await query(`SELECT p.userId,p.name FROM profiles p WHERE LOWER(TRIM(p.amwayId))=LOWER(TRIM(?)) ORDER BY p.userId`, [amwayId]);
  privateGroups.push({
    amwayId,
    memberCount: members.length,
    members: members.map(member => ({ userId: text(member.userId), name: text(member.name) }))
  });
}
const privateReportPath = path.join(outputDir, 'duplicate-amway-private.json');
fs.writeFileSync(privateReportPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  database: 'starry_id_db',
  repairRunId: runId,
  containsPII: true,
  modified: false,
  duplicateGroups: privateGroups
}, null, 2));

const publicReport = {
  generatedAt: new Date().toISOString(),
  database: 'starry_id_db',
  databaseId,
  repairRunId: runId,
  containsPII: false,
  backupRequiredBeforeRun: true,
  policy: {
    orphanBattery: 'map only with proven legacy link; delete logical duplicates; delete unjudgeable/unmapped rows after backup',
    profileFields: 'repair only deterministic values; never guess birthday',
    duplicateAmwayIds: 'report only; no modification'
  },
  before,
  changes: {
    battery: batteryDecision,
    stayReasonFixed,
    approvedRankFixed,
    birthdaysFixed,
    birthdaysLeftForReview,
    migrationIssuesResolved: resolvableMigrationIssues,
    duplicateAmwayGroupsReportedPrivately: privateGroups.length
  },
  after
};

fs.writeFileSync(path.join(outputDir, 'repair-public.json'), JSON.stringify(publicReport, null, 2));
console.log(JSON.stringify(publicReport, null, 2));

if (after.orphanBatteryTransactions || after.orphanBatteryAccounts || after.runningBalanceMismatches ||
    after.invalidStayReasons || after.approvedRankMissingValue || after.unresolvedMigrationIssues) {
  process.exitCode = 1;
}
