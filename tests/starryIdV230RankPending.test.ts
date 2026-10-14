import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rank = readFileSync('worker/starryIdRankUpdateRouter.ts', 'utf8');
const client = readFileSync('worker/starryIdV230ClientRouter.ts', 'utf8');
const notifications = readFileSync('worker/starryIdNotificationsRouter.ts', 'utf8');

test('v230 snapshots the last approved rank before a member submits a new rank', () => {
  assert.match(rank, /approvedRank=CASE WHEN TRIM\(COALESCE\(approvedRank,''\)\)='' AND COALESCE\(rankApproved,0\)=1 THEN rank ELSE approvedRank END/);
  assert.match(rank, /rankApproved=0,rankAuditStatus='pending'/);
  assert.match(rank, /approvedRank: text\(after\?\.approvedRank\)/);
});

test('v230 displays the exact pending-review message below the rank field', () => {
  assert.match(client, /你已提交獎銜變更 /);
  assert.match(client, / 等待人工審核中/);
  assert.match(client, /d\.rankStatus\.approvedRank\|\|'尚未核准'/);
});

test('v230 notification feed keeps approved and pending ranks separate', () => {
  assert.match(notifications, /approvedRank: effectiveRank\(me\)/);
  assert.match(notifications, /pendingRank: text\(me\?\.rankAuditStatus\) === 'pending' \? text\(me\?\.rank\) : ''/);
});
