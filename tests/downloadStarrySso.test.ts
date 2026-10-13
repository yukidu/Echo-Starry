import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handleDownloadStarrySso } from '../worker/downloadStarrySsoRouter';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Download Starry login page keeps Google verification on EchoStars origin', async () => {
  const response = await handleDownloadStarrySso(
    new Request('https://echo.starry.phd/auth/downloadstarry'),
    {} as any
  );
  assert.ok(response);
  assert.equal(response?.status, 200);
  const html = await response!.text();
  assert.match(html, /Starry ID × 繁星下載/);
  assert.match(html, /accounts\.google\.com\/gsi\/client/);
  assert.match(html, /\/api\/users\/google-sync/);
  assert.match(html, /\/api\/auth\/downloadstarry-ticket/);
  assert.doesNotMatch(html, /localStorage/);
});

test('Download Starry SSO uses one-time code and central Starry ID database', async () => {
  const source = await read('worker/downloadStarrySsoRouter.ts');
  assert.match(source, /external_app_auth_codes/);
  assert.match(source, /app = 'downloadstarry'/);
  assert.match(source, /STARRY_ID_DB/);
  assert.match(source, /syncEchoMemberToStarryBestEffort/);
  assert.match(source, /https:\/\/download\.starry\.phd\/auth\/callback\?code=/);
  assert.doesNotMatch(source, /googleSubject.*return json/s);
});

test('Worker entry stays a thin wrapper around current privacy router', async () => {
  const entry = await read('worker/downloadStarryEntry.ts');
  const wrangler = await read('wrangler.toml');
  assert.match(entry, /privacyCrawlerRouter/);
  assert.match(entry, /handleDownloadStarrySso/);
  assert.match(wrangler, /main = "worker\/downloadStarryEntry\.ts"/);
  assert.match(wrangler, /binding = "STARRY_ID_DB"/);
});
