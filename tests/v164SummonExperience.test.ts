import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const menuCss = readFileSync(new URL('../src/mobileMenuHalfLayout.css', import.meta.url), 'utf8');
const summonCss = readFileSync(new URL('../src/summonExperience.css', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('summon presentation has one dedicated stylesheet owner', () => {
  assert.match(menuCss, /@import "\.\/summonExperience\.css";/);
  assert.doesNotMatch(menuCss, /dedicated Summon Stars presentation/);
  assert.doesNotMatch(menuCss, /echostars-summon-sky/);
  assert.match(summonCss, /min-height:\s*46px !important/);
  assert.match(summonCss, /max-height:\s*46px !important/);
  assert.match(summonCss, /min-width:\s*190px !important/);
  assert.match(summonCss, /font-size:\s*23px !important/);
  assert.match(summonCss, /::before[\s\S]*content:\s*"✦"/);
  assert.match(summonCss, /animation:\s*echostars-summon-sky/);
});

test('canonical selector overrides legacy mobile home rule explicitly', () => {
  assert.match(
    summonCss,
    /html\.echostars-v141-home \.v141-home-search-row > button\[title="從目前條件下可播放的音檔中召喚繁星解答"\]:first-child/
  );
  assert.match(app, /title="從目前條件下可播放的音檔中召喚繁星解答"/);
});

test('lucky notices use normal flow instead of overlay z-index stacking', () => {
  assert.match(app, /className="lucky-answer-notice"/);
  assert.match(app, /className="lucky-winner-badge"/);
  assert.match(summonCss, /> \.lucky-answer-notice \{[\s\S]*position:\s*relative !important/);
  assert.match(summonCss, /> \.lucky-answer-notice \{[\s\S]*transform:\s*none !important/);
  assert.match(summonCss, /> \.lucky-winner-badge \{[\s\S]*position:\s*relative !important/);
  assert.match(summonCss, /display:\s*flex !important;[\s\S]*flex-direction:\s*column !important/);
  assert.doesNotMatch(summonCss, /z-index:\s*1[34]0/);
});
