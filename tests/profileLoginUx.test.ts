import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bridge = readFileSync(new URL('../src/googleIdentityBridge.ts', import.meta.url), 'utf8');
const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');

test('new Google registrations reopen profile and enter edit mode after the secure reload', () => {
  assert.match(bridge, /FIRST_PROFILE_EDIT_KEY = 'echostars_first_profile_edit_v1'/);
  assert.match(bridge, /if \(data\.isNewUser\)/);
  assert.match(bridge, /sessionStorage\.setItem\(FIRST_PROFILE_EDIT_KEY, String\(user\.id \|\| 'new'\)\)/);
  assert.match(bridge, /function resumeFirstProfileEdit\(\)/);
  assert.match(bridge, /profileButton\.click\(\)/);
  assert.match(bridge, /const editButton = headerButtons\.find\(button => button\.textContent\?\.trim\(\) === '修改'\)/);
  assert.match(bridge, /editButton\.click\(\)/);
});

test('Google sign-in shows a large animated loading message and hides redundant login copy without removing React nodes', () => {
  assert.match(bridge, /setStatus\('登入中請稍後'\)/);
  assert.match(bridge, /fontSize = isLoading \? '26px' : '13px'/);
  assert.match(bridge, /spinner\.className = 'animate-spin'/);
  assert.match(bridge, /text\.includes\('使用 Google 官方帳號進行安全驗證與身分綁定'\)/);
  assert.match(bridge, /text\.includes\('初次登入將自動建立專屬帳號'\)/);
  assert.match(bridge, /style\.display = 'none'/);
  assert.doesNotMatch(bridge, /child\.remove\(\)/);
});

test('mobile hamburger owns logout and profile modal logout is hidden from the rendered UI', () => {
  assert.match(navbar, /<LogOut className="w-4 h-4" \/>/);
  assert.match(navbar, /<span>登出<\/span>/);
  assert.match(navbar, /const handleLogout = \(\) =>/);
  assert.match(bridge, /button\[title="登出目前帳號"\]/);
  assert.match(bridge, /logoutButton\.style\.display = 'none'/);
});

test('profile save action is promoted to a high-contrast emerald call to action', () => {
  assert.match(bridge, /saveButton\.textContent = '儲存資料'/);
  assert.match(bridge, /saveButton\.style\.background = '#10b981'/);
  assert.match(bridge, /saveButton\.style\.fontWeight = '900'/);
  assert.match(bridge, /saveButton\.style\.boxShadow = '0 8px 22px rgba\(16,185,129,0\.35\)'/);
});
