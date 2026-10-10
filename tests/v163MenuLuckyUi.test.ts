import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navigation = readFileSync(new URL('../src/globalNavigationPolicy.ts', import.meta.url), 'utf8');
const presentation = readFileSync(new URL('../src/homeLuckyDrawPresentation.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

test('v163 main menu closes globally on outside interaction and movement', () => {
  assert.match(main, /import '\.\/globalNavigationPolicy';/);
  assert.match(navigation, /MENU_PANEL_SELECTOR/);
  assert.match(navigation, /document\.addEventListener\('pointerdown', handlePointerDown, true\)/);
  assert.match(navigation, /document\.addEventListener\('scroll', dismissOnMovement, true\)/);
  assert.match(navigation, /document\.addEventListener\('wheel', dismissOnMovement/);
  assert.match(navigation, /document\.addEventListener\('touchmove', dismissOnMovement/);
  assert.match(navigation, /if \(!panel\.contains\(target\)\) \{[\s\S]*closeOpenMainMenu\(\)/);
});

test('v163 only font size controls and mood palette keep the menu open', () => {
  assert.match(navigation, /MENU_KEEP_OPEN_SELECTOR = '\.navbar-menu-font-controls, \.navbar-menu-palette-shortcut'/);
  assert.match(navigation, /if \(target\.closest\(MENU_KEEP_OPEN_SELECTOR\)\) return/);
  assert.match(navigation, /requestAnimationFrame\(\(\) => \{[\s\S]*closeOpenMainMenu\(\)/);
});

test('v163 summon button stays 46px tall but uses larger animated star presentation', () => {
  assert.match(main, /import '\.\/homeLuckyDrawPresentation\.css';/);
  assert.match(presentation, /height: 46px !important/);
  assert.match(presentation, /font-size: clamp\(1\.15rem, 4\.6vw, 1\.48rem\) !important/);
  assert.match(presentation, /content: "✦"/);
  assert.match(presentation, /@keyframes echostars-summon-stars/);
  assert.match(presentation, /@media \(prefers-reduced-motion: reduce\)/);
});

test('v163 lucky bonus notice owns a stacking context above neighbouring audio cards', () => {
  assert.match(presentation, /\.lucky-card\[data-lucky-winner="true"\] \{[\s\S]*z-index: 90 !important;[\s\S]*isolation: isolate/);
  assert.match(presentation, /> \.lucky-answer-notice \{[\s\S]*z-index: 140 !important/);
  assert.match(presentation, /> \.lucky-winner-badge \{[\s\S]*z-index: 130 !important/);
});
