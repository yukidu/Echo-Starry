import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleDownloadStarryCentralSso } from '../worker/downloadStarryCentralSso';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Download Starry central login lives on id.starry.phd and uses central Google client', async () => {
  const response = await handleDownloadStarryCentralSso(
    new Request('https://id.starry.phd/auth/downloadstarry'),
    {} as any
  );
  assert.ok(response);
  assert.equal(response?.status, 200);
  const html = await response!.text();
  assert.match(html, /Starry ID × 繁星下載/);
  assert.match(html, /accounts\.google\.com\/gsi\/client/);
  assert.match(html, /\/api\/google-sync/);
  assert.match(html, /appId:'downloadstarry'/);
  assert.match(html, /\/api\/apps\/downloadstarry\/ticket/);
  assert.doesNotMatch(html, /echo\.starry\.phd/);
  assert.doesNotMatch(html, /\/api\/users\/google-sync/);
});

test('Download Starry central SSO stores one-time codes in Starry ID D1', async () => {
  const source = await read('worker/downloadStarryCentralSso.ts');
  assert.match(source, /STARRY_ID_DB/);
  assert.match(source, /starry_app_auth_codes/);
  assert.match(source, /appId,userId,expiresAt,createdAt/);
  assert.match(source, /DOWNLOAD_APP_ID/);
  assert.match(source, /https:\/\/download\.starry\.phd/);
  assert.match(source, /TICKET_TTL_MS = 5 \* 60 \* 1000/);
  assert.doesNotMatch(source, /syncEchoMemberToStarryBestEffort/);
});

test('privacy entry routes central Download SSO before generic Starry ID router', async () => {
  const privacy = await read('worker/privacyCrawlerRouter.ts');
  const wrangler = await read('wrangler.toml');
  const centralIndex = privacy.indexOf('handleDownloadStarryCentralSso(request');
  const genericIndex = privacy.indexOf('handleStarryIdCentral(request');
  assert.ok(centralIndex >= 0 && genericIndex > centralIndex);
  assert.match(wrangler, /main = "worker\/privacyCrawlerRouter\.ts"/);
  assert.match(wrangler, /STARRY_ID_ALLOWED_APPS = "starry-id,downloadstarry"/);
  assert.match(wrangler, /STARRY_ID_SELF_ENROLL_APPS = "starry-id,downloadstarry"/);
});
