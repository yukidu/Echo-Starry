import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const menuLink = readFileSync(new URL('../src/taiwanCrownMenuLink.ts', import.meta.url), 'utf8');
const changelogNote = readFileSync(new URL('../src/v171ChangelogNote.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../public/taiwan-crown.html', import.meta.url), 'utf8');

test('Taiwan Crown Ambassadors entry is installed globally for members and visitors', () => {
  assert.match(main, /import '\.\/taiwanCrownMenuLink';/);
  assert.match(menuLink, /臺灣皇冠大使/);
  assert.match(menuLink, /\.mobile-menu-panel\[data-react-menu="true"\]/);
  assert.match(menuLink, /window\.location\.assign\(crownPageUrl\(\)\)/);
  assert.match(menuLink, /--color-primary/);
  assert.match(menuLink, /sq_theme_dark/);
  assert.match(menuLink, /hasSignedInMember\(\)/);
  assert.match(menuLink, /sq_current_user_v1/);
  assert.doesNotMatch(menuLink, /if \(!currentUser\)/);
});

test('crown page automatically uses the signed-in member name or visitor nickname', () => {
  assert.match(page, /sq_current_user_v1/);
  assert.match(page, /sq_visitor_identity_v1/);
  assert.match(page, /currentUser\?\.name \|\| visitor\?\.fullName/);
  assert.match(page, /姓名已自動串接/);
  assert.doesNotMatch(page, /id="input-name"/);
  assert.doesNotMatch(page, /留下您的大名/);
});

test('crown page preserves all 13 ambassador stories and official links', () => {
  const names = [
    '陳婉芬 嵇龍生','傅後堅','王儷凱','許旭昇 謝淑芬','雷宇鳴','鍾易宏','楊嘉譁 陳仕騏',
    '曾玉玲 呂森林','游麗珠 謝建宗','涂永松 黃玉燕','楊貫一 鄭家華','許明哲 張瓅文','施素真'
  ];
  names.forEach(name => assert.match(page, new RegExp(name)));
  assert.equal((page.match(/https:\/\/www\.amway\.com\.tw\/wechat\/aep\/member\/member\d+\.html/g) || []).length, 13);
  assert.match(page, /raw\.githubusercontent\.com\/yukidu\/amway_crown\/main\/img\//);
});

test('crown page keeps personal photo and motto features while following Echo Stars theme', () => {
  assert.match(page, /id="photo-upload"/);
  assert.match(page, /motto-input/);
  assert.match(page, /echostars_crown_profile_v1/);
  assert.match(page, /--crown-primary/);
  assert.match(page, /primary/);
  assert.match(page, /dark/);
  assert.match(page, /返回繁星回聲/);
});

test('v171 Crown release is surfaced in the bottom changelog dialog', () => {
  assert.match(main, /import '\.\/v171ChangelogNote';/);
  assert.match(changelogNote, /v171 最新改版｜臺灣皇冠大使/);
  assert.match(changelogNote, /訪客與會員都可直接開啟/);
  assert.match(changelogNote, /登入會員自動使用會員姓名/);
  assert.match(changelogNote, /未登入時自動使用目前訪客暱稱/);
});
