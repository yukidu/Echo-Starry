from pathlib import Path

# 1) Sticker backend: leaderboard aggregation + privacy-aware search.
p = Path('worker/stickerRouter.ts')
text = p.read_text()
helper_marker = "\nasync function handleStickerApi(request: Request, env: Env, actor: any): Promise<Response | null> {\n"
assert text.count(helper_marker) == 1, text.count(helper_marker)
helper = r'''
async function stickerLeaderboard(db: any, actor: any, rawQuery: string) {
  const query = String(rawQuery || '').trim().slice(0, 120);
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
  const publicSearchFields = [
    'u.name','u.center','u.rank','u.approvedRank','u.role','u.joinReason','u.stayReason',
    'u.sponsor','u.platinumUpline','u.diamondUpline','u.residence','u.zodiac',
    'u.talentNumber','u.lifeNumber','u.registerDate'
  ];
  const memberOnlySearchFields = [
    'u.email','u.amwayId','u.phone','u.birthday','u.birthDate','u.notes',
    'u.rankUpdatedAt','u.auditedBy','u.auditedAt'
  ];
  const searchFields = actor ? [...publicSearchFields, ...memberOnlySearchFields] : publicSearchFields;
  const clauses = tokens.map(() => `(${searchFields.map(field => `LOWER(COALESCE(CAST(${field} AS TEXT), '')) LIKE ?`).join(' OR ')})`);
  const params = tokens.flatMap(token => searchFields.map(() => `%${token}%`));
  const whereSearch = clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
  const sql = `SELECT
      u.id,u.name,u.avatar,u.center,u.residence,u.joinReason,u.stayReason,u.sponsor,u.platinumUpline,u.diamondUpline,u.zodiac,
      CASE WHEN COALESCE(u.rankApproved,0)=1 THEN COALESCE(NULLIF(u.approvedRank,''),u.rank,'無') ELSE COALESCE(u.rank,'無') END AS effectiveRank,
      COALESCE(SUM(t.deltaUnits),0) AS balanceUnits,
      COALESCE(SUM(CASE WHEN t.deltaUnits > 0 THEN t.deltaUnits ELSE 0 END),0) AS earnedUnits,
      COALESCE(SUM(CASE WHEN t.deltaUnits < 0 THEN -t.deltaUnits ELSE 0 END),0) AS spentUnits
    FROM users u
    LEFT JOIN sticker_transactions t ON t.userId=u.id
    WHERE COALESCE(u.isBlocked,0)=0
      AND u.email IS NOT NULL AND TRIM(u.email)<>'' AND LOWER(u.email)<>'guest'
      AND u.id NOT LIKE 'guest-%' AND u.name NOT LIKE '訪客%'
      ${whereSearch}
    GROUP BY u.id,u.name,u.avatar,u.center,u.residence,u.joinReason,u.stayReason,u.sponsor,u.platinumUpline,u.diamondUpline,u.zodiac,u.rank,u.approvedRank,u.rankApproved
    ORDER BY balanceUnits DESC, earnedUnits DESC, u.name ASC
    LIMIT 20`;
  const prepared = db.prepare(sql);
  const result = params.length ? await prepared.bind(...params).all() : await prepared.all();
  const rows = result.results || [];
  const entries = rows.map((row: any) => ({
    user: { id: row.id, name: row.name, rank: row.effectiveRank || '無', avatar: row.avatar || '', center: row.center || '' },
    current: unitsToStickers(Number(row.balanceUnits || 0)),
    spent: unitsToStickers(Number(row.spentUnits || 0)),
    earned: unitsToStickers(Number(row.earnedUnits || 0))
  }));
  const cleanQuery = query.toLowerCase();
  const suggestionValues = rows.flatMap((row: any) => [
    row.name,row.effectiveRank,row.center,row.residence,row.joinReason,row.stayReason,
    row.sponsor,row.platinumUpline,row.diamondUpline,row.zodiac
  ]).map((value: any) => String(value || '').trim()).filter(Boolean);
  const matching = cleanQuery
    ? suggestionValues.filter((value: string) => value.toLowerCase().includes(cleanQuery))
    : [];
  const fallbackNames = cleanQuery && matching.length === 0 ? rows.map((row: any) => String(row.name || '').trim()).filter(Boolean) : [];
  const suggestions = [...new Set([...matching, ...fallbackNames])].slice(0, 8);
  return json({ entries, suggestions, searchScope: actor ? 'member' : 'public' });
}
'''
text = text.replace(helper_marker, '\n' + helper + helper_marker, 1)
old = "  if (path === '/api/stickers/public-settings' && method === 'GET') return json({settings:settingsForClient(await settingMap(db))});\n  if (!actor) return json({ error: '貼紙為會員專屬，請先登入' }, 401);\n"
new = "  if (path === '/api/stickers/public-settings' && method === 'GET') return json({settings:settingsForClient(await settingMap(db))});\n  if (path === '/api/stickers/leaderboard' && method === 'GET') return stickerLeaderboard(db, actor, url.searchParams.get('q') || '');\n  if (!actor) return json({ error: '貼紙為會員專屬，請先登入' }, 401);\n"
assert text.count(old) == 1, text.count(old)
text = text.replace(old, new, 1)
p.write_text(text)

# 2) Statistics page: fifth tab and sticker page mount.
p = Path('src/components/StatisticsView.tsx')
text = p.read_text()
old = "import { calculateNumerology } from '../utils/numerology';\n"
new = old + "import { StickerLeaderboardTab } from './StickerLeaderboardTab';\n"
assert text.count(old) == 1, text.count(old)
text = text.replace(old, new, 1)
old = "export type LeaderboardSubTab = 'model' | 'hot-tracks' | 'members' | 'hot-keywords';"
new = "export type LeaderboardSubTab = 'model' | 'hot-tracks' | 'members' | 'stickers' | 'hot-keywords';"
assert text.count(old) == 1, text.count(old)
text = text.replace(old, new, 1)
text = text.replace('grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1.5 bg-slate-100/90', 'grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1.5 bg-slate-100/90', 1)
button_marker = "        <button\n          type=\"button\"\n          onClick={() => setActiveTab('hot-keywords')}\n"
assert text.count(button_marker) == 1, text.count(button_marker)
sticker_button = '''        <button
          type="button"
          onClick={() => setActiveTab('stickers')}
          className={`py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'stickers'
              ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          <span>貼紙排位賽</span>
        </button>

'''
text = text.replace(button_marker, sticker_button + button_marker, 1)
render_marker = "      {/* SUB-TAB 4: 熱門關鍵字統計 - Requirement 4 (v2.5) */}\n"
assert text.count(render_marker) == 1, text.count(render_marker)
sticker_render = '''      {/* SUB-TAB 4: 貼紙排位賽 */}
      {activeTab === 'stickers' && (
        <StickerLeaderboardTab users={users} onViewMember={onViewMember} />
      )}

'''
text = text.replace(render_marker, sticker_render + render_marker.replace('SUB-TAB 4:', 'SUB-TAB 5:'), 1)
p.write_text(text)

# 3) Regression coverage for real ledger totals + privacy-aware profile search.
p = Path('tests/stickerTransactions.test.ts')
text = p.read_text()
marker = "\ntest('parallel unlock is permanent, charges once and cannot bypass rank or VIP', async () => {\n"
assert text.count(marker) == 1, text.count(marker)
test_block = r'''

test('sticker leaderboard sorts by current balance, totals earned/spent, and searches profile fields without leaking sensitive suggestions', async () => {
  const db=database();
  db.sqlite.exec("UPDATE users SET phone='0912345678', amwayId='A12345', birthday='1990-01-02', residence='苗栗' WHERE id='member'");
  const member=await session(db,'member');
  await balance(db,member);
  db.sqlite.exec(`INSERT INTO sticker_transactions(id,userId,deltaUnits,balanceAfterUnits,type,description,uniqueKey,createdAt)
    VALUES ('extra-in','member',100,160,'test_reward','測試收入','lb-in',1),
           ('extra-out','member',-30,130,'test_spend','測試支出','lb-out',2);`);
  const list=await call(db,'','/api/stickers/leaderboard');
  assert.equal(list.status,200);
  assert.ok(list.data.entries.length<=20);
  assert.ok(list.data.entries[0].current>=list.data.entries.at(-1).current);
  const byName=await call(db,member,'/api/stickers/leaderboard?q=%E4%B8%8B%E7%B7%9A');
  assert.equal(byName.data.entries[0].user.id,'member');
  assert.equal(byName.data.entries[0].current,13);
  assert.equal(byName.data.entries[0].earned,16);
  assert.equal(byName.data.entries[0].spent,3);
  const privateSearch=await call(db,member,'/api/stickers/leaderboard?q=0912345678');
  assert.equal(privateSearch.data.entries[0].user.id,'member');
  assert.ok(!privateSearch.data.suggestions.includes('0912345678'));
  const publicPrivateSearch=await call(db,'','/api/stickers/leaderboard?q=0912345678');
  assert.equal(publicPrivateSearch.data.entries.length,0);
  const publicSafeSearch=await call(db,'','/api/stickers/leaderboard?q=%E8%8B%97%E6%A0%97');
  assert.equal(publicSafeSearch.data.entries[0].user.id,'member');
});
'''
text = text.replace(marker, test_block + marker, 1)
p.write_text(text)

# 4) UI policy regression.
p = Path('tests/v106StickerLeaderboard.test.ts')
p.write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stats=readFileSync(new URL('../src/components/StatisticsView.tsx',import.meta.url),'utf8');
const tab=readFileSync(new URL('../src/components/StickerLeaderboardTab.tsx',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker/stickerRouter.ts',import.meta.url),'utf8');

test('leaderboard adds the sticker ranking tab with top-20 ledger metrics and member card action',()=>{
  assert.match(stats,/貼紙排位賽/);
  assert.match(stats,/activeTab === 'stickers'/);
  assert.match(tab,/最多顯示 20 名/);
  assert.match(tab,/現有貼紙/);
  assert.match(tab,/累積已消費/);
  assert.match(tab,/累積已獲得/);
  assert.match(tab,/點擊查看會員資訊卡/);
});

test('sticker ranking search has autocomplete while sensitive profile values stay server-side',()=>{
  assert.match(tab,/搜尋會員基本資料關鍵字/);
  assert.match(tab,/suggestions\.map/);
  assert.match(worker,/u\.phone/);
  assert.match(worker,/u\.amwayId/);
  assert.match(worker,/u\.birthday/);
  assert.match(worker,/searchScope: actor \? 'member' : 'public'/);
  assert.doesNotMatch(tab,/0912345678|amwayId|birthday/);
});
''')

# 5) Changelog + PWA cache update for user-visible page change.
p = Path('src/changelogReleaseNotes.ts')
text = p.read_text()
anchor = "export const PLATINUM_MULTIPLIER_RELEASE_NOTES: ChangelogEntry = {"
assert anchor in text
entry = r'''export const STICKER_LEADERBOARD_RELEASE_NOTES: ChangelogEntry = {
  version: 'v4.4',
  date: '2026-10-07',
  title: '貼紙排位賽與會員搜尋',
  added: [
    '排行榜新增「貼紙排位賽」，列出現有貼紙、累積已消費與累積已獲得總數前 20 名，依現有貼紙排序。',
    '貼紙排位賽可用會員基本資料關鍵字搜尋並顯示關聯詞；點會員姓名可開啟既有會員資訊卡。'
  ],
  modified: [
    '搜尋建議不主動顯示電話、生日、Email、直銷商編號等敏感值；已登入會員仍可用已知資料精確搜尋。'
  ]
};

'''
text = text.replace(anchor, entry + anchor, 1)
# Add new entry to maintained release list if it uses a simple array export.
list_anchor = 'export const CHANGELOG_RELEASE_NOTES: ChangelogEntry[] = ['
if list_anchor in text and 'STICKER_LEADERBOARD_RELEASE_NOTES,' not in text:
    text = text.replace(list_anchor, list_anchor + '\n  STICKER_LEADERBOARD_RELEASE_NOTES,', 1)
p.write_text(text)

p = Path('public/sw.js')
text = p.read_text()
assert "echostars-shell-v104" in text
p.write_text(text.replace('echostars-shell-v104','echostars-shell-v106',1))
