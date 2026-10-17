import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const view = readFileSync(new URL('../src/components/NotificationsView.tsx', import.meta.url), 'utf8');
const community = readFileSync(new URL('../worker/community.ts', import.meta.url), 'utf8');
const localServer = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');

test('opening notifications never loads the unbounded comments/users datasets', () => {
  const effect = app.split('// Load large users/comments datasets only for screens that use them.')[1]
    ?.split('// Filter & Search')[0] || '';
  assert.ok(effect.includes('const needsCommunityData ='));
  assert.ok(!effect.includes("currentTab === 'notifications'"));
  assert.ok(app.includes('onRequestMembers={() => fetchAllUsers()}'));
  assert.ok(!app.includes('comments={allComments.length > 0 ? allComments : comments}'));
});

test('inbox requests bounded, member-specific mentions and lazy-loads review lists', () => {
  assert.ok(view.includes('/api/comments?mention='));
  assert.ok(view.includes('encodeURIComponent(name)'));
  assert.ok(!view.includes("fetch('/api/comments')"));
  assert.ok(view.includes('if (activeTab === \'messages\' || !onRequestMembers'));
  assert.ok(view.includes('new AbortController()'));
  assert.ok(view.includes('正在讀取我的訊息'));
});

test('D1 and development server restrict notification results without altering legacy full feed', () => {
  assert.ok(community.includes("url.searchParams.has('mention')"));
  assert.ok(community.includes('ORDER BY createdAt DESC LIMIT 120'));
  assert.ok(community.includes("lower(trim(COALESCE(replyToAuthor,''))) = lower(?)"));
  assert.ok(community.includes("db.prepare('SELECT * FROM comments ORDER BY createdAt DESC')"));
  assert.ok(localServer.includes("typeof _req.query.mention === 'string'"));
  assert.ok(localServer.includes('.slice(0, 120)'));
});
