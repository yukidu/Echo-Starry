import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { communityApi } from '../worker/community';
import worker from '../worker/index';
import { NumerologyGrid } from '../src/components/NumerologyGrid';
import { commentThreads } from '../src/utils/comments';

const demo = [{
  id: 't-test',
  title: '測試音檔',
  speaker: '講者',
  audioUrl: '/test.mp3',
  likes: 0,
  durationSeconds: 600,
  ratings: {},
  likedBy: []
}];

function database(legacy = false) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  if (legacy) {
    sqlite.exec('ALTER TABLE tracks DROP COLUMN keywordMeta');
    for (const column of [
      'residence', 'birthday', 'approvedRank', 'rankAuditType', 'canUpload', 'playCount',
      'googleAvatar', 'avatarUploadCount', 'avatarUploadMonth', 'profileEditCount',
      'profileEditMonth', 'zodiac', 'talentNumber', 'lifeNumber'
    ]) sqlite.exec(`ALTER TABLE users DROP COLUMN ${column}`);
    sqlite.exec('ALTER TABLE playback_memories DROP COLUMN lastListenDate');
    sqlite.exec('ALTER TABLE playback_memories DROP COLUMN finishDate');
  }

  function prepare(sql: string) {
    let values: any[] = [];
    const statement = {
      bind(...args: any[]) { values = args; return statement; },
      async first() { return sqlite.prepare(sql).get(...values) || null; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      async run() {
        const result = sqlite.prepare(sql).run(...values);
        return { meta: { changes: Number(result.changes) } };
      }
    };
    return statement;
  }

  return {
    sqlite,
    prepare,
    async batch(statements: any[]) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

async function call(db: any, path: string, method = 'GET', body?: any) {
  const response = await communityApi(
    new Request('https://test.example' + path, {
      method,
      ...(body !== undefined ? {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      } : {})
    }),
    { DB: db },
    demo
  );
  assert.ok(response);
  return { status: response.status, data: await response.json() as any };
}

async function workerCall(db: any, path: string, method = 'GET', body?: any) {
  const response = await worker.fetch(new Request('https://test.example' + path, {
    method,
    ...(body !== undefined ? {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    } : {})
  }), { DB: db });
  return { status: response.status, data: await response.json() as any };
}

test('legacy member schema upgrades without losing edited profile fields', async () => {
  const db = database(true);
  const first = await call(db, '/api/users/google-sync', 'POST', {
    email: 'member@example.com', name: 'Google 名稱', avatar: 'https://lh3.googleusercontent.com/first'
  });
  assert.equal(first.status, 200);
  const id = first.data.user.id;
  await call(db, '/api/users/' + id, 'PUT', {
    name: '自訂名字', phone: '0912345678', center: '高雄', residence: '臺南',
    birthday: '1999-09-09', avatar: 'data:image/png;base64,custom', profileEditCount: 2
  });
  const login = await call(db, '/api/users/google-sync', 'POST', {
    email: 'MEMBER@example.com', name: 'Google 名稱', avatar: 'https://lh3.googleusercontent.com/new'
  });
  assert.equal(login.data.user.id, id);
  assert.equal(login.data.user.name, '自訂名字');
  assert.equal(login.data.user.phone, '0912345678');
  assert.equal(login.data.user.avatar, 'data:image/png;base64,custom');
  assert.equal((await call(db, '/api/users/profile?email=member%40example.com')).data.user.residence, '臺南');
  db.sqlite.close();
});

test('visitor likes and ratings persist with the frontend response contract', async () => {
  const db = database();
  assert.equal((await call(db, '/api/tracks')).data.length, 1);
  const like = await call(db, '/api/tracks/t-test/like', 'POST', { identifier: 'guest-device' });
  assert.deepEqual(like.data, { likes: 1, hasLiked: true, likedBy: ['guest-device'] });
  const cancelLike = await call(db, '/api/tracks/t-test/like', 'POST', { identifier: 'guest-device' });
  assert.equal(cancelLike.data.hasLiked, false);
  await call(db, '/api/tracks/t-test/rate', 'POST', { identifier: 'guest-a', score: 5 });
  const rated = await call(db, '/api/tracks/t-test/rate', 'POST', { identifier: 'guest-b', score: 3 });
  assert.equal(rated.data.rating, 4);
  assert.equal(rated.data.ratingCount, 2);
  assert.equal((await call(db, '/api/tracks/t-test/rate', 'POST', { identifier: 'guest-b', score: 9 })).status, 400);
  db.sqlite.close();
});

test('comments support replies, likes, owner edits, deletion and 2000-character posts', async () => {
  const db = database();
  await call(db, '/api/tracks');
  const longText = '心'.repeat(2000);
  const root = await call(db, '/api/tracks/t-test/comments', 'POST', {
    authorName: '訪客', deviceId: 'd-1', content: longText
  });
  assert.equal(root.status, 201);
  assert.equal(root.data.content.length, 2000);
  assert.equal((await call(db, '/api/tracks/t-test/comments', 'POST', {
    authorName: '訪客', deviceId: 'd-1', content: '心'.repeat(2001)
  })).status, 400);

  const reply = await call(db, '/api/tracks/t-test/comments', 'POST', {
    authorName: '訪客', deviceId: 'd-1', content: '回覆',
    replyToId: root.data.id, replyToAuthor: '訪客'
  });
  assert.equal(reply.data.replyToId, root.data.id);
  assert.equal((await call(db, '/api/comments/' + reply.data.id + '/like', 'POST', { identifier: 'd-1' })).data.hasLiked, true);
  assert.equal((await call(db, '/api/comments/' + reply.data.id, 'PUT', {
    content: '修正回覆', deviceId: 'd-1'
  })).data.content, '修正回覆');
  await call(db, '/api/comments/' + root.data.id, 'DELETE', { deviceId: 'd-1' });
  const remaining = (await call(db, '/api/tracks/t-test/comments')).data;
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].replyToId, null);
  db.sqlite.close();
});

test('regular admins may delete visitor comments but not another registered member comment', async () => {
  const db = database();
  await call(db, '/api/tracks');
  await call(db, '/api/users/google-sync', 'POST', { email: 'admin@example.com', name: '管理員' });
  db.sqlite.exec("UPDATE users SET isAdminUser = 1, role = '管理員' WHERE email = 'admin@example.com'");
  const visitorComment = await call(db, '/api/tracks/t-test/comments', 'POST', {
    authorName: '訪客', deviceId: 'guest-device', content: '訪客心得'
  });
  const memberComment = await call(db, '/api/tracks/t-test/comments', 'POST', {
    authorName: '會員', authorEmail: 'member@example.com', deviceId: 'member-device', content: '會員心得'
  });
  assert.equal((await call(db, '/api/comments/' + visitorComment.data.id, 'DELETE', {
    userEmail: 'admin@example.com'
  })).status, 200);
  assert.equal((await call(db, '/api/comments/' + memberComment.data.id, 'DELETE', {
    userEmail: 'admin@example.com'
  })).status, 403);
  assert.equal((await call(db, '/api/comments/' + memberComment.data.id, 'DELETE', {
    userEmail: 'member@example.com'
  })).status, 200);
  db.sqlite.close();
});

test('keywords preserve creator ownership and ranking', async () => {
  const db = database();
  await call(db, '/api/tracks');
  const alice = (await call(db, '/api/users/google-sync', 'POST', { email: 'alice@example.com', name: '甲' })).data.user;
  const bob = (await call(db, '/api/users/google-sync', 'POST', { email: 'bob@example.com', name: '乙' })).data.user;
  const path = '/api/tracks/t-test/keywords';
  const added = await call(db, path, 'POST', { keyword: '學習', userEmail: alice.email, userId: alice.id });
  assert.equal(added.status, 200);
  assert.equal(added.data.keywordMeta['學習'].creatorId, alice.id);
  assert.equal((await call(db, path, 'PUT', { oldKeyword: '學習', newKeyword: '偷改', userEmail: bob.email })).status, 403);
  const renamed = await call(db, path, 'PUT', { oldKeyword: '學習', newKeyword: '成長', userEmail: alice.email });
  assert.equal(renamed.data.keywordMeta['成長'].creatorId, alice.id);

  const { keywordRanking } = await import('../src/utils/keywords');
  const tracks: any = [
    { keywords: ['熱門', '舊', '新', '熱門'], keywordMeta: { 舊: { createdAt: 10 }, 新: { createdAt: 20 } } },
    { keywords: ['熱門'] }
  ];
  assert.deepEqual(keywordRanking(tracks), ['熱門', '新', '舊']);
  db.sqlite.close();
});

test('rank approval requires an authorized auditor', async () => {
  const db = database();
  await call(db, '/api/users/google-sync', 'POST', { email: 'yukidu@gmail.com', name: '管理員' });
  const member = await call(db, '/api/users/google-sync', 'POST', { email: 'member@example.com', name: '會員' });
  const route = '/api/users/' + member.data.user.id + '/audit-rank';
  assert.equal((await call(db, route, 'PUT', { auditorEmail: 'member@example.com', rank: '白金' })).status, 403);
  const approved = await call(db, route, 'PUT', { auditorEmail: 'yukidu@gmail.com', rank: '白金' });
  assert.equal(approved.status, 200);
  assert.equal(approved.data.approvedRank, '白金');
  assert.equal(approved.data.rankAuditStatus, 'approved');
  db.sqlite.close();
});

test('D1 categories can legitimately start empty and then preserve administrator CRUD order', async () => {
  const db = database();
  assert.deepEqual((await workerCall(db, '/api/categories')).data, []);
  assert.deepEqual((await workerCall(db, '/api/categories', 'POST', { name: '新人' })).data.categories, ['新人']);
  assert.deepEqual((await workerCall(db, '/api/categories', 'POST', { name: '事業' })).data.categories, ['新人', '事業']);
  assert.deepEqual((await workerCall(db, '/api/categories', 'POST', { name: '心態思維' })).data.categories, ['新人', '事業', '心態思維']);

  const reordered = await workerCall(db, '/api/categories/order', 'PUT', {
    categories: ['心態思維', '新人', '事業']
  });
  assert.equal(reordered.status, 200);
  assert.deepEqual(reordered.data.categories, ['心態思維', '新人', '事業']);
  assert.deepEqual((await workerCall(db, '/api/categories')).data, ['心態思維', '新人', '事業']);

  const renamed = await workerCall(db, '/api/categories/' + encodeURIComponent('新人'), 'PUT', { newName: '新手' });
  assert.deepEqual(renamed.data.categories, ['心態思維', '新手', '事業']);
  const removed = await workerCall(db, '/api/categories/' + encodeURIComponent('新手'), 'DELETE');
  assert.deepEqual(removed.data.categories, ['心態思維', '事業']);
  assert.equal((await workerCall(db, '/api/categories/order', 'PUT', { categories: ['心態思維', '不存在'] })).status, 409);
  db.sqlite.close();
});

test('track metadata partial edits preserve unrelated fields and honestly fail for missing records', async () => {
  const db = database();
  await call(db, '/api/users/google-sync', 'POST', { email: 'yukidu@gmail.com', name: '管理員' });
  const created = await workerCall(db, '/api/tracks', 'POST', {
    userEmail: 'yukidu@gmail.com', id: 'edit-one', title: '演講', speaker: '講員',
    audioUrl: '/uploads/one.mp3', requiredRank: '6%', description: '原備註', durationSeconds: 3439
  });
  assert.equal(created.status, 200);
  const saved = await workerCall(db, '/api/tracks/edit-one', 'PUT', {
    userEmail: 'yukidu@gmail.com', description: '新的備註', speechDate: '', series: '', seriesOrder: ''
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.track.description, '新的備註');
  assert.equal(saved.data.track.title, '演講');
  assert.equal(saved.data.track.requiredRank, '6%');
  assert.equal(saved.data.track.durationSeconds, 3439);
  assert.equal((await workerCall(db, '/api/tracks/missing', 'PUT', { description: '不能假裝成功' })).status, 404);
  db.sqlite.close();
});

test('VIP metadata persists through duration changes and token reset', async () => {
  const db = database();
  const created = await workerCall(db, '/api/tracks', 'POST', {
    id: 'vip-test', title: 'VIP', audioUrl: '/vip.mp3', uploaderEmail: 'yukidu@gmail.com',
    isPrivateVip: true, vipDurationDays: 0
  });
  assert.equal(created.status, 200);
  assert.ok(created.data.track.vipToken);
  const originalToken = created.data.track.vipToken;
  const changed = await workerCall(db, '/api/tracks/vip-test', 'PUT', { vipDurationDays: 7 });
  assert.equal(changed.data.track.vipToken, originalToken);
  assert.ok(changed.data.track.vipExpiresAt > Date.now());
  const reset = await workerCall(db, '/api/tracks/vip-test/reset-vip-token', 'POST', {
    userEmail: 'yukidu@gmail.com', durationDays: 0
  });
  assert.equal(reset.status, 200);
  assert.notEqual(reset.data.vipToken, originalToken);
  assert.equal((await workerCall(db, '/api/tracks/vip-test', 'PUT', { vipDurationDays: -1 })).status, 400);
  db.sqlite.close();
});

test('offline audio cleanup keeps completed files and removes only stale cached objects', async () => {
  const offline = await import('../src/utils/offlineAudio');
  const previous = { window: globalThis.window, localStorage: globalThis.localStorage, caches: globalThis.caches };
  const memory = new Map<string, string>();
  const removed: string[] = [];
  Object.assign(globalThis, {
    window: {},
    localStorage: {
      getItem: (key: string) => memory.get(key) || null,
      setItem: (key: string, value: string) => memory.set(key, value)
    },
    caches: { open: async () => ({ delete: async (url: string) => { removed.push(url); return true; } }) }
  });
  try {
    offline.saveOfflineRegistry({
      a: { trackId: 'a', audioUrl: 'https://audio.example/a.mp3', cachedAt: Date.now(), lastListenedAt: Date.now() }
    });
    offline.handleTrackProgressOffline('a', 96, 100);
    await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(removed, []);
    assert.equal(offline.getOfflineRegistry().a.completed, true);

    offline.saveOfflineRegistry({
      b: { trackId: 'b', audioUrl: 'https://audio.example/b.mp3', cachedAt: 0, lastListenedAt: Date.now() - 16 * 86400000 }
    });
    assert.equal(offline.purgeStaleOfflineTracks(), 1);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(removed[0], 'https://audio.example/b.mp3');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete (globalThis as any)[key];
      else (globalThis as any)[key] = value;
    }
  }
});

test('comment threading keeps nested and orphan replies visible exactly once', () => {
  const comments: any[] = [
    { id: 'root' },
    { id: 'reply', replyToId: 'root' },
    { id: 'nested', replyToId: 'reply' },
    { id: 'orphan', replyToId: 'deleted' }
  ];
  const threads = commentThreads(comments as any);
  assert.deepEqual(threads.roots.map(comment => comment.id), ['root', 'orphan']);
  assert.deepEqual(threads.replies.get('root')?.map(comment => comment.id), ['reply', 'nested']);
});

test('numerology rings stay inside square cells', () => {
  const html = renderToStaticMarkup(React.createElement(NumerologyGrid, { birthday: '1999-09-09' }));
  assert.equal((html.match(/viewBox="0 0 100 100"/g) || []).length, 9);
  const radii = [...html.matchAll(/<circle[^>]* r="([\d.]+)"/g)].map(match => Number(match[1]));
  assert.ok(radii.length > 9);
  assert.ok(radii.every(radius => radius >= 19 && radius <= 44));
});

test('missing database binding never pretends to save successfully', async () => {
  const response = await communityApi(new Request('https://test.example/api/users/google-sync', { method: 'POST' }), {}, demo);
  assert.equal(response?.status, 503);
});
