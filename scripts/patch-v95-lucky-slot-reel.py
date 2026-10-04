from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'{path}: target not found: {old[:180]}')
    p.write_text(text.replace(old, new, 1))


# Only the second visible slot changes during the spin. The surrounding cards keep
# their original positions so the page no longer jitters or reorders under the eye.
replace_once(
    'src/App.tsx',
    """  const [luckyPhase, setLuckyPhase] = useState<'idle' | 'spin' | 'win'>('idle');\n  const [luckyOrderIds, setLuckyOrderIds] = useState<string[] | null>(null);\n  const [luckyWinnerId, setLuckyWinnerId] = useState<string | null>(null);\n""",
    """  const [luckyPhase, setLuckyPhase] = useState<'idle' | 'spin' | 'win'>('idle');\n  const [luckyOrderIds, setLuckyOrderIds] = useState<string[] | null>(null);\n  const [luckySpinTrackId, setLuckySpinTrackId] = useState<string | null>(null);\n  const [luckyWinnerId, setLuckyWinnerId] = useState<string | null>(null);\n"""
)

replace_once(
    'src/App.tsx',
    """    setLuckyPhase('idle');\n    setLuckyOrderIds(null);\n    setLuckyWinnerId(null);\n""",
    """    setLuckyPhase('idle');\n    setLuckyOrderIds(null);\n    setLuckySpinTrackId(null);\n    setLuckyWinnerId(null);\n"""
)

replace_once(
    'src/App.tsx',
    """  const displayedTracks = useMemo(() => {\n    if (!luckyOrderIds) return filteredTracks;\n    const byId = new Map(filteredTracks.map(track => [track.id, track]));\n    const ordered = luckyOrderIds.map(id => byId.get(id)).filter((track): track is Track => Boolean(track));\n    const included = new Set(ordered.map(track => track.id));\n    return [...ordered, ...filteredTracks.filter(track => !included.has(track.id))];\n  }, [filteredTracks, luckyOrderIds]);\n""",
    """  const displayedTracks = useMemo(() => {\n    // During the reel animation the list itself stays frozen. Only slot #2 swaps\n    // its card content, which gives a slot-machine feel without moving nearby cards.\n    if (luckyPhase === 'spin' && luckySpinTrackId) {\n      const spinTrack = filteredTracks.find(track => track.id === luckySpinTrackId);\n      if (!spinTrack) return filteredTracks;\n      if (filteredTracks.length <= 1) return [spinTrack];\n      return [filteredTracks[0], spinTrack, ...filteredTracks.slice(2)];\n    }\n\n    if (!luckyOrderIds) return filteredTracks;\n    const byId = new Map(filteredTracks.map(track => [track.id, track]));\n    const ordered = luckyOrderIds.map(id => byId.get(id)).filter((track): track is Track => Boolean(track));\n    const included = new Set(ordered.map(track => track.id));\n    return [...ordered, ...filteredTracks.filter(track => !included.has(track.id))];\n  }, [filteredTracks, luckyPhase, luckySpinTrackId, luckyOrderIds]);\n"""
)

replace_once(
    'src/App.tsx',
    """    const finish = () => {\n      setLuckyOrderIds(moveTrackIdToSecondSlot(baseIds, winner.id));\n      setLuckyWinnerId(winner.id);\n      setLuckyPhase('win');\n      playLuckyWin();\n    };\n""",
    """    const finish = () => {\n      setLuckySpinTrackId(null);\n      setLuckyOrderIds(moveTrackIdToSecondSlot(baseIds, winner.id));\n      setLuckyWinnerId(winner.id);\n      setLuckyPhase('win');\n      playLuckyWin();\n    };\n"""
)

replace_once(
    'src/App.tsx',
    """      const candidate = reel[index];\n      setLuckyOrderIds(moveTrackIdToSecondSlot(baseIds, candidate.id));\n      setLuckyWinnerId(null);\n      setLuckyPhase('spin');\n""",
    """      const candidate = reel[index];\n      setLuckyOrderIds(null);\n      setLuckySpinTrackId(candidate.id);\n      setLuckyWinnerId(null);\n      setLuckyPhase('spin');\n"""
)

# Remove the per-card jitter variables introduced in v94. All surrounding cards are
# now spatially static; the second slot animation restarts naturally when its keyed
# card changes.
replace_once(
    'src/App.tsx',
    """                  const hasLiked = Boolean(track?.likedBy && Array.isArray(track.likedBy) && track.likedBy.some(k => currentIdentityKeys.includes(k)));\n                  const luckyMotionDirection = trackIndex % 2 === 0 ? 1 : -1;\n                  const luckyMotionDistance = 16 + ((trackIndex * 7) % 13);\n                  const luckyMotionLateral = 2 + ((trackIndex * 5) % 7);\n                  const luckyMotionDuration = 150 + ((trackIndex * 37) % 120);\n                  const luckyMotionDelay = -((trackIndex * 53) % 190);\n\n                  return (\n                    <div\n                      key={track.id}\n                      className=\"lucky-card relative\"\n                      data-track-card-id={track.id}\n                      data-lucky-winner={luckyWinnerId === track.id ? 'true' : undefined}\n                      style={{\n                        '--lucky-x-from': `${luckyMotionDirection * luckyMotionLateral}px`,\n                        '--lucky-y-from': `${-luckyMotionDistance}px`,\n                        '--lucky-x-to': `${-luckyMotionDirection * luckyMotionLateral}px`,\n                        '--lucky-y-to': `${luckyMotionDistance}px`,\n                        '--lucky-duration': `${luckyMotionDuration}ms`,\n                        '--lucky-delay': `${luckyMotionDelay}ms`\n                      } as React.CSSProperties}\n                    >\n""",
    """                  const hasLiked = Boolean(track?.likedBy && Array.isArray(track.likedBy) && track.likedBy.some(k => currentIdentityKeys.includes(k)));\n\n                  return (\n                    <div\n                      key={track.id}\n                      className=\"lucky-card relative\"\n                      data-track-card-id={track.id}\n                      data-lucky-winner={luckyWinnerId === track.id ? 'true' : undefined}\n                    >\n"""
)

css = Path('src/index.css')
text = css.read_text()
start = text.index('/* Home lucky draw v94 */')
end = text.index('@media (prefers-reduced-motion: reduce)', start)
end_close = text.index('}', end)
end_close = text.index('}', end_close + 1) + 1
new_css = r'''/* Home lucky draw v95: fixed surrounding cards + second-slot reel */
.audio-card-grid > .lucky-card {
  transition: filter 160ms ease, opacity 160ms ease, box-shadow 160ms ease;
  border-radius: 1.5rem;
  transform-origin: center;
}

/* All non-focus cards stay in their exact layout positions. */
.audio-card-grid.lucky-spin-active > .lucky-card {
  filter: brightness(0.34) saturate(0.55);
  opacity: 0.48;
  z-index: 10;
  transform: none;
  animation: none;
}

/* Only the second slot behaves like the reel window. Its keyed card is replaced on
   every tick, so this one-shot entrance animation restarts without moving siblings. */
.audio-card-grid.lucky-spin-active > .lucky-card:nth-child(2) {
  opacity: 1;
  z-index: 20;
  box-shadow: 0 0 0 3px var(--color-primary, #c06c84), 0 0 34px var(--color-primary, #c06c84);
  will-change: transform, filter, opacity;
  animation: echostars-lucky-slot-enter 210ms cubic-bezier(.16,.84,.28,1) both;
}

.audio-card-grid.lucky-spin-active > .lucky-card:nth-child(2)::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(180deg, transparent 0%, rgb(255 255 255 / 0.18) 46%, rgb(255 255 255 / 0.34) 50%, transparent 56%);
  opacity: 0.75;
  animation: echostars-lucky-slot-sheen 210ms ease-out both;
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
  animation: echostars-lucky-win 620ms cubic-bezier(.2,.9,.25,1.3) 2 forwards;
}

.lucky-winner-badge {
  position: absolute;
  z-index: 40;
  top: -2.85rem;
  right: 0.35rem;
  padding: 0.35rem 0.7rem;
  border-radius: 9999px;
  background: var(--color-primary, #c06c84);
  color: white;
  font-weight: 900;
  font-size: 0.95rem;
  line-height: 1.1;
  letter-spacing: 0.04em;
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.28);
  pointer-events: none;
  animation: echostars-lucky-badge 420ms cubic-bezier(.2,.9,.25,1.4) both;
}

@keyframes echostars-lucky-slot-enter {
  0% {
    transform: translate3d(0, 18px, 0) scale(0.985);
    filter: brightness(1.35) saturate(1.2) blur(2px);
    opacity: 0.35;
  }
  58% {
    transform: translate3d(0, -2px, 0) scale(1.018);
    filter: brightness(1.25) saturate(1.2) blur(0.4px);
    opacity: 1;
  }
  100% {
    transform: translate3d(0, 0, 0) scale(1);
    filter: brightness(1.18) saturate(1.2) blur(0);
    opacity: 1;
  }
}

@keyframes echostars-lucky-slot-sheen {
  from { transform: translateY(-35%); opacity: 0; }
  45% { opacity: 0.85; }
  to { transform: translateY(35%); opacity: 0; }
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
  .audio-card-grid.lucky-spin-active > .lucky-card:nth-child(2)::after,
  .audio-card-grid.lucky-win-active > .lucky-card[data-lucky-winner="true"],
  .lucky-winner-badge {
    animation: none !important;
    transition-duration: 0.01ms !important;
  }
}'''
css.write_text(text[:start] + new_css + text[end_close:])

# Regression tests: the surrounding cards must not animate or move; only the second
# slot cycles card content and gets the reel animation.
Path('tests/homeLuckyDrawUi.test.ts').write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('home search-side action is the accessible-track lucky draw', () => {
  assert.match(app, /🫵好手氣/);
  assert.match(app, /filteredTracks\.filter\(track => !track\.isPrivateVip && checkCanAccess\(track\)\)/);
  assert.match(app, /moveTrackIdToSecondSlot/);
  assert.match(app, /prefers-reduced-motion: reduce/);
  assert.match(app, /createOscillator\(\)/);
});

test('spin keeps surrounding cards fixed and only replaces the second visible slot', () => {
  assert.match(app, /const \[luckySpinTrackId, setLuckySpinTrackId\]/);
  assert.match(app, /luckyPhase === 'spin' && luckySpinTrackId/);
  assert.match(app, /return \[filteredTracks\[0\], spinTrack, \.\.\.filteredTracks\.slice\(2\)\]/);
  assert.match(app, /setLuckySpinTrackId\(candidate\.id\)/);
  assert.doesNotMatch(app, /--lucky-x-from/);
  assert.doesNotMatch(app, /--lucky-y-to/);
  assert.match(css, /\.audio-card-grid\.lucky-spin-active > \.lucky-card \{[\s\S]*transform: none;[\s\S]*animation: none;/);
  assert.match(css, /\.audio-card-grid\.lucky-spin-active > \.lucky-card:nth-child\(2\) \{[\s\S]*animation: echostars-lucky-slot-enter/);
  assert.match(css, /@keyframes echostars-lucky-slot-enter/);
});

test('lucky draw keeps spotlight and persistent winner state without scrolling', () => {
  assert.match(app, /lucky-spin-active/);
  assert.match(app, /lucky-win-active/);
  assert.match(app, /data-lucky-winner/);
  assert.match(css, /\.audio-card-grid\.lucky-win-active > \.lucky-card\[data-lucky-winner="true"\]/);
  assert.match(css, /\.lucky-winner-badge \{[\s\S]*top: -2\.85rem/);
  assert.match(app, /if \(luckyPhase !== 'win'\) return/);
  assert.match(app, /document\.addEventListener\('pointerdown', dismissLuckyWinnerOnBlank/);
  assert.doesNotMatch(app, /winnerElement\?\.scrollIntoView/);
  assert.doesNotMatch(app, /setLuckyPhase\('idle'\), 2400/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('home keyword expand and collapse control is right aligned', () => {
  assert.match(app, /className="ml-auto flex items-center gap-2"[\s\S]*showKeywordsDrawer \? '▲ 收起' : '▼ 展開'/);
});
''')

replace_once('public/sw.js', 'echostars-shell-v94', 'echostars-shell-v95')
replace_once(
    'tests/releaseIntegrity.test.ts',
    """test('v94 is the single current PWA cache version', () => {\n  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v94'/);\n""",
    """test('v95 is the single current PWA cache version', () => {\n  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v95'/);\n"""
)

replace_once(
    'src/changelogReleaseNotes.ts',
    """    '好手氣實機動畫再加強：每張可見卡片改用不同的位移方向、距離、速度與延遲一起滾動，暗色卡也會明顯參與轉輪；第二張只保留聚光、不再以另一套動畫覆蓋。中獎標籤再往上移到標題區外，避免遮住音檔名稱。',\n""",
    """    '好手氣實機動畫再加強：每張可見卡片改用不同的位移方向、距離、速度與延遲一起滾動，暗色卡也會明顯參與轉輪；第二張只保留聚光、不再以另一套動畫覆蓋。中獎標籤再往上移到標題區外，避免遮住音檔名稱。',\n    '依手機實機錄影重新整理好手氣動畫：抽卡時首頁清單不再整體重排或晃動，第一張、第三張及其他暗色卡固定原位，只讓第二張聚光槽快速更換音檔，搭配短距離滑入、模糊退去與掃光；抽中後才正式定格到第二張。中獎標籤再上移，避免壓住標題。',\n"""
)
