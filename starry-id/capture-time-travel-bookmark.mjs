const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const databaseId = String(process.env.STARRY_ID_D1_ID || '01195c92-555e-4816-bddc-5b8cb2e795db').trim();

if (!accountId || !apiToken || !databaseId) throw new Error('Cloudflare D1 backup credentials are required');

const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/time_travel/bookmark`, {
  headers: { Authorization: `Bearer ${apiToken}` }
});
const payload = await response.json().catch(() => null);
if (!response.ok || !payload?.success || !payload?.result?.bookmark) {
  throw new Error(`Unable to capture D1 Time Travel bookmark (${response.status})`);
}

const report = {
  backupType: 'cloudflare-d1-time-travel',
  database: 'starry_id_db',
  databaseId,
  capturedAt: new Date().toISOString(),
  bookmark: String(payload.result.bookmark),
  containsPII: false,
  purpose: 'pre-health-repair recovery point'
};
console.log(JSON.stringify(report, null, 2));
