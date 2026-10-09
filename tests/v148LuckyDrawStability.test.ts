import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const observers = [
  '../src/v141HomeVisualRefresh.ts',
  '../src/v143FavoriteCountCtaPolish.ts',
  '../src/v144GuestCtaFilterPreview.ts',
  '../src/v145FourFilterToolbar.ts'
].map(path => readFileSync(new URL(path, import.meta.url), 'utf8'));

test('v148 lucky reel has a bounded short visual budget independent of server approval', () => {
  assert.match(app, /const visualSpinSteps = Math\.max\(10, Math\.min\(14, candidates\.length \* 2\)\)/);
  assert.match(app, /const delay = Math\.round\(62 \+ progress \* progress \* 70\)/);
  assert.match(app, /if \(spinStep >= visualSpinSteps\) \{[\s\S]*completeVisualSpin\(\)/);
  assert.match(app, /if \(visualComplete\) finish\(\)/);
  assert.doesNotMatch(app, /minSpinSteps/);
  assert.doesNotMatch(app, /progress \* progress \* 190/);
  assert.doesNotMatch(app, /:\s*140;/);
});

test('v148 reset cancels the active draw generation and unlocks the summon action', () => {
  assert.match(app, /luckyDrawGenerationRef\.current \+= 1;[\s\S]*luckyRequestPending\.current = false;/);
  assert.match(app, /const drawGeneration = \+\+luckyDrawGenerationRef\.current/);
  assert.match(app, /const isCurrentDraw = \(\) => luckyDrawGenerationRef\.current === drawGeneration/);
});

test('v148 mobile reel animates only the focus card instead of every card', () => {
  assert.match(css, /\.audio-card-grid\.lucky-spin-active > \.lucky-card \{[\s\S]*filter: none;[\s\S]*animation: none;/);
  assert.match(css, /\.audio-card-grid\.lucky-spin-active > \.lucky-card:nth-child\(2\) \{[\s\S]*will-change: transform/);
});

test('v148 legacy DOM polish observers sleep during lucky-grid reorder churn', () => {
  for (const source of observers) {
    assert.match(source, /shouldSkipLuckyGridMutations/);
    assert.match(source, /record\.target === grid \|\| grid\.contains\(record\.target\)/);
  }
});
