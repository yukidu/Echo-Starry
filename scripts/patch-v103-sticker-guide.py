from pathlib import Path


def replace_once(path: str, before: str, after: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(before)
    if count != 1:
        raise SystemExit(f'{path}: expected one anchor, found {count}')
    file.write_text(text.replace(before, after))


replace_once(
    'src/components/StickersModal.tsx',
    "import { ThemedSelect } from './ThemedSelect';",
    "import { ThemedSelect } from './ThemedSelect';\nimport { StickerGuideTable } from './StickerGuideTable';"
)
replace_once(
    'src/components/StickersModal.tsx',
    "{tab==='history' && <><div className=\"rounded-2xl p-3 text-white text-center\" style={primary}",
    "{tab==='history' && <><StickerGuideTable currentUser={currentUser} tracks={tracks}/><div className=\"rounded-2xl p-3 text-white text-center\" style={primary}"
)

replace_once(
    'worker/stickerRouter.ts',
    "  if (!actor) return json({ error: '貼紙為會員專屬，請先登入' }, 401);\n  await ensureInitialStickers(db, actor.id);",
    """  if (!actor) return json({ error: '貼紙為會員專屬，請先登入' }, 401);
  if (path === '/api/stickers/guide' && method === 'GET') {
    const values = await settingMap(db);
    const tier = actor.rankApproved ? rankRewardTier(actor.approvedRank || actor.rank) : null;
    const rankUnits = tier ? rankRewardUnits(values, tier) : 0;
    return json({ guide: {
      initialReward: unitsToStickers(INITIAL_STICKER_UNITS),
      settings: settingsForClient(values),
      rankReward: tier && rankUnits > 0 ? { tier, label: rankRewardLabel(tier), amount: unitsToStickers(rankUnits) } : null,
      canGrant: canGrantStickers(actor),
      isSuperAdmin: isSuperAdmin(actor),
      canUploadVip: isSuperAdmin(actor) || Boolean(actor.canUpload) || Boolean(actor.isContributor)
    } });
  }
  await ensureInitialStickers(db, actor.id);"""
)

replace_once('public/sw.js', "const CACHE_NAME = 'echostars-shell-v102';", "const CACHE_NAME = 'echostars-shell-v103';")
replace_once(
    'tests/releaseIntegrity.test.ts',
    "test('v102 is the single current PWA cache version', () => {\n  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v102'/);",
    "test('v103 is the single current PWA cache version', () => {\n  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v103'/);"
)

replace_once(
    'src/changelogReleaseNotes.ts',
    "version: 'v4.2', date: '2026/10/07', isLatest: true,",
    "version: 'v4.2', date: '2026/10/07',"
)
replace_once(
    'src/changelogReleaseNotes.ts',
    "const RELEASE_NOTES = [ORGANIZATION_RELEASE_NOTES, RANK_STICKER_RELEASE_NOTES, STICKER_PAGES_RELEASE_NOTES, HEALTHCHECK_RELEASE_NOTES, CUMULATIVE_RELEASE_NOTES];",
    """export const STICKER_GUIDE_RELEASE_NOTES: ChangelogEntry = {
  version: 'v4.3', date: '2026/10/07', isLatest: true,
  summary: '我的貼紙紀錄新增可收合的貼紙取得／消耗規則表，依登入會員身分與目前設定顯示實際張數。',
  added: [
    '「我的貼紙＞貼紙紀錄」最上方新增「如何獲得貼紙？ ▼展開」，點一下以表格查看所有貼紙增加與消耗方式，再點一次可收起。',
    '表格會依登入會員身分顯示適用項目，例如白金以上的下線加發扣款、目前獎銜審核獎勵，以及具上傳權限會員的私秘 VIP 費用。'
  ],
  modified: [
    '貼紙規則表直接讀取目前後端設定與錄音貼紙設定；管理員日後修改張數後，會員展開時會看到最新數值。',
    '規則資料採按需載入並在同一次網站使用期間快取，未展開時不增加額外 API 請求。'
  ],
  removed: []
};

const RELEASE_NOTES = [STICKER_GUIDE_RELEASE_NOTES, ORGANIZATION_RELEASE_NOTES, RANK_STICKER_RELEASE_NOTES, STICKER_PAGES_RELEASE_NOTES, HEALTHCHECK_RELEASE_NOTES, CUMULATIVE_RELEASE_NOTES];"""
)
replace_once(
    'tests/changelogReleaseNotes.test.ts',
    r"RELEASE_NOTES = \[ORGANIZATION_RELEASE_NOTES, RANK_STICKER_RELEASE_NOTES, STICKER_PAGES_RELEASE_NOTES, HEALTHCHECK_RELEASE_NOTES, CUMULATIVE_RELEASE_NOTES\]",
    r"RELEASE_NOTES = \[STICKER_GUIDE_RELEASE_NOTES, ORGANIZATION_RELEASE_NOTES, RANK_STICKER_RELEASE_NOTES, STICKER_PAGES_RELEASE_NOTES, HEALTHCHECK_RELEASE_NOTES, CUMULATIVE_RELEASE_NOTES\]"
)

print('v103 sticker guide patch applied')
