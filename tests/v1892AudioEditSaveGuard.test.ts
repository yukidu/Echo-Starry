import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const guard = readFileSync(new URL('../worker/audioEditSaveGuardRouter.ts', import.meta.url), 'utf8');
const stickerRouter = readFileSync(new URL('../worker/stickerRouter.ts', import.meta.url), 'utf8');

test('v189.2 recognizes a no-change audio edit without treating bookkeeping fields as edits', () => {
  assert.match(guard, /IGNORED_NOOP_FIELDS = new Set\(\['userEmail', 'stickerOperationId'\]\)/);
  assert.match(guard, /request\.method\.toUpperCase\(\) === 'PUT'/);
  assert.match(guard, /\^\\\/api\\\/tracks\\\/\[\^\/\]\+\$/);
});

test('v189.2 routes no-change saves through the canonical partial update instead of sticker empty batch', () => {
  assert.match(guard, /NOOP_MARKER/);
  assert.match(guard, /rewriteJsonRequest/);
  assert.match(guard, /return appWorker\.fetch/);
  assert.match(stickerRouter, /if \(!isCreate && functionalKeys\.length === 0\) \{\s*await db\.batch\(statements\)/);
});

test('v189.2 leaves real edits untouched', () => {
  assert.match(guard, /if \(editableKeys\.length > 0\) \{\s*return appWorker\.fetch\(request, env\)/);
  assert.match(guard, /import appWorker from '\.\/privacyCrawlerRouter'/);
});