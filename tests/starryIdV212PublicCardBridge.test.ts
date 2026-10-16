import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { v212PublicAmwaySlug } from '../worker/starryIdV212PublicCardBridge';

const root = process.cwd();
const privacyRouter = readFileSync(join(root, 'worker/privacyCrawlerRouter.ts'), 'utf8');
const batteryRouter = readFileSync(join(root, 'worker/starryMainBatteryGameRouter.ts'), 'utf8');
const inlineLoginRouter = readFileSync(join(root, 'worker/starryMainInlineLoginRouter.ts'), 'utf8');
const wrangler = readFileSync(join(root, 'wrangler.toml'), 'utf8');
const bridge = readFileSync(join(root, 'worker/starryIdV212PublicCardBridge.ts'), 'utf8');

test('v212 stays inside the established privacy crawler production chain', () => {
  assert.match(wrangler, /main = "worker\/starryMainInlineLoginRouter\.ts"/);
  assert.match(inlineLoginRouter, /import appWorker from '\.\/starryMainBatteryGameRouter'/);
  assert.match(batteryRouter, /import appWorker from '\.\/privacyCrawlerRouter'/);
  assert.match(privacyRouter, /handleStarryIdV212PublicCardFallback/);
  assert.match(privacyRouter, /starryV212Response \|\| starryV211Response/);
});

test('only safe numeric one-segment Amway ID routes qualify for the legacy fallback', () => {
  assert.equal(v212PublicAmwaySlug(new Request('https://id.starry.phd/9845637')), '9845637');
  assert.equal(v212PublicAmwaySlug(new Request('https://id.starry.phd/n1')), '');
  assert.equal(v212PublicAmwaySlug(new Request('https://id.starry.phd/api/member/card')), '');
  assert.equal(v212PublicAmwaySlug(new Request('https://echo.starry.phd/9845637')), '');
  assert.equal(v212PublicAmwaySlug(new Request('https://id.starry.phd/9845637/extra')), '');
});

test('legacy fallback only runs after a v211 404 and accepts one member or one active spouse pair', () => {
  assert.match(bridge, /(v211Response\.status !== 404|response\.status === 404)/);
  assert.match(bridge, /u\.status='active'/);
  assert.match(bridge, /rows\.length === 1/);
  assert.match(bridge, /rows\.length !== 2/);
  assert.match(bridge, /spouse_links/);
  assert.match(bridge, /status='active'/);
});

test('first public Amway request assigns an n sequence and delegates rendering back to v211', () => {
  assert.match(bridge, /`n\$\{Number\(card\.seq\)\}`/);
  assert.match(bridge, /UPDATE public_cards SET slug=\?,cardNumber=\?,updatedAt=\?/);
  assert.match(bridge, /handleStarryIdV211\(request, env\)/);
  assert.match(bridge, /rendered\.status !== 404/);
});
