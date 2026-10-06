from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing replacement in {path}: {old[:160]!r}')
    p.write_text(text.replace(old, new, 1))

# Future-proof the central reward path: rank approval and manual grants never use the earning multiplier.
replace_once(
    'worker/stickerRouter.ts',
    "const shouldMultiply = input.deltaUnits > 0 && !input.skipEarningMultiplier && input.type !== 'rank_approval_reward';",
    "const shouldMultiply = input.deltaUnits > 0 && !input.skipEarningMultiplier && !['rank_approval_reward','manual_grant'].includes(input.type);"
)

# Manual grants stay exactly at the chosen 1–5 stickers for the recipient.
p = Path('worker/stickerRouter.ts')
text = p.read_text()
text = text.replace("      const targetMultiplierTenths = await earningMultiplierTenthsForUser(db, target.id);\n      const creditedUnits = multiplyStickerUnits(units, targetMultiplierTenths);\n", "")
text = text.replace(".bind(grantId,target.id,creditedUnits,target.id,creditedUnits,operationId", ".bind(grantId,target.id,units,target.id,units,operationId")
text = text.replace("      const amountText = formatStickerAmount(unitsToStickers(creditedUnits));", "      const amountText = formatStickerAmount(amount);")
text = text.replace("return json({ success: true, added: unitsToStickers(creditedUnits), balance:", "return json({ success: true, added: amount, balance:")
p.write_text(text)

# Guide table: manual grant is not multiplied and explanatory copy says so.
p = Path('src/stickerGuidePolicy.ts')
text = p.read_text()
text = text.replace(
    "{ kind: '增加', behavior: '上手人工加貼紙', amount: `+${formatStickerAmount(earned(1))}～${formatStickerAmount(earned(5))} 張`, detail: '上手依原始加發張數扣除；白金級以上收款會員依倍數實際入帳。' }",
    "{ kind: '增加', behavior: '上手人工加貼紙', amount: '+1～5 張', detail: '人工加貼紙不套用白金級以上獲取倍數；加幾張就實際收到幾張。' }"
)
text = text.replace(
    "detail: '目前會員已套用此倍數；所有一般獲得貼紙行為都乘倍數，獎銜審核獎勵例外。'",
    "detail: '目前會員已套用此倍數；一般系統獎勵會乘倍數，獎銜審核獎勵與人工加貼紙例外。'"
)
p.write_text(text)

# UI explanation.
replace_once(
    'src/components/StickersModal.tsx',
    "所有貼紙消耗不乘倍數，白金／翡翠／鑽石獎銜審核獎勵也不乘倍數。",
    "所有貼紙消耗不乘倍數，人工加貼紙與白金／翡翠／鑽石獎銜審核獎勵也不乘倍數。"
)

# Guide policy test: manual grant remains +1–5 even for platinum+.
replace_once(
    'tests/stickerGuidePolicy.test.ts',
    "assert.equal(rows.find(row => row.behavior === '上手人工加貼紙')?.amount, '+2～10 張');",
    "assert.equal(rows.find(row => row.behavior === '上手人工加貼紙')?.amount, '+1～5 張');"
)

# Backend test: manual grant into platinum remains the exact chosen amount.
replace_once(
    'tests/stickerTransactions.test.ts',
    "assert.equal(grant.deltaUnits,50);",
    "assert.equal(grant.deltaUnits,20);"
)

# Release notes reflect the explicit exception.
p = Path('src/changelogReleaseNotes.ts')
text = p.read_text()
text = text.replace(
    "'白金級以上倍數只作用在獲得端，不放大任何貼紙消耗；上手人工加發時仍只扣原本選擇的張數，白金級以上收款會員依倍數實際入帳。',",
    "'白金級以上倍數只作用在一般系統獎勵，不放大任何貼紙消耗；人工加貼紙完全不套倍數，加幾張就扣幾張、收幾張。',"
)
p.write_text(text)

print('manual grant multiplier exception applied')
