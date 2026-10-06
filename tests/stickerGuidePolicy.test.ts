import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStickerGuideRows, type StickerGuidePayload } from '../src/stickerGuidePolicy';

const base: StickerGuidePayload = {
  initialReward: 6,
  settings: {
    profileReward: 10,
    luckyCompleteReward: 12,
    luckyDailyLimit: 3,
    ratingReward: 0.1,
    likeReward: 0.1,
    keywordReward: 0.1,
    keywordRewardLimit: 1,
    commentThreadLimit: 20,
    replyReward: 0.1,
    luckyCost: 0.1,
    vipUploadCost: 0.1
  },
  rankReward: null,
  canGrant: false,
  isSuperAdmin: false,
  canUploadVip: false
};

const tracks = [
  { stickerUnlockCost: 3, commentStickerReward: 2 },
  { stickerUnlockCost: 8, commentStickerReward: 10 }
];

test('regular member guide lists current reward and spend amounts from rules and tracks', () => {
  const rows = buildStickerGuideRows(base, tracks);
  assert.equal(rows.find(row => row.behavior === '完整填寫個人資料')?.amount, '+10 張');
  assert.equal(rows.find(row => row.behavior === '100%聽完後分享心得')?.amount, '+2～10 張');
  assert.equal(rows.find(row => row.behavior === '用貼紙解鎖錄音')?.amount, '-3～8 張');
  assert.equal(rows.find(row => row.behavior === '💫召喚繁星解答')?.amount, '-0.1 張');
  assert.equal(rows.some(row => row.behavior === '人工加貼紙給自己的下線'), false);
});

test('approved platinum guide includes rank reward and personal debit for downline grants', () => {
  const rows = buildStickerGuideRows({ ...base, canGrant: true, rankReward: { tier: 'platinum', label: '白金以上', amount: 100 } }, tracks);
  assert.equal(rows.find(row => row.behavior === '白金以上獎銜審核通過')?.amount, '+100 張');
  assert.equal(rows.find(row => row.behavior === '人工加貼紙給自己的下線')?.amount, '-1～5 張');
});

test('super admin guide does not claim sticker unlock or downline grant deductions', () => {
  const rows = buildStickerGuideRows({ ...base, isSuperAdmin: true, canGrant: true, canUploadVip: true }, tracks);
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
