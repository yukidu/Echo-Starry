import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker/stickerRouter';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  sqlite.exec(`CREATE TABLE auth_sessions (tokenHash TEXT PRIMARY KEY, userId TEXT, expiresAt INTEGER, createdAt INTEGER);
    INSERT INTO users(id,name,email,rank,approvedRank,rankApproved,canUpload,platinumUpline) VALUES
      ('admin','超管','yukidu@gmail.com','鑽石','鑽石',1,1,''),
      ('platinum','白金會員','platinum@example.com','白金','白金',1,1,''),
      ('member','下線','member@example.com','無','無',1,1,'白金會員'),
      ('other','其他','other@example.com','無','無',1,0,'其他上手');
    INSERT INTO tracks(id,title,speaker,audioUrl,requiredRank,likedBy,ratings,keywords,keywordMeta,uploaderEmail)
      VALUES ('track','錄音','講者','/audio.mp3','無','[]','{}','[]','{}','member@example.com');`);
  const db = {
    sqlite,
    failTrackSave: false,
    prepare(sql: string) {
      let values: any[] = [];
      const statement = {
        sql,
        bind(...args: any[]) { values = args; return statement; },
        async first() { return sqlite.prepare(sql).get(...values) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        execute() {
          if (db.failTrackSave && /INSERT INTO tracks/.test(sql)) throw new Error('simulated storage failure');
          const result = sqlite.prepare(sql).run(...values);
          return { meta: { changes: Number(result.changes) } };
        },
        async run() { return statement.execute(); }
      };
      return statement;
    },
    async batch(statements: any[]) {
      sqlite.exec('BEGIN');
      try {
        const result = statements.map(s => s.execute());
        sqlite.exec('COMMIT');
        return result;
      } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    }
  };
  return db;
}
async function session(db: ReturnType<typeof database>, user: string) {
  const token = `${user}-`.padEnd(40, 'a');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  db.sqlite.prepare('INSERT OR REPLACE INTO auth_sessions VALUES (?,?,?,?)').run(hash, user, Date.now() + 86400000, Date.now());
  return token;
}
async function call(db: any, token: string, path: string, method = 'GET', body?: any, cookie = false) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers[cookie ? 'Cookie' : 'Authorization'] = cookie ? `echostars_session=${token}` : `Bearer ${token}`;
  const response = await worker.fetch(new Request(`https://test.example${path}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }), { DB: db });
  return { status: response.status, data: await response.json() as any };
}
function count(db: any, type: string) {
  return Number(db.sqlite.prepare('SELECT COUNT(*) AS n FROM sticker_transactions WHERE type = ?').get(type).n);
}
async function balance(db: any, token: string) { return (await call(db, token, '/api/stickers/me')).data.balance; }

test('member initialization is idempotent, cookie sessions work, guests and blocked members cannot spend', async () => {
  const db = database(); const token = await session(db, 'member');
  assert.equal(await balance(db, token), 6);
  assert.equal((await call(db, token, '/api/stickers/me', 'GET', undefined, true)).data.balance, 6);
  assert.equal(count(db, 'initial'), 4);
  assert.equal((await call(db, '', '/api/stickers/me')).status, 401);
  db.sqlite.exec("UPDATE users SET isBlocked = 1 WHERE id = 'member'");
  assert.equal((await call(db, token, '/api/stickers/me')).status, 401);
});

test('parallel unlock is permanent, charges once and cannot bypass rank or VIP', async () => {
  const db = database(); const token = await session(db, 'member');
  db.sqlite.exec("UPDATE tracks SET stickerUnlockCost = 2, requiredRank = '白金' WHERE id = 'track'");
  assert.equal((await call(db, token, '/api/stickers/unlock/track', 'POST', {})).status, 403);
  assert.equal(await balance(db, token), 6);
  db.sqlite.exec("UPDATE tracks SET requiredRank = '無', isPrivateVip = 1, uploaderEmail = 'other@example.com' WHERE id = 'track'; INSERT INTO vip_share_access VALUES ('track','1234',0)");
  assert.equal((await call(db, token, '/api/stickers/unlock/track', 'POST', {})).status, 403);
  const results = await Promise.all(Array.from({length: 5}, () => call(db, token, '/api/stickers/unlock/track', 'POST', { vipPassword: '1234' })));
  assert.ok(results.every(r => r.status === 200));
  assert.equal(await balance(db, token), 4);
  assert.equal(count(db, 'track_unlock_cost'), 1);
  const later = await session(db, 'member');
  assert.ok((await call(db, later, '/api/stickers/me')).data.unlockedTrackIds.includes('track'));
});

test('simultaneous different unlocks never overdraw the balance', async () => {
  const db = database(); const token = await session(db, 'member');
  db.sqlite.exec("UPDATE tracks SET stickerUnlockCost = 4; INSERT INTO tracks(id,title,speaker,audioUrl,requiredRank,stickerUnlockCost) VALUES ('second','第二支','講者','/second.mp3','無',4)");
  const results = await Promise.all(['track','second'].map(id => call(db, token, `/api/stickers/unlock/${id}`, 'POST', {})));
  assert.deepEqual(results.map(r => r.status).sort(), [200,402]);
  assert.equal(await balance(db, token), 2);
});

test('rating and like rewards use the verified actor, changes and unlike/re-like do not farm rewards', async () => {
  const db = database(); const token = await session(db, 'member');
  const spoof = { identifier: 'other', userId: 'other', userEmail: 'other@example.com', score: 4 };
  assert.equal((await call(db, token, '/api/tracks/track/rate', 'POST', spoof)).status, 200);
  await call(db, token, '/api/tracks/track/rate', 'POST', { ...spoof, score: 5 });
  for (let i=0;i<3;i++) await call(db, token, '/api/tracks/track/like', 'POST', spoof);
  assert.equal(count(db, 'rating_reward'), 1); assert.equal(count(db, 'like_reward'), 1);
  assert.equal(await balance(db, token), 6.2);
  const row: any = db.sqlite.prepare("SELECT ratings, likedBy FROM tracks WHERE id = 'track'").get();
  assert.deepEqual(JSON.parse(row.ratings), { member: 5 });
  assert.deepEqual(JSON.parse(row.likedBy), ['member']);
});

test('past reactions do not receive retrospective rewards and guests do not earn', async () => {
  const db = database(); const token = await session(db, 'member');
  db.sqlite.exec(`UPDATE tracks SET ratings = '{"member":3}', likedBy = '["member"]', likes = 1`);
  await call(db, token, '/api/tracks/track/rate', 'POST', { score: 5 });
  await call(db, '', '/api/tracks/track/like', 'POST', { identifier: 'dev-guest' });
  assert.equal(count(db, 'rating_reward'), 0); assert.equal(count(db, 'like_reward'), 0);
});

test('paid tracks reject direct likes before unlock', async () => {
  const db = database(); const token = await session(db, 'member');
  db.sqlite.exec('UPDATE tracks SET stickerUnlockCost = 1');
  assert.equal((await call(db, token, '/api/tracks/track/like', 'POST', { identifier: 'member' })).status, 403);
  assert.equal((await call(db, '', '/api/tracks/track/like', 'POST', { identifier: 'dev-guest' })).status, 403);
  assert.equal(count(db, 'like_reward'), 0);
});

test('parallel keyword rewards respect the super-admin limit atomically', async () => {
  const db = database(); const token = await session(db, 'member'); const admin = await session(db, 'admin');
  const settings = { ratingReward: .1, likeReward: .1, keywordReward: .1, keywordRewardLimit: 2, luckyCost: .1, vipUploadCost: .1 };
  assert.equal((await call(db, token, '/api/stickers/settings', 'PUT', settings)).status, 403);
  assert.equal((await call(db, admin, '/api/stickers/settings', 'PUT', {...settings, keywordRewardLimit:21})).status, 400);
  assert.equal((await call(db, admin, '/api/stickers/settings', 'PUT', settings)).status, 200);
  await Promise.all(['甲','乙','丙','丁'].map(keyword => call(db, token, '/api/tracks/track/keywords', 'POST', { keyword, userId:'other', userEmail:'other@example.com' })));
  assert.equal(count(db, 'keyword_reward'), 2);
  assert.equal(await balance(db, token), 6.2);
});

test('root comment rewards require 95% completion; edit/reply/delete/repost cannot farm', async () => {
  const db = database(); const token = await session(db, 'member');
  db.sqlite.exec('UPDATE tracks SET commentStickerReward = 2');
  const early = await call(db, token, '/api/tracks/track/comments', 'POST', { content:'尚未聽完' });
  assert.equal(early.status, 201); assert.equal(count(db, 'comment_reward'), 0);
  db.sqlite.exec(`INSERT INTO playback_memories(key,trackId,userIdentifier,memberId,progressPercent) VALUES ('member_track','track','member','member',95)`);
  const reply = await call(db, token, '/api/tracks/track/comments', 'POST', { content:'回覆', replyToId:early.data.id });
  assert.equal(reply.status,201); assert.equal(count(db, 'comment_reward'),0);
  const earned = await call(db, token, '/api/tracks/track/comments', 'POST', { content:'聽完心得' });
  assert.equal(earned.status,201); assert.equal(await balance(db, token),8);
  await call(db, token, `/api/comments/${earned.data.id}`, 'PUT', { content:'編輯',userEmail:'member@example.com' });
  assert.equal(count(db,'comment_reward'),1);
  const deleted = await call(db, token, `/api/comments/${earned.data.id}`, 'DELETE', { userEmail:'member@example.com' });
  assert.equal(deleted.status,200); assert.equal(await balance(db, token),6);
  await call(db, token, '/api/tracks/track/comments', 'POST', { content:'重新留言' });
  assert.equal(await balance(db, token),6); assert.equal(count(db,'comment_reward_reversal'),1);
});

test('manual grant is limited to approved platinum downlines, retry has one credit and notification', async () => {
  const db = database(); const token = await session(db, 'platinum'); const member = await session(db,'member');
  const targets = await call(db,token,'/api/stickers/grant-targets');
  assert.deepEqual(targets.data.targets.map((x:any)=>x.id), ['member']);
  const body = { targetUserId:'member', amount:2.3, reason:'鼓勵學習', operationId:'grant-1' };
  assert.equal((await call(db,token,'/api/stickers/grant','POST',{...body,targetUserId:'other'})).status,403);
  assert.equal((await call(db,token,'/api/stickers/grant','POST',{...body,amount:-1})).status,400);
  await call(db,token,'/api/stickers/grant','POST',body);
  await call(db,token,'/api/stickers/grant','POST',body);
  assert.equal(await balance(db,member),8.3); assert.equal(count(db,'manual_grant'),1);
  const notices = await call(db,member,'/api/stickers/notifications');
  assert.equal(notices.data.notifications.length,1);
  assert.match(notices.data.notifications[0].message,/2.3.*鼓勵學習/);
  await call(db,member,'/api/stickers/notifications/read','POST');
  assert.equal((await call(db,member,'/api/stickers/me')).data.unreadNotifications,0);
});

test('batch recording settings support more than 100 ids and preserve omitted fields', async () => {
  const db = database(); const admin = await session(db,'admin'); const member = await session(db,'member');
  const ids = Array.from({length:120},(_,i)=>`batch-${i}`);
  const insert = db.sqlite.prepare("INSERT INTO tracks(id,title,speaker,audioUrl,commentStickerReward) VALUES (?,?,'講者','/batch.mp3',3)");
  ids.forEach(id=>insert.run(id,id));
  assert.equal((await call(db,member,'/api/stickers/tracks/batch','PUT',{trackIds:ids,stickerUnlockCost:2})).status,403);
  const result = await call(db,admin,'/api/stickers/tracks/batch','PUT',{trackIds:ids,stickerUnlockCost:2});
  assert.equal(result.status,200); assert.equal(result.data.tracks.length,120);
  assert.ok(result.data.tracks.every((t:any)=>t.stickerUnlockCost===2 && t.commentStickerReward===3));
});

test('VIP save, sticker fields and charge commit together; failed save and normal VIP edits never charge', async () => {
  const db = database(); const token = await session(db,'member');
  const body = {title:'VIP錄音',speaker:'講者',audioUrl:'/vip.mp3',isPrivateVip:true,stickerOperationId:'vip-1',stickerUnlockCost:2,commentStickerReward:1};
  const result = await call(db,token,'/api/tracks','POST',body);
  assert.equal(result.status,200,JSON.stringify(result.data));
  const id=result.data.track?.id || result.data.id;
  assert.equal(await balance(db,token),5.9); assert.equal(count(db,'vip_upload_cost'),1);
  const row:any=db.sqlite.prepare('SELECT * FROM tracks WHERE id = ?').get(id);
  assert.equal(row.stickerUnlockCost,2); assert.equal(row.commentStickerReward,1);
  await call(db,token,'/api/tracks','POST',body);
  assert.equal(count(db,'vip_upload_cost'),1);
  const edit=await call(db,token,`/api/tracks/${id}`,'PUT',{title:'改標題',isPrivateVip:true,stickerUnlockCost:3});
  assert.equal(edit.status,200); assert.equal(await balance(db,token),5.9);
  db.failTrackSave=true;
  const failure=await call(db,token,'/api/tracks','POST',{...body,audioUrl:'/fail.mp3',stickerOperationId:'vip-fail'});
  assert.equal(failure.status,500); assert.equal(await balance(db,token),5.9);
  assert.equal(count(db,'vip_upload_cost'),1);
});

test('lucky draw requires an accessible result, retry charges once and insufficient balance blocks', async () => {
  const db = database(); const token = await session(db,'member');
  assert.equal((await call(db,token,'/api/stickers/lucky-spend','POST',{operationId:'empty'})).status,403);
  const body={trackId:'track',operationId:'draw-1'};
  await call(db,token,'/api/stickers/lucky-spend','POST',body);
  await call(db,token,'/api/stickers/lucky-spend','POST',body);
  assert.equal(await balance(db,token),5.9);assert.equal(count(db,'lucky_cost'),1);
  db.sqlite.exec("INSERT INTO sticker_transactions VALUES ('drain','member',-59,0,'test',NULL,'test',NULL,'drain',0)");
  assert.equal((await call(db,token,'/api/stickers/lucky-spend','POST',{...body,operationId:'draw-2'})).status,402);
});

test('parallel VIP creations with one remaining fee commit exactly one recording', async () => {
  const db=database();const token=await session(db,'member');const admin=await session(db,'admin');
  await balance(db,token);
  db.sqlite.exec("INSERT INTO sticker_transactions VALUES ('drain','member',-50,10,'test',NULL,'test',NULL,'drain',0)");
  await call(db,admin,'/api/stickers/settings','PUT',{ratingReward:.1,likeReward:.1,keywordReward:.1,keywordRewardLimit:1,luckyCost:.1,vipUploadCost:1});
  const results=await Promise.all(['a','b'].map(operationId=>call(db,token,'/api/tracks','POST',{
    title:'VIP',speaker:'講者',audioUrl:`/${operationId}.mp3`,isPrivateVip:true,stickerOperationId:operationId
  })));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,402]);
  assert.equal(await balance(db,token),0);assert.equal(count(db,'vip_upload_cost'),1);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM tracks WHERE isPrivateVip = 1').get()?.n,1);
});

test('a failed VIP batch rolls back the track when the charge statement fails', async () => {
  const db=database();const token=await session(db,'member');
  await balance(db,token);
  db.sqlite.exec(`CREATE TRIGGER fail_fee BEFORE INSERT ON sticker_transactions WHEN NEW.type = 'vip_upload_cost' BEGIN SELECT RAISE(ABORT,'simulated ledger failure'); END`);
  const result=await call(db,token,'/api/tracks','POST',{title:'VIP',speaker:'講者',audioUrl:'/atomic.mp3',isPrivateVip:true,stickerOperationId:'atomic'});
  assert.equal(result.status,500);assert.equal(await balance(db,token),6);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM tracks WHERE isPrivateVip = 1').get()?.n,0);
});
