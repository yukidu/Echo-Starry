import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('remaining member-facing rank displays use effective rank', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const notifications = readFileSync(new URL('../src/components/NotificationsView.tsx', import.meta.url), 'utf8');
  assert.match(app, /effectiveMemberRank\(currentUser, '訪客稱號'\)/);
  assert.doesNotMatch(app, /currentUser\?\.rank \|\| '訪客稱號'/);
  assert.match(notifications, /effectiveMemberRank\(m\.authorUser, m\.comment\.authorBadge \|\| '無'\)/);
  assert.doesNotMatch(notifications, /m\.authorUser\.rank \|\| m\.comment\.authorBadge/);
});
