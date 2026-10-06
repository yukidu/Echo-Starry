import { readFileSync, writeFileSync } from 'node:fs';

function mustReplace(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing expected source for ${label}`);
  return source.replace(search, replacement);
}

// 1) Lucky draw: React owns both immediate animation and server authorization.
const appPath = 'src/App.tsx';
let app = readFileSync(appPath, 'utf8');
const luckyStart = app.indexOf('  const luckyRequestPending = useRef(false);');
const luckyEnd = app.indexOf('  // Rated tracks by current user for BW export', luckyStart);
if (luckyStart < 0 || luckyEnd < 0) throw new Error('Unable to locate lucky draw handler');
const luckyBlock = `  const luckyRequestPending = useRef(false);
  const handleLuckyDraw = (anchor: HTMLElement) => {
    if (luckyPhase === 'spin' || luckyRequestPending.current) return;
    setIsSearchFocused(false);
    setLuckyAnswerText(null);
    clearLuckyTimers();

    // Private VIP stays a separate third group and is never surfaced by random discovery.
    const candidates = filteredTracks.filter(track => !track.isPrivateVip && checkCanAccess(track) && isTrackStickerUnlocked(track));
    if (candidates.length === 0) {
      showPermissionAlert('目前條件下沒有可播放的音檔可以抽選。', anchor);
      return;
    }

    // Start the reel immediately from the user's gesture. Server sticker validation runs in parallel.
    getLuckyAudioContext();
    const baseIds = filteredTracks.map(track => track.id);
    const winner = candidates[Math.floor(Math.random() * candidates.length)];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const minSpinSteps = Math.max(16, Math.min(26, candidates.length * 4));
    let spinStep = 0;
    let approvalState: 'pending' | 'approved' | 'failed' = currentUser ? 'pending' : 'approved';
    let approvalError: unknown = null;
    let luckyNotice: any = { bonus: 0, settings: getFeedbackRules() };

    luckyRequestPending.current = true;
    setLuckyOrderIds(baseIds);
    setLuckyWinnerId(null);
    setLuckyPhase('spin');

    const fail = () => {
      clearLuckyTimers();
      luckyRequestPending.current = false;
      setLuckyPhase('idle');
      setLuckyOrderIds(null);
      setLuckyWinnerId(null);
      setLuckyAnswerText(null);
      showPermissionAlert(approvalError instanceof Error ? approvalError.message : '貼紙不足或連線失敗，無法召喚繁星解答', anchor);
    };

    const finish = () => {
      clearLuckyTimers();
      luckyRequestPending.current = false;
      setLuckyOrderIds(moveTrackIdToSecondSlot(baseIds, winner.id));
      setLuckyWinnerId(winner.id);
      setLuckyPhase('win');
      if (luckyNotice) {
        setFeedbackRules(luckyNotice.settings);
        setLuckyAnswerText(luckyNotice.settings.luckyHintText.replaceAll('{x}', String(luckyNotice.bonus)));
      }
      playLuckyWin();
    };

    const approvalPromise = currentUser
      ? apiJson('/api/stickers/lucky-spend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationId: crypto.randomUUID(), trackId: winner.id })
        }).then(data => {
          luckyNotice = data;
          approvalState = 'approved';
          void refreshStickerSummary();
        }).catch(error => {
          approvalError = error;
          approvalState = 'failed';
        })
      : Promise.resolve();

    const approvalTimeout = window.setTimeout(() => {
      if (approvalState === 'pending') {
        approvalError = new Error('連線時間過久，請再試一次。');
        approvalState = 'failed';
      }
    }, 20000);
    luckyTimersRef.current.push(approvalTimeout);

    if (reducedMotion || candidates.length === 1 || filteredTracks.length === 1) {
      void approvalPromise.then(() => approvalState === 'approved' ? finish() : fail());
      return;
    }

    const spin = () => {
      if (approvalState === 'failed') {
        fail();
        return;
      }
      if (spinStep >= minSpinSteps && approvalState === 'approved') {
        finish();
        return;
      }

      const candidate = candidates[Math.floor(Math.random() * candidates.length)];
      setLuckyOrderIds(moveTrackIdToSecondSlot(baseIds, candidate.id));
      setLuckyWinnerId(null);
      setLuckyPhase('spin');
      playLuckyTick(spinStep);

      const progress = Math.min(1, spinStep / Math.max(1, minSpinSteps - 1));
      const delay = spinStep < minSpinSteps
        ? Math.round(58 + progress * progress * 190)
        : 140;
      spinStep += 1;
      const timer = window.setTimeout(spin, delay);
      luckyTimersRef.current.push(timer);
    };

    spin();
    void approvalPromise;
  };

`;
app = app.slice(0, luckyStart) + luckyBlock + app.slice(luckyEnd);

// 2) Admin is a genuine page branch inside <main>, not an overlay after <main>.
const mainStart = `      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-5 pb-28">\n        {/* Requirement 16 & 9: 優先切換排行榜與公開通知分頁 */}\n        {isProfileOpen ?`;
const adminPage = `      <main className={\`flex-1 w-full mx-auto px-4 sm:px-6 py-5 pb-28 \${isAdminOpen ? 'max-w-6xl' : 'max-w-3xl'}\`}>\n        {/* Requirement 16 & 9: 優先切換排行榜與公開通知分頁 */}\n        {isAdminOpen ? (<Suspense fallback={<div role="status" className="py-12 text-center text-slate-500">載入功能中…</div>}>\n      <AdminModal\n        presentation="page"\n        onUplinesChanged={()=>{void fetchAllUsers(true);if(currentUser)void apiJson(\`/api/users/profile?email=\${encodeURIComponent(currentUser.email)}\`).then(data=>{if(data.user)setCurrentUser(previous=>{if(!previous || previous.id!==data.user.id)return previous;const updated={...previous,platinumUpline:data.user.platinumUpline,diamondUpline:data.user.diamondUpline};localStorage.setItem('sq_current_user_v1',JSON.stringify(updated));return updated;});}).catch(()=>{});}}\n        isOpen={isAdminOpen}\n        onClose={handleReturnToHomePlaylist}\n        isAdmin={isAdmin}\n        currentUser={currentUser}\n        comments={comments}\n        users={allUsers}\n        tracks={tracks}\n        onUpdateUserFull={handleAdminUpdateUser}\n        onBatchUpdateUsers={handleBatchUpdateUsers}\n        onToggleBlockUser={handleToggleBlockUser}\n        onToggleContributor={handleToggleContributor}\n        onToggleAdminUser={handleToggleAdminUser}\n        onDeleteTrack={handleDeleteTrack}\n        onEditTrack={track => { setTrackToEdit(track); setIsUploadOpen(true); }}\n        onUpdateTrack={handleUpdateTrack}\n        onSwitchToAdmin={() => { setIsAdminOpen(false); setIsProfileOpen(true); }}\n        onCategoriesUpdated={fetchCategories}\n      />\n      </Suspense>) : isProfileOpen ?`;
app = mustReplace(app, mainStart, adminPage, 'admin main page branch');
const oldAdminStart = app.indexOf('      {/* Admin Management Modal');
const oldAdminEndMarker = '      {/* Profile & Google Binding Modal (With Amway Fields & Numerology) */}';
const oldAdminEnd = app.indexOf(oldAdminEndMarker, oldAdminStart);
if (oldAdminStart < 0 || oldAdminEnd < 0) throw new Error('Unable to locate old admin overlay block');
app = app.slice(0, oldAdminStart) + oldAdminEndMarker + app.slice(oldAdminEnd + oldAdminEndMarker.length);
writeFileSync(appPath, app);

// 3) Admin component gets explicit page presentation instead of CSS pretending a modal is a page.
const adminPath = 'src/components/AdminModal.tsx';
let admin = readFileSync(adminPath, 'utf8');
admin = mustReplace(admin,
  `interface AdminModalProps {\n  isOpen: boolean;`,
  `interface AdminModalProps {\n  isOpen: boolean;\n  presentation?: 'modal' | 'page';`,
  'admin presentation prop');
admin = mustReplace(admin,
  `export const AdminModal: React.FC<AdminModalProps> = ({\n  isOpen,\n  onClose,`,
  `export const AdminModal: React.FC<AdminModalProps> = ({\n  isOpen,\n  presentation = 'modal',\n  onClose,`,
  'admin presentation destructuring');
admin = mustReplace(admin,
  `  return (\n    <div className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">\n      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl border border-rose-100/60 dark:border-slate-800 my-8">`,
  `  const isPagePresentation = presentation === 'page';\n\n  return (\n    <div className={isPagePresentation ? 'w-full' : 'app-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto'}>\n      <div className={isPagePresentation\n        ? 'bg-white dark:bg-slate-900 rounded-3xl w-full overflow-hidden border border-rose-100/60 dark:border-slate-800'\n        : 'bg-white dark:bg-slate-900 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl border border-rose-100/60 dark:border-slate-800 my-8'}>`,
  'admin outer page layout');
admin = mustReplace(admin,
  `<button\n            onClick={onClose}\n            className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/20"\n          >\n            <X className="w-5 h-5" />\n          </button>`,
  `<button\n            onClick={onClose}\n            className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/20"\n            title={isPagePresentation ? '返回首頁' : '關閉'}\n            aria-label={isPagePresentation ? '返回首頁' : '關閉'}\n          >\n            {isPagePresentation ? <ChevronLeft className="w-5 h-5" /> : <X className="w-5 h-5" />}\n          </button>`,
  'admin page back control');
admin = mustReplace(admin,
  `<div className="p-4 sm:p-5 max-h-[65vh] overflow-y-auto space-y-3.5 text-xs">`,
  `<div className={isPagePresentation ? 'p-4 sm:p-5 space-y-3.5 text-xs' : 'p-4 sm:p-5 max-h-[65vh] overflow-y-auto space-y-3.5 text-xs'}>`,
  'admin page scrolling');
writeFileSync(adminPath, admin);

console.log('Applied clean v102 UI refactor');
