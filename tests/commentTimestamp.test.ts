import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatCommentTimestamp } from '../shared/commentTime';

test('comment timestamps use canonical createdAt in Taiwan time instead of a frozen just-now label', () => {
  const createdAt = Date.UTC(2026, 9, 4, 15, 14, 0);
  assert.equal(formatCommentTimestamp({ createdAt, timestamp: '剛剛' }), '2026/10/04 23:14');
  assert.equal(formatCommentTimestamp({ createdAt: Math.floor(createdAt / 1000) }), '2026/10/04 23:14');
  assert.equal(formatCommentTimestamp({ timestamp: '2026/10/04 22:00' }), '2026/10/04 22:00');
  assert.equal(formatCommentTimestamp({ timestamp: '剛剛' }), '時間未知');
});

test('production comment API derives every returned timestamp from createdAt', () => {
  const worker = readFileSync(new URL('../worker/community.ts', import.meta.url), 'utf8');
  assert.match(worker, /timestamp: formatCommentTimestamp\(row\)/);
  assert.match(worker, /const createdAt = Date\.now\(\)/);
  assert.match(worker, /timestamp: formatCommentTimestamp\(\{ createdAt \}\), createdAt/);
  assert.doesNotMatch(worker, /timestamp: '剛剛'/);
});

test('comment rank badge is forced onto one line', () => {
  const comments = readFileSync(new URL('../src/components/CommentsSection.tsx', import.meta.url), 'utf8');
  assert.match(comments, /displayAuthorBadge[^\n]*whitespace-nowrap shrink-0|whitespace-nowrap shrink-0[^\n]*displayAuthorBadge/);
  assert.doesNotMatch(comments, /displayAuthorBadge[^\n]*whitespace-normal/);
});
