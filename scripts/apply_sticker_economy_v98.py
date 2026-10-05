from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def replace(path: str, old: str, new: str):
    file = ROOT / path
    text = file.read_text()
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f'missing patch target: {path}: {old[:80]!r}')
    file.write_text(text.replace(old, new, 1))

def replace_all(path: str, old: str, new: str):
    file = ROOT / path
    text = file.read_text()
    if old not in text:
        if new in text:
            return
        raise RuntimeError(f'missing patch target: {path}: {old[:80]!r}')
    file.write_text(text.replace(old, new))

# Route sticker accounting after the existing category sanitizer and before session delegation.
replace('worker/categoryIntegrityRouter.ts', "import appWorker from './sessionCookieRouter';", "import appWorker from './stickerRouter';")

# Member deletion must clean sticker-owned records as well.
replace('worker/adminUserDeleteRouter.ts', """  if (await tableExists(env.DB, 'user_activity_logs')) {
    statements.push(
      env.DB.prepare('DELETE FROM user_activity_logs WHERE userId = ? OR LOWER(TRIM(userEmail)) = ?')
        .bind(target.id, targetEmail)
    );
  }

  statements.push(env.DB.prepare('DELETE FROM users WHERE id = ?').bind(target.id));""", """  if (await tableExists(env.DB, 'user_activity_logs')) {
    statements.push(
      env.DB.prepare('DELETE FROM user_activity_logs WHERE userId = ? OR LOWER(TRIM(userEmail)) = ?')
        .bind(target.id, targetEmail)
    );
  }
  if (await tableExists(env.DB, 'sticker_unlocks')) {
    statements.push(env.DB.prepare('DELETE FROM sticker_unlocks WHERE userId = ?').bind(target.id));
  }
  if (await tableExists(env.DB, 'sticker_transactions')) {
    statements.push(env.DB.prepare('DELETE FROM sticker_transactions WHERE userId = ? OR actorUserId = ?').bind(target.id, target.id));
  }
  if (await tableExists(env.DB, 'member_notifications')) {
    statements.push(env.DB.prepare('DELETE FROM member_notifications WHERE userId = ?').bind(target.id));
  }

  statements.push(env.DB.prepare('DELETE FROM users WHERE id = ?').bind(target.id));""")

# Shared track type.
replace('src/types.ts', """  vipDurationDays?: number;
  tags?: string[];""", """  vipDurationDays?: number;
  stickerUnlockCost?: number; // 0~20 張；0 表示免貼紙
  commentStickerReward?: number; // 聽完後首次根心得獎勵 0~20 張
  tags?: string[];""")

# Navbar: expose sticker entry in desktop and hamburger menu.
replace('src/components/Navbar.tsx', """  pendingNotificationsCount?: number;
  visitor?: VisitorIdentity;
}""", """  pendingNotificationsCount?: number;
  stickerBalance?: number;
  onOpenStickers?: () => void;
  visitor?: VisitorIdentity;
}""")
replace('src/components/Navbar.tsx', """  canUpload = true,
  pendingNotificationsCount = 0,
  visitor
}) => {""", """  canUpload = true,
  pendingNotificationsCount = 0,
  stickerBalance,
  onOpenStickers,
  visitor
}) => {""")
replace('src/components/Navbar.tsx', """  const notificationsMenuTitle = canAudit ? '通知與獎銜審核' : '通知';
""", """  const notificationsMenuTitle = canAudit ? '通知與獎銜審核' : '通知';
  const stickerBalanceText = stickerBalance === undefined
    ? '…'
    : (Number.isInteger(stickerBalance) ? String(stickerBalance) : stickerBalance.toFixed(1));
  const stickerMenuTitle = currentUser ? `我的貼紙${stickerBalanceText}張` : '我的貼紙(會員專屬)';
""")
replace('src/components/Navbar.tsx', """          {/* PWA install is shown directly whenever desktop/landscape navigation replaces the hamburger menu. */}
          <InstallAppButton""", """          <button
            type=\"button\"
            onClick={onOpenStickers}
            title={stickerMenuTitle}
            className=\"px-2.5 py-2 rounded-xl text-xs font-black text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap\"
          >
            🎟️ {currentUser ? `${stickerBalanceText}張` : '貼紙'}
          </button>

          {/* PWA install is shown directly whenever desktop/landscape navigation replaces the hamburger menu. */}
          <InstallAppButton""")
replace('src/components/Navbar.tsx', """          {canUpload && (
            <button
              onClick={() => handleMobileNav('upload')}""", """          <button
            type=\"button\"
            onClick={() => {
              onOpenStickers?.();
              setIsMobileMenuOpen(false);
            }}
            className=\"w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors\"
          >
            <span aria-hidden=\"true\">🎟️</span>
            <span>{stickerMenuTitle}</span>
          </button>

          {canUpload && (
            <button
              onClick={() => handleMobileNav('upload')}""")

# Home card permission badge.
replace('src/components/AudioCard.tsx', """  const hasReadAccess = canAccess && isVipUnlocked;
""", """  const stickerUnlockCost = Math.max(0, Number(track.stickerUnlockCost || 0));
  const permissionStickerLabel = stickerUnlockCost > 0
    ? `${displayRequiredRank} │ 貼紙${stickerUnlockCost}張`
    : displayRequiredRank;
  const hasReadAccess = canAccess && isVipUnlocked;
""")
replace_all('src/components/AudioCard.tsx', "title={`收聽權限：${displayRequiredRank}`}", "title={`收聽權限：${permissionStickerLabel}`}")
replace('src/components/AudioCard.tsx', """              <span className=\"truncate\">{displayRequiredRank}</span>""", """              <span className=\"truncate\">{permissionStickerLabel}</span>""")

# Detail page permission label, keyword balance refresh, and comment reward heading.
replace('src/components/DetailView.tsx', """        setDbKeywords(prev => [...new Set([...prev, ...(data.keywords || [])])]);
        if (onUpdateTrack) {""", """        setDbKeywords(prev => [...new Set([...prev, ...(data.keywords || [])])]);
        window.dispatchEvent(new CustomEvent('echostars:sticker-changed'));
        if (onUpdateTrack) {""")
replace('src/components/DetailView.tsx', """          <span>{track.isPrivateVip ? '私秘VIP' : (track.requiredRank === '無' ? '公開' : track.requiredRank)}</span>""", """          <span>{(() => {
            const permission = track.isPrivateVip ? '私秘VIP' : (track.requiredRank === '無' ? '公開' : track.requiredRank);
            const cost = Math.max(0, Number(track.stickerUnlockCost || 0));
            return cost > 0 ? `${permission} │ 貼紙${cost}張` : permission;
          })()}</span>""")
replace('src/components/DetailView.tsx', """      {/* Comments Section */}
      <div id=\"comments-section\">
        <CommentsSection""", """      {/* Comments Section */}
      <div id=\"comments-section\">
        <div className=\"mb-2 px-1 text-sm font-black text-slate-800 dark:text-slate-100\">
          {Math.max(0, Number(track.commentStickerReward || 0)) > 0
            ? `聽完後分享心得+貼紙${Math.max(0, Number(track.commentStickerReward || 0))}張`
            : '聽完後分享心得'}
        </div>
        <CommentsSection""")
replace('src/components/DetailView.tsx', """        body: JSON.stringify({ keyword: trimmed, userEmail: currentUser?.email, userId: currentUser?.id })""", """        body: JSON.stringify({
          keyword: trimmed,
          userEmail: currentUser?.email,
          userId: currentUser?.id,
          vipPassword: /^\\d{4,12}$/.test(window.location.search.replace(/^\\?/, '')) ? window.location.search.replace(/^\\?/, '') : ''
        })""")

# Upload/edit modal sticker fields and VIP preflight.
replace('src/components/UploadModal.tsx', """  const [requiredRank, setRequiredRank] = useState<AmwayRank>('無');
  const [description, setDescription] = useState('');""", """  const [requiredRank, setRequiredRank] = useState<AmwayRank>('無');
  const [stickerUnlockCost, setStickerUnlockCost] = useState(0);
  const [commentStickerReward, setCommentStickerReward] = useState(0);
  const [description, setDescription] = useState('');""")
replace('src/components/UploadModal.tsx', """      setRequiredRank(trackToEdit.requiredRank || '無');
      setDescription(trackToEdit.description || '');""", """      setRequiredRank(trackToEdit.requiredRank || '無');
      setStickerUnlockCost(Math.max(0, Number(trackToEdit.stickerUnlockCost || 0)));
      setCommentStickerReward(Math.max(0, Number(trackToEdit.commentStickerReward || 0)));
      setDescription(trackToEdit.description || '');""")
replace('src/components/UploadModal.tsx', """      setRequiredRank('無');
      setDescription('');""", """      setRequiredRank('無');
      setStickerUnlockCost(0);
      setCommentStickerReward(0);
      setDescription('');""")
replace('src/components/UploadModal.tsx', """    try {
      let finalAudioUrl = trackToEdit?.audioUrl || '';
""", """    try {
      if (isPrivateVip && !trackToEdit?.isPrivateVip && currentUser) {
        const preflight = await fetch('/api/stickers/vip-preflight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackId: trackToEdit?.id, isPrivateVip: true })
        });
        if (!preflight.ok) {
          const data = await preflight.json().catch(() => ({}));
          throw new Error(data.error || '貼紙不足，無法建立私秘VIP');
        }
      }

      let finalAudioUrl = trackToEdit?.audioUrl || '';
""")
replace('src/components/UploadModal.tsx', """        requiredRank,
        seriesOrder: seriesOrder.trim(),""", """        requiredRank,
        stickerUnlockCost,
        commentStickerReward,
        stickerOperationId: trackToEdit ? `vip-track:${trackToEdit.id}` : `vip-audio:${finalAudioUrl}`,
        seriesOrder: seriesOrder.trim(),""")
replace('src/components/UploadModal.tsx', """        playCount: typeof trackObj?.playCount === 'number' ? trackObj.playCount : 0
      };""", """        playCount: typeof trackObj?.playCount === 'number' ? trackObj.playCount : 0,
        stickerUnlockCost: Number(trackObj?.stickerUnlockCost ?? stickerUnlockCost ?? 0),
        commentStickerReward: Number(trackObj?.commentStickerReward ?? commentStickerReward ?? 0)
      };""")
replace('src/components/UploadModal.tsx', """      onSuccess(normalizedTrack);
      onClose();""", """      onSuccess(normalizedTrack);
      window.dispatchEvent(new CustomEvent('echostars:sticker-changed'));
      onClose();""")
replace('src/components/UploadModal.tsx', """          {/* 1. Audio Drag and Drop Area */}""", """          <div className=\"grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-2xl border border-amber-200/70 dark:border-slate-700 bg-amber-50/50 dark:bg-slate-800/50 p-3\">
            <label className=\"font-bold text-slate-700 dark:text-slate-200\">
              解鎖本錄音所需貼紙
              <ThemedSelect value={stickerUnlockCost} onChange={e => setStickerUnlockCost(Number(e.target.value))} className=\"mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900\">
                {Array.from({ length: 21 }, (_, i) => i).map(value => <option key={value} value={value}>{value === 0 ? '0（免貼紙）' : `${value} 張`}</option>)}
              </ThemedSelect>
            </label>
            <label className=\"font-bold text-slate-700 dark:text-slate-200\">
              聽完後留言心得獲得貼紙
              <ThemedSelect value={commentStickerReward} onChange={e => setCommentStickerReward(Number(e.target.value))} className=\"mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900\">
                {Array.from({ length: 21 }, (_, i) => i).map(value => <option key={value} value={value}>{value === 0 ? '0（不發放）' : `${value} 張`}</option>)}
              </ThemedSelect>
            </label>
          </div>

          {/* 1. Audio Drag and Drop Area */}""")

# App sticker state, gates, balance refresh, lucky draw cost, and modal.
replace('src/App.tsx', """const ChangelogModal = lazy(() => import('./components/ChangelogModal').then(module => ({ default: module.ChangelogModal })));
""", """const ChangelogModal = lazy(() => import('./components/ChangelogModal').then(module => ({ default: module.ChangelogModal })));
const StickersModal = lazy(() => import('./components/StickersModal').then(module => ({ default: module.StickersModal })));
""")
replace('src/App.tsx', """  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading]""", """  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [stickerSummary, setStickerSummary] = useState<{ balance: number; unlockedTrackIds: string[]; unreadNotifications: number; canGrant: boolean; isSuperAdmin: boolean } | null>(null);
  const [isStickersOpen, setIsStickersOpen] = useState(false);
  const [isLoading, setIsLoading]""")
replace('src/App.tsx', """  // Requirement 9, 10 & 12: 未審核通過名單總數 + 被 @ 標記提醒總數（用於通知鈴鐺徽章提醒）
  const pendingNotificationsCount = useMemo(() => {""", """  const refreshStickerSummary = useCallback(async () => {
    if (!currentUser) {
      setStickerSummary(null);
      return;
    }
    try {
      const data = await apiJson('/api/stickers/me');
      setStickerSummary({
        balance: Number(data.balance || 0),
        unlockedTrackIds: Array.isArray(data.unlockedTrackIds) ? data.unlockedTrackIds : [],
        unreadNotifications: Number(data.unreadNotifications || 0),
        canGrant: Boolean(data.canGrant),
        isSuperAdmin: Boolean(data.isSuperAdmin)
      });
    } catch (error) {
      console.warn('Failed to load sticker balance:', error);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    void refreshStickerSummary();
  }, [refreshStickerSummary]);

  useEffect(() => {
    const refresh = () => { void refreshStickerSummary(); };
    window.addEventListener('echostars:sticker-changed', refresh);
    return () => window.removeEventListener('echostars:sticker-changed', refresh);
  }, [refreshStickerSummary]);

  // Requirement 9, 10 & 12: 未審核通過名單總數 + 被 @ 標記提醒總數（用於通知鈴鐺徽章提醒）
  const pendingNotificationsCount = useMemo(() => {""")
replace('src/App.tsx', """    return auditCount + mentionCount;
  }, [allUsers, comments, allComments, currentUser]);""", """    return auditCount + mentionCount + Number(stickerSummary?.unreadNotifications || 0);
  }, [allUsers, comments, allComments, currentUser, stickerSummary?.unreadNotifications]);""")
replace('src/App.tsx', """  // 2. Play / Select Track with Memory Resume & Fullscreen Loading
  const handlePlayTrack""", """  const currentVipPassword = () => {
    if (typeof window === 'undefined') return '';
    const raw = window.location.search.replace(/^\\?/, '');
    return /^\\d{4,12}$/.test(raw) ? raw : '';
  };

  const isTrackStickerUnlocked = (track: Track) => {
    const cost = Math.max(0, Number(track.stickerUnlockCost || 0));
    if (cost <= 0 || isSuperAdmin) return true;
    return Boolean(currentUser && stickerSummary?.unlockedTrackIds?.includes(track.id));
  };

  const ensureStickerUnlock = async (track: Track, anchor?: HTMLElement | null) => {
    const cost = Math.max(0, Number(track.stickerUnlockCost || 0));
    if (cost <= 0 || isTrackStickerUnlocked(track)) return true;
    if (!currentUser) {
      showPermissionAlert(`此錄音需要貼紙${cost}張解鎖；貼紙為會員專屬，請先登入。`, anchor);
      return false;
    }
    if (!window.confirm(`此錄音需使用 ${cost} 張貼紙永久解鎖，是否繼續？`)) return false;
    try {
      await apiJson(`/api/stickers/unlock/${encodeURIComponent(track.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vipPassword: currentVipPassword() })
      });
      await refreshStickerSummary();
      return true;
    } catch (error) {
      showPermissionAlert(error instanceof Error ? error.message : '貼紙解鎖失敗', anchor);
      return false;
    }
  };

  // 2. Play / Select Track with Memory Resume & Fullscreen Loading
  const handlePlayTrack""")
replace('src/App.tsx', """    // Preserve user preferred player mode (Requirement 14)
    const effectiveMode""", """    if (!await ensureStickerUnlock(track, permissionAnchor)) return;

    // Preserve user preferred player mode (Requirement 14)
    const effectiveMode""")
replace('src/App.tsx', """    await handleTrackInteraction(trackId, 'rate', score);
  };
  const handleToggleLike = (trackId: string) => handleTrackInteraction(trackId, 'like');""", """    if (!await ensureStickerUnlock(track)) return;
    await handleTrackInteraction(trackId, 'rate', score);
  };
  const handleToggleLike = async (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    if (track.isPrivateVip && !isTrackVipUnlocked(track)) {
      showPermissionAlert('此錄音檔為【私密VIP】專屬內容，未解鎖前無法按讚。');
      return;
    }
    if (!checkCanAccess(track)) {
      showPermissionAlert('目前會員獎銜未達此錄音的互動權限。');
      return;
    }
    if (!await ensureStickerUnlock(track)) return;
    await handleTrackInteraction(trackId, 'like');
  };""")
replace('src/App.tsx', """        body: JSON.stringify({ identifier, score, userId: currentUser?.id, userEmail: currentUser?.email, deviceId: visitor.deviceId })""", """        body: JSON.stringify({ identifier, score, userId: currentUser?.id, userEmail: currentUser?.email, deviceId: visitor.deviceId, vipPassword: currentVipPassword() })""")
replace('src/App.tsx', """      replyToId,
      replyToAuthor
    };""", """      replyToId,
      replyToAuthor,
      vipPassword: currentVipPassword()
    };""")
replace('src/App.tsx', """    const newComment = commentData.comment || commentData;
    if (activeCommentsTrackIdRef.current""", """    const newComment = commentData.comment || commentData;
    window.dispatchEvent(new CustomEvent('echostars:sticker-changed'));
    if (activeCommentsTrackIdRef.current""")
replace('src/App.tsx', """    if (res.ok) {
      setComments(prev => prev.filter(c => c.id !== commentId));""", """    if (res.ok) {
      window.dispatchEvent(new CustomEvent('echostars:sticker-changed'));
      setComments(prev => prev.filter(c => c.id !== commentId));""")
replace('src/App.tsx', """  const handleLuckyDraw = (anchor: HTMLElement) => {""", """  const handleLuckyDraw = async (anchor: HTMLElement) => {""")
replace('src/App.tsx', """    const candidates = filteredTracks.filter(track => !track.isPrivateVip && checkCanAccess(track));""", """    const candidates = filteredTracks.filter(track => !track.isPrivateVip && checkCanAccess(track) && isTrackStickerUnlocked(track));""")
replace('src/App.tsx', """    const winner = candidates[Math.floor(Math.random() * candidates.length)];
    const reducedMotion""", """    const winner = candidates[Math.floor(Math.random() * candidates.length)];
    if (currentUser) {
      try {
        await apiJson('/api/stickers/lucky-spend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationId: crypto.randomUUID() })
        });
        await refreshStickerSummary();
      } catch (error) {
        showPermissionAlert(error instanceof Error ? error.message : '貼紙不足，無法使用好手氣', anchor);
        return;
      }
    }
    const reducedMotion""")
replace('src/App.tsx', """        pendingNotificationsCount={pendingNotificationsCount}
      />""", """        pendingNotificationsCount={pendingNotificationsCount}
        stickerBalance={stickerSummary?.balance}
        onOpenStickers={() => setIsStickersOpen(true)}
      />""")
replace('src/App.tsx', """                  const isVipUnlocked = isTrackVipUnlocked(track);
                  const tRatings""", """                  const isVipUnlocked = isTrackVipUnlocked(track);
                  const isStickerUnlocked = isTrackStickerUnlocked(track);
                  const tRatings""")
replace('src/App.tsx', """                      canAccess={canAccess}
                      isVipUnlocked={isVipUnlocked}""", """                      canAccess={canAccess && isStickerUnlocked}
                      isVipUnlocked={isVipUnlocked}""")
replace('src/App.tsx', """                canRate={checkCanAccess(activeTrack) && isTrackVipUnlocked(activeTrack)}""", """                canRate={checkCanAccess(activeTrack) && isTrackVipUnlocked(activeTrack) && isTrackStickerUnlocked(activeTrack)}""")
replace('src/App.tsx', """    setIsChangelogOpen(false);
    setIsShareOpen(false);""", """    setIsChangelogOpen(false);
    setIsStickersOpen(false);
    setIsShareOpen(false);""")
replace('src/App.tsx', """      setIsChangelogOpen(false);
      setCommentPreviewTrack(null);""", """      setIsChangelogOpen(false);
      setIsStickersOpen(false);
      setCommentPreviewTrack(null);""")
replace('src/App.tsx', """  const handleLogout = () => {
    setCurrentUser(null);""", """  const handleLogout = () => {
    setCurrentUser(null);
    setStickerSummary(null);""")
replace('src/App.tsx', """      {/* Version Changelog Modal */}
      {isChangelogOpen""", """      {isStickersOpen && <Suspense fallback={<div role=\"status\" className=\"fixed inset-0 z-50 grid place-items-center bg-black/50 text-white\">載入功能中…</div>}>
      <StickersModal
        isOpen={isStickersOpen}
        onClose={() => setIsStickersOpen(false)}
        currentUser={currentUser}
        tracks={tracks}
        onStickerChanged={refreshStickerSummary}
        onTracksUpdated={savedTracks => {
          const byId = new Map(savedTracks.map(track => [track.id, track]));
          setTracks(prev => prev.map(track => byId.get(track.id) || track));
        }}
      />
      </Suspense>}

      {/* Version Changelog Modal */}
      {isChangelogOpen""")

# Notifications: persistent sticker-grant notifications are a fourth tab.
replace('src/components/NotificationsView.tsx', """  Reply
} from 'lucide-react';""", """  Reply,
  Gift
} from 'lucide-react';""")
replace('src/components/NotificationsView.tsx', """  // Requirement 5 (v2.4): 刪除「所有通知」，預設為「被標記的心得」('mentions')
  const [filterType, setFilterType] = useState<'mentions' | 'pending' | 'approved'>('mentions');""", """  const [stickerNotifications, setStickerNotifications] = useState<any[]>([]);
  const loadStickerNotifications = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/stickers/notifications');
      if (!res.ok) return;
      const data = await res.json();
      setStickerNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    } catch {}
  };
  React.useEffect(() => { void loadStickerNotifications(); }, [currentUser?.id]);
  const openStickerNotifications = async () => {
    setFilterType('stickers');
    if (!currentUser) return;
    try {
      await fetch('/api/stickers/notifications/read', { method: 'POST' });
      await loadStickerNotifications();
      window.dispatchEvent(new CustomEvent('echostars:sticker-changed'));
    } catch {}
  };

  // Requirement 5 (v2.4): 刪除「所有通知」，預設為「被標記的心得」('mentions')
  const [filterType, setFilterType] = useState<'mentions' | 'stickers' | 'pending' | 'approved'>('mentions');""")
replace('src/components/NotificationsView.tsx', """    if (filterType === 'mentions') {
      return false; // only show mentions tab
    }""", """    if (filterType === 'mentions' || filterType === 'stickers') {
      return false; // special notification tabs render independently
    }""")
replace('src/components/NotificationsView.tsx', """        <div className=\"grid grid-cols-3 gap-1 sm:gap-1.5 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 w-full text-[10px] sm:text-xs\">""", """        <div className=\"grid grid-cols-4 gap-1 sm:gap-1.5 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 w-full text-[9px] sm:text-xs\">""")
replace('src/components/NotificationsView.tsx', """          <button
            type=\"button\"
            onClick={() => setFilterType('pending')}""", """          <button
            type=\"button\"
            onClick={openStickerNotifications}
            className={`w-full py-1.5 sm:py-2 px-1 rounded-xl font-bold transition-all flex items-center justify-center gap-1 truncate cursor-pointer ${
              filterType === 'stickers'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-300 border border-violet-200/70 dark:border-slate-700'
            }`}
          >
            <Gift className=\"w-3 h-3 shrink-0\" />
            <span className=\"truncate\">貼紙通知</span>
            <span className=\"px-1 rounded-full text-[9px] bg-violet-100 text-violet-700\">{stickerNotifications.filter(n => !n.readAt).length}</span>
          </button>

          <button
            type=\"button\"
            onClick={() => setFilterType('pending')}""")
replace('src/components/NotificationsView.tsx', """      <div className=\"space-y-2\">
        {/* TAB 1: 被標記的心得""", """      <div className=\"space-y-2\">
        {filterType === 'stickers' && stickerNotifications.length === 0 && (
          <div className=\"p-6 text-center text-sm text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800\">目前沒有貼紙通知</div>
        )}
        {filterType === 'stickers' && stickerNotifications.map(notification => (
          <div key={notification.id} className=\"p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-violet-200/70 dark:border-slate-800 shadow-2xs\">
            <div className=\"flex items-start gap-2\">
              <Gift className=\"w-5 h-5 text-violet-500 shrink-0 mt-0.5\" />
              <div className=\"min-w-0\">
                <p className=\"font-black text-sm text-slate-900 dark:text-slate-100\">{notification.title}</p>
                <p className=\"text-xs text-slate-600 dark:text-slate-300 mt-1 break-words\">{notification.message}</p>
                <p className=\"text-[10px] text-slate-400 mt-1\">{new Date(notification.createdAt).toLocaleString('zh-TW')}</p>
              </div>
            </div>
          </div>
        ))}

        {/* TAB 1: 被標記的心得""")

# D1 schema documentation.
replace('schema.sql', """  vipDurationDays INTEGER DEFAULT 7,
  externalVideos TEXT,""", """  vipDurationDays INTEGER DEFAULT 7,
  stickerUnlockCost INTEGER DEFAULT 0,
  commentStickerReward INTEGER DEFAULT 0,
  externalVideos TEXT,""")
replace('schema.sql', """-- 會員在首次 Google 登入時建立，不預先寫入個人範例資料。
""", """-- 7. 貼紙點數：以 0.1 張為 1 unit 的整數帳本，避免浮點誤差。
CREATE TABLE IF NOT EXISTS sticker_transactions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  deltaUnits INTEGER NOT NULL,
  balanceAfterUnits INTEGER NOT NULL,
  type TEXT NOT NULL,
  sourceId TEXT,
  description TEXT NOT NULL,
  actorUserId TEXT,
  uniqueKey TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sticker_transactions_user_created ON sticker_transactions(userId, createdAt DESC);

CREATE TABLE IF NOT EXISTS sticker_unlocks (
  userId TEXT NOT NULL,
  trackId TEXT NOT NULL,
  costUnits INTEGER NOT NULL,
  transactionId TEXT,
  createdAt INTEGER NOT NULL,
  PRIMARY KEY(userId, trackId)
);

CREATE TABLE IF NOT EXISTS sticker_settings (
  key TEXT PRIMARY KEY,
  valueUnits INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  updatedBy TEXT
);

CREATE TABLE IF NOT EXISTS member_notifications (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  readAt INTEGER,
  sourceId TEXT UNIQUE
);

-- 會員在首次 Google 登入時建立，不預先寫入個人範例資料。
""")

# Backend reward eligibility: rank + VIP + sticker gate are all required.
replace('worker/stickerRouter.ts', """async function playbackCompleted(db: any, actor: any, trackId: string) {""", """async function canEarnFromTrack(db: any, actor: any, track: any, vipPassword = '') {
  if (!actor || !track || !hasRankAccess(actor, track)) return false;
  if (!await hasVipAccess(db, actor, track, vipPassword)) return false;
  const cost = Math.max(0, Number(track.stickerUnlockCost || 0));
  if (cost <= 0 || isSuperAdmin(actor)) return true;
  return Boolean(await db.prepare('SELECT trackId FROM sticker_unlocks WHERE userId = ? AND trackId = ?').bind(actor.id, track.id).first());
}

async function playbackCompleted(db: any, actor: any, trackId: string) {""")
replace('worker/stickerRouter.ts', """      beforeTrack = await env.DB.prepare('SELECT id, title, likedBy, ratings FROM tracks WHERE id = ?').bind(decodeURIComponent(trackAction[1])).first();""", """      beforeTrack = await env.DB.prepare('SELECT id, title, likedBy, ratings, requiredRank, isPrivateVip, uploaderEmail, vipExpiresAt, stickerUnlockCost FROM tracks WHERE id = ?').bind(decodeURIComponent(trackAction[1])).first();""")
replace('worker/stickerRouter.ts', """      if (action === 'rate' && Number(requestBody.score) > 0) {""", """      const canEarn = await canEarnFromTrack(env.DB, actor, beforeTrack, String(requestBody.vipPassword || ''));
      if (action === 'rate' && Number(requestBody.score) > 0 && canEarn) {""")
replace('worker/stickerRouter.ts', """      } else if (action === 'like' && data?.hasLiked === true) {""", """      } else if (action === 'like' && data?.hasLiked === true && canEarn) {""")
replace('worker/stickerRouter.ts', """        const track: any = await env.DB.prepare('SELECT title FROM tracks WHERE id = ?').bind(trackId).first();
        await awardInteraction""", """        const track: any = await env.DB.prepare('SELECT id, title, requiredRank, isPrivateVip, uploaderEmail, vipExpiresAt, stickerUnlockCost FROM tracks WHERE id = ?').bind(trackId).first();
        if (await canEarnFromTrack(env.DB, actor, track, String(requestBody.vipPassword || ''))) await awardInteraction""")
replace('worker/stickerRouter.ts', """      const track: any = await env.DB.prepare('SELECT title, commentStickerReward FROM tracks WHERE id = ?').bind(trackId).first();
      const reward = Math.max(0, Number(track?.commentStickerReward || 0));
      if (reward > 0 && await playbackCompleted(env.DB, actor, trackId)) {""", """      const track: any = await env.DB.prepare('SELECT id, title, commentStickerReward, requiredRank, isPrivateVip, uploaderEmail, vipExpiresAt, stickerUnlockCost FROM tracks WHERE id = ?').bind(trackId).first();
      const reward = Math.max(0, Number(track?.commentStickerReward || 0));
      if (reward > 0 && await canEarnFromTrack(env.DB, actor, track, String(requestBody.vipPassword || '')) && await playbackCompleted(env.DB, actor, trackId)) {""")
replace('worker/stickerRouter.ts', """        actorUserId: actor?.id || null,""", """        actorUserId: actor?.id || undefined,""")

# PWA and user-readable changelog.
replace('public/sw.js', 'echostars-shell-v97', 'echostars-shell-v98')
replace('src/changelogReleaseNotes.ts', """    '網友關鍵字提示再精簡：詳細播放頁未登入時維持「(登入可自訂新增)」，登入會員後自動縮成「(可自訂新增)」；首頁與詳細頁括號提示字再縮小。首頁「🫵好手氣」移到搜尋框左邊，搜尋框改到右側。',""", """    '網友關鍵字提示再精簡：詳細播放頁未登入時維持「(登入可自訂新增)」，登入會員後自動縮成「(可自訂新增)」；首頁與詳細頁括號提示字再縮小。首頁「🫵好手氣」移到搜尋框左邊，搜尋框改到右側。',
    '新增「我的貼紙」會員點數：新會員與既有會員安全初始化 6 張，評價、按讚、新增網友關鍵字與聽完分享心得可依規則獲得貼紙；好手氣、私秘 VIP 與指定錄音可消耗貼紙。所有增減都有永久帳本與防重複機制，刪除曾獲獎的心得會自動扣回。超級管理員可批次設定錄音貼紙、調整全站規則；白金以上會員可依上手白金／上手鑽石關係幫自己的下線人工加貼紙，受贈會員會在鈴鐺通知頁收到原因與張數。',""")

print('sticker v98 patches applied')
