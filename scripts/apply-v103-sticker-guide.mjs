import { existsSync, readFileSync, writeFileSync } from 'node:fs';

function replaceOnce(path, before, after) {
  const source = readFileSync(path, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected exactly one anchor, found ${count}`);
  writeFileSync(path, source.replace(before, after));
}

function createNew(path, content) {
  if (existsSync(path)) throw new Error(`${path}: file already exists`);
  writeFileSync(path, content);
}

createNew('src/stickerGuidePolicy.ts', `import { formatStickerAmount } from '../shared/stickers';

export type StickerGuideSettings = {
  profileReward: number;
  luckyCompleteReward: number;
  luckyDailyLimit: number;
  ratingReward: number;
  likeReward: number;
  keywordReward: number;
  keywordRewardLimit: number;
  commentThreadLimit: number;
  replyReward: number;
  luckyCost: number;
  vipUploadCost: number;
};

export type StickerGuidePayload = {
  initialReward: number;
  settings: StickerGuideSettings;
  rankReward: { tier: string; label: string; amount: number } | null;
  canGrant: boolean;
  isSuperAdmin: boolean;
  canUploadVip: boolean;
};

export type StickerGuideTrack = {
  stickerUnlockCost?: number | null;
  commentStickerReward?: number | null;
};

export type StickerGuideRow = {
  kind: '增加' | '消耗';
  behavior: string;
  amount: string;
  detail: string;
};

function amount(value: number, sign: '+' | '-') {
  return \`${'${sign}'}${'${formatStickerAmount(value)}'} 張\`;
}

function range(values: number[], sign: '+' | '-') {
  const sorted = [...new Set(values.map(Number).filter(value => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (sorted.length === 1) return amount(sorted[0], sign);
  return \`${'${sign}'}${'${formatStickerAmount(sorted[0])}'}～${'${formatStickerAmount(sorted[sorted.length - 1])}'} 張\`;
}

export function buildStickerGuideRows(guide: StickerGuidePayload, tracks: StickerGuideTrack[]): StickerGuideRow[] {
  const settings = guide.settings;
  const commentRange = range(tracks.map(track => Number(track.commentStickerReward || 0)), '+') || '+0 張';
  const unlockRange = range(tracks.map(track => Number(track.stickerUnlockCost || 0)), '-');
  const rows: StickerGuideRow[] = [
    { kind: '增加', behavior: '成為會員', amount: amount(guide.initialReward, '+'), detail: '每個會員帳號一次。' },
    { kind: '增加', behavior: '完整填寫個人資料', amount: amount(settings.profileReward, '+'), detail: '完整填寫所有必要欄位後，每位會員一次。' },
    { kind: '增加', behavior: '首次評價錄音', amount: amount(settings.ratingReward, '+'), detail: '同一支錄音首次有效評價。' },
    { kind: '增加', behavior: '按讚錄音或他人心得', amount: amount(settings.likeReward, '+'), detail: '首次有效按讚；自己的內容不能靠互動取得貼紙。' },
    { kind: '增加', behavior: '新增網友關鍵字', amount: \`${'${amount(settings.keywordReward, "+")}'}／次\`, detail: \`每人每支錄音最多 ${'${amount(settings.keywordRewardLimit, "+")}'}。\` },
    { kind: '增加', behavior: '100%聽完後分享心得', amount: commentRange, detail: \`依各錄音設定；本人心得＋回覆他人心得合計，每支錄音最多 ${'${amount(settings.commentThreadLimit, "+")}'}。\` },
    { kind: '增加', behavior: '回覆他人心得', amount: \`${'${amount(settings.replyReward, "+")}'}／則\`, detail: \`與本人心得共用每支錄音 ${'${amount(settings.commentThreadLimit, "+")}'} 上限。\` },
    { kind: '增加', behavior: '召喚繁星抽中後當日聽完', amount: amount(settings.luckyCompleteReward, '+'), detail: \`同一錄音不重複，每日最多 ${'${formatStickerAmount(settings.luckyDailyLimit)}'} 次。\` },
    { kind: '增加', behavior: '上手人工加貼紙', amount: '+1～5 張', detail: '由有資格的上手依規則發放。' }
  ];

  if (guide.rankReward) {
    rows.push({
      kind: '增加',
      behavior: `${'${guide.rankReward.label}'}獎銜審核通過`,
      amount: amount(guide.rankReward.amount, '+'),
      detail: '同一級別只發一次；升到更高級別並審核通過可再領該級別獎勵。'
    });
  }

  if (!guide.isSuperAdmin && unlockRange) {
    rows.push({ kind: '消耗', behavior: '用貼紙解鎖錄音', amount: unlockRange, detail: '依各錄音設定；貼紙不能越過獎銜或私秘 VIP 權限。' });
  }
  rows.push({ kind: '消耗', behavior: '💫召喚繁星解答', amount: amount(settings.luckyCost, '-'), detail: '每次召喚扣除一次。' });
  if (guide.canUploadVip) {
    rows.push({ kind: '消耗', behavior: '建立私秘 VIP 錄音', amount: amount(settings.vipUploadCost, '-'), detail: '只有具備音檔上傳權限的會員會顯示此項。' });
  }
  if (guide.canGrant && !guide.isSuperAdmin) {
    rows.push({ kind: '消耗', behavior: '人工加貼紙給自己的下線', amount: '-1～5 張', detail: '每次發放多少張，就從自己的貼紙餘額扣除多少張。' });
  }
  rows.push({ kind: '消耗', behavior: '刪除曾取得獎勵的心得／回覆', amount: '-原已領張數', detail: '刪除已領過貼紙的內容時，原獎勵會被扣回。' });
  return rows;
}
`);

createNew('src/components/StickerGuideTable.tsx', `import React, { useMemo, useState } from 'react';
import type { Track, UserProfile } from '../types';
import { buildStickerGuideRows, type StickerGuidePayload } from '../stickerGuidePolicy';

const guideCache = new Map<string, StickerGuidePayload>();

export function StickerGuideTable({ currentUser, tracks }: { currentUser: UserProfile; tracks: Track[] }) {
  const [expanded, setExpanded] = useState(false);
  const [guide, setGuide] = useState<StickerGuidePayload | null>(() => guideCache.get(currentUser.id) || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const rows = useMemo(() => guide ? buildStickerGuideRows(guide, tracks) : [], [guide, tracks]);

  const loadGuide = async () => {
    if (guide || loading) return;
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/stickers/guide');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '無法讀取貼紙規則');
      guideCache.set(currentUser.id, data.guide);
      setGuide(data.guide);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '無法讀取貼紙規則');
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !guide && !loading) void loadGuide();
  };

  return <section className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800/60">
    <button type="button" onClick={toggle} aria-expanded={expanded} className="w-full px-3 py-3 flex items-center justify-between gap-3 text-left font-black">
      <span>如何獲得貼紙？</span>
      <span className="text-xs whitespace-nowrap" style={{color:'var(--color-primary,#c06c84)'}}>{expanded ? '▲收起' : '▼展開'}</span>
    </button>
    {expanded && <div className="border-t border-slate-200 dark:border-slate-700 p-2">
      {loading && <p role="status" className="py-4 text-center text-xs text-slate-400">讀取目前貼紙規則中…</p>}
      {error && <p role="alert" className="p-2 rounded-xl bg-rose-50 text-rose-700 text-xs">{error}</p>}
      {guide && <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-xs border-collapse">
          <thead><tr className="text-left text-slate-500 dark:text-slate-400"><th className="p-2">類型</th><th className="p-2">行為</th><th className="p-2 whitespace-nowrap">貼紙變化</th><th className="p-2">條件／限制</th></tr></thead>
          <tbody>{rows.map((row, index) => <tr key={`${'${row.kind}'}-${'${row.behavior}'}-${'${index}'}`} className="border-t border-slate-200 dark:border-slate-700 align-top">
            <td className="p-2 font-bold whitespace-nowrap">{row.kind}</td>
            <td className="p-2 font-bold">{row.behavior}</td>
            <td className={`p-2 text-base font-black whitespace-nowrap ${'${row.kind === "增加" ? "text-red-500" : "text-emerald-500"}'}`}>{row.amount}</td>
            <td className="p-2 leading-relaxed text-slate-600 dark:text-slate-300">{row.detail}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </div>}
  </section>;
}
`);

createNew('tests/stickerGuidePolicy.test.ts', `import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStickerGuideRows, type StickerGuidePayload } from '../src/stickerGuidePolicy';

const base: StickerGuidePayload = {
  initialReward: 6,
  settings: { profileReward: 10, luckyCompleteReward: 12, luckyDailyLimit: 3, ratingReward: 0.1, likeReward: 0.1, keywordReward: 0.1, keywordRewardLimit: 1, commentThreadLimit: 20, replyReward: 0.1, luckyCost: 0.1, vipUploadCost: 0.1 },
  rankReward: null,
  canGrant: false,
  isSuperAdmin: false,
  canUploadVip: false
};

const tracks = [{stickerUnlockCost:3,commentStickerReward:2},{stickerUnlockCost:8,commentStickerReward:10}];

test('regular member guide lists current reward and spend amounts from rules and tracks', () => {
  const rows = buildStickerGuideRows(base, tracks);
  assert.equal(rows.find(row => row.behavior === '完整填寫個人資料')?.amount, '+10 張');
  assert.equal(rows.find(row => row.behavior === '100%聽完後分享心得')?.amount, '+2～10 張');
  assert.equal(rows.find(row => row.behavior === '用貼紙解鎖錄音')?.amount, '-3～8 張');
  assert.equal(rows.find(row => row.behavior === '💫召喚繁星解答')?.amount, '-0.1 張');
  assert.equal(rows.some(row => row.behavior === '人工加貼紙給自己的下線'), false);
});

test('approved platinum guide includes rank reward and personal debit for downline grants', () => {
  const rows = buildStickerGuideRows({...base,canGrant:true,rankReward:{tier:'platinum',label:'白金以上',amount:100}}, tracks);
  assert.equal(rows.find(row => row.behavior === '白金以上獎銜審核通過')?.amount, '+100 張');
  assert.equal(rows.find(row => row.behavior === '人工加貼紙給自己的下線')?.amount, '-1～5 張');
});

test('super admin guide does not claim sticker unlock or downline grant deductions', () => {
  const rows = buildStickerGuideRows({...base,isSuperAdmin:true,canGrant:true,canUploadVip:true}, tracks);
  assert.equal(rows.some(row => row.behavior === '用貼紙解鎖錄音'), false);
  assert.equal(rows.some(row => row.behavior === '人工加貼紙給自己的下線'), false);
  assert.equal(rows.find(row => row.behavior === '建立私秘 VIP 錄音')?.amount, '-0.1 張');
});

test('history page mounts the collapsible guide and backend exposes a signed-in personalized guide endpoint', () => {
  const modal = readFileSync(new URL('../src/components/StickersModal.tsx', import.meta.url), 'utf8');
  const table = readFileSync(new URL('../src/components/StickerGuideTable.tsx', import.meta.url), 'utf8');
  const router = readFileSync(new URL('../worker/stickerRouter.ts', import.meta.url), 'utf8');
  assert.match(modal, /<StickerGuideTable currentUser=\{currentUser\} tracks=\{tracks\}\/>/);
  assert.match(table, /如何獲得貼紙？/);
  assert.match(table, /▼展開/);
  assert.match(table, /▲收起/);
  assert.match(table, /<table/);
  assert.match(router, /\/api\/stickers\/guide/);
  assert.match(router, /rankReward:/);
});
`);

replaceOnce('src/components/StickersModal.tsx',
  "import { ThemedSelect } from './ThemedSelect';",
  "import { ThemedSelect } from './ThemedSelect';\nimport { StickerGuideTable } from './StickerGuideTable';"
);
replaceOnce('src/components/StickersModal.tsx',
  "{tab==='history' && <><div className=\"rounded-2xl p-3 text-white text-center\" style={primary}",
  "{tab==='history' && <><StickerGuideTable currentUser={currentUser} tracks={tracks}/><div className=\"rounded-2xl p-3 text-white text-center\" style={primary}"
);

replaceOnce('worker/stickerRouter.ts',
  "  if (!actor) return json({ error: '貼紙為會員專屬，請先登入' }, 401);\n  await ensureInitialStickers(db, actor.id);",
  `  if (!actor) return json({ error: '貼紙為會員專屬，請先登入' }, 401);\n  if (path === '/api/stickers/guide' && method === 'GET') {\n    const values = await settingMap(db);\n    const tier = actor.rankApproved ? rankRewardTier(actor.approvedRank || actor.rank) : null;\n    const rankUnits = tier ? rankRewardUnits(values, tier) : 0;\n    return json({ guide: {\n      initialReward: unitsToStickers(INITIAL_STICKER_UNITS),\n      settings: settingsForClient(values),\n      rankReward: tier && rankUnits > 0 ? { tier, label: rankRewardLabel(tier), amount: unitsToStickers(rankUnits) } : null,\n      canGrant: canGrantStickers(actor),\n      isSuperAdmin: isSuperAdmin(actor),\n      canUploadVip: isSuperAdmin(actor) || Boolean(actor.canUpload) || Boolean(actor.isContributor)\n    } });\n  }\n  await ensureInitialStickers(db, actor.id);`
);

replaceOnce('public/sw.js', "const CACHE_NAME = 'echostars-shell-v102';", "const CACHE_NAME = 'echostars-shell-v103';");
replaceOnce('tests/releaseIntegrity.test.ts', "test('v102 is the single current PWA cache version', () => {\n  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v102'/);", "test('v103 is the single current PWA cache version', () => {\n  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v103'/);");

replaceOnce('src/changelogReleaseNotes.ts',
  "version: 'v4.2', date: '2026/10/07', isLatest: true,",
  "version: 'v4.2', date: '2026/10/07',"
);
replaceOnce('src/changelogReleaseNotes.ts',
  "const RELEASE_NOTES = [ORGANIZATION_RELEASE_NOTES, RANK_STICKER_RELEASE_NOTES, STICKER_PAGES_RELEASE_NOTES, HEALTHCHECK_RELEASE_NOTES, CUMULATIVE_RELEASE_NOTES];",
  `export const STICKER_GUIDE_RELEASE_NOTES: ChangelogEntry = {\n  version: 'v4.3', date: '2026/10/07', isLatest: true,\n  summary: '我的貼紙紀錄新增可收合的貼紙取得／消耗規則表，依登入會員身分與目前設定顯示實際張數。',\n  added: [\n    '「我的貼紙＞貼紙紀錄」最上方新增「如何獲得貼紙？ ▼展開」，點一下以表格查看所有貼紙增加與消耗方式，再點一次可收起。',\n    '表格會依登入會員身分顯示適用項目，例如白金以上的下線加發扣款、目前獎銜審核獎勵，以及具上傳權限會員的私秘 VIP 費用。'\n  ],\n  modified: [\n    '貼紙規則表直接讀取目前後端設定與錄音貼紙設定；管理員日後修改張數後，會員展開時會看到最新數值。',\n    '規則資料採按需載入並在同一次網站使用期間快取，未展開時不增加額外 API 請求。'\n  ],\n  removed: []\n};\n\nconst RELEASE_NOTES = [STICKER_GUIDE_RELEASE_NOTES, ORGANIZATION_RELEASE_NOTES, RANK_STICKER_RELEASE_NOTES, STICKER_PAGES_RELEASE_NOTES, HEALTHCHECK_RELEASE_NOTES, CUMULATIVE_RELEASE_NOTES];`
);
replaceOnce('tests/changelogReleaseNotes.test.ts',
  "RELEASE_NOTES = \\[ORGANIZATION_RELEASE_NOTES, RANK_STICKER_RELEASE_NOTES, STICKER_PAGES_RELEASE_NOTES, HEALTHCHECK_RELEASE_NOTES, CUMULATIVE_RELEASE_NOTES\\]",
  "RELEASE_NOTES = \\[STICKER_GUIDE_RELEASE_NOTES, ORGANIZATION_RELEASE_NOTES, RANK_STICKER_RELEASE_NOTES, STICKER_PAGES_RELEASE_NOTES, HEALTHCHECK_RELEASE_NOTES, CUMULATIVE_RELEASE_NOTES\\]"
);

console.log('v103 sticker guide integration applied');
