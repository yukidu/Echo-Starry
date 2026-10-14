import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entry = readFileSync(new URL('../worker/starryIdMobileToolbarEntry.ts', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

test('v227 keeps the existing worker chain and only patches Starry ID member-center HTML', () => {
  assert.match(entry, /import privacyCrawlerRouter from '\.\/privacyCrawlerRouter'/);
  assert.match(entry, /url\.hostname !== STAR_DOMAIN/);
  assert.match(entry, /MEMBER_CENTER_PATHS\.has\(url\.pathname\)/);
  assert.match(entry, /Content-Type/);
  assert.match(entry, /v227-mobile-toolbar-fix/);
});

test('v227 removes viewport-width translation overflow and gives brand flexible mobile space', () => {
  assert.match(entry, /width:100%!important/);
  assert.match(entry, /left:auto!important/);
  assert.match(entry, /transform:none!important/);
  assert.match(entry, /\.topbar \.brand\{flex:1 1 auto!important;min-width:0!important/);
  assert.match(entry, /\.topbar \.top-actions\{flex:0 0 auto!important/);
  assert.match(entry, /@media\(max-width:760px\)/);
});

test('wrangler uses the v227 wrapper while preserving the same production worker', () => {
  assert.match(wrangler, /name = "echostars"/);
  assert.match(wrangler, /main = "worker\/starryIdMobileToolbarEntry\.ts"/);
  assert.match(wrangler, /pattern = "id\.starry\.phd"/);
  assert.match(wrangler, /binding = "STARRY_ID_DB"/);
});
