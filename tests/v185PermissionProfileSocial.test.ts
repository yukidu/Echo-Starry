import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canAppearInHomeForViewer } from '../src/trackVisibilityPolicy';
import { canGuestPlayPublicShare, isVisibleOnGuestHome } from '../src/visitorTrackPolicy';
import { missingProfileFields } from '../shared/profileCompletion';

const restricted = { requiredRank: '白金', authorizedOnlyVisible: true, stickerUnlockCost: 0 };

test('只對有權限者顯示：訪客與無權限會員完全隱藏', () => {
  assert.equal(canAppearInHomeForViewer(restricted, false, false), false);
  assert.equal(canAppearInHomeForViewer(restricted, true, false), false);
  assert.equal(canAppearInHomeForViewer(restricted, true, true), true);
  assert.equal(isVisibleOnGuestHome({ requiredRank: '無', authorizedOnlyVisible: true, stickerUnlockCost: 0 }), false);
  assert.equal(canGuestPlayPublicShare({ requiredRank: '無', authorizedOnlyVisible: true }, true, true), false);
});

test('個人資料完善：phone 與 email 都不是獎勵必要欄位', () => {
  const profile = {
    name: '測試會員', avatar: 'x', amwayId: '123', residence: '臺北', center: '無', rank: '3%',
    joinReason: '事業', stayReason: '事業', sponsor: 'A', platinumUpline: 'B', diamondUpline: 'C', birthday: '1990-01-01',
    phone: '', email: ''
  };
  assert.deepEqual(missingProfileFields(profile), []);
});

test('舊音檔未設定新旗標時維持原本顯示行為', () => {
  assert.equal(canAppearInHomeForViewer({}, false, false), true);
});


test('固定 Preview 使用 preview 環境標記但共用正式 D1/R2/KV', () => {
  const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
  assert.match(wrangler, /\[previews\.vars\][\s\S]*ENVIRONMENT = "preview"/);
  assert.equal((wrangler.match(/database_id = "e0a696a9-0233-4186-be4d-229435b19a27"/g) || []).length, 2);
  assert.equal((wrangler.match(/bucket_name = "echoes-audio-bucket"/g) || []).length, 2);
  assert.equal((wrangler.match(/id = "a2e345e244cb40b4a804be3f89584b90"/g) || []).length, 2);
});
