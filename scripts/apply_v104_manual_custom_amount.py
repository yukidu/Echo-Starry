from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing replacement in {path}: {old[:180]!r}')
    p.write_text(text.replace(old, new, 1))

# UI: free numeric input, one decimal place, same safety range as sticker settings.
replace_once(
    'src/components/StickersModal.tsx',
    '<label className="block font-bold">加貼紙張數<ThemedSelect value={grantAmount} onChange={e=>setGrantAmount(e.target.value)} className={`${field} mt-1`}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} 張</option>)}</ThemedSelect></label>',
    '<label className="block font-bold">加貼紙張數<div className="mt-1 flex items-center gap-2"><input aria-label="加貼紙張數" type="number" inputMode="decimal" min="0.1" max="1000" step="0.1" value={grantAmount} onChange={e=>setGrantAmount(e.target.value)} className={field}/><span className="shrink-0 text-sm">張</span></div><p className="mt-1 text-[11px] font-normal text-slate-500">可自行輸入 0.1～1000 張，人工加貼紙不套用白金級以上倍數。</p></label>'
)

# Backend: accept 0.1–1000 stickers, max one decimal place.
replace_once(
    'worker/stickerRouter.ts',
    "    if (!Number.isInteger(amount) || amount < 1 || amount > 5) {\n      return json({ error: '人工加貼紙需為 1 至 5 張整數' }, 400);\n    }",
    "    if (!validTenth(amount) || amount <= 0) {\n      return json({ error: '人工加貼紙需為 0.1 至 1000 張，最多小數一位' }, 400);\n    }"
)

# Guide text.
replace_once(
    'src/stickerGuidePolicy.ts',
    "{ kind: '增加', behavior: '上手人工加貼紙', amount: '+1～5 張', detail: '人工加貼紙不套用白金級以上獲取倍數；加幾張就實際收到幾張。' }",
    "{ kind: '增加', behavior: '上手人工加貼紙', amount: '+0.1～1000 張', detail: '由上手自行輸入張數；人工加貼紙不套用白金級以上獲取倍數，加幾張就實際收到幾張。' }"
)
replace_once(
    'src/stickerGuidePolicy.ts',
    "rows.push({ kind: '消耗', behavior: '人工加貼紙給自己的下線', amount: '-1～5 張', detail: '每次發放多少張，就從自己的貼紙餘額扣除多少張。' });",
    "rows.push({ kind: '消耗', behavior: '人工加貼紙給自己的下線', amount: '-0.1～1000 張', detail: '張數可自行輸入；每次發放多少張，就從自己的貼紙餘額扣除多少張。' });"
)

# Guide tests.
replace_once(
    'tests/stickerGuidePolicy.test.ts',
    "assert.equal(rows.find(row => row.behavior === '上手人工加貼紙')?.amount, '+1～5 張');",
    "assert.equal(rows.find(row => row.behavior === '上手人工加貼紙')?.amount, '+0.1～1000 張');"
)
replace_once(
    'tests/stickerGuidePolicy.test.ts',
    "assert.equal(rows.find(row => row.behavior === '人工加貼紙給自己的下線')?.amount, '-1～5 張');",
    "assert.equal(rows.find(row => row.behavior === '人工加貼紙給自己的下線')?.amount, '-0.1～1000 張');"
)

# Existing backend test no longer rejects fractional values; verify custom decimal amount and range validation.
p = Path('tests/stickerTransactions.test.ts')
text = p.read_text()
text = text.replace(
    "test('manual grant history is scoped to issuer, fractional counts rejected, and unlock range reaches 50', async () => {",
    "test('manual grant history is scoped to issuer, custom decimal amounts are accepted, and unlock range reaches 50', async () => {",
    1
)
text = text.replace(
    "  const body={targetUserId:'member',amount:5,reason:'完整原因',operationId:'history'};\n  assert.equal((await call(db,platinum,'/api/stickers/grant','POST',{...body,amount:1.5})).status,400);\n  assert.equal((await call(db,platinum,'/api/stickers/grant','POST',body)).status,200);",
    "  const body={targetUserId:'member',amount:5.5,reason:'完整原因',operationId:'history'};\n  assert.equal((await call(db,platinum,'/api/stickers/grant','POST',{...body,amount:0})).status,400);\n  assert.equal((await call(db,platinum,'/api/stickers/grant','POST',{...body,amount:1000.1})).status,400);\n  assert.equal((await call(db,platinum,'/api/stickers/grant','POST',{...body,amount:1.23})).status,400);\n  assert.equal((await call(db,platinum,'/api/stickers/grant','POST',body)).status,200);",
    1
)
Path('tests/stickerTransactions.test.ts').write_text(text)

# Release note wording.
p = Path('src/changelogReleaseNotes.ts')
text = p.read_text()
text = text.replace(
    "'白金級以上倍數只作用在一般系統獎勵，不放大任何貼紙消耗；人工加貼紙完全不套倍數，加幾張就扣幾張、收幾張。',",
    "'白金級以上倍數只作用在一般系統獎勵，不放大任何貼紙消耗；人工加貼紙完全不套倍數，張數改為可自行輸入 0.1～1000 張，加幾張就扣幾張、收幾張。',",
    1
)
Path('src/changelogReleaseNotes.ts').write_text(text)

print('custom manual sticker amount applied')
