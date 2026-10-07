from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)


admin_path = Path('src/components/AdminModal.tsx')
admin = admin_path.read_text()
admin = replace_once(admin, "  AlertTriangle,\n", "", 'remove AlertTriangle import')
admin = replace_once(admin, "  onSwitchToAdmin: () => void;\n", "", 'remove onSwitchToAdmin prop')
admin = replace_once(admin, "  onSwitchToAdmin,\n", "", 'remove onSwitchToAdmin destructure')

old_tabs = """  // Requirement 1, 2, 4 & 6: Tabs: 數據中心, 會員, 音檔, 分類標籤, 網友關鍵字, 私秘VIP, 權限
  const [activeTab, setActiveTab] = useState<'data-center' | 'users' | 'tracks' | 'categories' | 'keywords' | 'vip' | 'permissions' | 'uplines'>(
    isContributorOnly ? 'tracks' : 'data-center'
  );
"""
new_tabs = """  // Restricted management tabs are super-admin only. Other roles land on the first feature they may use.
  type AdminTab = 'data-center' | 'users' | 'tracks' | 'categories' | 'keywords' | 'vip' | 'permissions' | 'uplines';
  const defaultAllowedTab: AdminTab = isEffectiveAdmin
    ? 'data-center'
    : isPlatinumOrAbove
      ? 'data-center'
      : currentUser?.isContributor === true
        ? 'vip'
        : currentUser?.isAdminUser || currentUser?.role === '管理員'
          ? 'uplines'
          : 'permissions';
  const [activeTab, setActiveTab] = useState<AdminTab>(defaultAllowedTab);
"""
admin = replace_once(admin, old_tabs, new_tabs, 'replace admin tab default')

old_warning = """        {!isEffectiveAdmin && (
          <div className=\"p-3 bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-900 flex items-center justify-between gap-3 text-xs\">
            <div className=\"flex items-center gap-2 text-amber-800 dark:text-amber-200\">
              <AlertTriangle className=\"w-4 h-4 shrink-0 text-amber-600\" />
              <span>尚未登入超級管理員帳號 (yukidu@gmail.com)</span>
            </div>
            <button
              onClick={onSwitchToAdmin}
              className=\"px-3 py-1 rounded-xl bg-amber-600 text-white font-bold shrink-0 hover:bg-amber-700\"
            >
              使用 Google 登入
            </button>
          </div>
        )}

"""
admin = replace_once(admin, old_warning, "", 'remove yellow super-admin login banner')

for old, new, label in [
    ("{/* 2. 會員 */}\n            {!isContributorOnly && (", "{/* 2. 會員：僅超級管理員 */}\n            {isEffectiveAdmin && (", 'users tab visibility'),
    ("{/* 3. 音檔 */}\n            {!isDiamondOnly && (", "{/* 3. 音檔：僅超級管理員 */}\n            {isEffectiveAdmin && (", 'tracks tab visibility'),
    ("{/* 5. 分類標籤 */}\n            {!isContributorOnly && (", "{/* 5. 分類標籤：僅超級管理員 */}\n            {isEffectiveAdmin && (", 'categories tab visibility'),
    ("{/* 6. 網友關鍵字 */}\n            {!isDiamondOnly && (", "{/* 6. 網友關鍵字：僅超級管理員 */}\n            {isEffectiveAdmin && (", 'keywords tab visibility'),
    ("{activeTab === 'users' && (", "{activeTab === 'users' && isEffectiveAdmin && (", 'users content guard'),
    ("{activeTab === 'tracks' && (", "{activeTab === 'tracks' && isEffectiveAdmin && (", 'tracks content guard'),
    ("{activeTab === 'categories' && (", "{activeTab === 'categories' && isEffectiveAdmin && (", 'categories content guard'),
    ("{activeTab === 'keywords' && (", "{activeTab === 'keywords' && isEffectiveAdmin && (", 'keywords content guard'),
]:
    admin = replace_once(admin, old, new, label)
admin_path.write_text(admin)

profile_path = Path('src/components/ProfileModal.tsx')
profile = profile_path.read_text()
profile = replace_once(profile, "  LogOut,\n", "", 'remove LogOut icon import')
profile = replace_once(profile, "  onLogout: () => void;\n", "", 'remove onLogout prop')
profile = replace_once(profile, "  onLogout,\n", "", 'remove onLogout destructure')
logout_button = """            {currentUser && (
              <button
                type=\"button\"
                onClick={onLogout}
                className=\"px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer border border-white/25 active:scale-95\"
                title=\"登出目前帳號\"
              >
                <LogOut className=\"w-3.5 h-3.5\" />
                <span>登出</span>
              </button>
            )}
"""
profile = replace_once(profile, logout_button, "", 'remove personal center logout button')
profile_path.write_text(profile)

app_path = Path('src/App.tsx')
app = app_path.read_text()
app = replace_once(app, "        onSwitchToAdmin={() => { setIsAdminOpen(false); setIsProfileOpen(true); }}\n", "", 'remove AdminModal switch-login prop')
app = replace_once(app, "        onLogout={handleLogout}\n", "", 'remove ProfileModal logout prop')
app_path.write_text(app)

test_path = Path('tests/v115AdminVisibilityAndLogout.test.ts')
test_path.write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('sensitive admin tabs are super-admin only and the login warning banner is gone', () => {
  const admin = readFileSync(new URL('../src/components/AdminModal.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(admin, /尚未登入超級管理員帳號/);
  assert.doesNotMatch(admin, /onSwitchToAdmin/);
  assert.match(admin, /\/\* 2\. 會員：僅超級管理員 \*\/\s*\{isEffectiveAdmin && \(/);
  assert.match(admin, /\/\* 3\. 音檔：僅超級管理員 \*\/\s*\{isEffectiveAdmin && \(/);
  assert.match(admin, /\/\* 5\. 分類標籤：僅超級管理員 \*\/\s*\{isEffectiveAdmin && \(/);
  assert.match(admin, /\/\* 6\. 網友關鍵字：僅超級管理員 \*\/\s*\{isEffectiveAdmin && \(/);
  for (const tab of ['users', 'tracks', 'categories', 'keywords']) {
    assert.match(admin, new RegExp(`\\{activeTab === '${tab}' && isEffectiveAdmin && \\(`));
  }
});

test('personal center no longer exposes a logout button or logout prop', () => {
  const profile = readFileSync(new URL('../src/components/ProfileModal.tsx', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(profile, /onLogout/);
  assert.doesNotMatch(profile, /<span>登出<\\/span>/);
  assert.doesNotMatch(profile, /LogOut/);
  assert.doesNotMatch(app, /onLogout=\{handleLogout\}/);
  assert.doesNotMatch(app, /onSwitchToAdmin=/);
});
""")
