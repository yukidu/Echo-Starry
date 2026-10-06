from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing replacement in {path}: {old[:180]!r}')
    p.write_text(text.replace(old, new, 1))

# Fresh installations: initialize each member through the same per-user function so
# approved Platinum+ users receive the configured multiplier at actual credit time.
replace_once(
    'worker/stickerRouter.ts',
    """      // Launch policy: every member present when v98 first reaches an installation
      // starts with 6 stickers. INSERT OR IGNORE keeps this permanently idempotent.
      await db.prepare(`
        INSERT OR IGNORE INTO sticker_transactions
          (id, userId, deltaUnits, balanceAfterUnits, type, sourceId, description, actorUserId, uniqueKey, createdAt)
        SELECT 'initial:' || id, id, ?, ?, 'initial', id, '會員初始貼紙', 'system', 'initial:' || id, ?
        FROM users
      `).bind(INITIAL_STICKER_UNITS, INITIAL_STICKER_UNITS, now).run();
""",
    """      // Launch policy: every member receives the one-time initial reward through
      // the same per-user path. INSERT OR IGNORE preserves all existing ledgers and
      // never retroactively recalculates a reward that was already credited.
      const initialUsers = (await db.prepare('SELECT id FROM users').all()).results || [];
      for (const user of initialUsers as any[]) await ensureInitialStickers(db, String(user.id || ''));
"""
)

replace_once(
    'worker/stickerRouter.ts',
    """async function ensureInitialStickers(db: any, userId: string) {
  if (!userId) return;
  const now = Date.now();
  await db.prepare(`
    INSERT OR IGNORE INTO sticker_transactions
      (id, userId, deltaUnits, balanceAfterUnits, type, sourceId, description, actorUserId, uniqueKey, createdAt)
    VALUES (?, ?, ?, ?, 'initial', ?, '會員初始貼紙', 'system', ?, ?)
  `).bind(`initial:${userId}`, userId, INITIAL_STICKER_UNITS, INITIAL_STICKER_UNITS, userId, `initial:${userId}`, now).run();
}
""",
    """async function ensureInitialStickers(db: any, userId: string) {
  if (!userId) return;
  const existing = await db.prepare('SELECT id FROM sticker_transactions WHERE uniqueKey = ? LIMIT 1').bind(`initial:${userId}`).first();
  if (existing) return;
  const multiplierTenths = await earningMultiplierTenthsForUser(db, userId);
  const initialUnits = multiplyStickerUnits(INITIAL_STICKER_UNITS, multiplierTenths);
  const now = Date.now();
  await db.prepare(`
    INSERT OR IGNORE INTO sticker_transactions
      (id, userId, deltaUnits, balanceAfterUnits, type, sourceId, description, actorUserId, uniqueKey, createdAt)
    VALUES (?, ?, ?, ?, 'initial', ?, '會員初始貼紙', 'system', ?, ?)
  `).bind(`initial:${userId}`, userId, initialUnits, initialUnits, userId, `initial:${userId}`, now).run();
}
"""
)

# Guide shows the actual applicable initial reward too.
replace_once(
    'src/stickerGuidePolicy.ts',
    "{ kind: '增加', behavior: '成為會員', amount: amount(guide.initialReward, '+'), detail: '每個會員帳號一次。' },",
    "{ kind: '增加', behavior: '成為會員', amount: amount(earned(guide.initialReward), '+'), detail: '每個會員帳號一次；若初始貼紙入帳當下已是已審核白金級以上，會套用目前倍數。' },"
)

# Guide test covers the initial reward for Platinum+.
replace_once(
    'tests/stickerGuidePolicy.test.ts',
    "  assert.equal(rows.find(row => row.behavior === '白金級以上獲取貼紙倍數')?.amount, '×2');\n",
    "  assert.equal(rows.find(row => row.behavior === '白金級以上獲取貼紙倍數')?.amount, '×2');\n  assert.equal(rows.find(row => row.behavior === '成為會員')?.amount, '+12 張');\n"
)

# Backend expectations on a fresh DB: approved Platinum+/Emerald/Admin users get
# the initial 6 stickers multiplied by the default 2x before fixed rank rewards.
p = Path('tests/stickerTransactions.test.ts')
text = p.read_text()
text = text.replace("assert.equal(await balance(db,token),106);", "assert.equal(await balance(db,token),112);", 1)
text = text.replace("assert.equal(await balance(db,member),9); assert.equal(await balance(db,token),103);", "assert.equal(await balance(db,member),9); assert.equal(await balance(db,token),109);", 1)
text = text.replace(
    "  assert.equal(await balance(db,platinum),6);\n  assert.equal((await call(db,platinum,'/api/stickers/grant','POST',{targetUserId:'member',amount:5,reason:'先發五張',operationId:'debit-1'})).status,200);\n  assert.equal(await balance(db,platinum),1);\n  assert.equal((await call(db,platinum,'/api/stickers/grant','POST',{targetUserId:'member',amount:2,reason:'餘額不足',operationId:'debit-2'})).status,402);\n  assert.equal(await balance(db,member),11);",
    "  assert.equal(await balance(db,platinum),12);\n  assert.equal((await call(db,platinum,'/api/stickers/grant','POST',{targetUserId:'member',amount:10,reason:'先發十張',operationId:'debit-1'})).status,200);\n  assert.equal(await balance(db,platinum),2);\n  assert.equal((await call(db,platinum,'/api/stickers/grant','POST',{targetUserId:'member',amount:3,reason:'餘額不足',operationId:'debit-2'})).status,402);\n  assert.equal(await balance(db,member),16);",
    1
)
text = text.replace("  assert.equal(await balance(db,member),13);", "  assert.equal(await balance(db,member),18);", 1)
text = text.replace(
    "assert.equal(Number((db.sqlite.prepare(\"SELECT SUM(deltaUnits)/10.0 AS n FROM sticker_transactions WHERE userId='platinum'\").get() as any).n),106);",
    "assert.equal(Number((db.sqlite.prepare(\"SELECT SUM(deltaUnits)/10.0 AS n FROM sticker_transactions WHERE userId='platinum'\").get() as any).n),112);",
    1
)
text = text.replace(
    "assert.equal(Number((db.sqlite.prepare(\"SELECT SUM(deltaUnits)/10.0 AS n FROM sticker_transactions WHERE userId='emerald'\").get() as any).n),306);",
    "assert.equal(Number((db.sqlite.prepare(\"SELECT SUM(deltaUnits)/10.0 AS n FROM sticker_transactions WHERE userId='emerald'\").get() as any).n),312);",
    1
)

# Add an explicit contract test for initial credit and non-retroactivity.
anchor = "test('parallel unlock is permanent, charges once and cannot bypass rank or VIP', async () => {"
extra = """test('initial sticker reward uses the earning multiplier only when first credited and never rewrites history', async () => {\n  const db=database();\n  const platinum=await session(db,'platinum');\n  const member=await session(db,'member');\n  assert.equal(await balance(db,platinum),112);\n  const platinumInitial:any=db.sqlite.prepare(\"SELECT deltaUnits FROM sticker_transactions WHERE userId='platinum' AND type='initial'\").get();\n  const memberInitial:any=db.sqlite.prepare(\"SELECT deltaUnits FROM sticker_transactions WHERE userId='member' AND type='initial'\").get();\n  assert.equal(platinumInitial.deltaUnits,120);\n  assert.equal(memberInitial.deltaUnits,60);\n  db.sqlite.exec(\"UPDATE sticker_settings SET valueUnits=30 WHERE key='platinum_rank_multiplier_tenths'\");\n  assert.equal(await balance(db,platinum),112);\n  assert.equal(db.sqlite.prepare(\"SELECT deltaUnits FROM sticker_transactions WHERE userId='platinum' AND type='initial'\").get()?.deltaUnits,120);\n});\n\n"""
if anchor not in text:
    raise SystemExit('initial reward test anchor missing')
text = text.replace(anchor, extra + anchor, 1)
p.write_text(text)

# Changelog wording: this completes the v4.4 multiplier scope without creating a new release.
p = Path('src/changelogReleaseNotes.ts')
text = p.read_text()
needle = "'已審核白金級以上會員的完整資料、評價、按讚、關鍵字、心得、回覆、召喚繁星完成獎勵與人工收到貼紙等一般正數收入，統一套用超級管理員設定的倍數。',"
replacement = "'已審核白金級以上會員的會員初始貼紙、完整資料、評價、按讚、關鍵字、心得、回覆與召喚繁星完成獎勵等一般系統收入，統一套用超級管理員設定的倍數；已領過的歷史初始貼紙不回頭重算。',"
if needle not in text:
    raise SystemExit('v4.4 changelog multiplier sentence missing')
text = text.replace(needle, replacement, 1)
p.write_text(text)

print('initial sticker multiplier completion applied')
