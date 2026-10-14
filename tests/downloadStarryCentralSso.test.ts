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
  assert.match(html, /downloadstarry/);
  assert.match(html, /\/api\/apps\/downloadstarry\/ticket/);
  assert.doesNotMatch(html, /echo\.starry\.phd/);
  assert.doesNotMatch(html, /\/api\/users\/google-sync/);
});

test('Go Starry central login uses the same Starry ID ticket flow', async () => {
  const response = await handleDownloadStarryCentralSso(
    new Request('https://id.starry.phd/auth/gostarry'),
    {} as any
  );
  assert.ok(response);
  assert.equal(response?.status, 200);
  const html = await response!.text();
  assert.match(html, /Starry ID × Go Starry/);
  assert.match(html, /\/api\/google-sync/);
  assert.match(html, /gostarry/);
  assert.match(html, /\/api\/apps\/gostarry\/ticket/);
  assert.match(html, /https:\/\/go\.starry\.phd/);
});

test('Quotes central login returns to quotes.starry.phd and uses identity-only flow', async () => {
  const response = await handleDownloadStarryCentralSso(
    new Request('https://id.starry.phd/auth/quotes'),
    {} as any
  );
  assert.ok(response);
  assert.equal(response?.status, 200);
  const html = await response!.text();
  assert.match(html, /Starry ID × 繁星語錄/);
  assert.match(html, /\/api\/google-sync/);
  assert.match(html, /\/api\/apps\/quotes\/identity/);
  assert.match(html, /https:\/\/quotes\.starry\.phd/);
  assert.match(html, /IDENTITY_ONLY=true/);
});

test('Quotes identity endpoint is credentialed only for the Quotes origin and exposes minimal profile fields', async () => {
  const source = await read('worker/downloadStarryCentralSso.ts');
  assert.match(source, /const QUOTES_ORIGIN = 'https:\/\/quotes\.starry\.phd'/);
  assert.match(source, /Access-Control-Allow-Credentials', 'true'/);
  assert.match(source, /Access-Control-Allow-Origin', QUOTES_ORIGIN/);
  assert.match(source, /name: text\(member\.name\)/);
  assert.match(source, /rank: text\(member\.rank\)/);
  assert.match(source, /approvedRank: text\(member\.approvedRank\)/);
  const endpointBlock = source.slice(source.indexOf('async function quotesIdentity'), source.indexOf('async function issueTicket'));
  assert.doesNotMatch(endpointBlock, /email:/);
  assert.doesNotMatch(endpointBlock, /phone:/);
  assert.doesNotMatch(endpointBlock, /birthday:/);
});

test('central SSO stores one-time codes in Starry ID D1 for ticket-based registered apps', async () => {
  const source = await read('worker/downloadStarryCentralSso.ts');
  assert.match(source, /STARRY_ID_DB/);
  assert.match(source, /starry_app_auth_codes/);
  assert.match(source, /appId,userId,expiresAt,createdAt/);
  assert.match(source, /downloadstarry/);
  assert.match(source, /gostarry/);
  assert.match(source, /https:\/\/download\.starry\.phd/);
  assert.match(source, /https:\/\/go\.starry\.phd/);
  assert.match(source, /TICKET_TTL_MS = 5 \* 60 \* 1000/);
  assert.doesNotMatch(source, /syncEchoMemberToStarryBestEffort/);
});

test('privacy entry routes central app SSO before generic Starry ID router', async () => {
  const privacy = await read('worker/privacyCrawlerRouter.ts');
  const wrangler = await read('wrangler.toml');
  const centralIndex = privacy.indexOf('handleDownloadStarryCentralSso(request');
  const genericIndex = privacy.indexOf('handleStarryIdCentral(request');
  assert.ok(centralIndex >= 0 && genericIndex > centralIndex);
  assert.match(wrangler, /main = "worker\/privacyCrawlerRouter\.ts"/);
  assert.match(wrangler, /STARRY_ID_ALLOWED_APPS = "starry-id,downloadstarry,gostarry,quotes"/);
  assert.match(wrangler, /STARRY_ID_SELF_ENROLL_APPS = "starry-id,downloadstarry,gostarry,quotes"/);
});
