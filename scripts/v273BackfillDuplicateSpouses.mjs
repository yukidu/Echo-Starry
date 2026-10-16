import fs from 'node:fs';
import path from 'node:path';

const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const databaseId = String(process.env.STARRY_ID_D1_ID || '01195c92-555e-4816-bddc-5b8cb2e795db').trim();

if (!accountId || !apiToken || !databaseId) {
  throw new Error('Cloudflare D1 credentials are required');
}

const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
const clean = value => value == null ? '' : String(value).trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function requestD1(body, attempts = 4) {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    lastStatus = response.status;
    const payload = await response.json().catch(() => null);
    const ok = response.ok && payload?.success && Array.isArray(payload.result) && !payload.result.some(item => item?.success === false);
    if (ok) return payload.result;
    if (attempt < attempts && (response.status === 429 || response.status >= 500)) {
      await sleep(900 * attempt);
      continue;
    }
    throw new Error(`D1 request failed (${response.status})`);
  }
  throw new Error(`D1 request failed (${lastStatus})`);
}

async function query(sql, params = []) {
  const result = await requestD1({ sql, params: params.map(value => String(value)) });
  return result[0]?.results || [];
}

async function batch(statements) {
  if (!statements.length) return;
  await requestD1({
    batch: statements.map(statement => ({
      sql: statement.sql,
      params: (statement.params || []).map(value => String(value))
    }))
  });
}

const now = Date.now();
const duplicateGroups = await query(`
  SELECT LOWER(TRIM(amwayId)) AS groupKey, COUNT(*) AS memberCount
  FROM profiles
  WHERE TRIM(COALESCE(amwayId,''))<>''
  GROUP BY LOWER(TRIM(amwayId))
  HAVING COUNT(*)>1
  ORDER BY LOWER(TRIM(amwayId))
`);

// The user explicitly approved the three duplicate groups found by the immediately preceding health audit.
// Abort instead of guessing if the production state has changed before this one-time repair runs.
if (duplicateGroups.length !== 3) {
  throw new Error(`Expected exactly 3 duplicate distributor groups, found ${duplicateGroups.length}; no spouse changes were applied.`);
}

const plans = [];
let alreadyLinked = 0;

for (const group of duplicateGroups) {
  const groupKey = clean(group.groupKey);
  const members = await query(`
    SELECT p.userId,u.status
    FROM profiles p
    JOIN users u ON u.id=p.userId
    WHERE LOWER(TRIM(p.amwayId))=?
    ORDER BY p.userId
  `, [groupKey]);

  if (members.length !== 2 || members.some(member => clean(member.status) !== 'active')) {
    throw new Error('A duplicate distributor group is no longer exactly two active members; no spouse changes were applied.');
  }

  const users = members.map(member => clean(member.userId)).sort();
  if (!users[0] || !users[1] || users[0] === users[1]) {
    throw new Error('Invalid member pair detected; no spouse changes were applied.');
  }

  const links = await query(`
    SELECT id,userA,userB,status
    FROM spouse_links
    WHERE (userA IN (?,?) OR userB IN (?,?))
      AND status IN ('pending','active','unlink_pending')
    ORDER BY id
  `, [users[0], users[1], users[0], users[1]]);

  if (links.length) {
    const exact = links.length === 1
      && clean(links[0].status) === 'active'
      && [clean(links[0].userA), clean(links[0].userB)].sort().join('|') === users.join('|');
    if (!exact) {
      throw new Error('A target member already has another spouse relationship; no automatic reassignment was performed.');
    }
    const slots = await query(`SELECT userId,linkId FROM spouse_slots WHERE userId IN (?,?) ORDER BY userId`, users);
    if (slots.length !== 2 || slots.some(slot => clean(slot.linkId) !== clean(links[0].id))) {
      throw new Error('Existing spouse relationship has inconsistent slots; no automatic rewrite was performed.');
    }
    alreadyLinked += 1;
    continue;
  }

  const occupiedSlots = await query(`SELECT userId,linkId FROM spouse_slots WHERE userId IN (?,?)`, users);
  if (occupiedSlots.length) {
    throw new Error('A target member has an occupied spouse slot without a current relationship; no automatic rewrite was performed.');
  }

  plans.push({ users });
}

const statements = [];
for (const plan of plans) {
  const [userA, userB] = plan.users;
  const linkId = crypto.randomUUID();
  statements.push(
    {
      sql: `INSERT INTO spouse_links(id,userA,userB,status,requestedBy,unlinkRequestedBy,keepUserId,replacement,createdAt,updatedAt)
            VALUES(?,?,?,'active',?,NULL,NULL,NULL,?,?)`,
      params: [linkId, userA, userB, userA, now, now]
    },
    { sql: 'INSERT INTO spouse_slots(userId,linkId) VALUES(?,?)', params: [userA, linkId] },
    { sql: 'INSERT INTO spouse_slots(userId,linkId) VALUES(?,?)', params: [userB, linkId] },
    {
      sql: `INSERT INTO profile_audit_logs(id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt)
            VALUES(?,?,'starry-id-health-repair',NULL,'spouse-admin-backfill','', 'active-shared-distributor-spouse',?)`,
      params: [crypto.randomUUID(), userA, now]
    },
    {
      sql: `INSERT INTO profile_audit_logs(id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt)
            VALUES(?,?,'starry-id-health-repair',NULL,'spouse-admin-backfill','', 'active-shared-distributor-spouse',?)`,
      params: [crypto.randomUUID(), userB, now]
    }
  );
}

await batch(statements);

let verifiedGroups = 0;
for (const group of duplicateGroups) {
  const groupKey = clean(group.groupKey);
  const members = await query(`SELECT p.userId FROM profiles p WHERE LOWER(TRIM(p.amwayId))=? ORDER BY p.userId`, [groupKey]);
  const users = members.map(member => clean(member.userId)).sort();
  const links = await query(`
    SELECT id,userA,userB,status
    FROM spouse_links
    WHERE status='active'
      AND ((userA=? AND userB=?) OR (userA=? AND userB=?))
  `, [users[0], users[1], users[1], users[0]]);
  if (links.length !== 1) throw new Error('Post-write spouse verification failed.');
  const slots = await query(`SELECT userId,linkId FROM spouse_slots WHERE userId IN (?,?) ORDER BY userId`, users);
  if (slots.length !== 2 || slots.some(slot => clean(slot.linkId) !== clean(links[0].id))) {
    throw new Error('Post-write spouse slot verification failed.');
  }
  verifiedGroups += 1;
}

const conflictingCurrentLinks = Number((await query(`
  SELECT COUNT(*) AS value FROM (
    SELECT userId,COUNT(*) AS c FROM (
      SELECT userA AS userId FROM spouse_links WHERE status IN ('pending','active','unlink_pending')
      UNION ALL
      SELECT userB AS userId FROM spouse_links WHERE status IN ('pending','active','unlink_pending')
    ) GROUP BY userId HAVING COUNT(*)>1
  )
`))?.[0]?.value || 0);

if (verifiedGroups !== 3 || conflictingCurrentLinks !== 0) {
  throw new Error('Final spouse consistency verification failed.');
}

const report = {
  generatedAt: new Date().toISOString(),
  database: 'starry_id_db',
  containsPII: false,
  expectedDuplicateGroups: 3,
  groupsNewlyLinked: plans.length,
  groupsAlreadyLinked: alreadyLinked,
  groupsVerifiedActive: verifiedGroups,
  conflictingCurrentLinks,
  distributorNumbersChanged: 0,
  memberNamesChanged: 0,
  status: 'healthy'
};

const outputDir = path.resolve('starry-id/audit-output');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'spouse-backfill-public.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));