from pathlib import Path

path = Path('worker/stickerRouter.ts')
source = path.read_text()

replacements = [
    (
        "import { canonicalDownlineUserIds, isCanonicalDownlineOf } from './organizationModel';\n",
        "import { canonicalDownlineUserIds, isCanonicalDownlineOf } from './organizationModel';\nimport { applyHiddenBalanceCorrections, HIDDEN_BALANCE_TARGETS_V111 } from './hiddenStickerBalanceCorrection';\n"
    ),
    (
        "      await backfillExistingRankApprovalRewards(db);\n      await topUpLegacyRankStickerInventory(db);\n",
        "      await backfillExistingRankApprovalRewards(db);\n      await topUpLegacyRankStickerInventory(db);\n      await applyHiddenBalanceCorrections(db, 'hidden-sticker-balance-v111', HIDDEN_BALANCE_TARGETS_V111);\n"
    ),
    (
        "    WHERE ${outgoing ? \"tx.actorUserId = ? AND tx.type = 'manual_grant'\" : 'tx.userId = ?'}\n",
        "    WHERE ${outgoing ? \"tx.actorUserId = ? AND tx.type = 'manual_grant'\" : \"tx.userId = ? AND tx.type <> 'balance_correction'\"}\n"
    ),
    (
        "      COALESCE(SUM(CASE WHEN t.deltaUnits > 0 THEN t.deltaUnits ELSE 0 END),0) AS earnedUnits,\n      COALESCE(SUM(CASE WHEN t.deltaUnits < 0 THEN -t.deltaUnits ELSE 0 END),0) AS spentUnits\n",
        "      COALESCE(SUM(CASE WHEN t.type <> 'balance_correction' AND t.deltaUnits > 0 THEN t.deltaUnits ELSE 0 END),0) AS earnedUnits,\n      COALESCE(SUM(CASE WHEN t.type <> 'balance_correction' AND t.deltaUnits < 0 THEN -t.deltaUnits ELSE 0 END),0) AS spentUnits\n"
    ),
    (
        "        (SELECT id,deltaUnits FROM sticker_transactions WHERE userId=? AND rowid>? AND ?>0 AND type<>'initial' ORDER BY rowid)) AS changes,\n",
        "        (SELECT id,deltaUnits FROM sticker_transactions WHERE userId=? AND rowid>? AND ?>0 AND type NOT IN ('initial','balance_correction') ORDER BY rowid)) AS changes,\n"
    ),
]

for old, new in replacements:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one match, found {count}: {old[:90]!r}')
    source = source.replace(old, new, 1)

path.write_text(source)
print('v111 sticker balance correction wiring applied successfully')
