import { formatStickerAmount } from '../shared/stickers';

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
  earningMultiplier: number;
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
  return `${sign}${formatStickerAmount(value)} 張`;
}

function range(values: number[], sign: '+' | '-') {
  const sorted = [...new Set(values.map(Number).filter(value => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (sorted.length === 1) return amount(sorted[0], sign);
  return `${sign}${formatStickerAmount(sorted[0])}～${formatStickerAmount(sorted[sorted.length - 1])} 張`;
}

export function buildStickerGuideRows(guide: StickerGuidePayload, tracks: StickerGuideTrack[]): StickerGuideRow[] {
  const settings = guide.settings;
  const multiplier = Number.isFinite(Number(guide.earningMultiplier)) ? Math.max(0, Number(guide.earningMultiplier)) : 1;
  const earned = (value: number) => Number((Number(value || 0) * multiplier).toFixed(1));
  const commentRange = range(tracks.map(track => earned(Number(track.commentStickerReward || 0))), '+') || '+0 張';
  const unlockRange = range(tracks.map(track => Number(track.stickerUnlockCost || 0)), '-');
  const rows: StickerGuideRow[] = [
    { kind: '增加', behavior: '成為會員', amount: amount(guide.initialReward, '+'), detail: '每個會員帳號一次。' },
    { kind: '增加', behavior: '完整填寫個人資料', amount: amount(earned(settings.profileReward), '+'), detail: '完整填寫所有必要欄位後，每位會員一次。' },
    { kind: '增加', behavior: '首次評價錄音', amount: amount(earned(settings.ratingReward), '+'), detail: '同一支錄音首次有效評價。' },
    { kind: '增加', behavior: '按讚錄音或他人心得', amount: amount(earned(settings.likeReward), '+'), detail: '首次有效按讚；自己的內容不能靠互動取得貼紙。' },
    { kind: '增加', behavior: '新增網友關鍵字', amount: `${amount(earned(settings.keywordReward), '+')}／次`, detail: `每人每支錄音最多 ${amount(earned(settings.keywordRewardLimit), '+')}。` },
    { kind: '增加', behavior: '100%聽完後分享心得', amount: commentRange, detail: `依各錄音設定；本人心得＋回覆他人心得合計，每支錄音最多 ${amount(earned(settings.commentThreadLimit), '+')}。` },
    { kind: '增加', behavior: '回覆他人心得', amount: `${amount(earned(settings.replyReward), '+')}／則`, detail: `與本人心得共用每支錄音 ${amount(earned(settings.commentThreadLimit), '+')} 上限。` },
    { kind: '增加', behavior: '召喚繁星抽中後當日聽完', amount: amount(earned(settings.luckyCompleteReward), '+'), detail: `同一錄音不重複，每日最多 ${formatStickerAmount(settings.luckyDailyLimit)} 次。` },
    { kind: '增加', behavior: '上手人工加貼紙', amount: '+1～5 張', detail: '人工加貼紙不套用白金級以上獲取倍數；加幾張就實際收到幾張。' }
  ];

  if (multiplier !== 1) {
    rows.unshift({ kind: '增加', behavior: '白金級以上獲取貼紙倍數', amount: `×${formatStickerAmount(multiplier)}`, detail: '目前會員已套用此倍數；一般系統獎勵會乘倍數，獎銜審核獎勵與人工加貼紙例外。' });
  }

  if (guide.rankReward) {
    rows.push({
      kind: '增加',
      behavior: `${guide.rankReward.label}獎銜審核通過`,
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
