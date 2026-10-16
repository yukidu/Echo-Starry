import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync('scripts/v273BackfillDuplicateSpouses.mjs', 'utf8');
const workflow = readFileSync('.github/workflows/starry-id-spouse-backfill.yml', 'utf8');

test('v273 spouse backfill never publishes known member names or distributor numbers', () => {
  for (const privateValue of ['4810333','6437758','9386705','陳泰榮','曾采婕','李育霖','Ming Yao','粘薈蕙','陳溢銳']) {
    assert.equal(script.includes(privateValue), false);
    assert.equal(workflow.includes(privateValue), false);
  }
});

test('v273 backfill aborts unless the audited state is exactly three duplicate groups', () => {
  assert.match(script, /duplicateGroups\.length !== 3/);
  assert.match(script, /members\.length !== 2/);
  assert.match(script, /status\) !== 'active'/);
});

test('v273 only creates active spouse links and slots without changing distributor numbers', () => {
  assert.match(script, /INSERT INTO spouse_links/);
  assert.match(script, /'active'/);
  assert.match(script, /INSERT INTO spouse_slots/);
  assert.doesNotMatch(script, /UPDATE profiles SET amwayId/);
  assert.match(script, /distributorNumbersChanged: 0/);
});

test('v273 refuses to overwrite conflicting spouse relationships', () => {
  assert.match(script, /already has another spouse relationship/);
  assert.match(script, /occupied spouse slot/);
  assert.match(script, /conflictingCurrentLinks/);
});

test('v273 workflow captures a D1 recovery point before mutation and uploads only non-PII evidence', () => {
  const backupIndex = workflow.indexOf('Capture immediate pre-backfill D1 recovery point');
  const writeIndex = workflow.indexOf('Backfill exactly three approved spouse groups and verify');
  assert.ok(backupIndex >= 0 && writeIndex > backupIndex);
  assert.match(workflow, /pre-spouse-backfill-bookmark\.json/);
  assert.match(workflow, /spouse-backfill-public\.json/);
});
