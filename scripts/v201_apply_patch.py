from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing replacement in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))


def replace_all(path: str, old: str, new: str, expected_min: int = 1):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count < expected_min:
        raise SystemExit(f'missing replacement in {path}: {old[:120]!r}; count={count}')
    p.write_text(text.replace(old, new))

# 1. Homepage card more-menu copy.
replace_once('src/components/AudioCard.tsx', '<span>查看詳細內容</span>', '<span>詳細內容</span>')
replace_once("src/components/AudioCard.tsx", "<span>{isFavorite ? '取消收藏' : '收藏'}</span>", "<span>{isFavorite ? '取消收藏' : '加入收藏'}</span>")
replace_all("src/v181HomeToolbarDislike.ts", "label.textContent = '不喜歡';", "label.textContent = '不喜歡他';", 2)
replace_once('src/v181HomeToolbarDislike.css', '  font-size: 0.875rem;\n  font-weight: 700;', '  font-size: 0.875rem;\n  line-height: 1.25rem;\n  font-weight: 700;')

# 2. Shared Platinum-tools eligibility: approved members stay authoritative; legacy members without an explicit pending audit are repaired automatically.
replace_once(
    'shared/stickers.ts',
    "export function vipPasswordForTrack(trackId: string): string {",
    """export function isPlatinumToolsEligible(member: any): boolean {
  if (!member) return false;
  const rankApproved = Boolean(member.rankApproved);
  const auditStatus = String(member.rankAuditStatus || '').trim().toLowerCase();
  if (rankApproved) return isPlatinumOrAboveRank(member.approvedRank || member.rank);
  // A newly requested / changed rank that is explicitly waiting for approval must
  // not unlock privileged sticker/upline tools. Legacy imported members often have
  // no audit status; their stored Platinum+ rank is treated as the established rank.
  if (auditStatus === 'pending') return false;
  return isPlatinumOrAboveRank(member.approvedRank || member.rank);
}

export function vipPasswordForTrack(trackId: string): string {"""
)

# 3. Stickers UI uses the same policy and exposes the legacy-members audit to super admin.
replace_once(
    'src/components/StickersModal.tsx',
    "import { formatStickerAmount, isPlatinumOrAboveRank } from '../../shared/stickers';",
    "import { formatStickerAmount, isPlatinumToolsEligible } from '../../shared/stickers';"
)
replace_once(
    'src/components/StickersModal.tsx',
    "  const canGrant = superAdmin || Boolean(currentUser?.rankApproved && isPlatinumOrAboveRank(currentUser.approvedRank || currentUser.rank));\n  const canCreateDownlineInvite = Boolean(currentUser?.rankApproved && isPlatinumOrAboveRank(currentUser.approvedRank || currentUser.rank));",
    "  const canGrant = superAdmin || isPlatinumToolsEligible(currentUser);\n  const canCreateDownlineInvite = isPlatinumToolsEligible(currentUser);"
)
replace_once(
    'src/components/StickersModal.tsx',
    "  const [inviteNotice,setInviteNotice] = useState('');",
    "  const [inviteNotice,setInviteNotice] = useState('');\n  const [platinumAudit,setPlatinumAudit] = useState<{count:number;members:Array<{id:string;name:string;email:string;rank:string;approvedRank?:string;rankAuditStatus?:string}>} | null>(null);"
)
replace_once(
    'src/components/StickersModal.tsx',
    "  useEffect(()=>{\n    if(!initialSummary)return;",
    """  useEffect(()=>{
    if(!isOpen || !superAdmin){setPlatinumAudit(null);return;}
    let active=true;
    void requestJson('/api/stickers/platinum-tools-audit')
      .then(data=>{if(active)setPlatinumAudit({count:Number(data.count||0),members:Array.isArray(data.members)?data.members:[]});})
      .catch(()=>{if(active)setPlatinumAudit(null);});
    return()=>{active=false;};
  },[isOpen,superAdmin]);
  useEffect(()=>{
    if(!initialSummary)return;"""
)
replace_once(
    'src/components/StickersModal.tsx',
    "          {tab==='grant' && canGrant && <div className=\"space-y-3\">\n            {canCreateDownlineInvite && <section",
    """          {tab==='grant' && canGrant && <div className=\"space-y-3\">
            {superAdmin && platinumAudit && <section aria-label=\"白金工具自動補開檢查\" className=\"rounded-2xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 p-3 text-xs leading-relaxed\"><h3 className=\"font-black text-sm\">白金以上功能補開檢查</h3><p className=\"mt-1\">舊規則曾因缺少獎銜核准旗標而被擋住：<strong>{platinumAudit.count} 位</strong>。v201 已按既有正式／舊制獎銜規則自動補開。</p>{platinumAudit.members.length>0 && <p className=\"mt-1 break-words text-slate-600 dark:text-slate-300\">{platinumAudit.members.map(member=>`${member.name}（${member.rank || member.approvedRank || '未標示'}）`).join('、')}</p>}</section>}
            {canCreateDownlineInvite && <section"""
)

# 4. Sticker backend grants legacy established Platinum+ accounts the tools, while pending rank changes stay locked.
replace_once(
    'worker/stickerRouter.ts',
    "  isPlatinumOrAboveRank,\n  normalizeMemberName,",
    "  isPlatinumOrAboveRank,\n  isPlatinumToolsEligible,\n  normalizeMemberName,"
)
replace_once(
    'worker/stickerRouter.ts',
    "SELECT u.id, u.email, u.name, u.role, u.rank, u.approvedRank, u.rankApproved,\n           u.isAdminUser",
    "SELECT u.id, u.email, u.name, u.role, u.rank, u.approvedRank, u.rankApproved, u.rankAuditStatus,\n           u.isAdminUser"
)
replace_once(
    'worker/stickerRouter.ts',
    "function canGrantStickers(actor: any) {\n  return isSuperAdmin(actor) || (Boolean(actor?.rankApproved) && isPlatinumOrAboveRank(effectiveRank(actor)));\n}",
    "function canGrantStickers(actor: any) {\n  return isSuperAdmin(actor) || isPlatinumToolsEligible(actor);\n}"
)
replace_once(
    'worker/stickerRouter.ts',
    "  if (path === '/api/stickers/grant-targets' && method === 'GET') {",
    """  if (path === '/api/stickers/platinum-tools-audit' && method === 'GET') {
    if (!isSuperAdmin(actor)) return json({ error: '只有超級管理員可查看此檢查' }, 403);
    const { results } = await db.prepare(`SELECT id,name,email,rank,approvedRank,rankApproved,rankAuditStatus
      FROM users WHERE COALESCE(isBlocked,0)=0 ORDER BY name`).all();
    const members = (results || []).filter((member: any) => {
      const oldAllowed = Boolean(member.rankApproved) && isPlatinumOrAboveRank(member.approvedRank || member.rank);
      return isPlatinumToolsEligible(member) && !oldAllowed;
    }).map((member: any) => ({
      id: member.id, name: member.name, email: member.email, rank: member.rank,
      approvedRank: member.approvedRank, rankApproved: Boolean(member.rankApproved), rankAuditStatus: member.rankAuditStatus
    }));
    return json({ count: members.length, members });
  }

  if (path === '/api/stickers/grant-targets' && method === 'GET') {"""
)

# 5. Organization model: legacy established Platinum+ can own an upline group; Platinum+ can never be bound as a downline.
replace_once(
    'worker/organizationModel.ts',
    "import { isPlatinumOrAboveRank } from '../shared/stickers';",
    "import { isPlatinumOrAboveRank, isPlatinumToolsEligible } from '../shared/stickers';"
)
replace_once(
    'worker/organizationModel.ts',
    "SELECT u.id,u.name,u.email,u.amwayId,u.rank,u.approvedRank,u.rankApproved,u.isBlocked,om.memberOrder",
    "SELECT u.id,u.name,u.email,u.amwayId,u.rank,u.approvedRank,u.rankApproved,u.rankAuditStatus,u.isBlocked,om.memberOrder"
)
replace_once(
    'worker/organizationModel.ts',
    "export function highestApprovedKind(members: any[]): UplineKind | null {\n  const approved = members.filter(member => Boolean(member.rankApproved));\n  if (approved.some(member => /鑽石|皇冠|大使/.test(String(member.approvedRank || member.rank || '')))) return 'diamond';\n  if (approved.some(member => isPlatinumOrAboveRank(member.approvedRank || member.rank))) return 'platinum';\n  return null;\n}",
    """export function highestApprovedKind(members: any[]): UplineKind | null {
  const eligible = members.filter(member => isPlatinumToolsEligible(member));
  if (eligible.some(member => /鑽石|皇冠|大使/.test(String(member.rankApproved ? (member.approvedRank || member.rank) : member.rank || member.approvedRank || '')))) return 'diamond';
  if (eligible.some(member => isPlatinumOrAboveRank(member.rankApproved ? (member.approvedRank || member.rank) : member.rank || member.approvedRank))) return 'platinum';
  return null;
}"""
)
replace_once(
    'worker/organizationModel.ts',
    "SELECT id,name,amwayId,rank,approvedRank,rankApproved,isBlocked FROM users WHERE id=? LIMIT 1",
    "SELECT id,name,amwayId,rank,approvedRank,rankApproved,rankAuditStatus,isBlocked FROM users WHERE id=? LIMIT 1"
)
replace_once(
    'worker/organizationModel.ts',
    "  if (summary.members.some((member:any)=>member.id===memberId)) return { error: '不能把自己綁定成自己的下線', status: 400 } as const;\n  const now=Date.now();",
    """  if (summary.members.some((member:any)=>member.id===memberId)) return { error: '不能把自己綁定成自己的下線', status: 400 } as const;
  const target: any = await db.prepare('SELECT id,rank,approvedRank FROM users WHERE id=? LIMIT 1').bind(memberId).first();
  if (!target) return { error: '找不到要綁定的會員', status: 404 } as const;
  if (isPlatinumOrAboveRank(target.rank) || isPlatinumOrAboveRank(target.approvedRank)) {
    return { error: '白金或白金以上會員不可綁定成為下線', status: 409 } as const;
  }
  const now=Date.now();"""
)

# 6. Organization API supplies the exact admin-upline-name dictionary to profile autocomplete.
replace_once(
    'worker/organizationRouter.ts',
    "SELECT u.id,u.email,u.name,u.amwayId,u.rank,u.approvedRank,u.rankApproved,u.role,u.isBlocked,s.expiresAt",
    "SELECT u.id,u.email,u.name,u.amwayId,u.rank,u.approvedRank,u.rankApproved,u.rankAuditStatus,u.role,u.isBlocked,s.expiresAt"
)
replace_once(
    'worker/organizationRouter.ts',
    "  if (path === '/api/organization/couple-candidate' && method === 'GET') {",
    """  if (path === '/api/organization/upline-suggestions' && method === 'GET') {
    try {
      const { results } = await db.prepare(`SELECT kind,name FROM upline_names
        WHERE kind IN ('platinum','diamond') AND TRIM(COALESCE(name,''))<>''
        ORDER BY kind,name`).all();
      const platinum: string[] = [];
      const diamond: string[] = [];
      for (const row of results || []) {
        const name = String((row as any).name || '').trim();
        if (!name) continue;
        if ((row as any).kind === 'diamond') diamond.push(name);
        else if ((row as any).kind === 'platinum') platinum.push(name);
      }
      return json({ platinum: [...new Set(platinum)], diamond: [...new Set(diamond)] });
    } catch (error) {
      console.warn('Unable to load canonical upline name dictionary:', error);
      return json({ platinum: [], diamond: [] });
    }
  }

  if (path === '/api/organization/couple-candidate' && method === 'GET') {"""
)

# 7. Profile modal autocomplete reads the canonical backend list rather than inferring names from member rows.
replace_once(
    'src/components/ProfileModal.tsx',
    "  const [organizationDisplayName,setOrganizationDisplayName] = useState('');",
    "  const [organizationDisplayName,setOrganizationDisplayName] = useState('');\n  const [uplineDirectory,setUplineDirectory] = useState<{platinum:string[];diamond:string[]}>({platinum:[],diamond:[]});"
)
replace_once(
    'src/components/ProfileModal.tsx',
    "  useEffect(()=>{ if(isOpen && currentUser) void refreshOrganizationDisplay(); },[isOpen,currentUser?.id,currentUser?.name,currentUser?.amwayId]);",
    """  useEffect(()=>{ if(isOpen && currentUser) void refreshOrganizationDisplay(); },[isOpen,currentUser?.id,currentUser?.name,currentUser?.amwayId]);
  useEffect(()=>{
    if(!isOpen || !currentUser){setUplineDirectory({platinum:[],diamond:[]});return;}
    let active=true;
    void fetch('/api/organization/upline-suggestions',{credentials:'same-origin',cache:'no-store'})
      .then(async response=>response.ok ? response.json() : Promise.reject(new Error('upline suggestions unavailable')))
      .then(data=>{if(active)setUplineDirectory({
        platinum:Array.isArray(data?.platinum)?data.platinum.map(String).map((name:string)=>name.trim()).filter(Boolean):[],
        diamond:Array.isArray(data?.diamond)?data.diamond.map(String).map((name:string)=>name.trim()).filter(Boolean):[]
      });})
      .catch(()=>{if(active)setUplineDirectory({platinum:[],diamond:[]});});
    return()=>{active=false;};
  },[isOpen,currentUser?.id]);"""
)
old_suggestions = """  const platinumSuggestions = useMemo(() => {
    const set = new Set<string>();
    allUsers.forEach(u => {
      const rank = effectiveMemberRank(u, '');
      if (rank && (rank.includes('白金') || rank.includes('翡翠') || rank.includes('鑽石') || rank.includes('皇冠') || rank.includes('大使'))) {
        set.add(u.name);
      }
      if (u.platinumUpline) set.add(u.platinumUpline);
    });

    return Array.from(set).filter(n => n.toLowerCase().includes((platinumUpline || '').toLowerCase()));
  }, [allUsers, platinumUpline]);

  const diamondSuggestions = useMemo(() => {
    const set = new Set<string>();
    allUsers.forEach(u => {
      const rank = effectiveMemberRank(u, '');
      if (rank && (rank.includes('鑽石') || rank.includes('皇冠') || rank.includes('大使'))) {
        set.add(u.name);
      }
      if (u.diamondUpline) set.add(u.diamondUpline);
    });

    return Array.from(set).filter(n => n.toLowerCase().includes((diamondUpline || '').toLowerCase()));
  }, [allUsers, diamondUpline]);"""
new_suggestions = """  const platinumSuggestions = useMemo(() => {
    const query=(platinumUpline || '').trim().toLocaleLowerCase('zh-Hant');
    return uplineDirectory.platinum.filter(name => name.toLocaleLowerCase('zh-Hant').includes(query));
  }, [uplineDirectory.platinum, platinumUpline]);

  const diamondSuggestions = useMemo(() => {
    const query=(diamondUpline || '').trim().toLocaleLowerCase('zh-Hant');
    return uplineDirectory.diamond.filter(name => name.toLocaleLowerCase('zh-Hant').includes(query));
  }, [uplineDirectory.diamond, diamondUpline]);"""
replace_once('src/components/ProfileModal.tsx', old_suggestions, new_suggestions)

# 8. Login/profile completion policy uses the shared required-field contract (email excluded) and explicitly handles brand-new members once.
replace_once(
    'src/googleIdentityBridge.ts',
    "import { GOOGLE_CLIENT_ID } from './config/auth';",
    "import { GOOGLE_CLIENT_ID } from './config/auth';\nimport { missingProfileFields } from '../shared/profileCompletion';"
)
replace_once(
    'src/googleIdentityBridge.ts',
    "const SESSION_CHECK_TTL = 10 * 60 * 1000;\nconst originalFetch = window.fetch.bind(window);\n\nconst REQUIRED_PROFILE_FIELDS = [\n  'name',\n  'amwayId',\n  'residence',\n  'center',\n  'rank',\n  'joinReason',\n  'stayReason',\n  'sponsor',\n  'platinumUpline',\n  'diamondUpline',\n  'birthday'\n] as const;",
    "const SESSION_CHECK_TTL = 10 * 60 * 1000;\nconst NEW_MEMBER_PROFILE_MARKER = 'echostars_v201_new_member_profile_edit';\nconst originalFetch = window.fetch.bind(window);"
)
replace_once(
    'src/googleIdentityBridge.ts',
    "function profileNeedsCompletion(user: any | null) {\n  if (!user) return false;\n  return REQUIRED_PROFILE_FIELDS.some(field => String(user?.[field] ?? '').trim() === '');\n}",
    """function profileNeedsCompletion(user: any | null) {
  if (!user) return false;
  return missingProfileFields(user).length > 0;
}

function newMemberNeedsFirstProfileEdit(user: any | null) {
  if (!user?.id) return false;
  return sessionStorage.getItem(NEW_MEMBER_PROFILE_MARKER) === String(user.id);
}"""
)
replace_once(
    'src/googleIdentityBridge.ts',
    "    localStorage.setItem(USER_KEY, JSON.stringify(user));\n    sessionStorage.setItem(SESSION_CHECK_KEY, String(Date.now()));\n    setStatus(profileNeedsCompletion(user) ? '登入成功，正在開啟個人資料…' : '登入成功，正在同步學習紀錄…');",
    """    localStorage.setItem(USER_KEY, JSON.stringify(user));
    sessionStorage.setItem(SESSION_CHECK_KEY, String(Date.now()));
    if (data.isNewUser) sessionStorage.setItem(NEW_MEMBER_PROFILE_MARKER, String(user.id));
    setStatus((data.isNewUser || profileNeedsCompletion(user)) ? '登入成功，正在開啟個人資料…' : '登入成功，正在同步學習紀錄…');"""
)
replace_once(
    'src/googleIdentityBridge.ts',
    "  if (!profileNeedsCompletion(cachedUser) || incompleteProfilePromptedThisLoad) return;",
    "  if ((!profileNeedsCompletion(cachedUser) && !newMemberNeedsFirstProfileEdit(cachedUser)) || incompleteProfilePromptedThisLoad) return;"
)
replace_once(
    'src/googleIdentityBridge.ts',
    "  incompleteProfileEditStartedThisLoad = true;\n  editButton.click();",
    "  incompleteProfileEditStartedThisLoad = true;\n  if (newMemberNeedsFirstProfileEdit(readCachedUser())) sessionStorage.removeItem(NEW_MEMBER_PROFILE_MARKER);\n  editButton.click();"
)

# 9. Tests: profile login and canonical upline source.
Path('tests/profileLoginUx.test.ts').write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bridge = readFileSync(new URL('../src/googleIdentityBridge.ts', import.meta.url), 'utf8');
const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const completion = readFileSync(new URL('../shared/profileCompletion.ts', import.meta.url), 'utf8');

test('new members and members with incomplete basic data enter profile edit mode; email is not a required field', () => {
  assert.match(bridge, /missingProfileFields/);
  assert.match(bridge, /NEW_MEMBER_PROFILE_MARKER/);
  assert.match(bridge, /data\.isNewUser/);
  assert.match(bridge, /newMemberNeedsFirstProfileEdit/);
  assert.match(bridge, /resumeIncompleteProfileEdit/);
  assert.match(bridge, /profileButton\.click\(\)/);
  assert.match(bridge, /editButton\.click\(\)/);
  assert.match(completion, /'avatar'/);
  for (const field of ['name','amwayId','residence','center','rank','joinReason','stayReason','sponsor','platinumUpline','diamondUpline','birthday']) assert.match(completion,new RegExp(`'${field}'`));
  assert.doesNotMatch(completion, /'email'/);
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
  assert.match(navbar, /<LogOut className=\"w-4 h-4(?: [^\"]*)?\" \/>/);
  assert.match(navbar, /<span>登出<\/span>/);
  assert.match(navbar, /const handleLogout = \(\) =>/);
  assert.match(bridge, /button\[title=\"登出目前帳號\"\]/);
  assert.match(bridge, /logoutButton\.dataset\.echostarsHiddenLogout/);
  assert.match(bridge, /logoutButton\.style\.display = 'none'/);
});

test('profile save action remains a high-contrast emerald call to action', () => {
  assert.match(bridge, /saveButton\.textContent = '儲存資料'/);
  assert.match(bridge, /saveButton\.style\.background = '#10b981'/);
  assert.match(bridge, /saveButton\.style\.fontWeight = '900'/);
  assert.match(bridge, /saveButton\.style\.boxShadow = '0 8px 22px rgba\\\(16,185,129,0\\\.35\\\)'/);
});
""")

Path('tests/profileUplineAutocomplete.test.ts').write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profile = readFileSync(new URL('../src/components/ProfileModal.tsx', import.meta.url), 'utf8');
const router = readFileSync(new URL('../worker/organizationRouter.ts', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../src/components/UplineManagement.tsx', import.meta.url), 'utf8');

test('profile upline autocomplete reads the same canonical names maintained by Admin > 上手名單', () => {
  assert.match(admin, /\/api\/admin\/uplines/);
  assert.match(router, /\/api\/organization\/upline-suggestions/);
  assert.match(router, /SELECT kind,name FROM upline_names/);
  assert.match(profile, /fetch\('\/api\/organization\/upline-suggestions'/);
  assert.match(profile, /uplineDirectory\.platinum\.filter/);
  assert.match(profile, /uplineDirectory\.diamond\.filter/);
  assert.doesNotMatch(profile, /if \(u\.platinumUpline\) set\.add/);
  assert.doesNotMatch(profile, /if \(u\.diamondUpline\) set\.add/);
});

test('platinum and diamond fields still open and apply related-name suggestions', () => {
  assert.match(profile, /setActiveSuggestField\('platinum'\)/);
  assert.match(profile, /setActiveSuggestField\('diamond'\)/);
  assert.match(profile, /activeSuggestField === 'platinum' && platinumSuggestions\.length > 0/);
  assert.match(profile, /activeSuggestField === 'diamond' && diamondSuggestions\.length > 0/);
  assert.match(profile, /setPlatinumUpline\(nameItem\)/);
  assert.match(profile, /setDiamondUpline\(nameItem\)/);
});
""")

# Extend organization test schema for the new legacy-policy field and canonical dictionary.
replace_once('tests/organizationRelationships.test.ts', "      rankApproved INTEGER DEFAULT 0,\n      role TEXT DEFAULT '一般夥伴',", "      rankApproved INTEGER DEFAULT 0,\n      rankAuditStatus TEXT,\n      role TEXT DEFAULT '一般夥伴',")
replace_once('tests/organizationRelationships.test.ts', "    CREATE TABLE upline_owners (kind TEXT NOT NULL,name TEXT NOT NULL,userId TEXT NOT NULL,PRIMARY KEY(kind,name));", "    CREATE TABLE upline_owners (kind TEXT NOT NULL,name TEXT NOT NULL,userId TEXT NOT NULL,PRIMARY KEY(kind,name));\n    CREATE TABLE upline_names (kind TEXT NOT NULL,name TEXT NOT NULL,PRIMARY KEY(kind,name));")
replace_once(
    'tests/organizationRelationships.test.ts',
    "  // A member cannot use the shared invite to become their own downline.\n  const self=await call(db,ownerToken,'/api/organization/invite-accept','POST',{dealerId:'D500'});\n  assert.equal(self.status,400);",
    """  // A member cannot use the shared invite to become their own downline.
  const self=await call(db,ownerToken,'/api/organization/invite-accept','POST',{dealerId:'D500'});
  assert.equal(self.status,400);

  // Platinum+ members can never be bound as downlines, even if an invite is valid.
  db.sqlite.prepare(`INSERT INTO users(id,name,email,amwayId,rank,approvedRank,rankApproved,rankAuditStatus,registerDate,platinumUpline,diamondUpline)
    VALUES ('platinumTarget','白金目標','pt@example.com','PT1','白金','白金',1,'approved','2025-05-01','','')`).run();
  const platinumToken=await session(db,'platinumTarget');
  const rejected=await call(db,platinumToken,'/api/organization/invite-accept','POST',{dealerId:'D500'});
  assert.equal(rejected.status,409);
  assert.match(rejected.data.error,/白金或白金以上/);"""
)

# New static integration test for v201 policy/menu/audit.
Path('tests/v201MemberProfileMenuTools.test.ts').write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const audio = readFileSync(new URL('../src/components/AudioCard.tsx', import.meta.url), 'utf8');
const dislike = readFileSync(new URL('../src/v181HomeToolbarDislike.ts', import.meta.url), 'utf8');
const dislikeCss = readFileSync(new URL('../src/v181HomeToolbarDislike.css', import.meta.url), 'utf8');
const stickers = readFileSync(new URL('../src/components/StickersModal.tsx', import.meta.url), 'utf8');
const shared = readFileSync(new URL('../shared/stickers.ts', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../worker/stickerRouter.ts', import.meta.url), 'utf8');
const organization = readFileSync(new URL('../worker/organizationModel.ts', import.meta.url), 'utf8');

test('homepage card menu uses the requested compact copy and matching text size', () => {
  assert.match(audio, />詳細內容<\/span>/);
  assert.match(audio, /'加入收藏'/);
  assert.match(dislike, /label\.textContent = '不喜歡他'/);
  assert.match(dislikeCss, /font-size: 0\.875rem;[\s\S]*line-height: 1\.25rem;/);
});

test('Platinum tools use one shared legacy-safe eligibility rule in UI and backend', () => {
  assert.match(shared, /function isPlatinumToolsEligible/);
  assert.match(shared, /auditStatus === 'pending'/);
  assert.match(stickers, /isPlatinumToolsEligible\(currentUser\)/);
  assert.match(backend, /isSuperAdmin\(actor\) \|\| isPlatinumToolsEligible\(actor\)/);
  assert.match(backend, /\/api\/stickers\/platinum-tools-audit/);
});

test('downline binding rejects any member already at Platinum or above', () => {
  assert.match(organization, /isPlatinumOrAboveRank\(target\.rank\) \|\| isPlatinumOrAboveRank\(target\.approvedRank\)/);
  assert.match(organization, /白金或白金以上會員不可綁定成為下線/);
});
""")

# 10. Plain-language changelog.
Path('src/v201ReleaseNote.ts').write_text("""type ChangelogEntry = {version:string;date:string;isLatest?:boolean;summary:string;added:string[];modified:string[];removed:string[]};
const V201_RELEASE:ChangelogEntry={
  version:'v201',date:'2026/10/13',isLatest:true,
  summary:'調整首頁音檔卡片選單、白金以上會員貼紙／下線工具、基本資料自動補完，以及上手白金／鑽石關聯詞來源。',
  added:[
    '白金以上會員的「我的貼紙」會依正式或舊制既有獎銜自動顯示「人工加貼紙」與「綁定成為我下線」；明確等待獎銜審核者仍不會提前取得權限。',
    '超級管理員可在人工加貼紙頁看到舊規則曾漏開的白金以上會員檢查名單。',
    '上手白金／上手鑽石的關聯詞改為直接讀取「後台管理 > 上手名單」的正式詞庫。'
  ],
  modified:[
    '首頁音檔卡片「…」選單改為「詳細內容」、「加入收藏」與「不喜歡他」，並統一選項字級。',
    '剛註冊的新會員，以及基本資料仍有任一必填欄位未完成的會員，登入後會直接進入基本資料修改模式；Email 不列入完整度判斷。',
    '下線綁定在伺服器端新增限制：已是白金或白金以上的會員不能再被綁定為下線。'
  ],
  removed:['移除以整份會員名單推測上手關聯詞的做法，避免關聯詞與後台上手名單不同步。']
};
const runtime=window as Window&typeof globalThis&{__ECHOSTARS_V201_RELEASE_PATCH__?:boolean};
function isChangelogGet(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1]){const method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();if(method!=='GET')return false;try{const raw=input instanceof Request?input.url:String(input);const url=new URL(raw,window.location.origin);return url.origin===window.location.origin&&url.pathname==='/api/changelog';}catch{return false;}}
function merge(data:unknown){const list=Array.isArray(data)?data.filter(item=>item&&typeof item==='object') as ChangelogEntry[]:[];return[V201_RELEASE,...list.filter(item=>item.version!==V201_RELEASE.version).map(item=>({...item,isLatest:false}))];}
if(!runtime.__ECHOSTARS_V201_RELEASE_PATCH__){runtime.__ECHOSTARS_V201_RELEASE_PATCH__=true;const previousFetch=window.fetch.bind(window);window.fetch=(async(...args:Parameters<typeof fetch>)=>{const[input,init]=args;if(!isChangelogGet(input,init))return previousFetch(...args);try{const response=await previousFetch(...args);const data=response.ok?await response.clone().json().catch(()=>[]):[];const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=utf-8');headers.delete('Content-Length');headers.delete('Content-Encoding');return new Response(JSON.stringify(merge(data)),{status:200,statusText:'OK',headers});}catch{return new Response(JSON.stringify(merge([])),{status:200,headers:{'Content-Type':'application/json; charset=utf-8'}});}}) as typeof window.fetch;}
""")
replace_once('index.html', '    <script type="module" src="/src/v200ReleaseNote.ts"></script>', '    <script type="module" src="/src/v200ReleaseNote.ts"></script>\n    <script type="module" src="/src/v201ReleaseNote.ts"></script>')

print('v201 patch applied')
