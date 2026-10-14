import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const enhancer = readFileSync(new URL('../worker/starryIdV218ResponseEnhancer.ts', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

test('v227 applies the mobile toolbar fix only in the existing Starry ID member-center enhancer', () => {
  assert.match(enhancer, /const STAR_DOMAIN = 'id\.starry\.phd'/);
  assert.match(enhancer, /url\.pathname === '\/' \|\| url\.pathname === '\/my-card'/);
  assert.match(enhancer, /v227-mobile-toolbar-fix/);
  assert.match(enhancer, /enhanceStarryIdV222MemberCenter\(html\)/);
  assert.match(enhancer, /html = html\.replace\('<\/head>', mobileToolbarFixStyle\(\) \+ '<\/head>'\)/);
});

test('v227 final override removes viewport translation overflow and preserves action space', () => {
  assert.match(enhancer, /width:100%!important/);
  assert.match(enhancer, /left:auto!important/);
  assert.match(enhancer, /transform:none!important/);
  assert.match(enhancer, /\.topbar \.brand\{flex:1 1 auto!important;min-width:0!important/);
  assert.match(enhancer, /\.topbar \.top-actions\{flex:0 0 auto!important/);
  assert.match(enhancer, /text-overflow:ellipsis!important/);
  assert.match(enhancer, /@media\(max-width:760px\)/);
});

test('wrangler keeps the established privacy crawler entrypoint and production Starry ID route', () => {
  assert.match(wrangler, /name = "echostars"/);
  assert.match(wrangler, /main = "worker\/privacyCrawlerRouter\.ts"/);
  assert.match(wrangler, /pattern = "id\.starry\.phd"/);
  assert.match(wrangler, /binding = "STARRY_ID_DB"/);
});
