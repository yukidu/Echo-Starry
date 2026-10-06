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
    queries: [] as string[],
    prepare(sql: string) {
      db.queries.push(sql);
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
  const settings = { ratingReward: .1, likeReward: .1, keywordReward: .1, keywordRewardLimit: .2, commentThreadLimit:20, replyReward:.1, luckyCost: .1, vipUploadCost: .1 };
  assert.equal((await call(db, token, '/api/stickers/settings', 'PUT', settings)).status, 403);
  assert.equal((await call(db, admin, '/api/stickers/settings', 'PUT', {...settings, keywordRewardLimit:1000.1})).status, 400);
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
  assert.equal(reply.status,201); assert.equal(count(db, 'comment_reward'),1);
  const earned = await call(db, token, '/api/tracks/track/comments', 'POST', { content:'聽完心得' });
  assert.equal(earned.status,201); assert.equal(await balance(db, token),8);
  assert.deepEqual((await call(db,token,'/api/stickers/summary')).data.commentRewardTrackIds,['track']);
  await call(db, token, `/api/comments/${early.data.id}`, 'PUT', { content:'編輯',userEmail:'member@example.com' });
  assert.equal(count(db,'comment_reward'),1);
  const deleted = await call(db, token, `/api/comments/${early.data.id}`, 'DELETE', { userEmail:'member@example.com' });
  assert.equal(deleted.status,200); assert.equal(await balance(db, token),6);
  await call(db, token, '/api/tracks/track/comments', 'POST', { content:'重新留言' });
  assert.equal(await balance(db, token),6); assert.equal(count(db,'comment_reward_reversal'),1);
});

test('manual grant is limited to approved platinum downlines, retry has one credit and notification', async () => {
  const db = database(); const token = await session(db, 'platinum'); const member = await session(db,'member');
  const targets = await call(db,token,'/api/stickers/grant-targets');
  assert.deepEqual(targets.data.targets.map((x:any)=>x.id), ['member']);
  const body = { targetUserId:'member', amount:3, reason:'鼓勵學習', operationId:'grant-1' };
  assert.equal((await call(db,token,'/api/stickers/grant','POST',{...body,targetUserId:'other'})).status,403);
  assert.equal((await call(db,token,'/api/stickers/grant','POST',{...body,amount:-1})).status,400);
  assert.equal(await balance(db,token),106);
  await call(db,token,'/api/stickers/grant','POST',body);
  await call(db,token,'/api/stickers/grant','POST',body);
  assert.equal(await balance(db,member),9); assert.equal(await balance(db,token),103);
  assert.equal(count(db,'manual_grant'),1); assert.equal(count(db,'manual_grant_debit'),1);
  const notices = await call(db,member,'/api/stickers/notifications');
  assert.equal(notices.data.notifications.length,1);
  assert.match(notices.data.notifications[0].message,/3.*鼓勵學習/);
  await call(db,member,'/api/stickers/notifications/read','POST');
  assert.equal((await call(db,member,'/api/stickers/me')).data.unreadNotifications,0);
});

test('downline grants cannot overdraw the issuer while super-admin grants do not debit the admin', async () => {
  const db=database();const platinum=await session(db,'platinum');const admin=await session(db,'admin');const member=await session(db,'member');
  await call(db,platinum,'/api/stickers/summary');
  db.sqlite.exec("DELETE FROM sticker_transactions WHERE userId='platinum' AND type='rank_approval_reward'");
  assert.equal(await balance(db,platinum),6);
  assert.equal((await call(db,platinum,'/api/stickers/grant','POST',{targetUserId:'member',amount:5,reason:'先發五張',operationId:'debit-1'})).status,200);
  assert.equal(await balance(db,platinum),1);
  assert.equal((await call(db,platinum,'/api/stickers/grant','POST',{targetUserId:'member',amount:2,reason:'餘額不足',operationId:'debit-2'})).status,402);
  assert.equal(await balance(db,member),11);
  const adminBefore=await balance(db,admin);
  assert.equal((await call(db,admin,'/api/stickers/grant','POST',{targetUserId:'member',amount:2,reason:'管理發放',operationId:'admin-free'})).status,200);
  assert.equal(await balance(db,admin),adminBefore);
  assert.equal(await balance(db,member),13);
});

test('existing and future approved leaders receive configurable one-time rank sticker rewards', async () => {
  const db=database();
  db.sqlite.exec("INSERT INTO users(id,name,email,rank,approvedRank,rankApproved,canUpload) VALUES ('emerald','翡翠會員','emerald@example.com','翡翠','翡翠',1,0),('candidate','候選會員','candidate@example.com','白金','無',0,0)");
  const admin=await session(db,'admin');
  const defaults=(await call(db,admin,'/api/stickers/settings')).data.settings;
  assert.equal(defaults.platinumRankReward,100);assert.equal(defaults.platinumEarningMultiplier,2);
  assert.equal(defaults.emeraldRankReward,300);assert.equal(defaults.diamondRankReward,500);
  assert.equal(Number((db.sqlite.prepare("SELECT SUM(deltaUnits)/10.0 AS n FROM sticker_transactions WHERE userId='platinum'").get() as any).n),106);
  assert.equal(Number((db.sqlite.prepare("SELECT SUM(deltaUnits)/10.0 AS n FROM sticker_transactions WHERE userId='emerald'").get() as any).n),306);
  assert.equal(count(db,'rank_approval_reward'),3);
  assert.equal((await call(db,admin,'/api/stickers/settings','PUT',{...defaults,platinumRankReward:120,platinumEarningMultiplier:2.5,emeraldRankReward:350,diamondRankReward:550})).status,200);
  const audit=(rank:string)=>{db.sqlite.prepare("UPDATE users SET rank=?,rankApproved=0,rankAuditStatus='pending' WHERE id='candidate'").run(rank);return call(db,admin,'/api/users/candidate/audit-rank','PUT',{auditorEmail:'yukidu@gmail.com',rank});};
  assert.equal((await audit('白金')).status,200);
  const candidate=await session(db,'candidate');assert.equal(await balance(db,candidate),126);
  assert.equal((await audit('白金')).status,200);assert.equal(await balance(db,candidate),126);
  assert.equal((await audit('翡翠')).status,200);assert.equal(await balance(db,candidate),476);
  assert.equal((await audit('鑽石')).status,200);assert.equal(await balance(db,candidate),1026);
  assert.equal((await audit('白金')).status,200);assert.equal(await balance(db,candidate),1026);
});

test('approved platinum ordinary earnings use the configured multiplier while rank rewards stay fixed', async () => {
  const db=database();const platinum=await session(db,'platinum');const admin=await session(db,'admin');
  const rules=(await call(db,admin,'/api/stickers/settings')).data.settings;
  assert.equal((await call(db,admin,'/api/stickers/settings','PUT',{...rules,platinumEarningMultiplier:2.5,platinumRankReward:100})).status,200);
  assert.equal((await call(db,platinum,'/api/tracks/track/rate','POST',{score:5})).status,200);
  const rating:any=db.sqlite.prepare("SELECT deltaUnits FROM sticker_transactions WHERE userId='platinum' AND type='rating_reward'").get();
  assert.equal(rating.deltaUnits,3);
  assert.equal((await call(db,admin,'/api/stickers/grant','POST',{targetUserId:'platinum',amount:2,reason:'倍數測試',operationId:'multiplier-grant'})).status,200);
  const grant:any=db.sqlite.prepare("SELECT deltaUnits FROM sticker_transactions WHERE userId='platinum' AND type='manual_grant' AND sourceId='multiplier-grant'").get();
  assert.equal(grant.deltaUnits,20);
  const rank:any=db.sqlite.prepare("SELECT deltaUnits FROM sticker_transactions WHERE userId='platinum' AND type='rank_approval_reward'").get();
  assert.equal(rank.deltaUnits,1000);
  const guide=(await call(db,platinum,'/api/stickers/guide')).data.guide;
  assert.equal(guide.earningMultiplier,2.5);assert.equal(guide.rankReward.amount,100);
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
  db.sqlite.exec("INSERT INTO sticker_transactions(id,userId,deltaUnits,balanceAfterUnits,type,sourceId,description,actorUserId,uniqueKey,createdAt) VALUES ('drain','member',-59,0,'test',NULL,'test',NULL,'drain',0)");
  assert.equal((await call(db,token,'/api/stickers/lucky-spend','POST',{...body,operationId:'draw-2'})).status,402);
});

test('parallel VIP creations with one remaining fee commit exactly one recording', async () => {
  const db=database();const token=await session(db,'member');const admin=await session(db,'admin');
  await balance(db,token);
  db.sqlite.exec("INSERT INTO sticker_transactions(id,userId,deltaUnits,balanceAfterUnits,type,sourceId,description,actorUserId,uniqueKey,createdAt) VALUES ('drain','member',-50,10,'test',NULL,'test',NULL,'drain',0)");
  await call(db,admin,'/api/stickers/settings','PUT',{ratingReward:.1,likeReward:.1,keywordReward:.1,keywordRewardLimit:1,commentThreadLimit:20,replyReward:.1,luckyCost:.1,vipUploadCost:1});
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

test('ordinary member early comment receives its snapshot reward when cloud progress completes, exactly once', async () => {
  const db=database();const token=await session(db,'member');
  db.sqlite.exec('UPDATE tracks SET stickerUnlockCost=1,commentStickerReward=3');
  await call(db,token,'/api/stickers/unlock/track','POST',{});
  const comment=await call(db,token,'/api/tracks/track/comments','POST',{content:'先分享'});
  assert.equal(comment.status,201);assert.equal(await balance(db,token),5);
  db.sqlite.exec('UPDATE tracks SET commentStickerReward=5');
  const progress=(currentTime:number)=>call(db,token,'/api/playback/record','POST',{trackId:'track',userIdOrDeviceId:'member@example.com',currentTime,duration:100});
  assert.equal((await progress(94)).status,200);assert.equal(count(db,'comment_reward'),0);
  assert.equal((await progress(96)).status,200);assert.equal(await balance(db,token),8);
  await Promise.all([progress(100),progress(100),balance(db,token)]);
  assert.equal(count(db,'comment_reward'),1);assert.equal(await balance(db,token),8);
  const history=(await call(db,token,'/api/stickers/me')).data.transactions;
  assert.equal(history.find((t:any)=>t.type==='comment_reward').source.commentId,comment.data.id);
  assert.equal(history.find((t:any)=>t.type==='comment_reward').source.label,'講者-錄音');
});

test('root and other-author replies share an atomic sticker amount cap; self replies and deleted awards cannot reopen it', async () => {
  const db=database();const token=await session(db,'member');const other=await session(db,'other');const admin=await session(db,'admin');
  const rules={ratingReward:.1,likeReward:.2,keywordReward:.1,keywordRewardLimit:1,commentThreadLimit:2.5,replyReward:1,luckyCost:.1,vipUploadCost:.1};
  assert.equal((await call(db,admin,'/api/stickers/settings','PUT',rules)).status,200);
  db.sqlite.exec('UPDATE tracks SET commentStickerReward=2');
  const parent=await call(db,other,'/api/tracks/track/comments','POST',{content:'別人的心得'});
  await call(db,token,'/api/playback/record','POST',{trackId:'track',userIdOrDeviceId:'member@example.com',currentTime:100,duration:100});
  const root=await call(db,token,'/api/tracks/track/comments','POST',{content:'本人的心得'});
  await call(db,token,'/api/tracks/track/comments','POST',{content:'回覆自己',replyToId:root.data.id});
  assert.equal(count(db,'reply_reward'),0);
  await Promise.all([1,2,3].map(i=>call(db,token,'/api/tracks/track/comments','POST',{content:`回覆別人${i}`,replyToId:parent.data.id})));
  assert.equal(await balance(db,token),8.5);assert.equal(count(db,'reply_reward'),1);
  const reply:any=db.sqlite.prepare("SELECT * FROM sticker_transactions WHERE type='reply_reward'").get();
  assert.equal(reply.deltaUnits,5);
  await call(db,token,`/api/comments/${reply.commentId}`,'DELETE',{userEmail:'member@example.com'});
  await call(db,token,'/api/tracks/track/comments','POST',{content:'刪除後再回覆',replyToId:parent.data.id});
  assert.equal(await balance(db,token),8);assert.equal(count(db,'reply_reward'),1);
});

test('comment likes reward the authenticated liker once, exclude self likes, and link to the original comment', async () => {
  const db=database();const token=await session(db,'member');const other=await session(db,'other');
  const parent=await call(db,other,'/api/tracks/track/comments','POST',{content:'心得'});
  for(let i=0;i<3;i++) assert.equal((await call(db,token,`/api/comments/${parent.data.id}/like`,'POST',{identifier:'other'})).status,200);
  await call(db,other,`/api/comments/${parent.data.id}/like`,'POST',{});
  assert.equal(count(db,'comment_like_reward'),1);assert.equal(await balance(db,token),6.1);assert.equal(await balance(db,other),6);
  const tx=(await call(db,token,'/api/stickers/me')).data.transactions.find((t:any)=>t.type==='comment_like_reward');
  assert.equal(tx.source.trackId,'track');assert.equal(tx.source.commentId,parent.data.id);
});

test('wallet recovers missed regular-member completed comments using email-owned playback, but not pre-launch comments', async () => {
  const db=database();const token=await session(db,'member');await balance(db,token);
  db.sqlite.exec('UPDATE tracks SET commentStickerReward=2');
  const insert=db.sqlite.prepare("INSERT INTO comments(id,trackId,authorEmail,authorName,content,createdAt) VALUES (?,'track','member@example.com','下線','心得',?)");
  insert.run('old',1);insert.run('missed',Date.now());
  db.sqlite.exec("INSERT INTO playback_memories(key,trackId,userIdentifier,currentTime,duration) VALUES ('legacy','track','member@example.com',100,100)");
  assert.equal(await balance(db,token),8);
  assert.equal(db.sqlite.prepare("SELECT sourceId FROM sticker_transactions WHERE type='comment_reward'").get()?.sourceId,'missed');
});

test('manual grant history is scoped to issuer, fractional counts rejected, and unlock range reaches 50', async () => {
  const db=database();const platinum=await session(db,'platinum');const admin=await session(db,'admin');const member=await session(db,'member');
  const body={targetUserId:'member',amount:5,reason:'完整原因',operationId:'history'};
  assert.equal((await call(db,platinum,'/api/stickers/grant','POST',{...body,amount:1.5})).status,400);
  assert.equal((await call(db,platinum,'/api/stickers/grant','POST',body)).status,200);
  const history=(await call(db,platinum,'/api/stickers/grant-history')).data.transactions;
  assert.equal(history.length,1);assert.equal(history[0].source.userId,'member');
  assert.equal((await call(db,admin,'/api/stickers/grant-history')).data.transactions.length,0);
  assert.equal((await call(db,member,'/api/stickers/grant-history')).status,403);
  assert.equal((await call(db,admin,'/api/stickers/tracks/batch','PUT',{trackIds:['track'],stickerUnlockCost:50})).status,200);
  assert.equal((await call(db,admin,'/api/stickers/tracks/batch','PUT',{trackIds:['track'],stickerUnlockCost:51})).status,400);
});

test('v98 migration preserves balances and translates keyword count to sticker cap', async () => {
  const db=database();const token=await session(db,'member');const admin=await session(db,'admin');
  db.sqlite.exec(`DROP INDEX IF EXISTS sticker_transactions_member_track;
    ALTER TABLE sticker_transactions DROP COLUMN trackId;
    ALTER TABLE sticker_transactions DROP COLUMN commentId;
    ALTER TABLE sticker_transactions DROP COLUMN relatedUserId;
    ALTER TABLE sticker_transactions DROP COLUMN sourceLabel;
    INSERT INTO sticker_settings VALUES ('keyword_reward_limit',3,1,'admin');
    INSERT INTO sticker_transactions VALUES ('initial:member','member',60,60,'initial','member','初始','system','initial:member',1);
    INSERT INTO sticker_transactions VALUES ('old-reward','member',20,80,'comment_reward','deleted','心得','member','comment-reward:member:track',2);`);
  assert.equal(await balance(db,token),8);
  const rules=(await call(db,admin,'/api/stickers/settings')).data.settings;
  assert.equal(rules.keywordRewardLimit,3);
  const history=(await call(db,token,'/api/stickers/me')).data.transactions;
  assert.equal(history.find((t:any)=>t.id==='old-reward').source.trackId,'track');
  assert.equal(await balance(db,token),8);
});


test('complete profile rewards once and incomplete saves return configurable hint without credit', async () => {
  const db=database();const member=await session(db,'member');const admin=await session(db,'admin');
  const rules=(await call(db,admin,'/api/stickers/settings')).data.settings;
  assert.equal((await call(db,admin,'/api/stickers/settings','PUT',{...rules,profileReward:2,profileHintSeconds:1.5,profileHintText:'請補齊，可+{x}張貼紙'})).status,200);
  const incomplete=await call(db,member,'/api/users/member','PUT',{phone:'0912345678'});
  assert.equal(incomplete.status,200,JSON.stringify(incomplete.data));
  assert.equal(incomplete.data.profileCompletion.complete,false);
  assert.equal(incomplete.data.profileCompletion.settings.profileHintSeconds,1.5);
  assert.equal(count(db,'profile_reward'),0);
  const complete={name:'下線',avatar:'https://example.com/a.png',amwayId:'123',phone:'0912345678',residence:'台中',center:'豐宇台中',rank:'無',joinReason:'事業',stayReason:'打造自己的事業與團隊',sponsor:'推薦人',platinumUpline:'白金會員',diamondUpline:'鑽石會員',birthday:'1990-01-01'};
  const saved=await call(db,member,'/api/users/member','PUT',complete);
  assert.equal(saved.status,200,JSON.stringify(saved.data));assert.equal(saved.data.profileCompletion.complete,true);
  await Promise.all([call(db,member,'/api/users/member','PUT',complete),call(db,member,'/api/users/member','PUT',complete)]);
  assert.equal(count(db,'profile_reward'),1);assert.equal(await balance(db,member),8);
  await call(db,member,'/api/users/member','PUT',{sponsor:''});await call(db,member,'/api/users/member','PUT',{sponsor:'推薦人'});
  assert.equal(count(db,'profile_reward'),1);
  assert.equal((await call(db,member,'/api/users/other','PUT',complete)).status,403);
});

test('lucky completion uses draw snapshot, enforces atomic daily cap, and never rewards already-completed recordings', async () => {
  const db=database();const member=await session(db,'member');const admin=await session(db,'admin');
  const rules=(await call(db,admin,'/api/stickers/settings')).data.settings;
  await call(db,admin,'/api/stickers/settings','PUT',{...rules,luckyCompleteReward:2,luckyDailyLimit:1,luckyCost:0});
  db.sqlite.exec("INSERT INTO tracks(id,title,speaker,audioUrl,requiredRank) VALUES ('second','第二支','講者','/two.mp3','無')");
  const draw=await call(db,member,'/api/stickers/lucky-spend','POST',{trackId:'track',operationId:'draw'});
  assert.equal(draw.data.bonus,2);
  assert.equal((await call(db,member,'/api/stickers/lucky-spend','POST',{trackId:'second',operationId:'draw'})).status,409);
  await call(db,member,'/api/stickers/lucky-spend','POST',{trackId:'second',operationId:'draw2'});
  await call(db,admin,'/api/stickers/settings','PUT',{...rules,luckyCompleteReward:4,luckyDailyLimit:1,luckyCost:0});
  await Promise.all(['track','second'].map(trackId=>call(db,member,'/api/playback/record','POST',{trackId,userIdOrDeviceId:'member@example.com',currentTime:100,duration:100})));
  assert.equal(count(db,'lucky_complete_reward'),1);assert.equal(await balance(db,member),8);
  assert.equal((await call(db,member,'/api/stickers/lucky-spend','POST',{trackId:'track',operationId:'completed'})).data.bonus,0);
  await call(db,member,'/api/stickers/reconcile','POST',{});assert.equal(count(db,'lucky_complete_reward'),1);
  db.sqlite.exec("UPDATE sticker_lucky_draws SET day='2000-01-01'");
  await call(db,admin,'/api/stickers/settings','PUT',{...rules,luckyDailyLimit:10});
  await call(db,member,'/api/stickers/reconcile','POST',{});assert.equal(count(db,'lucky_complete_reward'),1);
});

test('ledger summary provides individual signed changes and history fast path avoids pending-reward scans', async () => {
  const db=database();const member=await session(db,'member');const platinum=await session(db,'platinum');
  const initial=(await call(db,member,'/api/stickers/summary')).data;
  assert.deepEqual(initial.changes,[]);
  await call(db,platinum,'/api/stickers/grant','POST',{targetUserId:'member',amount:3,reason:'鼓勵',operationId:'feed'});
  db.sqlite.exec('UPDATE tracks SET stickerUnlockCost=2');await call(db,member,'/api/stickers/unlock/track','POST',{});
  const changed=(await call(db,member,`/api/stickers/summary?after=${initial.cursor}`)).data;
  assert.deepEqual(changed.changes.map((x:any)=>x.delta),[3,-2]);
  assert.equal(changed.balance,7);
  assert.deepEqual((await call(db,member,`/api/stickers/summary?after=${changed.cursor}`)).data.changes,[]);
  db.queries.length=0;assert.equal((await call(db,member,'/api/stickers/history')).status,200);
  assert.ok(db.queries.length<=4,`history query count=${db.queries.length}`);
  assert.ok(!db.queries.some(sql=>sql.includes('sticker_comment_rewards')));
});

test('upline rename, merge, and deletion update member fields and preserve authenticated downline grants', async () => {
  const db=database();const admin=await session(db,'admin');const platinum=await session(db,'platinum');const member=await session(db,'member');
  assert.equal((await call(db,member,'/api/admin/uplines')).status,403);
  const list=await call(db,admin,'/api/admin/uplines');assert.equal(list.status,200,JSON.stringify(list.data));
  assert.ok(list.data.uplines.some((r:any)=>r.kind==='platinum'&&r.name==='白金會員'&&r.members===1));
  assert.equal((await call(db,admin,'/api/admin/uplines','POST',{action:'save',kind:'platinum',names:['白金會員'],target:'上手別名'})).status,200);
  assert.equal(db.sqlite.prepare("SELECT platinumUpline FROM users WHERE id='member'").get()?.platinumUpline,'上手別名');
  assert.deepEqual((await call(db,platinum,'/api/stickers/grant-targets')).data.targets.map((u:any)=>u.id),['member']);
  assert.equal((await call(db,platinum,'/api/stickers/grant','POST',{targetUserId:'member',amount:1,reason:'改名後仍可發放',operationId:'alias'})).status,200);
  await call(db,admin,'/api/admin/uplines','POST',{action:'merge',kind:'platinum',names:['上手別名','其他上手'],target:'白金會員'});
  assert.equal((await call(db,platinum,'/api/stickers/grant-targets')).data.targets.length,2);
  await call(db,admin,'/api/admin/uplines','POST',{action:'delete',kind:'platinum',names:['白金會員']});
  assert.equal((await call(db,platinum,'/api/stickers/grant-targets')).data.targets.length,0);
  assert.equal(count(db,'manual_grant'),1);
});

test('authorized administrators can manage feedback rules and invalid limits cannot partially change them', async () => {
  const db=database();const token=await session(db,'other');const member=await session(db,'member');
  db.sqlite.exec("UPDATE users SET isAdminUser=1 WHERE id='other'");
  const initial=await call(db,token,'/api/stickers/settings');assert.equal(initial.status,200);
  for(const patch of [{toastSeconds:0},{profileHintSeconds:61},{luckyDailyLimit:1.2},{luckyCompleteReward:-1},{profileHintText:''}])assert.equal((await call(db,token,'/api/stickers/settings','PUT',{...initial.data.settings,...patch})).status,400);
  assert.equal((await call(db,member,'/api/stickers/settings','PUT',initial.data.settings)).status,403);
  assert.equal((await call(db,token,'/api/stickers/settings','PUT',{...initial.data.settings,toastSeconds:2,luckyHintText:'你的答案\n聽完+{x}張貼紙'})).status,200);
  assert.equal((await call(db,member,'/api/stickers/public-settings')).data.settings.toastSeconds,2);
});
