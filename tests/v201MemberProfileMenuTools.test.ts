import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const audio = readFileSync(new URL('../src/components/AudioCard.tsx', import.meta.url), 'utf8');
const dislike = readFileSync(new URL('../src/v181HomeToolbarDislike.ts', import.meta.url), 'utf8');
const dislikeCss = readFileSync(new URL('../src/v181HomeToolbarDislike.css', import.meta.url), 'utf8');
const stickers = readFileSync(new URL('../src/components/StickersModal.tsx', import.meta.url), 'utf8');
const shared = readFileSync(new URL('../shared/stickers.ts', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../worker/legacyStickerRouter.ts', import.meta.url), 'utf8');
const organization = readFileSync(new URL('../worker/organizationModel.ts', import.meta.url), 'utf8');

test('homepage card menu uses the requested compact copy and matching text size', () => {
  assert.match(audio, />詳細內容<\/span>/);
  assert.match(audio, /'加入收藏'/);
  assert.match(dislike, /label\.textContent = '不喜歡他'/);
  assert.match(dislikeCss, /font-size: 0\.875rem;[\s\S]*line-height: 1\.25rem;/);
});

test('Platinum tools use one shared legacy-safe eligibility rule in UI and legacy backend', () => {
  assert.match(shared, /function isPlatinumToolsEligible/);
  assert.match(shared, /auditStatus === 'pending'/);
  assert.match(stickers, /isPlatinumToolsEligible\(currentUser\)/);
  assert.match(backend, /isSuperAdmin\(actor\) \|\| isPlatinumToolsEligible\(actor\)/);
  assert.match(backend, /\/api\/stickers\/platinum-tools-audit/);
});

test('downline binding rejects any member already at Platinum or above', () => {
  assert.match(organization, /isPlatinumOrAboveRank\(target\.rank\) \|\| isPlatinumOrAboveRank\(target\.approvedRank\)/);
  assert.match(organization, /白金或白金以上會員不可綁定成為下線/);
});
