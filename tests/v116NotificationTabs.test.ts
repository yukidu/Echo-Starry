import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const notifications = readFileSync(new URL('../src/components/NotificationsView.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const model = readFileSync(new URL('../src/utils/notificationsModel.ts', import.meta.url), 'utf8');

test('notification tabs match the personal-center underline navigation and sticker tab is removed', () => {
  assert.equal(notifications.includes('我的訊息'), true);
  assert.equal(notifications.includes('未審核'), true);
  assert.equal(notifications.includes('新會員'), true);
  assert.equal(notifications.includes('貼紙通知'), false);
  assert.equal(notifications.includes('/api/stickers/notifications'), false);
  assert.equal(notifications.includes('ChevronLeft'), true);
  assert.equal(notifications.includes('ChevronRight'), true);
  assert.equal(notifications.includes('border-b-2'), true);
  assert.equal(model.includes('if (!isDirectMention) return [];'), true);
  assert.equal(notifications.includes("return comment.content.includes('@') || comment.content.includes('＠');"), false);
});

test('pending review tab is visible only to reviewers, platinum-and-above, or super admin', () => {
  assert.equal(notifications.includes("currentUser?.role === '獎銜審核員'"), true);
  assert.equal(notifications.includes("indexOf('白金')"), true);
  assert.equal(notifications.includes('canSeePending && ('), true);
  assert.equal(app.includes('canSeePendingAuditNotifications'), true);
  assert.equal(app.includes('const pendingAuditCount = canSeePendingAuditNotifications'), true);
});

test('bell badge no longer counts sticker notifications', () => {
  assert.equal(app.includes('return (canSeePendingAuditNotifications ? auditCount : 0) + mentionCount;'), true);
  assert.equal(app.includes('auditCount + mentionCount + Number(stickerSummary?.unreadNotifications || 0)'), false);
});
