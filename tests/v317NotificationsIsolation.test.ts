import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { UserProfile, Track, Comment } from '../src/types';
import {
  parseDismissedMentions,
  buildMentionNotifications,
  getPendingNotificationUsers,
  getNewNotificationMembers
} from '../src/utils/notificationsModel';

const user = (id: string, name: string, email: string, rest: Record<string, unknown> = {}) =>
  ({ id, name, email, ...rest } as UserProfile);
const comment = (id: string, content: string, rest: Record<string, unknown> = {}) =>
  ({ id, content, trackId: 'track1', authorName: '友人', authorEmail: 'friend@example.com', ...rest } as Comment);

test('corrupt, obsolete and oversized notification storage cannot crash the screen', () => {
  for (const raw of [null, '', 'null', '{}', 'true', '42', '"text"', '{broken']) {
    assert.deepEqual(parseDismissedMentions(raw), []);
  }
  assert.deepEqual(parseDismissedMentions('["a",123,null,"b","a"]'), ['a', 'b']);
  assert.equal(parseDismissedMentions(JSON.stringify(Array.from({length: 6000}, (_, i) => String(i)))).length, 5000);
});

test('mentions preserve reply, self-filter, recording link, author and dismissal behavior', () => {
  const me = user('me', '繁星', 'me@example.com');
  const friend = user('other', '友人', 'friend@example.com');
  const track = {id: 'track1', title: '測試音檔'} as Track;
  const data = [
    comment('1', '你好 @繁星', {createdAt: 1700000000000}),
    comment('2', '你好', {replyToAuthor: '繁星', createdAt: 1710000000000}),
    comment('3', '@繁星', {authorEmail: me.email}),
    comment('4', '@繁星', {authorName: me.name}),
    comment('5', '無關內容')
  ];
  const notices = buildMentionNotifications(data, me, [track], [friend], ['2']);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].id, 'mention-1');
  assert.equal(notices[0].authorUser?.id, friend.id);
  assert.equal(notices[0].track?.title, '測試音檔');
  assert.equal(notices[0].isDirectMention, true);
  assert.equal(buildMentionNotifications(data, me, [track], [friend], []).length, 2);
  assert.deepEqual(buildMentionNotifications(data, null, [track], [friend], []), []);
});

test('only requested notification tab derives member lists', () => {
  const users = [
    user('a', '待審核', 'pending@example.com', {rankAuditStatus: 'pending', rankUpdatedAt: '2026-10-18'}),
    user('b', '已加入', 'active@example.com', {rankApproved: true, registerDate: '2026-10-17'}),
    user('c', '管理員', 'yukidu@gmail.com', {rankApproved: true})
  ];
  assert.equal(getPendingNotificationUsers(users).length, 1);
  assert.equal(getNewNotificationMembers(users).length, 1);
  assert.equal(getNewNotificationMembers(users)[0].id, 'b');
});

const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
test('notification screen is lazy, guarded, limited and recoverable', () => {
  const app = read('src/App.tsx');
  const view = read('src/components/NotificationsView.tsx');
  const navbar = read('src/components/Navbar.tsx');
  const boundary = read('src/components/NotificationErrorBoundary.tsx');
  assert.match(app, /const NotificationsView = lazy\(/);
  assert.match(app, /<NotificationErrorBoundary onReturnHome=/);
  assert.match(view, /activeTab === 'pending' && canSeePending \? getPendingNotificationUsers\(users\) : \[\]/);
  assert.match(view, /activeTab === 'new-members' \? getNewNotificationMembers\(users\) : \[\]/);
  assert.match(view, /mentionNotifications\.slice\(0,visibleRows\)/);
  assert.match(view, /parseDismissedMentions\(stored\)/);
  assert.match(view, /重新讀取通知/);
  assert.match(view, /AbortController/);
  assert.match(view, /onApproveRank\(userId/);
  assert.match(view, /onAddComment\(/);
  assert.match(view, /dismissMention\(/);
  assert.match(boundary, /返回首頁/);
  assert.match(boundary, /getDerivedStateFromError/);
  assert.match(navbar, /tab !== 'notifications' && currentTab !== 'home'/);
});
