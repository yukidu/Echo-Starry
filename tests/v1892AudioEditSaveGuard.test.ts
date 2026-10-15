import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const privacyRouter = readFileSync(new URL('../worker/privacyCrawlerRouter.ts', import.meta.url), 'utf8');
const stickerRouter = readFileSync(new URL('../worker/legacyStickerRouter.ts', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

test('v189.2 recognizes a no-change audio edit without treating bookkeeping fields as edits', () => {
  assert.match(privacyRouter, /NOOP_EDIT_BOOKKEEPING_FIELDS = new Set\(\['userEmail', 'stickerOperationId'\]\)/);
  assert.match(privacyRouter, /request\.method\.toUpperCase\(\) !== 'PUT'/);
  assert.match(privacyRouter, /!\/\^\\\/api\\\/tracks\\\/\[\^\/\]\+\$\/\.test\(url\.pathname\)/);
});

test('v189.2 routes a no-change save through the canonical partial-update path', () => {
  assert.match(privacyRouter, /NOOP_EDIT_MARKER = '__ECHOSTARS_NOOP_EDIT_SAVE__'/);
  assert.match(privacyRouter, /const appRequest = await rewriteNoopTrackEditRequest\(request\)/);
  assert.match(privacyRouter, /\[NOOP_EDIT_MARKER\]: true/);
  assert.match(stickerRouter, /delete cleanBody\.stickerOperationId/);
  assert.match(stickerRouter, /const functionalKeys = Object\.keys\(cleanBody\)\.filter\(key => key !== 'userEmail'\)/);
});

test('v189.2 leaves real edits untouched and preserves the current Worker wrapper chain', () => {
  assert.match(privacyRouter, /if \(editableKeys\.length > 0\) return request/);
  assert.match(wrangler, /main = "worker\/starryMainInlineLoginRouter\.ts"/);
  assert.doesNotMatch(wrangler, /audioEditSaveGuardRouter/);
});
