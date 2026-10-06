from pathlib import Path

worker = Path('worker/stickerRouter.ts')
text = worker.read_text()
old_call = "      await backfillExistingRankApprovalRewards(db);\n"
new_call = old_call + "      await topUpLegacyRankStickerInventory(db);\n"
assert text.count(old_call) == 1, text.count(old_call)
text = text.replace(old_call, new_call, 1)
marker = "\nfunction validTenth(value: unknown) {\n"
assert text.count(marker) == 1, text.count(marker)
helper = '''
const LEGACY_RANK_INVENTORY_TARGET_UNITS: Record<RankRewardTier, number> = {
  platinum: 1000,
  emerald: 2000,
  diamond: 3000
};

async function topUpLegacyRankStickerInventory(db: any) {
  await db.prepare('CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY)').run();
  const migration = 'legacy-rank-inventory-topup-v105';
  if (await db.prepare('SELECT name FROM app_migrations WHERE name = ?').bind(migration).first()) return;

  const users = (await db.prepare(`SELECT id,name,rank,approvedRank,rankApproved
    FROM users WHERE COALESCE(rankApproved,0)=1`).all()).results || [];
  const statements: any[] = [];
  const now = Date.now();
  for (const user of users as any[]) {
    const tier = rankRewardTier(user.approvedRank || user.rank);
    if (!tier) continue;
    const targetUnits = LEGACY_RANK_INVENTORY_TARGET_UNITS[tier];
    if (!targetUnits) continue;
    const uniqueKey = `legacy-rank-inventory-topup-v105:${user.id}`;
    statements.push(db.prepare(`INSERT OR IGNORE INTO sticker_transactions
      (id,userId,deltaUnits,balanceAfterUnits,type,sourceId,description,actorUserId,uniqueKey,createdAt)
      SELECT ?, ?, ? - COALESCE((SELECT SUM(deltaUnits) FROM sticker_transactions WHERE userId = ?),0), ?,
        'legacy_rank_inventory_topup', ?, ?, 'system', ?, ?
      WHERE COALESCE((SELECT SUM(deltaUnits) FROM sticker_transactions WHERE userId = ?),0) < ?`)
      .bind(uniqueKey, user.id, targetUnits, user.id, targetUnits, tier,
        `${rankRewardLabel(tier)}舊會員貼紙一次性補發至 ${formatStickerAmount(unitsToStickers(targetUnits))} 張`,
        uniqueKey, now, user.id, targetUnits));
  }
  for (let offset = 0; offset < statements.length; offset += 50) {
    await db.batch(statements.slice(offset, offset + 50));
  }
  await db.prepare('INSERT OR IGNORE INTO app_migrations(name) VALUES (?)').bind(migration).run();
}
'''
text = text.replace(marker, '\n' + helper + marker, 1)
worker.write_text(text)

tests = Path('tests/stickerTransactions.test.ts')
text = tests.read_text()
marker = "\ntest('approved platinum ordinary earnings use the configured multiplier while rank rewards stay fixed', async () => {\n"
assert text.count(marker) == 1, text.count(marker)
new_test = '''

test('one-time legacy rank inventory top-up fills approved leaders to 100, 200 and 300 without repeating', async () => {
  const db=database();
  db.sqlite.exec(`CREATE TABLE sticker_settings (key TEXT PRIMARY KEY,valueUnits INTEGER NOT NULL,updatedAt INTEGER NOT NULL,updatedBy TEXT);
    INSERT INTO sticker_settings VALUES
      ('platinum_rank_reward_units',0,1,'test'),
      ('emerald_rank_reward_units',0,1,'test'),
      ('diamond_rank_reward_units',0,1,'test');
    INSERT INTO users(id,name,email,rank,approvedRank,rankApproved,canUpload) VALUES
      ('emerald-topup','翡翠補發','emerald-topup@example.com','翡翠','翡翠',1,0);`);
  const platinum=await session(db,'platinum');
  const emerald=await session(db,'emerald-topup');
  const diamond=await session(db,'admin');
  const member=await session(db,'member');
  assert.equal(await balance(db,platinum),100);
  assert.equal(await balance(db,emerald),200);
  assert.equal(await balance(db,diamond),300);
  assert.equal(await balance(db,member),6);
  assert.equal(count(db,'legacy_rank_inventory_topup'),3);
  await Promise.all([balance(db,platinum),balance(db,emerald),balance(db,diamond)]);
  assert.equal(count(db,'legacy_rank_inventory_topup'),3);
  const amounts=(db.sqlite.prepare("SELECT userId,deltaUnits FROM sticker_transactions WHERE type='legacy_rank_inventory_topup' ORDER BY userId").all() as any[])
    .map(row=>[row.userId,row.deltaUnits]);
  assert.deepEqual(amounts,[['admin',2880],['emerald-topup',1880],['platinum',880]]);
});
'''
text = text.replace(marker, new_test + marker, 1)
tests.write_text(text)

notes = Path('src/changelogReleaseNotes.ts')
text = notes.read_text()
old = "    '白金、翡翠、鑽石獎銜審核獎勵維持各自設定張數，不套用白金級以上獲取倍數。'\n"
new = "    '白金、翡翠、鑽石獎銜審核獎勵維持各自設定張數，不套用白金級以上獲取倍數。',\n    '貼紙功能較晚加入，針對目前已審核的舊白金級以上會員執行一次性庫存補足：白金至少 100 張、翡翠至少 200 張、鑽石級以上至少 300 張；只補差額且不套倍數，不會重複補發。'\n"
assert text.count(old) == 1, text.count(old)
notes.write_text(text.replace(old, new, 1))
