import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/v176CrownStoryInPage.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/v176CrownStoryInPage.css', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/v176ReleaseNote.ts', import.meta.url), 'utf8');
const browserCheck = readFileSync(new URL('../scripts/verifyV176CrownStoryInPage.mjs', import.meta.url), 'utf8');

test('v176 intercepts Crown story cards instead of opening or navigating away', () => {
  assert.match(index, /\/src\/v176CrownStoryInPage\.ts/);
  assert.match(source, /document\.addEventListener\('click',[\s\S]*?event\.preventDefault\(\)[\s\S]*?event\.stopPropagation\(\)/);
  assert.match(source, /a\.taiwan-crown-card\[href\]/);
  assert.match(source, /AMWAY_STORY_RE/);
  assert.doesNotMatch(source, /window\.open\(/);
  assert.doesNotMatch(source, /location\.assign\(/);
  assert.doesNotMatch(source, /location\.href\s*=/);
});

test('story view stays inside Crown page and preserves shared app/player DOM', () => {
  assert.match(source, /shell\.hidden = true/);
  assert.match(source, /page\.insertBefore\(view, modal \|\| null\)/);
  assert.match(source, /data-v176-crown-story-content/);
  assert.match(source, /createLocalStoryContent/);
  assert.match(source, /返回皇冠大使/);
  assert.match(source, /上一位皇冠大使/);
  assert.match(source, /下一位皇冠大使/);
  assert.doesNotMatch(source, /replaceChildren\(view/);
  assert.doesNotMatch(source, /createElement\('iframe'\)/);
});

test('local story reader reuses the existing Crown photo, name, quote and official source identity', () => {
  assert.match(source, /taiwan-crown-card-name/);
  assert.match(source, /taiwan-crown-card-quote/);
  assert.match(source, /taiwan-crown-avatar img/);
  assert.match(source, /成功語錄/);
  assert.match(source, /資料來源：安麗臺灣皇冠大使成功故事/);
  assert.match(source, /data-source-url/);
});

test('v176 story view has responsive in-page sizing and records release history', () => {
  assert.match(css, /\.v176-crown-story-view/);
  assert.match(css, /\.v176-crown-story-content/);
  assert.match(css, /\.v176-crown-story-portrait/);
  assert.match(css, /\.v176-crown-story-quote/);
  assert.match(css, /100dvh/);
  assert.match(release, /version:\s*'v176'/);
  assert.match(release, /不再開啟新的瀏覽器分頁/);
  assert.match(release, /浮動播放器/);
});

test('v176 real-browser gate requires next, previous, back and uninterrupted playback on the exact same audio node', () => {
  assert.match(browserCheck, /window\.__v176AudioNode/);
  assert.match(browserCheck, /audio\.play\(\)/);
  assert.match(browserCheck, /audio\.paused/);
  assert.match(browserCheck, /currentTime/);
  assert.match(browserCheck, /currentSrcMatches/);
  assert.match(browserCheck, /Target\.getTargets/);
  assert.match(browserCheck, /下一位皇冠大使/);
  assert.match(browserCheck, /上一位皇冠大使/);
  assert.match(browserCheck, /previous-story/);
  assert.match(browserCheck, /back-to-list/);
  assert.match(browserCheck, /same page: Crown list -> story -> next -> previous -> back to list/);
});