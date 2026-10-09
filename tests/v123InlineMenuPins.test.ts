import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const prefs = readFileSync(new URL('../src/quickShortcutPreferences.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/Navbar.css', import.meta.url), 'utf8');

test('font and theme controls stay at the top of the hamburger function list', () => {
  const font = navbar.indexOf("renderPinControl('font', '字體')");
  const theme = navbar.indexOf("renderPinControl('theme', themeActionLabel)");
  const stats = navbar.indexOf("renderPinControl('stats', '排行榜')");
  assert.ok(font >= 0 && theme >= 0 && stats >= 0);
  assert.ok(font < stats);
  assert.ok(theme < stats);
});

test('eligible signed-in hamburger actions expose inline pin controls while fixed header actions do not', () => {
  for (const [id, label] of [
    ['font', '字體'],
    ['stats', '排行榜'],
    ['notifications', '通知'],
    ['stickers', '我的貼紙'],
    ['upload', '上傳音檔'],
    ['profile', '個人中心'],
    ['admin', '後台管理']
  ]) {
    assert.match(navbar, new RegExp(`renderPinControl\\('${id}', '${label}'\\)`));
  }
  assert.match(navbar, /const themeActionLabel = isDark \? '開燈' : '關燈'/);
  assert.match(navbar, /renderPinControl\('theme', themeActionLabel\)/);
  assert.doesNotMatch(navbar, /renderPinControl\('home'/);
  assert.doesNotMatch(navbar, /renderPinControl\('logout'/);
  assert.doesNotMatch(navbar, /renderPinControl\('install'/);
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
