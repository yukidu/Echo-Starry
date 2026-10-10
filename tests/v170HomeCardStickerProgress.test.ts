import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const card = readFileSync(new URL('../src/components/AudioCard.tsx', import.meta.url), 'utf8');

test('home audio-card progress text stays compact without display spaces', () => {
  assert.match(card, /已聽\{guestProgressPercent\}%/);
  assert.match(card, /已聽\{Math\.round\(progressRatio \* 100\)\}%｜聽完/);
  assert.doesNotMatch(card, /已聽 \{guestProgressPercent\}%/);
  assert.doesNotMatch(card, /已聽 \{Math\.round\(progressRatio \* 100\)\}%/);
  assert.doesNotMatch(card, /<\/span> 張貼紙/);
});

test('earned stickers are red, spent stickers are green, and the unit label is white', () => {
  assert.match(card, /className="text-red-500">\+\{track\.commentStickerReward \|\| 0\}<\/span><span className="text-white">張貼紙<\/span>/);
  assert.match(card, /className="text-emerald-300">-\{stickerUnlockCost\}<\/span><span className="text-white">張貼紙<\/span>/);
  assert.doesNotMatch(card, /text-amber-200/);
});
