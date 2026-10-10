import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navigation = readFileSync(new URL('../src/globalNavigationPolicy.ts', import.meta.url), 'utf8');
const presentation = readFileSync(new URL('../src/homeLuckyDrawPresentation.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

test('v164 main menu uses a real interaction shield and never closes inside pointerdown before click', () => {
  assert.match(main, /import '\.\/globalNavigationPolicy';/);
  assert.match(navigation, /MENU_SHELL_SELECTOR = '\.mobile-menu-shell'/);
  assert.match(navigation, /pointer-events: auto !important/);
  assert.match(navigation, /position: fixed !important/);
  assert.match(navigation, /document\.addEventListener\('pointerdown', handlePointerDown, true\)/);
  assert.match(navigation, /document\.addEventListener\('click', handleCompletedClick, true\)/);
  assert.doesNotMatch(navigation, /requestAnimationFrame\(\(\) => \{[\s\S]*closeOpenMainMenu/);
});

test('v164 normal menu actions close only after click while font size and mood palette stay open', () => {
  assert.match(navigation, /MENU_KEEP_OPEN_SELECTOR = '\.navbar-menu-font-controls, \.navbar-menu-palette-shortcut'/);
  assert.match(navigation, /if \(target\.closest\(MENU_KEEP_OPEN_SELECTOR\)\) return/);
  assert.match(navigation, /window\.setTimeout\(\(\) => \{[\s\S]*closeOpenMainMenu\(\)/);
  assert.match(navigation, /document\.addEventListener\('scroll', dismissOnMovement, true\)/);
  assert.match(navigation, /document\.addEventListener\('wheel', dismissOnMovement/);
  assert.match(navigation, /document\.addEventListener\('touchmove', dismissOnMovement/);
});

test('v164 summon button gets a dedicated live class and visibly larger animated star treatment', () => {
  assert.match(navigation, /SUMMON_BUTTON_CLASS = 'echostars-summon-button'/);
  assert.match(navigation, /button\.classList\.add\(SUMMON_BUTTON_CLASS\)/);
  assert.match(navigation, /height: 46px !important/);
  assert.match(navigation, /font-size: 1\.28rem !important/);
  assert.match(navigation, /content: "✦" !important/);
  assert.match(navigation, /content: "召喚繁星"/);
  assert.match(navigation, /@keyframes echostars-v164-summon-stars/);
  assert.match(navigation, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(main, /import '\.\/homeLuckyDrawPresentation\.css';/);
  assert.match(presentation, /height: 46px !important/);
});

test('v164 mobile lucky answer and winner badge are normal-flow blocks above the audio card', () => {
  assert.match(navigation, /@media \(max-width: 767px\)/);
  assert.match(navigation, /> \.lucky-answer-notice,[\s\S]*> \.lucky-winner-badge \{[\s\S]*position: relative !important/);
  assert.match(navigation, /> \.lucky-answer-notice \{[\s\S]*margin: 0 auto 0\.55rem !important/);
  assert.match(navigation, /> \.lucky-winner-badge \{[\s\S]*margin: 0 auto 0\.5rem !important/);
});
