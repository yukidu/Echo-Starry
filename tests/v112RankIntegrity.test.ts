import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { effectiveMemberRank } from '../src/utils/ranks';
import { HIDDEN_BALANCE_TARGETS_V112 } from '../worker/hiddenStickerBalanceCorrection';

test('effective member rank matches backend official-rank semantics', () => {
  assert.equal(effectiveMemberRank({rank:'鑽石級以上',approvedRank:'無',rankApproved:true} as any), '無');
  assert.equal(effectiveMemberRank({rank:'翡翠',approvedRank:'翡翠',rankApproved:true} as any), '翡翠');
  assert.equal(effectiveMemberRank({rank:'18%',approvedRank:'15%',rankApproved:false} as any), '18%');
});

test('all v112 production sticker targets are exact and non-negative', () => {
  assert.deepEqual(HIDDEN_BALANCE_TARGETS_V112.map(x=>x.targetUnits).sort((a,b)=>a-b), [2061,3060,3160]);
  assert.ok(HIDDEN_BALANCE_TARGETS_V112.every(x => Number.isInteger(x.targetUnits) && x.targetUnits >= 0));
});

test('sticker correction is visible as system error fix but excluded from earned/spent/toast', () => {
  const router=readFileSync(new URL('../worker/stickerRouter.ts', import.meta.url),'utf8');
  const modal=readFileSync(new URL('../src/components/StickersModal.tsx', import.meta.url),'utf8');
  assert.match(router,/系統錯誤修正/);
  assert.match(modal,/balance_correction:'系統錯誤修正'/);
  assert.match(router,/t\.type <> 'balance_correction' AND t\.deltaUnits > 0/);
  assert.match(router,/t\.type <> 'balance_correction' AND t\.deltaUnits < 0/);
  assert.match(router,/type NOT IN \('initial','balance_correction'\)/);
});

test('requested UI styling is locked in', () => {
  const css=readFileSync(new URL('../src/components/Navbar.css', import.meta.url),'utf8');
  const guide=readFileSync(new URL('../src/components/StickerGuideTable.tsx', import.meta.url),'utf8');
  assert.match(css,/content: "（未安裝）"/);
  assert.match(css,/aria-label="貼紙簿分頁"/);
  assert.match(css,/overflow-x: auto/);
  assert.match(guide,/border-amber-200/);
  assert.match(guide,/bg-amber-50/);
  assert.match(guide,/text-amber-900/);
});
