import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const audioCard = readFileSync(new URL('../src/components/AudioCard.tsx', import.meta.url), 'utf8');

test('listening progress badges use the current palette primary color', () => {
  const primaryBackgroundMatches = audioCard.match(/backgroundColor:\s*'var\(--color-primary, #c06c84\)'/g) || [];
  assert.ok(primaryBackgroundMatches.length >= 2, 'completed and partial listening badges should both use the theme primary color');
  assert.doesNotMatch(audioCard, /bg-emerald-600\/95/);
  assert.doesNotMatch(audioCard, /bg-blue-600\/95/);
});

test('portrait access label text is always white and guests do not see sticker costs', () => {
  assert.match(audioCard, /收聽權限：\$\{isGuest \? displayRequiredRank : permissionStickerLabel\}/);
  assert.match(audioCard, /\{!isGuest && stickerUnlockCost>0/);
  assert.match(audioCard, /font-black text-white/);
  assert.doesNotMatch(audioCard, /text-amber-300/);
});
