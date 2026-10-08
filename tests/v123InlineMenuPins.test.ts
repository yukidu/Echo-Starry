import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const prefs = readFileSync(new URL('../src/quickShortcutPreferences.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/Navbar.css', import.meta.url), 'utf8');

test('font and theme controls appear before home in the hamburger menu', () => {
  const font = navbar.indexOf("renderPinControl('font', '文字大小')");
  const theme = navbar.indexOf("renderPinControl('theme', '淺色／暗色切換')");
  const home = navbar.indexOf('<span>首頁播放清單</span>');
  assert.ok(font >= 0 && theme >= 0 && home >= 0);
  assert.ok(font < home);
  assert.ok(theme < home);
});

test('all eligible signed-in hamburger actions expose inline pin controls while home and logout do not', () => {
  for (const [id, label] of [
    ['font', '文字大小'],
    ['theme', '淺色／暗色切換'],
    ['stats', '排行榜'],
    ['notifications', '通知'],
    ['stickers', '我的貼紙'],
    ['upload', '上傳音檔'],
    ['profile', '個人中心'],
    ['install', '安裝到桌面'],
    ['admin', '後台管理'],
    ['palette', '切換配色']
  ]) {
    assert.match(navbar, new RegExp(`renderPinControl\\('${id}', '${label}'\\)`));
  }
  assert.doesNotMatch(navbar, /renderPinControl\('home'/);
  assert.doesNotMatch(navbar, /renderPinControl\('logout'/);
  assert.doesNotMatch(navbar, /自訂置頂功能/);
});

test('device limits are phone three, tablet five and desktop unlimited to the client', () => {
  assert.match(prefs, /mobile:\s*3/);
  assert.match(prefs, /tablet:\s*5/);
  assert.match(prefs, /desktop:\s*Number\.MAX_SAFE_INTEGER/);
  assert.match(navbar, /selectedQuickActionIds\.includes\(id\) \|\| selectedQuickActionIds\.length < deviceLimit/);
});

test('desktop navbar follows the viewport instead of a fixed max-width container', () => {
  assert.match(css, /\.navbar-main-row\s*\{[\s\S]*max-width:\s*none\s*!important/);
  assert.doesNotMatch(navbar, /max-w-4xl mx-auto/);
});
