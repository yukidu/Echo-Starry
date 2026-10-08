import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/Navbar.v124.css', import.meta.url), 'utf8');

test('pinned actions keep the saved order and support long-press horizontal reordering', () => {
  assert.match(navbar, /const pinnedQuickActionIds = currentUser[\s\S]*selectedQuickActionIds\.filter/);
  assert.match(navbar, /QUICK_DRAG_HOLD_MS = 260/);
  assert.match(navbar, /data-quick-action-id=\{id\}/);
  assert.match(navbar, /onPointerDown=\{event => beginQuickActionDrag\(id, event\)\}/);
  assert.match(navbar, /document\.elementFromPoint\(event\.clientX, event\.clientY\)/);
  assert.match(navbar, /reorderQuickAction\(state\.id, targetId\)/);
  assert.match(css, /\.navbar-top-action-slot[\s\S]*touch-action:\s*pan-y/);
  assert.match(css, /\.navbar-top-action-slot\.is-dragging/);
});

test('hamburger header removes sync/count text and keeps home playback list in the upper right action group', () => {
  assert.match(navbar, /navbar-menu-profile-head[\s\S]*navbar-menu-header-actions[\s\S]*navbar-menu-home-shortcut[\s\S]*首頁播放清單/);
  assert.doesNotMatch(navbar, /手機置頂|平板置頂|桌機置頂/);
  assert.doesNotMatch(navbar, /已跨裝置同步|已載入跨裝置設定|同步中…|本機已儲存，稍後再同步/);
  assert.equal((navbar.match(/onClick=\{handleLogoClick\} className=\{menuRowClass/g) || []).length, 0);
});

test('font controls exist only in the top function section and never below logout', () => {
  const logout = navbar.indexOf('title="登出目前帳號"');
  assert.ok(logout >= 0);
  assert.doesNotMatch(navbar.slice(logout), /字體|文字大小|縮小字體|放大字體/);
  assert.match(navbar.slice(0, logout), /renderPinControl\('font', '字體'\)/);
});
