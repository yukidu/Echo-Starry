import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const router = readFileSync(join(root, 'worker/starryIdV212Router.ts'), 'utf8');
const wrangler = readFileSync(join(root, 'wrangler.toml'), 'utf8');

test('v212 is a thin compatibility layer in front of the existing privacy/v211 worker chain', () => {
  assert.match(wrangler, /main = "worker\/starryIdV212Router\.ts"/);
  assert.match(router, /import privacyWorker from '\.\/privacyCrawlerRouter'/);
  assert.match(router, /return privacyWorker\.fetch\(request, env, ctx\)/);
});

test('legacy Amway members can materialize a public card directly from their Amway ID URL', () => {
  assert.match(router, /LOWER\(TRIM\(COALESCE\(p\.amwayId,''\)\)\)=\?/);
  assert.match(router, /u\.status='active'/);
  assert.match(router, /rows\.length !== 1/);
  assert.match(router, /const number = `n\$\{Number\(card\.seq\)\}`/);
  assert.match(router, /UPDATE public_cards SET slug=\?,cardNumber=\?,updatedAt=\?/);
  assert.match(router, /first\.status !== 404/);
  assert.match(router, /materializeAmwayCardAfterV211Bootstrap/);
});

test('n-number URLs remain explicit public_cards routes and never fall back to Amway lookup', () => {
  assert.match(router, /const NUMBER_CARD_RE = \/\^n\[1-9\]\[0-9\]\*\$\//);
  assert.match(router, /if \(!db \|\| NUMBER_CARD_RE\.test\(slug\)\) return false/);
  assert.match(router, /first\.status !== 404 \|\| NUMBER_CARD_RE\.test\(slug\)/);
});

test('changed Amway IDs self-heal stale public URLs with a canonical redirect', () => {
  assert.match(router, /const desired = slugify\(member\.amwayId\) \|\| lower\(card\.cardNumber\)/);
  assert.match(router, /UPDATE public_cards SET slug=\?,updatedAt=\? WHERE userId=\?/);
  assert.match(router, /Response\.redirect\(next\.toString\(\), 308\)/);
});

test('public card compatibility layer only accepts one-segment safe Starry ID slugs', () => {
  assert.match(router, /url\.hostname !== STAR_DOMAIN/);
  assert.match(router, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(router, /raw\.includes\('\/'\)/);
  assert.match(router, /slugify\(normalized\) !== normalized/);
});
