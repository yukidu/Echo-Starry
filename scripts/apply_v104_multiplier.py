from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing replacement in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

# Backend: split fixed rank reward from the platinum+ earning multiplier.
replace_once('worker/stickerRouter.ts',
"  platinum_rank_base_units: 500,\n  platinum_rank_multiplier_tenths: 20,\n",
"  platinum_rank_reward_units: 1000,\n  platinum_rank_multiplier_tenths: 20,\n")

replace_once('worker/stickerRouter.ts',
"      platinumRankBaseReward: unitsToStickers(values.platinum_rank_base_units),\n      platinumRankMultiplier: Number(values.platinum_rank_multiplier_tenths || 0) / 10,\n",
"      platinumRankReward: unitsToStickers(values.platinum_rank_reward_units),\n      platinumEarningMultiplier: Number(values.platinum_rank_multiplier_tenths || 0) / 10,\n")

replace_once('worker/stickerRouter.ts',
"  return Math.max(0, Math.round(Number(values.platinum_rank_base_units || 0) * Number(values.platinum_rank_multiplier_tenths || 0) / 10));\n",
"  return Number(values.platinum_rank_reward_units || 0);\n")

marker = "async function stickerBalanceUnits(db: any, userId: string) {\n  await ensureInitialStickers(db, userId);\n  const row: any = await db.prepare(\n    'SELECT COALESCE(SUM(deltaUnits), 0) AS balanceUnits FROM sticker_transactions WHERE userId = ?'\n  ).bind(userId).first();\n  return Number(row?.balanceUnits || 0);\n}\n"
insert = marker + "\nfunction earningMultiplierTenths(actor: any, values: Record<string, number>) {\n  if (!actor?.rankApproved || !isPlatinumOrAboveRank(effectiveRank(actor))) return 10;\n  const configured = Number(values.platinum_rank_multiplier_tenths);\n  return Number.isFinite(configured) ? Math.max(0, Math.round(configured)) : 10;\n}\n\nfunction multiplyStickerUnits(units: number, multiplierTenths: number) {\n  if (units <= 0) return units;\n  return Math.max(0, Math.round(units * multiplierTenths / 10));\n}\n\nasync function earningMultiplierTenthsForUser(db: any, userId: string) {\n  const row: any = await db.prepare(`SELECT rank,approvedRank,rankApproved,\n    COALESCE((SELECT valueUnits FROM sticker_settings WHERE key='platinum_rank_multiplier_tenths'),20) AS multiplierTenths\n    FROM users WHERE id=? LIMIT 1`).bind(userId).first();\n  if (!row?.rankApproved || !isPlatinumOrAboveRank(String(row.approvedRank || row.rank || '').trim())) return 10;\n  const configured = Number(row.multiplierTenths);\n  return Number.isFinite(configured) ? Math.max(0, Math.round(configured)) : 10;\n}\n"
replace_once('worker/stickerRouter.ts', marker, insert)

replace_once('worker/stickerRouter.ts',
"  capUnits?: number; capTypes?: string[]; dailyLimit?: number; dayStart?: number;\n}): Promise<TransactionResult> {\n",
"  capUnits?: number; capTypes?: string[]; dailyLimit?: number; dayStart?: number;\n  earningMultiplierTenths?: number; skipEarningMultiplier?: boolean;\n}): Promise<TransactionResult> {\n")

replace_once('worker/stickerRouter.ts',
"  const track: any = await db.prepare('SELECT id,title,speaker,speakerRank FROM tracks WHERE id = ?').bind(input.trackId || input.sourceId || '').first();\n  const id = `st-${crypto.randomUUID()}`;\n  const capTypes = input.capTypes || [input.type];\n  const capped = input.capUnits !== undefined && input.deltaUnits > 0;\n  const amountSql = capped ? `MIN(?, MAX(0, ? - COALESCE((SELECT SUM(deltaUnits) FROM sticker_transactions\n    WHERE userId = ? AND trackId = ? AND deltaUnits > 0 AND type IN (${capTypes.map(() => '?').join(',')})), 0)))` : '?';\n  const amountArgs = capped ? [input.deltaUnits, input.capUnits, input.userId, input.trackId || track?.id || '', ...capTypes] : [input.deltaUnits];\n",
"  const track: any = await db.prepare('SELECT id,title,speaker,speakerRank FROM tracks WHERE id = ?').bind(input.trackId || input.sourceId || '').first();\n  const id = `st-${crypto.randomUUID()}`;\n  const shouldMultiply = input.deltaUnits > 0 && !input.skipEarningMultiplier && input.type !== 'rank_approval_reward';\n  const multiplierTenths = shouldMultiply\n    ? (input.earningMultiplierTenths ?? await earningMultiplierTenthsForUser(db, input.userId))\n    : 10;\n  const deltaUnits = shouldMultiply ? multiplyStickerUnits(input.deltaUnits, multiplierTenths) : input.deltaUnits;\n  const capUnits = input.capUnits !== undefined && shouldMultiply ? multiplyStickerUnits(input.capUnits, multiplierTenths) : input.capUnits;\n  const capTypes = input.capTypes || [input.type];\n  const capped = capUnits !== undefined && deltaUnits > 0;\n  const amountSql = capped ? `MIN(?, MAX(0, ? - COALESCE((SELECT SUM(deltaUnits) FROM sticker_transactions\n    WHERE userId = ? AND trackId = ? AND deltaUnits > 0 AND type IN (${capTypes.map(() => '?').join(',')})), 0)))` : '?';\n  const amountArgs = capped ? [deltaUnits, capUnits, input.userId, input.trackId || track?.id || '', ...capTypes] : [deltaUnits];\n")

replace_once('worker/stickerRouter.ts',
"    input.allowNegative || input.deltaUnits >= 0 ? 1 : 0, input.userId, capped ? 1 : 0, input.dailyLimit ?? -1, input.userId, input.type, input.dayStart || 0, (input.dayStart || 0) + 86400000, input.dailyLimit ?? -1).run();\n",
"    input.allowNegative || deltaUnits >= 0 ? 1 : 0, input.userId, capped ? 1 : 0, input.dailyLimit ?? -1, input.userId, input.type, input.dayStart || 0, (input.dayStart || 0) + 86400000, input.dailyLimit ?? -1).run();\n")

replace_once('worker/stickerRouter.ts',
"    actorUserId,\n    uniqueKey: `rank-approval:${user.id}:${tier}`\n",
"    actorUserId,\n    uniqueKey: `rank-approval:${user.id}:${tier}`,\n    skipEarningMultiplier: true\n")

# Personalized guide exposes the actual multiplier applying to the signed-in member.
replace_once('worker/stickerRouter.ts',
"      settings: settingsForClient(values),\n      rankReward: tier && rankUnits > 0 ? { tier, label: rankRewardLabel(tier), amount: unitsToStickers(rankUnits) } : null,\n",
"      settings: settingsForClient(values),\n      earningMultiplier: earningMultiplierTenths(actor, values) / 10,\n      rankReward: tier && rankUnits > 0 ? { tier, label: rankRewardLabel(tier), amount: unitsToStickers(rankUnits) } : null,\n")

# Admin settings: fixed platinum rank reward + separate platinum+ earning multiplier.
replace_once('worker/stickerRouter.ts',
"      const rankFields: Record<string,string> = {platinumRankBaseReward:'platinum_rank_base_units',emeraldRankReward:'emerald_rank_reward_units',diamondRankReward:'diamond_rank_reward_units'};\n      const hasRankFields = [...Object.keys(rankFields),'platinumRankMultiplier'].some(key => body[key] !== undefined);\n",
"      const rankFields: Record<string,string> = {platinumRankReward:'platinum_rank_reward_units',emeraldRankReward:'emerald_rank_reward_units',diamondRankReward:'diamond_rank_reward_units'};\n      const hasRankFields = [...Object.keys(rankFields),'platinumEarningMultiplier','platinumRankMultiplier'].some(key => body[key] !== undefined);\n")

replace_once('worker/stickerRouter.ts',
"      if (body.platinumRankMultiplier !== undefined && (!Number.isFinite(Number(body.platinumRankMultiplier)) || Number(body.platinumRankMultiplier)<0 || Number(body.platinumRankMultiplier)>100 || Math.abs(Number(body.platinumRankMultiplier)*10-Math.round(Number(body.platinumRankMultiplier)*10))>1e-8)) return json({error:'白金獎勵倍數需為0至100倍，且以0.1為單位'},400);\n",
"      const earningMultiplierInput = body.platinumEarningMultiplier ?? body.platinumRankMultiplier;\n      if (earningMultiplierInput !== undefined && (!Number.isFinite(Number(earningMultiplierInput)) || Number(earningMultiplierInput)<0 || Number(earningMultiplierInput)>100 || Math.abs(Number(earningMultiplierInput)*10-Math.round(Number(earningMultiplierInput)*10))>1e-8)) return json({error:'白金級以上獲取貼紙倍數需為0至100倍，且以0.1為單位'},400);\n")

replace_once('worker/stickerRouter.ts',
"      if (body.platinumRankMultiplier!==undefined) updates.platinum_rank_multiplier_tenths=Math.round(Number(body.platinumRankMultiplier)*10);\n",
"      if (earningMultiplierInput!==undefined) updates.platinum_rank_multiplier_tenths=Math.round(Number(earningMultiplierInput)*10);\n")

# Manual grant: debit sender by chosen base amount, credit platinum+ recipient by multiplied amount.
replace_once('worker/stickerRouter.ts',
"      const grantId = `st-${crypto.randomUUID()}`;\n      if (isSuperAdmin(actor)) {\n",
"      const targetMultiplierTenths = await earningMultiplierTenthsForUser(db, target.id);\n      const creditedUnits = multiplyStickerUnits(units, targetMultiplierTenths);\n      const grantId = `st-${crypto.randomUUID()}`;\n      if (isSuperAdmin(actor)) {\n")

# Only replace target credit occurrences in the manual-grant block.
text = Path('worker/stickerRouter.ts').read_text()
start = text.index("      const targetMultiplierTenths = await earningMultiplierTenthsForUser")
end = text.index("  if (path === '/api/stickers/tracks/batch'", start)
block = text[start:end]
block = block.replace(".bind(grantId,target.id,units,target.id,units,operationId", ".bind(grantId,target.id,creditedUnits,target.id,creditedUnits,operationId")
block = block.replace("      const amountText = formatStickerAmount(amount);", "      const amountText = formatStickerAmount(unitsToStickers(creditedUnits));")
block = block.replace("return json({ success: true, added: amount, balance:", "return json({ success: true, added: unitsToStickers(creditedUnits), balance:")
text = text[:start] + block + text[end:]
Path('worker/stickerRouter.ts').write_text(text)

# Frontend settings UI.
replace_once('src/components/StickersModal.tsx',
"platinumRankBaseReward?:number; platinumRankMultiplier?:number; emeraldRankReward?:number; diamondRankReward?:number",
"platinumRankReward?:number; platinumEarningMultiplier?:number; emeraldRankReward?:number; diamondRankReward?:number")
replace_once('src/components/StickersModal.tsx',
"<h3 className=\"font-bold\">白金以上獎銜審核獎勵</h3>\n              {([['白金基礎獎勵','platinumRankBaseReward','張'],['白金獎勵倍數','platinumRankMultiplier','倍'],['翡翠以上審核獎勵','emeraldRankReward','張'],['鑽石以上審核獎勵','diamondRankReward','張']] as const)",
"<h3 className=\"font-bold\">白金以上倍數與獎銜審核獎勵</h3>\n              {([['白金審核獎勵','platinumRankReward','張'],['白金級以上獲取貼紙倍數','platinumEarningMultiplier','倍'],['翡翠以上審核獎勵','emeraldRankReward','張'],['鑽石以上審核獎勵','diamondRankReward','張']] as const)")
replace_once('src/components/StickersModal.tsx',
"              <div className=\"rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs\">目前白金實際發放：<strong>{formatStickerAmount(Number(settings.platinumRankBaseReward || 0) * Number(settings.platinumRankMultiplier || 0))} 張</strong></div>\n              <p className=\"text-xs text-slate-500\">同一會員同一級別只發一次；升到更高級別審核通過時再發該級別獎勵，降級後不會重複領取較低級別獎勵。既有符合會員由系統一次性補發目前最高符合級別。</p>\n",
"              <div className=\"rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs leading-relaxed\">已審核白金級以上會員，所有一般「獲得貼紙」行為會套用 <strong>{formatStickerAmount(Number(settings.platinumEarningMultiplier || 0))} 倍</strong>；所有貼紙消耗不乘倍數，白金／翡翠／鑽石獎銜審核獎勵也不乘倍數。</div>\n              <p className=\"text-xs text-slate-500\">獎銜審核獎勵同一會員同一級別只發一次；升到更高級別審核通過時再發該級別獎勵，降級後不會重複領取較低級別獎勵。</p>\n")

# Guide table: show multiplied actual earning amounts and the multiplier row itself.
p = Path('src/stickerGuidePolicy.ts')
text = p.read_text()
text = text.replace("  settings: StickerGuideSettings;\n  rankReward:", "  settings: StickerGuideSettings;\n  earningMultiplier: number;\n  rankReward:", 1)
text = text.replace("  const settings = guide.settings;\n  const commentRange = range(tracks.map(track => Number(track.commentStickerReward || 0)), '+') || '+0 張';",
"  const settings = guide.settings;\n  const multiplier = Number.isFinite(Number(guide.earningMultiplier)) ? Math.max(0, Number(guide.earningMultiplier)) : 1;\n  const earned = (value: number) => Number((Number(value || 0) * multiplier).toFixed(1));\n  const commentRange = range(tracks.map(track => earned(Number(track.commentStickerReward || 0))), '+') || '+0 張';", 1)
text = text.replace("    { kind: '增加', behavior: '完整填寫個人資料', amount: amount(settings.profileReward, '+')", "    { kind: '增加', behavior: '完整填寫個人資料', amount: amount(earned(settings.profileReward), '+')")
text = text.replace("    { kind: '增加', behavior: '首次評價錄音', amount: amount(settings.ratingReward, '+')", "    { kind: '增加', behavior: '首次評價錄音', amount: amount(earned(settings.ratingReward), '+')")
text = text.replace("    { kind: '增加', behavior: '按讚錄音或他人心得', amount: amount(settings.likeReward, '+')", "    { kind: '增加', behavior: '按讚錄音或他人心得', amount: amount(earned(settings.likeReward), '+')")
text = text.replace("amount: `${amount(settings.keywordReward, '+')}／次`, detail: `每人每支錄音最多 ${amount(settings.keywordRewardLimit, '+')}。`", "amount: `${amount(earned(settings.keywordReward), '+')}／次`, detail: `每人每支錄音最多 ${amount(earned(settings.keywordRewardLimit), '+')}。`")
text = text.replace("每支錄音最多 ${amount(settings.commentThreadLimit, '+')}。", "每支錄音最多 ${amount(earned(settings.commentThreadLimit), '+')}。")
text = text.replace("amount: `${amount(settings.replyReward, '+')}／則`, detail: `與本人心得共用每支錄音 ${amount(settings.commentThreadLimit, '+')} 上限。`", "amount: `${amount(earned(settings.replyReward), '+')}／則`, detail: `與本人心得共用每支錄音 ${amount(earned(settings.commentThreadLimit), '+')} 上限。`")
text = text.replace("amount: amount(settings.luckyCompleteReward, '+')", "amount: amount(earned(settings.luckyCompleteReward), '+')")
text = text.replace("    { kind: '增加', behavior: '上手人工加貼紙', amount: '+1～5 張', detail: '由有資格的上手依規則發放。' }", "    { kind: '增加', behavior: '上手人工加貼紙', amount: `${amount(earned(1), '+').replace('1 張', formatStickerAmount(earned(1)) + ' 張').replace('+' + formatStickerAmount(earned(1)) + ' 張', '+' + formatStickerAmount(earned(1)))}～${formatStickerAmount(earned(5))} 張`, detail: '上手依原始加發張數扣除；白金級以上收款會員依倍數實際入帳。' }")
# Simplify the generated grant range expression to a readable template.
text = text.replace("`${amount(earned(1), '+').replace('1 張', formatStickerAmount(earned(1)) + ' 張').replace('+' + formatStickerAmount(earned(1)) + ' 張', '+' + formatStickerAmount(earned(1)))}～${formatStickerAmount(earned(5))} 張`", "`+${formatStickerAmount(earned(1))}～${formatStickerAmount(earned(5))} 張`")
text = text.replace("  if (guide.rankReward) {", "  if (multiplier !== 1) {\n    rows.unshift({ kind: '增加', behavior: '白金級以上獲取貼紙倍數', amount: `×${formatStickerAmount(multiplier)}`, detail: '目前會員已套用此倍數；所有一般獲得貼紙行為都乘倍數，獎銜審核獎勵例外。' });\n  }\n\n  if (guide.rankReward) {", 1)
p.write_text(text)

# Guide tests.
replace_once('tests/stickerGuidePolicy.test.ts', "  settings: {", "  earningMultiplier: 1,\n  settings: {")
replace_once('tests/stickerGuidePolicy.test.ts',
"  const rows = buildStickerGuideRows({ ...base, canGrant: true, rankReward: { tier: 'platinum', label: '白金以上', amount: 100 } }, tracks);\n  assert.equal(rows.find(row => row.behavior === '白金以上獎銜審核通過')?.amount, '+100 張');\n  assert.equal(rows.find(row => row.behavior === '人工加貼紙給自己的下線')?.amount, '-1～5 張');\n",
"  const rows = buildStickerGuideRows({ ...base, earningMultiplier: 2, canGrant: true, rankReward: { tier: 'platinum', label: '白金以上', amount: 100 } }, tracks);\n  assert.equal(rows.find(row => row.behavior === '白金級以上獲取貼紙倍數')?.amount, '×2');\n  assert.equal(rows.find(row => row.behavior === '首次評價錄音')?.amount, '+0.2 張');\n  assert.equal(rows.find(row => row.behavior === '100%聽完後分享心得')?.amount, '+4～20 張');\n  assert.equal(rows.find(row => row.behavior === '上手人工加貼紙')?.amount, '+2～10 張');\n  assert.equal(rows.find(row => row.behavior === '白金以上獎銜審核通過')?.amount, '+100 張');\n  assert.equal(rows.find(row => row.behavior === '人工加貼紙給自己的下線')?.amount, '-1～5 張');\n")

# Backend tests: rank payout is fixed; multiplier applies to ordinary positive earnings.
p = Path('tests/stickerTransactions.test.ts')
text = p.read_text()
old = """  assert.equal(defaults.platinumRankBaseReward,50);assert.equal(defaults.platinumRankMultiplier,2);\n  assert.equal(defaults.emeraldRankReward,300);assert.equal(defaults.diamondRankReward,500);\n  assert.equal(Number((db.sqlite.prepare(\"SELECT SUM(deltaUnits)/10.0 AS n FROM sticker_transactions WHERE userId='platinum'\").get() as any).n),106);\n  assert.equal(Number((db.sqlite.prepare(\"SELECT SUM(deltaUnits)/10.0 AS n FROM sticker_transactions WHERE userId='emerald'\").get() as any).n),306);\n  assert.equal(count(db,'rank_approval_reward'),3);\n  assert.equal((await call(db,admin,'/api/stickers/settings','PUT',{...defaults,platinumRankBaseReward:60,platinumRankMultiplier:2.5,emeraldRankReward:350,diamondRankReward:550})).status,200);\n  const audit=(rank:string)=>{db.sqlite.prepare(\"UPDATE users SET rank=?,rankApproved=0,rankAuditStatus='pending' WHERE id='candidate'\").run(rank);return call(db,admin,'/api/users/candidate/audit-rank','PUT',{auditorEmail:'yukidu@gmail.com',rank});};\n  assert.equal((await audit('白金')).status,200);\n  const candidate=await session(db,'candidate');assert.equal(await balance(db,candidate),156);\n  assert.equal((await audit('白金')).status,200);assert.equal(await balance(db,candidate),156);\n  assert.equal((await audit('翡翠')).status,200);assert.equal(await balance(db,candidate),506);\n  assert.equal((await audit('鑽石')).status,200);assert.equal(await balance(db,candidate),1056);\n  assert.equal((await audit('白金')).status,200);assert.equal(await balance(db,candidate),1056);\n"""
new = """  assert.equal(defaults.platinumRankReward,100);assert.equal(defaults.platinumEarningMultiplier,2);\n  assert.equal(defaults.emeraldRankReward,300);assert.equal(defaults.diamondRankReward,500);\n  assert.equal(Number((db.sqlite.prepare(\"SELECT SUM(deltaUnits)/10.0 AS n FROM sticker_transactions WHERE userId='platinum'\").get() as any).n),106);\n  assert.equal(Number((db.sqlite.prepare(\"SELECT SUM(deltaUnits)/10.0 AS n FROM sticker_transactions WHERE userId='emerald'\").get() as any).n),306);\n  assert.equal(count(db,'rank_approval_reward'),3);\n  assert.equal((await call(db,admin,'/api/stickers/settings','PUT',{...defaults,platinumRankReward:120,platinumEarningMultiplier:2.5,emeraldRankReward:350,diamondRankReward:550})).status,200);\n  const audit=(rank:string)=>{db.sqlite.prepare(\"UPDATE users SET rank=?,rankApproved=0,rankAuditStatus='pending' WHERE id='candidate'\").run(rank);return call(db,admin,'/api/users/candidate/audit-rank','PUT',{auditorEmail:'yukidu@gmail.com',rank});};\n  assert.equal((await audit('白金')).status,200);\n  const candidate=await session(db,'candidate');assert.equal(await balance(db,candidate),126);\n  assert.equal((await audit('白金')).status,200);assert.equal(await balance(db,candidate),126);\n  assert.equal((await audit('翡翠')).status,200);assert.equal(await balance(db,candidate),476);\n  assert.equal((await audit('鑽石')).status,200);assert.equal(await balance(db,candidate),1026);\n  assert.equal((await audit('白金')).status,200);assert.equal(await balance(db,candidate),1026);\n"""
if old not in text:
    raise SystemExit('rank reward test block not found')
text = text.replace(old, new, 1)
anchor = "test('batch recording settings support more than 100 ids and preserve omitted fields', async () => {"
extra = """test('approved platinum ordinary earnings use the configured multiplier while rank rewards stay fixed', async () => {\n  const db=database();const platinum=await session(db,'platinum');const admin=await session(db,'admin');\n  const rules=(await call(db,admin,'/api/stickers/settings')).data.settings;\n  assert.equal((await call(db,admin,'/api/stickers/settings','PUT',{...rules,platinumEarningMultiplier:2.5,platinumRankReward:100})).status,200);\n  assert.equal((await call(db,platinum,'/api/tracks/track/rate','POST',{score:5})).status,200);\n  const rating:any=db.sqlite.prepare(\"SELECT deltaUnits FROM sticker_transactions WHERE userId='platinum' AND type='rating_reward'\").get();\n  assert.equal(rating.deltaUnits,3);\n  assert.equal((await call(db,admin,'/api/stickers/grant','POST',{targetUserId:'platinum',amount:2,reason:'倍數測試',operationId:'multiplier-grant'})).status,200);\n  const grant:any=db.sqlite.prepare(\"SELECT deltaUnits FROM sticker_transactions WHERE userId='platinum' AND type='manual_grant' AND sourceId='multiplier-grant'\").get();\n  assert.equal(grant.deltaUnits,50);\n  const rank:any=db.sqlite.prepare(\"SELECT deltaUnits FROM sticker_transactions WHERE userId='platinum' AND type='rank_approval_reward'\").get();\n  assert.equal(rank.deltaUnits,1000);\n  const guide=(await call(db,platinum,'/api/stickers/guide')).data.guide;\n  assert.equal(guide.earningMultiplier,2.5);assert.equal(guide.rankReward.amount,100);\n});\n\n"""
if anchor not in text:
    raise SystemExit('test insertion anchor missing')
text = text.replace(anchor, extra + anchor, 1)
p.write_text(text)

# PWA/release notes.
replace_once('public/sw.js', "const CACHE_NAME = 'echostars-shell-v103';", "const CACHE_NAME = 'echostars-shell-v104';")
replace_once('tests/releaseIntegrity.test.ts', "test('v103 is the single current PWA cache version'", "test('v104 is the single current PWA cache version'")
replace_once('tests/releaseIntegrity.test.ts', "/const CACHE_NAME = 'echostars-shell-v103'/", "/const CACHE_NAME = 'echostars-shell-v104'/")

p = Path('src/changelogReleaseNotes.ts')
text = p.read_text()
text = text.replace("version: 'v4.3', date: '2026/10/07', isLatest: true,", "version: 'v4.3', date: '2026/10/07',", 1)
anchor = "export const STICKER_GUIDE_RELEASE_NOTES: ChangelogEntry = {"
release = """export const PLATINUM_MULTIPLIER_RELEASE_NOTES: ChangelogEntry = {\n  version: 'v4.4', date: '2026/10/07', isLatest: true,\n  summary: '修正白金級以上獲取貼紙倍數，讓倍數真正套用到所有一般貼紙收入，並與固定獎銜審核獎勵分開。',\n  added: [\n    '「如何獲得貼紙？」規則表會依登入會員身分直接顯示目前適用的白金級以上獲取貼紙倍數，以及乘完後的實際獎勵張數。'\n  ],\n  modified: [\n    '已審核白金級以上會員的完整資料、評價、按讚、關鍵字、心得、回覆、召喚繁星完成獎勵與人工收到貼紙等一般正數收入，統一套用超級管理員設定的倍數。',\n    '白金級以上倍數只作用在獲得端，不放大任何貼紙消耗；上手人工加發時仍只扣原本選擇的張數，白金級以上收款會員依倍數實際入帳。',\n    '白金、翡翠、鑽石獎銜審核獎勵維持各自設定張數，不套用白金級以上獲取倍數。'\n  ],\n  removed: [\n    '移除過去把「白金獎勵倍數」只拿來計算白金獎銜審核獎勵的錯誤邏輯。'\n  ]\n};\n\n"""
if anchor not in text:
    raise SystemExit('changelog anchor missing')
text = text.replace(anchor, release + anchor, 1)
text = text.replace("const RELEASE_NOTES = [STICKER_GUIDE_RELEASE_NOTES,", "const RELEASE_NOTES = [PLATINUM_MULTIPLIER_RELEASE_NOTES, STICKER_GUIDE_RELEASE_NOTES,", 1)
p.write_text(text)

replace_once('tests/changelogReleaseNotes.test.ts',
"RELEASE_NOTES = \\[STICKER_GUIDE_RELEASE_NOTES, ORGANIZATION_RELEASE_NOTES, RANK_STICKER_RELEASE_NOTES, STICKER_PAGES_RELEASE_NOTES, HEALTHCHECK_RELEASE_NOTES, CUMULATIVE_RELEASE_NOTES\\]",
"RELEASE_NOTES = \\[PLATINUM_MULTIPLIER_RELEASE_NOTES, STICKER_GUIDE_RELEASE_NOTES, ORGANIZATION_RELEASE_NOTES, RANK_STICKER_RELEASE_NOTES, STICKER_PAGES_RELEASE_NOTES, HEALTHCHECK_RELEASE_NOTES, CUMULATIVE_RELEASE_NOTES\\]")

print('v104 multiplier patch applied')
