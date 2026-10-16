import fs from 'node:fs';
import path from 'node:path';

const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const databaseId = String(process.env.STARRY_ID_D1_ID || '01195c92-555e-4816-bddc-5b8cb2e795db').trim();
if (!accountId || !apiToken || !databaseId) throw new Error('Cloudflare D1 report credentials are required');

async function query(sql, params = []) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql, params: params.map(value => String(value)) })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success || !Array.isArray(payload.result) || payload.result.some(item => item?.success === false)) {
    throw new Error(`D1 report query failed (${response.status})`);
  }
  return payload.result[0]?.results || [];
}

const text = value => value == null ? '' : String(value).trim();
const groups = await query(`SELECT amwayId,COUNT(*) AS memberCount
  FROM profiles WHERE TRIM(COALESCE(amwayId,''))<>''
  GROUP BY LOWER(TRIM(amwayId)) HAVING COUNT(*)>1 ORDER BY LOWER(TRIM(amwayId))`);

const duplicateGroups = [];
for (const group of groups) {
  const amwayId = text(group.amwayId);
  const members = await query(`SELECT p.userId,p.name,u.primaryEmail
    FROM profiles p JOIN users u ON u.id=p.userId
    WHERE LOWER(TRIM(p.amwayId))=LOWER(TRIM(?)) ORDER BY p.userId`, [amwayId]);
  duplicateGroups.push({
    amwayId,
    memberCount: members.length,
    members: members.map(member => ({
      userId: text(member.userId),
      name: text(member.name),
      email: text(member.primaryEmail)
    }))
  });
}

const outputDir = path.resolve('starry-id/audit-output');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'duplicate-amway-private.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  database: 'starry_id_db',
  containsPII: true,
  modified: false,
  duplicateGroups
}, null, 2));

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  database: 'starry_id_db',
  containsPII: false,
  modified: false,
  duplicateGroupCount: duplicateGroups.length,
  duplicateMemberCount: duplicateGroups.reduce((sum, group) => sum + group.memberCount, 0)
}, null, 2));
