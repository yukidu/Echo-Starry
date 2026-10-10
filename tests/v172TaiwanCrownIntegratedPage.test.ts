import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const crown = readFileSync(new URL('../src/taiwanCrownMenuLink.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/taiwanCrownPage.css', import.meta.url), 'utf8');
const members = readFileSync(new URL('../worker/memberRepository.ts', import.meta.url), 'utf8');
const changelog = readFileSync(new URL('../src/v171ChangelogNote.ts', import.meta.url), 'utf8');

test('Crown page stays inside the existing Echo Stars app and preserves navbar/player session', () => {
  assert.match(main, /import '\.\/taiwanCrownMenuLink';/);
  assert.match(crown, /CROWN_OVERLAY_ID/);
  assert.match(crown, /overlay\.hidden = false;\s*renderCrownPage\(\)/);
  assert.doesNotMatch(crown, /window\.location\.assign/);
  assert.doesNotMatch(crown, /taiwan-crown\.html/);
  assert.equal(existsSync(new URL('../public/taiwan-crown.html', import.meta.url)), false);
  assert.match(css, /\.taiwan-crown-overlay\s*\{[\s\S]*?z-index:\s*30/);
});

test('Crown menu uses a single-color line icon and member pin checkbox/top shortcut', () => {
  assert.match(crown, /stroke', 'currentColor'/);
  assert.match(crown, /fill', 'none'/);
  assert.doesNotMatch(crown, /👑/);
  assert.match(crown, /navbar-inline-pin/);
  assert.match(crown, /navbar-top-action/);
  assert.match(crown, /CROWN_PIN_KEY_PREFIX/);
  assert.match(crown, /echostars_quick_header_actions_v2/);
});

test('Crown page follows the existing font zoom and theme variables', () => {
  assert.match(crown, /echostars_user_font_zoom_v1/);
  assert.match(crown, /--taiwan-crown-font-zoom/);
  assert.match(css, /--color-primary/);
  assert.match(css, /--theme-gradient-bg/);
  assert.match(css, /font-size:\s*calc\(16px \* var\(--taiwan-crown-font-zoom\)\)/);
});

test('visitors never receive a personal card or personal motto controls', () => {
  assert.match(crown, /if \(member\) cards\.append\(createMemberCard\(member\)\)/);
  assert.match(crown, /if \(!member\) return;/);
  assert.doesNotMatch(crown, /已登入會員/);
  assert.doesNotMatch(crown, /個人化設定/);
  assert.doesNotMatch(crown, /photo-upload/);
  assert.doesNotMatch(crown, /重新設定個人照片與座右銘/);
});

test('member card reads profile avatar and shared motto without Crown photo editing', () => {
  assert.match(crown, /appendAvatar\(avatar, member\.avatar/);
  assert.match(crown, /effectiveMotto\(member\)/);
  assert.match(crown, /編輯我的座右銘/);
  assert.doesNotMatch(crown, /FileReader/);
  assert.doesNotMatch(crown, /type\s*=\s*['"]file['"]/);
  assert.doesNotMatch(crown, /臺灣皇冠大使成功故事<\/div>/);
});

test('motto persists in member profile and is surfaced in personal basic profile', () => {
  assert.match(members, /MEMBER_SCHEMA_VERSION = 'member-profile-v172-motto'/);
  assert.match(members, /motto:\s*'TEXT'/);
  assert.match(crown, /fetch\(`\/api\/users\/\$\{encodeURIComponent\(member\.id\)\}`/);
  assert.match(crown, /body:\s*JSON\.stringify\(\{ motto, email:/);
  assert.match(crown, /data-profile-motto-view/);
  assert.match(crown, /data-profile-motto-edit/);
  assert.match(crown, /什麼原因留在安麗？/);
  assert.match(crown, /與臺灣皇冠大使同步/);
  assert.match(crown, /readLegacyMotto/);
});

test('all 13 Taiwan Crown Ambassador stories remain available', () => {
  const names = [
    '陳婉芬 嵇龍生', '傅後堅', '王儷凱', '許旭昇 謝淑芬', '雷宇鳴', '鍾易宏', '楊嘉譁 陳仕騏',
    '曾玉玲 呂森林', '游麗珠 謝建宗', '涂永松 黃玉燕', '楊貫一 鄭家華', '許明哲 張瓅文', '施素真'
  ];
  names.forEach(name => assert.match(crown, new RegExp(name)));
  assert.equal((crown.match(/https:\/\/www\.amway\.com\.tw\/wechat\/aep\/member\/member\d+\.html/g) || []).length, 13);
  assert.match(crown, /raw\.githubusercontent\.com\/yukidu\/amway_crown\/main\/img\//);
});

test('v172 changes are documented in the bottom changelog dialog', () => {
  assert.match(changelog, /v172 最新改版｜臺灣皇冠大使整合/);
  assert.match(changelog, /切換頁面不會中斷播放/);
  assert.match(changelog, /新增會員基本資料「座右銘」欄位/);
});
