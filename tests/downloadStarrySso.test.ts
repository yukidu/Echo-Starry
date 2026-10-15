import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Download Starry production login is owned by central Starry ID, not Echo login', async () => {
  const privacy = await read('worker/privacyCrawlerRouter.ts');
  const central = await read('worker/downloadStarryCentralSso.ts');
  const centralIndex = privacy.indexOf('handleDownloadStarryCentralSso(request');
  const genericIndex = privacy.indexOf('handleStarryIdCentral(request');
  const legacyIndex = privacy.indexOf('handleStarbeautySso(request');

  assert.ok(centralIndex >= 0, 'central app SSO must be wired into the production entry');
  assert.ok(genericIndex > centralIndex, 'central app SSO must run before the generic Starry ID router');
  assert.ok(legacyIndex > centralIndex, 'central app SSO must run before the legacy Echo external-app chain');
  assert.match(central, /const STARRY_ID_HOST = 'id\.starry\.phd'/);
  assert.match(central, /\/api\/google-sync/);
  assert.match(central, /downloadstarry/);
  assert.match(central, /gostarry/);
  assert.doesNotMatch(central, /echo\.starry\.phd/);
  assert.doesNotMatch(central, /\/api\/users\/google-sync/);
});

test('central app SSO uses one-time codes in central Starry ID database', async () => {
  const source = await read('worker/downloadStarryCentralSso.ts');
  assert.match(source, /CREATE TABLE IF NOT EXISTS starry_app_auth_codes/);
  assert.match(source, /STARRY_ID_DB/);
  assert.match(source, /APP_CONFIG/);
  assert.match(source, /downloadstarry/);
  assert.match(source, /gostarry/);
  assert.match(source, /TICKET_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(source, /https:\/\/download\.starry\.phd/);
  assert.match(source, /https:\/\/go\.starry\.phd/);
  assert.match(source, /redirect: `\$\{config\.origin\}\/auth\/callback\?code=/);
  assert.match(source, /codeHash TEXT PRIMARY KEY/);
  assert.doesNotMatch(source, /syncEchoMemberToStarryBestEffort/);
  assert.doesNotMatch(source, /downloadstarry-exchange/);
  assert.doesNotMatch(source, /echo\.starry\.phd/);
});

test('legacy Echo Download SSO may remain for compatibility but cannot own central Starry ID routing', async () => {
  const privacy = await read('worker/privacyCrawlerRouter.ts');
  const externalSso = await read('worker/starbeautySsoRouter.ts');
  const wrangler = await read('wrangler.toml');
  const inline = await read('worker/starryMainInlineLoginRouter.ts');
  const battery = await read('worker/starryMainBatteryGameRouter.ts');

  assert.match(wrangler, /main = "worker\/starryMainInlineLoginRouter\.ts"/);
  assert.match(inline, /import appWorker from '\.\/starryMainBatteryGameRouter'/);
  assert.match(battery, /import appWorker from '\.\/privacyCrawlerRouter'/);
  assert.match(wrangler, /binding = "STARRY_ID_DB"/);
  assert.match(wrangler, /STARRY_ID_ALLOWED_APPS = "starry-id,starryphd,downloadstarry,gostarry,quotes,boxstarry"/);
  assert.match(wrangler, /STARRY_ID_SELF_ENROLL_APPS = "starry-id,starryphd,downloadstarry,gostarry,quotes,boxstarry"/);
  assert.match(privacy, /handleDownloadStarryCentralSso/);
  assert.match(externalSso, /handleDownloadStarrySso/);
  assert.ok(
    privacy.indexOf('handleDownloadStarryCentralSso(request') < privacy.indexOf('handleStarbeautySso(request'),
    'central SSO must intercept Download login before the legacy compatibility chain'
  );
});
