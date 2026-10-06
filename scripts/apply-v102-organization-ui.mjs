import { readFileSync, writeFileSync } from 'node:fs';

function read(path) { return readFileSync(path, 'utf8'); }
function write(path, value) { writeFileSync(path, value); }
function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one anchor, found ${count}`);
  return source.replace(before, after);
}

// ---------------------------------------------------------------------------
// StickersModal: invite block at the top of 人工加貼紙
// ---------------------------------------------------------------------------
{
  const path = 'src/components/StickersModal.tsx';
  let s = read(path);
  s = replaceOnce(s,
    "import { Trophy, X, History, SlidersHorizontal, ListChecks, PlusCircle, Search, ArrowUpRight } from 'lucide-react';",
    "import { Trophy, X, History, SlidersHorizontal, ListChecks, PlusCircle, Search, ArrowUpRight, Copy, Share2 } from 'lucide-react';",
    'StickersModal icons');

  s = replaceOnce(s,
`  onTracksUpdated?: (tracks: Track[]) => void; onStickerChanged?: () => void;
  onOpenSource?: (source: StickerSource) => void;
}`,
`  onTracksUpdated?: (tracks: Track[]) => void; onStickerChanged?: () => void;
  onOpenSource?: (source: StickerSource) => void;
  onRequireProfileEdit?: () => void;
}`,
    'StickersModal props');

  s = replaceOnce(s,
`export const StickersModal: React.FC<StickersModalProps> = ({isOpen,onClose,currentUser,tracks,initialSummary,onTracksUpdated,onStickerChanged,onOpenSource}) => {`,
`export const StickersModal: React.FC<StickersModalProps> = ({isOpen,onClose,currentUser,tracks,initialSummary,onTracksUpdated,onStickerChanged,onOpenSource,onRequireProfileEdit}) => {`,
    'StickersModal destructure');

  s = replaceOnce(s,
`  const canGrant = superAdmin || Boolean(currentUser?.rankApproved && isPlatinumOrAboveRank(currentUser.approvedRank || currentUser.rank));
  const [summary,setSummary] = useState<StickerSummary | null>(initialSummary || null);`,
`  const canGrant = superAdmin || Boolean(currentUser?.rankApproved && isPlatinumOrAboveRank(currentUser.approvedRank || currentUser.rank));
  const canCreateDownlineInvite = Boolean(currentUser?.rankApproved && isPlatinumOrAboveRank(currentUser.approvedRank || currentUser.rank));
  const [summary,setSummary] = useState<StickerSummary | null>(initialSummary || null);`,
    'invite eligibility');

  s = replaceOnce(s,
`  const [batchUnlockCost,setBatchUnlockCost] = useState(''); const [batchCommentReward,setBatchCommentReward] = useState('');
  const requestSequence = useRef(0); const mutationPending = useRef(false);`,
`  const [batchUnlockCost,setBatchUnlockCost] = useState(''); const [batchCommentReward,setBatchCommentReward] = useState('');
  const [inviteInfo,setInviteInfo] = useState<{url:string;dealerId:string;displayName:string;kind:'platinum'|'diamond'} | null>(null);
  const [inviteBusy,setInviteBusy] = useState(false);
  const [inviteNotice,setInviteNotice] = useState('');
  const requestSequence = useRef(0); const mutationPending = useRef(false);`,
    'invite state');

  s = replaceOnce(s,
`  const saveRules = () => mutate(async () => {
    const data=await requestJson('/api/stickers/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(settings)});
    setSettings(data.settings);setFeedbackRules(data.settings);notifyChanged();
  });
  const transactions = (rows: StickerTransaction[]) => <div className="space-y-1">`,
`  const saveRules = () => mutate(async () => {
    const data=await requestJson('/api/stickers/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(settings)});
    setSettings(data.settings);setFeedbackRules(data.settings);notifyChanged();
  });
  const copyText = async (text: string) => {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
    const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();document.execCommand('copy');input.remove();
  };
  const ensureInviteInfo = async () => {
    if (!currentUser?.amwayId?.trim()) { onRequireProfileEdit?.(); return null; }
    if (inviteInfo) return inviteInfo;
    setInviteBusy(true);setInviteNotice('');setError('');
    try {
      const data=await requestJson('/api/organization/invite-link');
      const info={url:String(data.url||''),dealerId:String(data.dealerId||''),displayName:String(data.displayName||currentUser.name||''),kind:data.kind as 'platinum'|'diamond'};
      setInviteInfo(info);return info;
    } catch(reason) { setError(reason instanceof Error?reason.message:'無法產生專屬網址');return null; }
    finally { setInviteBusy(false); }
  };
  const copyInvite = async () => {
    const info=await ensureInviteInfo();if(!info)return;
    try { await copyText(info.url);setInviteNotice('專屬網址已複製'); } catch { setError('無法複製網址，請再試一次'); }
  };
  const shareInvite = async () => {
    const info=await ensureInviteInfo();if(!info)return;
    const text=\`點開連結並登入繁星回聲，即可綁定成為 \${info.displayName} 的下線。\`;
    try {
      if (navigator.share) await navigator.share({title:'綁定成為我下線',text,url:info.url});
      else { await copyText(info.url);setInviteNotice('此裝置沒有分享選單，已幫您複製網址'); }
    } catch(reason:any) { if (reason?.name!=='AbortError') setError('分享失敗，請再試一次'); }
  };
  const transactions = (rows: StickerTransaction[]) => <div className="space-y-1">`,
    'invite helpers');

  s = replaceOnce(s,
`          {tab==='grant' && canGrant && <div className="space-y-3">
            {!superAdmin && <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-3 py-2 text-xs leading-relaxed">加發給下線的貼紙會從你自己的餘額扣除。目前可用：<strong>{formatStickerAmount(summary?.balance || 0)} 張</strong>。</div>}`,
`          {tab==='grant' && canGrant && <div className="space-y-3">
            {canCreateDownlineInvite && <section aria-label="綁定成為我下線" className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-2 bg-slate-50 dark:bg-slate-800/60">
              <div><h3 className="font-black">綁定成為我下線</h3><p className="text-xs text-slate-500 dark:text-slate-400 mt-1">分享您的專屬網址。已登入會員點開後，系統會依您或夫妻共同事業體的最高已審核獎銜，自動綁定上手白金或上手鑽石。</p></div>
              {currentUser?.amwayId?.trim() ? <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs break-all"><p className="font-bold">直銷商編號：{currentUser.amwayId.trim()}</p>{inviteInfo?.displayName && <p className="text-slate-500 mt-0.5">共同顯示：{inviteInfo.displayName}</p>}{inviteInfo?.url && <p className="text-slate-500 mt-1">{inviteInfo.url}</p>}</div> : <button type="button" onClick={onRequireProfileEdit} className="w-full rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs font-bold text-amber-700 dark:text-amber-300">請先填寫基本資料的「直銷商編號」</button>}
              {inviteNotice && <p role="status" className="text-xs font-bold text-emerald-600">{inviteNotice}</p>}
              <div className="grid grid-cols-2 gap-2"><button type="button" disabled={inviteBusy} onClick={()=>void copyInvite()} className="py-2.5 rounded-xl text-white font-bold flex items-center justify-center gap-1.5 disabled:opacity-50" style={primary}><Copy className="w-4 h-4"/>複製網址</button><button type="button" disabled={inviteBusy} onClick={()=>void shareInvite()} className="py-2.5 rounded-xl text-white font-bold flex items-center justify-center gap-1.5 disabled:opacity-50" style={primary}><Share2 className="w-4 h-4"/>傳 LINE 或 APP</button></div>
            </section>}
            {!superAdmin && <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-3 py-2 text-xs leading-relaxed">加發給下線的貼紙會從你自己的餘額扣除。目前可用：<strong>{formatStickerAmount(summary?.balance || 0)} 張</strong>。</div>}`,
    'invite section');
  write(path,s);
}

// ---------------------------------------------------------------------------
// ProfileModal: personal name stays personal; view mode renders organization A&B.
// Also support opening directly in edit mode when dealer ID is missing.
// ---------------------------------------------------------------------------
{
  const path='src/components/ProfileModal.tsx';
  let s=read(path);
  s=replaceOnce(s,
`  onClearListeningHistory?: () => Promise<void>;
  allUsers?: UserProfile[];
}`,
`  onClearListeningHistory?: () => Promise<void>;
  allUsers?: UserProfile[];
  forceEdit?: boolean;
  onForceEditHandled?: () => void;
}`,
    'Profile props');
  s=replaceOnce(s,
`  onRateTrack,
  onClearListeningHistory,
  allUsers = []
}) => {`,
`  onRateTrack,
  onClearListeningHistory,
  allUsers = [],
  forceEdit = false,
  onForceEditHandled
}) => {`,
    'Profile destructure');
  s=replaceOnce(s,
`  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Standard Google OAuth 2.0 Sign In`,
`  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [organizationDisplayName,setOrganizationDisplayName] = useState('');

  const refreshOrganizationDisplay = async () => {
    if (!currentUser?.id || !currentUser.amwayId?.trim()) { setOrganizationDisplayName(''); return; }
    try {
      const response=await fetch('/api/organization/me');
      const data=await response.json().catch(()=>({}));
      if (response.ok) setOrganizationDisplayName(String(data.displayName || currentUser.name || ''));
    } catch { /* display falls back to the member's own name */ }
  };
  useEffect(()=>{ if(isOpen && currentUser) void refreshOrganizationDisplay(); },[isOpen,currentUser?.id,currentUser?.name,currentUser?.amwayId]);
  useEffect(()=>{
    if(!isOpen || !forceEdit || !currentUser)return;
    setName(currentUser.name || '');setAmwayId(currentUser.amwayId || '');setPhone(currentUser.phone || '');setResidence(currentUser.residence || '臺北');setCenter(currentUser.center || '無');setRank(currentUser.rank || '無');setJoinReason(currentUser.joinReason || '事業');setStayReason(currentUser.stayReason || '未填寫');setSponsor(currentUser.sponsor || '');setPlatinumUpline(currentUser.platinumUpline || '');setDiamondUpline(currentUser.diamondUpline || '');setBirthday(currentUser.birthday || '');setAvatar(currentUser.avatar || '');setIsEditing(true);onForceEditHandled?.();
  },[isOpen,forceEdit,currentUser?.id]);

  // Standard Google OAuth 2.0 Sign In`,
    'Profile organization state');
  s=replaceOnce(s,
`      await onUpdateProfile(payload);
      setIsEditing(false);`,
`      await onUpdateProfile(payload);
      await refreshOrganizationDisplay();
      setIsEditing(false);`,
    'Profile refresh after save');
  s=replaceOnce(s,
`                                {currentUser.name}
                              </h3>`,
`                                {organizationDisplayName || currentUser.name}
                              </h3>`,
    'Profile display name');
  s=s.replace('安麗編號: {currentUser.amwayId || \'未填寫\'}','直銷商編號: {currentUser.amwayId || \'未填寫\'}');
  s=s.replace('                            安麗編號\n','                            直銷商編號\n');
  write(path,s);
}

// ---------------------------------------------------------------------------
// App: couple confirmation during profile save, direct /upline/:dealerId accept,
// and bridge Stickers -> forced Profile edit.
// ---------------------------------------------------------------------------
{
  const path='src/App.tsx';
  let s=read(path);
  s=replaceOnce(s,
`  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);`,
`  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileEditRequested,setProfileEditRequested] = useState(false);
  const uplineInviteHandledRef = useRef('');
  const [isShareOpen, setIsShareOpen] = useState(false);`,
    'App profile edit state');

  s=replaceOnce(s,
`  const showPermissionAlert = useCallback((message: string, anchor?: HTMLElement | null) => {
    setPermissionAlert(message);
    if (!anchor || typeof window === 'undefined') {
      setPermissionAlertPosition(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const maxWidth = Math.min(384, window.innerWidth - 16);
    const left = Math.max(8, Math.min(window.innerWidth - maxWidth - 8, rect.left + rect.width / 2 - maxWidth / 2));
    const estimatedHeight = 150;
    const top = rect.bottom + estimatedHeight + 12 <= window.innerHeight
      ? rect.bottom + 8
      : Math.max(8, rect.top - estimatedHeight - 8);
    setPermissionAlertPosition({ left, top });
  }, []);

  // Requirement 5:`,
`  const showPermissionAlert = useCallback((message: string, anchor?: HTMLElement | null) => {
    setPermissionAlert(message);
    if (!anchor || typeof window === 'undefined') {
      setPermissionAlertPosition(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const maxWidth = Math.min(384, window.innerWidth - 16);
    const left = Math.max(8, Math.min(window.innerWidth - maxWidth - 8, rect.left + rect.width / 2 - maxWidth / 2));
    const estimatedHeight = 150;
    const top = rect.bottom + estimatedHeight + 12 <= window.innerHeight
      ? rect.bottom + 8
      : Math.max(8, rect.top - estimatedHeight - 8);
    setPermissionAlertPosition({ left, top });
  }, []);

  useEffect(()=>{
    if(typeof window==='undefined')return;
    const match=window.location.pathname.match(/^\\/upline\\/([^/]+)\\/?$/);
    if(!match)return;
    const dealerId=decodeURIComponent(match[1] || '').trim();
    if(!dealerId)return;
    if(!currentUser){setIsProfileOpen(true);return;}
    const operationKey=\`${currentUser.id}:\${dealerId}\`;
    if(uplineInviteHandledRef.current===operationKey)return;
    uplineInviteHandledRef.current=operationKey;
    void apiJson('/api/organization/invite-accept',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dealerId})}).then(data=>{
      if(data.user){const updated={...currentUser,...data.user};setCurrentUser(updated);localStorage.setItem('sq_current_user_v1',JSON.stringify(updated));setAllUsers(prev=>[...prev.filter(user=>user.id!==updated.id),updated]);}
      showStickerNotice(data.message || \`已完成下線綁定：\${data.displayName || ''}\`,2);
      setIsProfileOpen(false);setIsStickersOpen(false);setCurrentTab('home');
      window.history.replaceState({echostars:true,view:'home'},'',window.location.origin + '/');
    }).catch(error=>{showPermissionAlert(error instanceof Error?error.message:'下線綁定失敗，請重新開啟邀請連結');});
  },[currentUser?.id,showPermissionAlert]);

  // Requirement 5:`,
    'App upline accept effect');

  s=replaceOnce(s,
`  const handleUpdateProfile = async (updatedProfile: Partial<UserProfile>) => {
    if (!currentUser) return;

    const isRankChanged = updatedProfile.rank && updatedProfile.rank !== currentUser.rank;`,
`  const handleUpdateProfile = async (updatedProfile: Partial<UserProfile>) => {
    if (!currentUser) return;

    const requestedDealerId=String(updatedProfile.amwayId ?? currentUser.amwayId ?? '').trim();
    if(requestedDealerId){
      const candidateResponse=await fetch(\`/api/organization/couple-candidate?dealerId=\${encodeURIComponent(requestedDealerId)}\`);
      const candidateData=await candidateResponse.json().catch(()=>({}));
      if(!candidateResponse.ok) throw new Error(candidateData.error || '無法確認直銷商編號');
      if(candidateData.candidate && !candidateData.linked){
        const partnerName=String(candidateData.candidate.name || '此會員');
        const accepted=window.confirm(\`是否要綁定與\${partnerName}為夫妻關係嗎？\`);
        if(!accepted) throw new Error('此直銷商編號已由其他會員使用。若不是夫妻，請改成正確的直銷商編號後再儲存。');
        await apiJson('/api/organization/couple-bind',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dealerId:requestedDealerId,partnerUserId:candidateData.candidate.id})});
      }
    }

    const isRankChanged = updatedProfile.rank && updatedProfile.rank !== currentUser.rank;`,
    'App couple save preflight');

  s=replaceOnce(s,
`        onClearListeningHistory={handleClearListeningHistory}
        allUsers={allUsers}
      />`,
`        onClearListeningHistory={handleClearListeningHistory}
        allUsers={allUsers}
        forceEdit={profileEditRequested}
        onForceEditHandled={()=>setProfileEditRequested(false)}
      />`,
    'Profile force edit props');

  s=replaceOnce(s,
`        initialSummary={stickerSummary}
        onOpenSource={source => {`,
`        initialSummary={stickerSummary}
        onRequireProfileEdit={()=>{setIsStickersOpen(false);setProfileEditRequested(true);setIsProfileOpen(true);}}
        onOpenSource={source => {`,
    'Stickers profile bridge');
  write(path,s);
}

// ---------------------------------------------------------------------------
// PWA + changelog + release test
// ---------------------------------------------------------------------------
{
  const sw='public/sw.js';
  let s=read(sw);
  s=replaceOnce(s,"const CACHE_NAME = 'echostars-shell-v101';","const CACHE_NAME = 'echostars-shell-v102';",'PWA version');
  write(sw,s);
}
{
  const path='tests/releaseIntegrity.test.ts';
  let s=read(path);
  s=replaceOnce(s,"test('v101 is the single current PWA cache version', () => {\n  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v101'/);","test('v102 is the single current PWA cache version', () => {\n  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v102'/);",'release version test');
  write(path,s);
}
{
  const path='src/changelogReleaseNotes.ts';
  let s=read(path);
  s=replaceOnce(s,"version: 'v4.1', date: '2026/10/06', isLatest: true,","version: 'v4.1', date: '2026/10/06',",'previous latest flag');
  const anchor="const RELEASE_NOTES = [RANK_STICKER_RELEASE_NOTES, STICKER_PAGES_RELEASE_NOTES, HEALTHCHECK_RELEASE_NOTES, CUMULATIVE_RELEASE_NOTES];";
  const release=`export const ORGANIZATION_RELEASE_NOTES: ChangelogEntry = {\n  version: 'v4.2', date: '2026/10/07', isLatest: true,\n  summary: '重新整理測試與組織關係架構，讓召喚繁星立即啟動、後台真正整頁顯示，並新增夫妻共同直銷商編號與專屬下線綁定網址。',\n  added: [\n    '「我的貼紙＞人工加貼紙」新增「綁定成為我下線」：白金級以上可複製專屬網址或直接呼叫 LINE／其他 APP 分享；網址尾端使用直銷商編號。',\n    '登入會員開啟專屬網址後，會依發送者或夫妻共同事業體的最高已審核獎銜，自動更新上手白金或上手鑽石。',\n    '兩位會員輸入相同直銷商編號時，系統會詢問是否建立夫妻關係；單方確認即可成立，超過兩位同編號則停止自動綁定並要求管理處理。'\n  ],\n  modified: [\n    '夫妻只共用直銷商編號、下線組織與專屬邀請網址；貼紙、播放進度、心得、按讚、評價、通知與其他個人紀錄全部維持各自獨立。',\n    '夫妻個人姓名仍各自保存與編輯；基本資料非修改狀態自動顯示 A&B，任何一方改名後共同組織名稱會同步更新。',\n    '首頁照片上、下方進度與權限文字只恢復到改版前的字體大小，其餘貼紙文案與判定不變。',\n    '「💫召喚繁星解答」按下後立即開始轉輪動畫，貼紙與資格驗證在動畫進行時同步完成，不再先等待網路回應。',\n    '後台管理改為真正的網頁整頁模式，不再用彈出視窗假裝全頁。',\n    '部署測試改為每個測試檔都完整執行，單一失敗不會遮住其他結果；TypeScript 與正式建置也會持續檢查。'\n  ],\n  removed: [\n    '移除夫妻與下線組織以姓名當作唯一關聯依據的做法，改用固定會員 ID 與共同事業體 ID 保存關係。'\n  ]\n};\n\nconst RELEASE_NOTES = [ORGANIZATION_RELEASE_NOTES, RANK_STICKER_RELEASE_NOTES, STICKER_PAGES_RELEASE_NOTES, HEALTHCHECK_RELEASE_NOTES, CUMULATIVE_RELEASE_NOTES];`;
  s=replaceOnce(s,anchor,release,'v4.2 changelog');
  write(path,s);
}

// UI wiring regression test.
write('tests/organizationUi.test.ts', `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\nconst app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');\nconst stickers=readFileSync(new URL('../src/components/StickersModal.tsx',import.meta.url),'utf8');\nconst profile=readFileSync(new URL('../src/components/ProfileModal.tsx',import.meta.url),'utf8');\nconst changelog=readFileSync(new URL('../src/changelogReleaseNotes.ts',import.meta.url),'utf8');\n\ntest('manual sticker page exposes the approved-leader downline invite actions',()=>{\n  assert.match(stickers,/綁定成為我下線/);\n  assert.match(stickers,/複製網址/);\n  assert.match(stickers,/傳 LINE 或 APP/);\n  assert.match(stickers,/\\/api\\/organization\\/invite-link/);\n  assert.match(stickers,/navigator\\.share/);\n  assert.match(stickers,/onRequireProfileEdit/);\n});\n\ntest('profile keeps personal edit name while showing the canonical couple display name',()=>{\n  assert.match(profile,/organizationDisplayName \\|\\| currentUser\\.name/);\n  assert.match(profile,/value=\\{name\\}/);\n  assert.match(profile,/\\/api\\/organization\\/me/);\n  assert.match(profile,/forceEdit/);\n  assert.match(profile,/直銷商編號/);\n});\n\ntest('profile save confirms duplicate dealer ID and direct invite route auto binds signed-in members',()=>{\n  assert.match(app,/couple-candidate\\?dealerId=/);\n  assert.match(app,/是否要綁定與\\$\\{partnerName\\}為夫妻關係嗎/);\n  assert.match(app,/\\/api\\/organization\\/couple-bind/);\n  assert.match(app,/pathname\\.match\\(\\^?[^\\n]*upline/);\n  assert.match(app,/\\/api\\/organization\\/invite-accept/);\n  assert.match(app,/forceEdit=\\{profileEditRequested\\}/);\n});\n\ntest('v4.2 explains shared organization but independent personal behavior',()=>{\n  assert.match(changelog,/version: 'v4\\.2'/);\n  assert.match(changelog,/貼紙、播放進度、心得、按讚、評價、通知與其他個人紀錄全部維持各自獨立/);\n});\n`);

console.log('v102 organization UI integration applied successfully');
