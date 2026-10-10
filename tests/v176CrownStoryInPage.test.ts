import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/v176CrownStoryInPage.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/v176CrownStoryInPage.css', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/v176ReleaseNote.ts', import.meta.url), 'utf8');

test('v176 intercepts Crown story cards instead of opening a new browser tab', () => {
  assert.match(index, /\/src\/v176CrownStoryInPage\.ts/);
  assert.match(source, /document\.addEventListener\('click',[\s\S]*?event\.preventDefault\(\)[\s\S]*?event\.stopPropagation\(\)/);
  assert.match(source, /a\.taiwan-crown-card\[href\]/);
  assert.match(source, /AMWAY_STORY_RE/);
  assert.doesNotMatch(source, /window\.open\(/);
  assert.doesNotMatch(source, /location\.assign\(/);
});

test('story view stays inside Crown page and preserves shared app/player DOM', () => {
  assert.match(source, /shell\.hidden = true/);
  assert.match(source, /page\.insertBefore\(view, modal \|\| null\)/);
  assert.match(source, /iframe/);
  assert.match(source, /data-v176-crown-story-frame/);
  assert.match(source, /返回皇冠大使/);
  assert.match(source, /上一位皇冠大使/);
  assert.match(source, /下一位皇冠大使/);
  assert.doesNotMatch(source, /replaceChildren\(view/);
});

test('story iframe is constrained to official Amway success-story URLs', () => {
  assert.match(source, /www\\\.amway\\\.com\\\.tw/);
  assert.match(source, /member\\d\+/);
  assert.match(source, /sandbox/);
  assert.match(source, /allow-scripts allow-same-origin allow-forms/);
});

test('v176 story view has full in-page sizing and records release history', () => {
  assert.match(css, /\.v176-crown-story-view/);
  assert.match(css, /\.v176-crown-story-frame/);
  assert.match(css, /100dvh/);
  assert.match(release, /version:\s*'v176'/);
  assert.match(release, /不再開啟新的瀏覽器分頁/);
  assert.match(release, /浮動播放器/);
});
