import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const spouse = readFileSync(new URL('../worker/starryIdSpouseRouter.ts', import.meta.url), 'utf8');

test('v228 unlinks an active or legacy unlink-pending spouse relation immediately', () => {
  assert.match(spouse, /l\.status==='active'\|\|l\.status==='unlink_pending'/);
  assert.match(spouse, /kind==='request-unlink'\|\|kind==='unlink'/);
  assert.match(spouse, /DELETE FROM spouse_links WHERE id=\?/);
  assert.match(spouse, /DELETE FROM spouse_slots WHERE linkId=\?/);
  assert.match(spouse, /status:'unlinked'/);
  assert.match(spouse, /spouse-single-unlink/);
});

test('v228 automatically gives the other spouse a synthetic ID when requester keeps the shared distributor number', () => {
  assert.match(spouse, /const autoAssigned=loser!==id/);
  assert.match(spouse, /if\(autoAssigned\)\{\s*replacement=await generate\(db\)/);
  assert.match(spouse, /INSERT INTO non_distributor_ids/);
  assert.match(spouse, /INSERT INTO non_distributor_history/);
  assert.match(spouse, /synthetic\.test\(replacement\)/);
});

test('v228 keeps number validation when requester gives the shared number to the other spouse', () => {
  assert.match(spouse, /若由對方保留原編號/);
  assert.match(spouse, /replacement==='nonDistributor'/);
  assert.match(spouse, /!numeric\.test\(replacement\)/);
  assert.match(spouse, /await owner\(db,replacement,loser\)/);
});

test('v228 exposes legacy unlink-pending rows as active so either spouse can finish unlink immediately', () => {
  assert.match(spouse, /visibleStatus=l\?\.status==='unlink_pending'\?'active':l\?\.status/);
});
