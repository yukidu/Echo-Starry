import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const router = readFileSync('worker/starryIdV211Router.ts','utf8');

test('v250 resolves a missing numeric public-card slug from one member or an active spouse pair', () => {
  assert.match(router, /if\(!card && \/\^\[0-9\]\+\$\/\.test\(slug\)\)/);
  assert.match(router, /TRIM\(COALESCE\(p\.amwayId,''\)\)=\?/);
  assert.match(router, /u\.status='active'/);
  assert.match(router, /LIMIT 3/);
  assert.match(router, /rows\.length===1/);
  assert.match(router, /text\(rows\[0\]\.amwayId\)===slug/);
  assert.match(router, /rows\.length===2/);
  assert.match(router, /spouse_links/);
  assert.match(router, /status='active'/);
});

test('v250 materializes the member card and retries the requested numeric slug', () => {
  assert.match(router, /await ensureCard\(db,directMember\)/);
  const lookup = "SELECT userId,slug,cardNumber FROM public_cards WHERE slug=? LIMIT 1";
  assert.ok(router.split(lookup).length - 1 >= 2);
});

test('v250 keeps unknown or ambiguous numeric IDs private instead of choosing a random member', () => {
  assert.match(router, /if\(!card\) return null/);
  assert.doesNotMatch(router, /rows\[0\].*rows\.length>0/);
});
