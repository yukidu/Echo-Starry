import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const source = readFileSync(join(root, 'worker/starryIdV212PublicCardBridge.ts'), 'utf8');

test('v252 persists per-member layout and a single global default', () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS public_card_layouts/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS public_card_layout_defaults/);
  assert.match(source, /mobileColumns INTEGER NOT NULL DEFAULT 1 CHECK\(mobileColumns BETWEEN 1 AND 3\)/);
  assert.match(source, /setAsGlobalDefault/);
  assert.match(source, /只有超級管理員可以設定全體預設值/);
});

test('v252 my-card supports touch dragging and one to three mobile columns', () => {
  assert.match(source, /pointerdown/);
  assert.match(source, /pointermove/);
  assert.match(source, /pointerup/);
  assert.match(source, /touch-action:none/);
  assert.match(source, /手機每列/);
  assert.match(source, /設定為全體預設值/);
  assert.match(source, /repeat\(var\(--v252-mobile-columns,1\),minmax\(0,1fr\)\)/);
  assert.doesNotMatch(source, /new MutationObserver/);
});

test('v252 public card mirrors member order and mobile density', () => {
  assert.match(source, /data-v252-key/);
  assert.match(source, /style="order:/);
  assert.match(source, /v252-public-layout/);
  assert.match(source, /grid-template-columns:repeat\(\$\{layout\.mobileColumns\}/);
});

test('v252 deduplicates and warms the slow session and card-settings reads', () => {
  assert.match(source, /v252-fast-load/);
  assert.match(source, /u\.pathname!=='\/api\/session'/);
  assert.match(source, /u\.pathname!=='\/api\/card-settings'/);
  assert.match(source, /__v252WarmCardSettings/);
  assert.match(source, /r\.clone\(\)/);
});
