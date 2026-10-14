import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatStickerAmount, INITIAL_STICKER_UNITS, stickersToUnits, unitsToStickers } from '../shared/stickers';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8');

test('貼紙以十分之一整數保存，避免浮點累積誤差', () => {
  assert.equal(INITIAL_STICKER_UNITS, 60);
  assert.equal(stickersToUnits(0.1), 1);
  assert.equal(stickersToUnits(0.3), 3);
  assert.equal(stickersToUnits(3.7), 37);
  assert.equal(unitsToStickers(37), 3.7);
  assert.equal(formatStickerAmount(6), '6');
  assert.equal(formatStickerAmount(3.7), '3.7');
});

test('舊版相容後端保留歷史貼紙帳本、永久解鎖、規則與通知資料表', () => {
  const source = read('worker/legacyStickerRouter.ts');
  for (const contract of [
    'sticker_transactions',
    'sticker_unlocks',
    'sticker_settings',
    'member_notifications',
    "'comment_reward_reversal'",
    "'manual_grant'",
    "'manual_grant_debit'",
    "'rank_approval_reward'",
    "'lucky_cost'",
    "'vip_upload_cost'",
    'keyword_reward_limit',
    'playbackCompleted'
  ]) assert.match(source, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(source, /INITIAL_STICKER_UNITS/);
  assert.match(source, /只有超級管理員可管理貼紙規則/);
  assert.match(source, /白金以上會員只能幫自己的下線會員加貼紙/);
});

test('錄音解鎖貼紙欄位支援 0 到 50 且 0 保留免貼紙語意', () => {
  const types = read('src/types.ts');
  const upload = read('src/components/UploadModal.tsx');
  const card = read('src/components/AudioCard.tsx');
  const detail = read('src/components/DetailView.tsx');
  assert.match(types, /stickerUnlockCost\?: number/);
  assert.match(types, /commentStickerReward\?: number/);
  assert.match(upload, /解鎖本錄音所需貼紙/);
  assert.match(upload, /聽完後留言心得獲得貼紙/);
  assert.match(card, /張貼紙/);
  assert.match(card, /\[已聽100%\]/);
  assert.match(card, /commentRewardClaimed/);
  assert.doesNotMatch(card, /truncate\">\{displayRequiredRank/);
  assert.match(detail, /commentStickerReward/);
  assert.match(read('src/components/CommentsSection.tsx'), /按這裡寫下您的心得收穫/);
});

test('主選單與貼紙專區保留訪客會員界線及超管分頁', () => {
  const navbar = read('src/components/Navbar.tsx');
  const modal = read('src/components/StickersModal.tsx');
  assert.match(navbar, /stickerMenuTitle = currentUser[\s\S]*: '我的貼紙'/);
  assert.match(navbar, /我的貼紙/);
  assert.match(modal, /批次修改/);
  assert.match(modal, /其他/);
  assert.match(modal, /人工加貼紙/);
  assert.match(modal, /keywordRewardLimit/);
});

test('舊貼紙相容層仍經共同組織層再進入 session cookie 後端驗證，且刪會員同步清理舊資料', () => {
  const categoryRouter = read('worker/categoryIntegrityRouter.ts');
  const organizationRouter = read('worker/organizationRouter.ts');
  const deleteRouter = read('worker/adminUserDeleteRouter.ts');
  assert.match(categoryRouter, /\.\/organizationRouter/);
  assert.match(organizationRouter, /\.\/stickerRouter/);
  for (const table of ['sticker_transactions', 'sticker_unlocks', 'member_notifications']) {
    assert.match(deleteRouter, new RegExp(table));
  }
});
