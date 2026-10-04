from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'{path}: target not found: {old[:120]}')
    p.write_text(text.replace(old, new, 1))


app_path = Path('src/App.tsx')
app = app_path.read_text()

# Imports.
old = "import { keywordRanking } from './utils/keywords';\n"
new = old + "import { moveTrackIdToSecondSlot, sortDefaultHomeTracks } from './homePlaylistPolicy';\n"
if old not in app:
    raise SystemExit('App import anchor not found')
app = app.replace(old, new, 1)

# Default home order + lucky draw state.
old = """  const [sortField, setSortField] = useState<SortField>('權限');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [trackToEdit, setTrackToEdit] = useState<Track | null>(null);
"""
new = """  const [sortField, setSortField] = useState<SortField>('權限');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [useDefaultHomeOrder, setUseDefaultHomeOrder] = useState(true);
  const [homeShuffleSeed, setHomeShuffleSeed] = useState(() =>
    ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0)
  );
  const [luckyPhase, setLuckyPhase] = useState<'idle' | 'spin' | 'win'>('idle');
  const [luckyOrderIds, setLuckyOrderIds] = useState<string[] | null>(null);
  const [luckyWinnerId, setLuckyWinnerId] = useState<string | null>(null);
  const luckyTimersRef = useRef<number[]>([]);
  const luckyAudioContextRef = useRef<AudioContext | null>(null);

  const clearLuckyTimers = useCallback(() => {
    luckyTimersRef.current.forEach(timer => window.clearTimeout(timer));
    luckyTimersRef.current = [];
  }, []);

  const resetLuckyDrawState = useCallback(() => {
    clearLuckyTimers();
    setLuckyPhase('idle');
    setLuckyOrderIds(null);
    setLuckyWinnerId(null);
  }, [clearLuckyTimers]);

  useEffect(() => () => {
    clearLuckyTimers();
    const context = luckyAudioContextRef.current;
    luckyAudioContextRef.current = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }, [clearLuckyTimers]);

  const [trackToEdit, setTrackToEdit] = useState<Track | null>(null);
"""
if old not in app:
    raise SystemExit('sort state block not found')
app = app.replace(old, new, 1)

# Browser-back home is a fresh home entry, so re-randomize.
old = """    const showHomeFromHistory = () => {
      setCurrentTab('home');
      setSelectedDetailTrack(null);
      setPlayerModeState(savedPreferredModeHistoryRef.current);
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
"""
new = """    const showHomeFromHistory = () => {
      clearLuckyTimers();
      setLuckyPhase('idle');
      setLuckyOrderIds(null);
      setLuckyWinnerId(null);
      setUseDefaultHomeOrder(true);
      setSortField('權限');
      setSortDirection('asc');
      setHomeShuffleSeed(((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0));
      setCurrentTab('home');
      setSelectedDetailTrack(null);
      setPlayerModeState(savedPreferredModeHistoryRef.current);
      window.scrollTo({ top: 0, behavior: 'auto' });
    };
"""
if old not in app:
    raise SystemExit('showHomeFromHistory block not found')
app = app.replace(old, new, 1)

# Normal home navigation is also a fresh home entry.
old = """  const handleReturnToHomePlaylist = useCallback(() => {
    setCurrentTab('home');
"""
new = """  const handleReturnToHomePlaylist = useCallback(() => {
    resetLuckyDrawState();
    setUseDefaultHomeOrder(true);
    setSortField('權限');
    setSortDirection('asc');
    setHomeShuffleSeed(((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0));
    setCurrentTab('home');
"""
if old not in app:
    raise SystemExit('handleReturn start not found')
app = app.replace(old, new, 1)
old = """  }, [playerMode, savedPreferredMode, setPlayerMode]);
"""
new = """  }, [playerMode, savedPreferredMode, setPlayerMode, resetLuckyDrawState]);
"""
if old not in app:
    raise SystemExit('handleReturn dependencies not found')
app = app.replace(old, new, 1)

# Manual sort opts out of the default three-tier order until the next home entry.
old = """  const handleSortClick = (field: SortField) => {
    if (sortField === field) {
"""
new = """  const handleSortClick = (field: SortField) => {
    resetLuckyDrawState();
    setUseDefaultHomeOrder(false);
    if (sortField === field) {
"""
if old not in app:
    raise SystemExit('handleSortClick block not found')
app = app.replace(old, new, 1)

# Replace filtered sorting with requested three-tier default policy, preserving manual sorts.
start = app.index("  // Filtered & Sorted Tracks List")
end = app.index("\n  // Rated tracks by current user for BW export", start)
old = app[start:end]
new = """  // Filtered & Sorted Tracks List. Entering home uses the personalized three-tier
  // default order; pressing a sort button switches to the requested manual sort.
  const filteredTracks = useMemo(() => {
    const trackList = Array.isArray(tracks) ? tracks : [];
    const filtered = trackList.filter(t => {
      if (!trackMatchesHomeBaseFilters(t, selectedCategory, selectedSpeakerRank, searchQuery)) return false;
      if (selectedKeywords.length > 0 && !selectedKeywords.every(keyword => trackMatchesHomeKeyword(t, keyword))) return false;
      return true;
    });

    if (useDefaultHomeOrder) {
      return sortDefaultHomeTracks(filtered, {
        canAccess: checkCanAccess,
        getRequiredRankIndex: getRequiredRankSortIndex,
        getUploadTimestamp,
        getUploadSequence,
        shuffleSeed: homeShuffleSeed
      });
    }

    return filtered.sort((a, b) => {
      let diff = 0;
      switch (sortField) {
        case '時間': {
          diff = getUploadTimestamp(a.uploadDate) - getUploadTimestamp(b.uploadDate);
          if (diff === 0) diff = getUploadSequence(a) - getUploadSequence(b);
          break;
        }
        case '權限': {
          const permissionDiff = getRequiredRankSortIndex(a) - getRequiredRankSortIndex(b);
          if (permissionDiff !== 0) {
            return sortDirection === 'desc' ? -permissionDiff : permissionDiff;
          }
          let timeDiff = getUploadTimestamp(b.uploadDate) - getUploadTimestamp(a.uploadDate);
          if (timeDiff === 0) timeDiff = getUploadSequence(b) - getUploadSequence(a);
          return timeDiff;
        }
        case '評價': {
          diff = (a.rating || 0) - (b.rating || 0);
          break;
        }
        case '留言': {
          diff = (a.commentsCount || 0) - (b.commentsCount || 0);
          break;
        }
        case '按讚': {
          diff = (a.likes || 0) - (b.likes || 0);
          break;
        }
        case '演講人': {
          diff = (a.speaker || '').localeCompare(b.speaker || '', 'zh-Hant');
          break;
        }
        default:
          diff = 0;
      }
      return sortDirection === 'desc' ? -diff : diff;
    });
  }, [
    tracks,
    selectedCategory,
    selectedSpeakerRank,
    selectedKeywords,
    searchQuery,
    sortField,
    sortDirection,
    useDefaultHomeOrder,
    homeShuffleSeed,
    currentUser,
    isSuperAdmin,
    isAdministrator
  ]);

  useEffect(() => {
    resetLuckyDrawState();
  }, [
    selectedCategory,
    selectedSpeakerRank,
    selectedKeywords,
    searchQuery,
    sortField,
    sortDirection,
    useDefaultHomeOrder,
    homeShuffleSeed,
    resetLuckyDrawState
  ]);

  const displayedTracks = useMemo(() => {
    if (!luckyOrderIds) return filteredTracks;
    const byId = new Map(filteredTracks.map(track => [track.id, track]));
    const ordered = luckyOrderIds.map(id => byId.get(id)).filter((track): track is Track => Boolean(track));
    const included = new Set(ordered.map(track => track.id));
    return [...ordered, ...filteredTracks.filter(track => !included.has(track.id))];
  }, [filteredTracks, luckyOrderIds]);

  const getLuckyAudioContext = () => {
    if (typeof window === 'undefined') return null;
    const Context = window.AudioContext || (window as any).webkitAudioContext;
    if (!Context) return null;
    if (!luckyAudioContextRef.current || luckyAudioContextRef.current.state === 'closed') {
      luckyAudioContextRef.current = new Context();
    }
    const context = luckyAudioContextRef.current;
    if (context.state === 'suspended') void context.resume().catch(() => {});
    return context;
  };

  const playLuckyTone = (frequency: number, durationSeconds: number, delaySeconds = 0, volume = 0.035) => {
    const context = getLuckyAudioContext();
    if (!context) return;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime + delaySeconds;
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSeconds);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + durationSeconds + 0.02);
    } catch {}
  };

  const playLuckyTick = (step: number) => {
    playLuckyTone(300 + (step % 7) * 34, 0.045, 0, 0.025);
  };

  const playLuckyWin = () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) =>
      playLuckyTone(frequency, 0.16, index * 0.085, 0.045)
    );
  };

  const handleLuckyDraw = (anchor: HTMLElement) => {
    if (luckyPhase === 'spin') return;
    setIsSearchFocused(false);
    clearLuckyTimers();

    // Private VIP stays a separate third group and is never surfaced by random discovery.
    const candidates = filteredTracks.filter(track => !track.isPrivateVip && checkCanAccess(track));
    if (candidates.length === 0) {
      showPermissionAlert('目前條件下沒有可播放的音檔可以抽選。', anchor);
      return;
    }

    // Initial call happens directly inside the user click, so mobile browsers allow Web Audio.
    getLuckyAudioContext();
    const baseIds = filteredTracks.map(track => track.id);
    const winner = candidates[Math.floor(Math.random() * candidates.length)];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const finish = () => {
      setLuckyOrderIds(moveTrackIdToSecondSlot(baseIds, winner.id));
      setLuckyWinnerId(winner.id);
      setLuckyPhase('win');
      playLuckyWin();
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        const winnerElement = Array.from(document.querySelectorAll<HTMLElement>('[data-track-card-id]'))
          .find(element => element.dataset.trackCardId === winner.id);
        winnerElement?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
      }));
      const settleTimer = window.setTimeout(() => setLuckyPhase('idle'), 2400);
      luckyTimersRef.current.push(settleTimer);
    };

    if (reducedMotion || candidates.length === 1 || filteredTracks.length === 1) {
      finish();
      return;
    }

    const spinSteps = Math.max(16, Math.min(26, candidates.length * 4));
    const reel = Array.from({ length: spinSteps - 1 }, () =>
      candidates[Math.floor(Math.random() * candidates.length)]
    );
    reel.push(winner);

    const spin = (index: number) => {
      if (index >= reel.length - 1) {
        finish();
        return;
      }
      const candidate = reel[index];
      setLuckyOrderIds(moveTrackIdToSecondSlot(baseIds, candidate.id));
      setLuckyWinnerId(null);
      setLuckyPhase('spin');
      playLuckyTick(index);
      const progress = index / Math.max(1, reel.length - 1);
      const delay = Math.round(58 + progress * progress * 190);
      const timer = window.setTimeout(() => spin(index + 1), delay);
      luckyTimersRef.current.push(timer);
    };

    spin(0);
  };
"""
app = app[:start] + new + app[end:]

# Replace Search action with lucky draw action.
old = """              {/* Requirement 10 (v2.7): 同一排增加「搜尋」按鈕 */}
              <button
                type="button"
                onClick={() => setIsSearchFocused(false)}
                className="h-[46px] px-3.5 sm:px-4 py-0 rounded-2xl text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-2xs hover:brightness-105 shrink-0 active:scale-95 transition-all cursor-pointer"
                style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
                title="執行搜尋"
              >
                <Search className="w-4 h-4" />
                <span>搜尋</span>
              </button>
"""
new = """              <button
                type="button"
                onClick={event => handleLuckyDraw(event.currentTarget)}
                disabled={luckyPhase === 'spin'}
                className="h-[46px] px-3.5 sm:px-4 py-0 rounded-2xl text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1 shadow-2xs hover:brightness-105 shrink-0 active:scale-95 transition-all cursor-pointer disabled:cursor-wait disabled:opacity-80"
                style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
                title="從目前條件下可播放的音檔中抽一張好手氣"
              >
                <span>{luckyPhase === 'spin' ? '🫵轉運中' : '🫵好手氣'}</span>
              </button>
"""
if old not in app:
    raise SystemExit('search action block not found')
app = app.replace(old, new, 1)

# Card grid gets live roulette state, and renders the temporary lucky ordering.
old = """            <div className="audio-card-grid relative grid grid-cols-1 gap-2 pt-1">
              {filteredTracks.length === 0 ? (
"""
new = """            <div className={`audio-card-grid relative grid grid-cols-1 gap-2 pt-1 ${luckyPhase === 'spin' ? 'lucky-spin-active' : ''} ${luckyPhase === 'win' ? 'lucky-win-active' : ''}`}>
              {displayedTracks.length === 0 ? (
"""
if old not in app:
    raise SystemExit('audio grid start not found')
app = app.replace(old, new, 1)
app = app.replace("                filteredTracks.map((track, trackIndex) => {", "                displayedTracks.map((track, trackIndex) => {", 1)

old = """                  return (
                    <div key={track.id} className="relative">
                    <AudioCard
"""
new = """                  return (
                    <div
                      key={track.id}
                      className="lucky-card relative"
                      data-track-card-id={track.id}
                      data-lucky-winner={luckyWinnerId === track.id ? 'true' : undefined}
                    >
                    {luckyPhase === 'win' && luckyWinnerId === track.id && (
                      <div className="lucky-winner-badge" aria-live="polite">✨ 好手氣！✨</div>
                    )}
                    <AudioCard
"""
if old not in app:
    raise SystemExit('audio card wrapper not found')
app = app.replace(old, new, 1)

app_path.write_text(app)

# Direct-on-list pachinko / game-like spotlight styles.
css_path = Path('src/index.css')
css = css_path.read_text()
marker = '/* Home lucky draw v92 */'
if marker in css:
    raise SystemExit('lucky CSS already present')
css += r'''

/* Home lucky draw v92 */
.audio-card-grid > .lucky-card {
  transition: filter 150ms ease, opacity 150ms ease, transform 150ms ease, box-shadow 150ms ease;
  border-radius: 1.5rem;
}

.audio-card-grid.lucky-spin-active > .lucky-card {
  filter: brightness(0.34) saturate(0.55);
  opacity: 0.48;
  transform: scale(0.975);
}

.audio-card-grid.lucky-spin-active > .lucky-card:nth-child(2) {
  filter: brightness(1.18) saturate(1.2);
  opacity: 1;
  transform: scale(1.025);
  z-index: 20;
  box-shadow: 0 0 0 3px var(--color-primary, #c06c84), 0 0 30px var(--color-primary, #c06c84);
  animation: echostars-lucky-scan 240ms ease-in-out infinite alternate;
}

.audio-card-grid.lucky-win-active > .lucky-card {
  filter: brightness(0.48) saturate(0.7);
  opacity: 0.58;
}

.audio-card-grid.lucky-win-active > .lucky-card[data-lucky-winner="true"] {
  filter: brightness(1.2) saturate(1.28);
  opacity: 1;
  transform: scale(1.035);
  z-index: 30;
  box-shadow: 0 0 0 4px var(--color-primary, #c06c84), 0 0 40px var(--color-primary, #c06c84);
  animation: echostars-lucky-win 620ms cubic-bezier(.2,.9,.25,1.3) 3;
}

.lucky-winner-badge {
  position: absolute;
  z-index: 40;
  top: -0.6rem;
  right: 0.75rem;
  padding: 0.35rem 0.7rem;
  border-radius: 9999px;
  background: var(--color-primary, #c06c84);
  color: white;
  font-weight: 900;
  font-size: 0.95rem;
  letter-spacing: 0.04em;
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.28);
  pointer-events: none;
  animation: echostars-lucky-badge 420ms cubic-bezier(.2,.9,.25,1.4) both;
}

@keyframes echostars-lucky-scan {
  from { transform: scale(1.015); }
  to { transform: scale(1.04); }
}

@keyframes echostars-lucky-win {
  0% { transform: scale(1.01) rotate(-0.25deg); }
  45% { transform: scale(1.055) rotate(0.25deg); }
  100% { transform: scale(1.035) rotate(0deg); }
}

@keyframes echostars-lucky-badge {
  from { opacity: 0; transform: translateY(8px) scale(0.75); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .audio-card-grid > .lucky-card,
  .audio-card-grid.lucky-spin-active > .lucky-card:nth-child(2),
  .audio-card-grid.lucky-win-active > .lucky-card[data-lucky-winner="true"],
  .lucky-winner-badge {
    animation: none !important;
    transition-duration: 0.01ms !important;
  }
}
'''
css_path.write_text(css)

# PWA cache.
replace_once('public/sw.js', 'echostars-shell-v91', 'echostars-shell-v92')
replace_once('tests/releaseIntegrity.test.ts', "test('v91 is the single current PWA cache version'", "test('v92 is the single current PWA cache version'")
replace_once('tests/releaseIntegrity.test.ts', 'echostars-shell-v91', 'echostars-shell-v92')

# Plain-language changelog.
replace_once(
    'src/changelogReleaseNotes.ts',
    "    '首頁新手教學文字與位置整理：回首頁與照片播放提示改成更精簡文字；會員提示改為分行列出完整功能；「不再顯示新手教學」勾選區改為跟著照片提示框移動，手機高度或方向改變時也會一起重新定位。',",
    "    '首頁新手教學文字與位置整理：回首頁與照片播放提示改成更精簡文字；會員提示改為分行列出完整功能；「不再顯示新手教學」勾選區改為跟著照片提示框移動，手機高度或方向改變時也會一起重新定位。',\n    '首頁預設播放清單改為依會員播放權限分三層：可播放音檔每次進首頁重新隨機、不可播放音檔依所需獎銜由低到高、私密 VIP 固定最後並依上傳時間新到舊。搜尋旁按鈕改為「🫵好手氣」，會在目前可播放清單中直接跑轉輪聚光與音效，最後抽出一張音檔資訊卡；私密 VIP 不會被隨機推薦。',"
)
