import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('sensitive admin tabs are super-admin only and the login warning banner is gone', () => {
  const admin = readFileSync(new URL('../src/components/AdminModal.tsx', import.meta.url), 'utf8');
  assert.equal(admin.includes('尚未登入超級管理員帳號'), false);
  assert.equal(admin.includes('onSwitchToAdmin'), false);
  for (const label of ['會員：僅超級管理員', '音檔：僅超級管理員', '分類標籤：僅超級管理員', '網友關鍵字：僅超級管理員']) {
    assert.equal(admin.includes(label), true, `missing super-admin-only marker: ${label}`);
  }
  for (const tab of ['users', 'tracks', 'categories', 'keywords']) {
    assert.equal(admin.includes(`{activeTab === '${tab}' && isEffectiveAdmin && (`), true, `missing content guard: ${tab}`);
  }
});

test('personal center no longer exposes a logout button or logout prop', () => {
  const profile = readFileSync(new URL('../src/components/ProfileModal.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.equal(profile.includes('onLogout'), false);
  assert.equal(profile.includes('<span>登出</span>'), false);
  assert.equal(profile.includes('LogOut'), false);
  assert.equal(app.includes('onLogout={handleLogout}'), false);
  assert.equal(app.includes('onSwitchToAdmin='), false);
});
