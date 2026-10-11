import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bridge = readFileSync(new URL('../src/googleIdentityBridge.ts', import.meta.url), 'utf8');
const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');

test('new and existing members with any missing basic profile field reopen directly in edit mode on each page entry', () => {
  assert.match(bridge, /const REQUIRED_PROFILE_FIELDS = \[/);
  for (const field of ['name', 'amwayId', 'residence', 'center', 'rank', 'joinReason', 'stayReason', 'sponsor', 'platinumUpline', 'diamondUpline', 'birthday']) {
    assert.match(bridge, new RegExp(`'${field}'`));
  }
  assert.match(bridge, /function profileNeedsCompletion\(user: any \| null\)/);
  assert.match(bridge, /REQUIRED_PROFILE_FIELDS\.some\(field => String\(user\?\.\[field\] \?\? ''\)\.trim\(\) === ''\)/);
  assert.match(bridge, /function resumeIncompleteProfileEdit\(\)/);
  assert.match(bridge, /profileButton\.click\(\)/);
  assert.match(bridge, /const editButton = headerButtons\.find\(button => button\.textContent\?\.trim\(\) === '修改'\)/);
  assert.match(bridge, /editButton\.click\(\)/);
  assert.doesNotMatch(bridge, /data\.isNewUser/);
});

test('profile edit save decoration is one-time so the mutation observer cannot freeze the page', () => {
  assert.match(bridge, /saveButton\.dataset\.echostarsProminentSave !== '1'/);
  assert.match(bridge, /saveButton\.dataset\.echostarsProminentSave = '1'/);
  assert.match(bridge, /saveButton\.textContent = '儲存資料'/);
  assert.match(bridge, /infinite mutation loop/);
});

test('Google sign-in keeps the large animated loading message and hides redundant login copy without removing React nodes', () => {
  assert.match(bridge, /setStatus\('登入中請稍後'\)/);
  assert.match(bridge, /fontSize = isLoading \? '26px' : '13px'/);
  assert.match(bridge, /spinner\.className = 'animate-spin'/);
  assert.match(bridge, /text\.includes\('使用 Google 官方帳號進行安全驗證與身分綁定'\)/);
  assert.match(bridge, /text\.includes\('初次登入將自動建立專屬帳號'\)/);
  assert.match(bridge, /style\.display = 'none'/);
  assert.doesNotMatch(bridge, /child\.remove\(\)/);
});

test('mobile hamburger owns logout and profile modal logout stays hidden from the rendered UI', () => {
  assert.match(navbar, /<LogOut className="w-4 h-4(?: [^"]*)?" \/>/);
  assert.match(navbar, /<span>登出<\/span>/);
  assert.match(navbar, /const handleLogout = \(\) =>/);
  assert.match(bridge, /button\[title="登出目前帳號"\]/);
  assert.match(bridge, /logoutButton\.dataset\.echostarsHiddenLogout/);
  assert.match(bridge, /logoutButton\.style\.display = 'none'/);
});

test('profile save action remains a high-contrast emerald call to action', () => {
  assert.match(bridge, /saveButton\.textContent = '儲存資料'/);
  assert.match(bridge, /saveButton\.style\.background = '#10b981'/);
  assert.match(bridge, /saveButton\.style\.fontWeight = '900'/);
  assert.match(bridge, /saveButton\.style\.boxShadow = '0 8px 22px rgba\(16,185,129,0\.35\)'/);
});
