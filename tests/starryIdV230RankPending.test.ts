import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rank = readFileSync('worker/starryIdRankUpdateRouter.ts', 'utf8');
const client = readFileSync('worker/starryIdV230ClientRouter.ts', 'utf8');
const notifications = readFileSync('worker/starryIdNotificationsRouter.ts', 'utf8');

test('v306 preserves the last approved rank before a member submits a new rank', () => {
  assert.match(rank, /const preservedApprovedRank = text\(current\.approvedRank\) \|\| \(Number\(current\.rankApproved \|\| 0\) === 1 \? text\(current\.rank\) : ''\)/);
  assert.match(rank, /approvedRank: preservedApprovedRank/);
  assert.match(rank, /rankApproved: 0/);
  assert.match(rank, /rankAuditStatus: 'pending'/);
  assert.match(rank, /UPDATE profiles SET approvedRank=\?,rank=\?,rankApproved=0,rankAuditStatus='pending'/);
  assert.match(rank, /await db\.batch\(\[update, \.\.\.auditStatements\]\)/);
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
