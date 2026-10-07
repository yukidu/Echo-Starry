import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stats=readFileSync(new URL('../src/components/StatisticsView.tsx',import.meta.url),'utf8');
const tab=readFileSync(new URL('../src/components/StickerLeaderboardTab.tsx',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker/stickerRouter.ts',import.meta.url),'utf8');

test('leaderboard adds the sticker ranking tab with top-20 ledger metrics and member card action',()=>{
  assert.match(stats,/貼紙排位賽/);
  assert.match(stats,/activeTab === 'stickers'/);
  assert.match(stats,/sm:grid-cols-5/);
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
