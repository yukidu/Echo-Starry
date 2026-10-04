from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'{path}: target not found: {old[:180]}')
    p.write_text(text.replace(old, new, 1))


# Give every rendered card a distinct reel motion profile. Because displayedTracks
# changes order during the draw, these per-position values change during the spin too.
replace_once(
    'src/App.tsx',
    """                  const hasLiked = Boolean(track?.likedBy && Array.isArray(track.likedBy) && track.likedBy.some(k => currentIdentityKeys.includes(k)));\n\n                  return (\n                    <div\n                      key={track.id}\n                      className=\"lucky-card relative\"\n                      data-track-card-id={track.id}\n                      data-lucky-winner={luckyWinnerId === track.id ? 'true' : undefined}\n                    >\n""",
    """                  const hasLiked = Boolean(track?.likedBy && Array.isArray(track.likedBy) && track.likedBy.some(k => currentIdentityKeys.includes(k)));\n                  const luckyMotionDirection = trackIndex % 2 === 0 ? 1 : -1;\n                  const luckyMotionDistance = 16 + ((trackIndex * 7) % 13);\n                  const luckyMotionLateral = 2 + ((trackIndex * 5) % 7);\n                  const luckyMotionDuration = 150 + ((trackIndex * 37) % 120);\n                  const luckyMotionDelay = -((trackIndex * 53) % 190);\n\n                  return (\n                    <div\n                      key={track.id}\n                      className=\"lucky-card relative\"\n                      data-track-card-id={track.id}\n                      data-lucky-winner={luckyWinnerId === track.id ? 'true' : undefined}\n                      style={{\n                        '--lucky-x-from': `${luckyMotionDirection * luckyMotionLateral}px`,\n                        '--lucky-y-from': `${-luckyMotionDistance}px`,\n                        '--lucky-x-to': `${-luckyMotionDirection * luckyMotionLateral}px`,\n                        '--lucky-y-to': `${luckyMotionDistance}px`,\n                        '--lucky-duration': `${luckyMotionDuration}ms`,\n                        '--lucky-delay': `${luckyMotionDelay}ms`\n                      } as React.CSSProperties}\n                    >\n"""
)

replace_once(
    'src/index.css',
    """/* Home lucky draw v93 */\n.audio-card-grid > .lucky-card {\n  transition: filter 150ms ease, opacity 150ms ease, transform 150ms ease, box-shadow 150ms ease;\n  border-radius: 1.5rem;\n  transform-origin: center;\n}\n\n.audio-card-grid.lucky-spin-active > .lucky-card {\n  filter: brightness(0.34) saturate(0.55);\n  opacity: 0.48;\n  z-index: 10;\n  animation: echostars-lucky-reel 180ms cubic-bezier(.35,0,.65,1) infinite alternate;\n}\n\n.audio-card-grid.lucky-spin-active > .lucky-card:nth-child(3n + 1) {\n  animation-delay: -55ms;\n}\n\n.audio-card-grid.lucky-spin-active > .lucky-card:nth-child(3n + 3) {\n  animation-delay: -105ms;\n  animation-direction: alternate-reverse;\n}\n\n.audio-card-grid.lucky-spin-active > .lucky-card:nth-child(2) {\n  filter: brightness(1.18) saturate(1.2);\n  opacity: 1;\n  z-index: 20;\n  box-shadow: 0 0 0 3px var(--color-primary, #c06c84), 0 0 30px var(--color-primary, #c06c84);\n  animation: echostars-lucky-reel-focus 170ms ease-in-out infinite alternate;\n}\n""",
    """/* Home lucky draw v94 */\n.audio-card-grid > .lucky-card {\n  transition: filter 150ms ease, opacity 150ms ease, transform 150ms ease, box-shadow 150ms ease;\n  border-radius: 1.5rem;\n  transform-origin: center;\n}\n\n.audio-card-grid.lucky-spin-active > .lucky-card {\n  filter: brightness(0.34) saturate(0.55);\n  opacity: 0.48;\n  z-index: 10;\n  will-change: transform, filter, opacity;\n  animation-name: echostars-lucky-reel;\n  animation-duration: var(--lucky-duration, 190ms);\n  animation-delay: var(--lucky-delay, 0ms);\n  animation-timing-function: cubic-bezier(.32,0,.68,1);\n  animation-iteration-count: infinite;\n  animation-direction: alternate;\n}\n\n.audio-card-grid.lucky-spin-active > .lucky-card:nth-child(2) {\n  filter: brightness(1.18) saturate(1.2);\n  opacity: 1;\n  z-index: 20;\n  box-shadow: 0 0 0 3px var(--color-primary, #c06c84), 0 0 30px var(--color-primary, #c06c84);\n}\n"""
)

replace_once(
    'src/index.css',
    """  top: -1.25rem;\n  right: 0.5rem;\n""",
    """  top: -2.2rem;\n  right: 0.35rem;\n"""
)

replace_once(
    'src/index.css',
    """  font-size: 0.95rem;\n  letter-spacing: 0.04em;\n""",
    """  font-size: 0.95rem;\n  line-height: 1.1;\n  letter-spacing: 0.04em;\n"""
)

replace_once(
    'src/index.css',
    """@keyframes echostars-lucky-reel {\n  from { transform: translateY(-7px) scale(0.98); }\n  to { transform: translateY(7px) scale(0.99); }\n}\n\n@keyframes echostars-lucky-reel-focus {\n  from { transform: translateY(-10px) scale(1.018); }\n  to { transform: translateY(10px) scale(1.035); }\n}\n""",
    """@keyframes echostars-lucky-reel {\n  0% {\n    transform: translate3d(var(--lucky-x-from, -4px), var(--lucky-y-from, -18px), 0) scale(0.965);\n  }\n  48% {\n    transform: translate3d(0, 0, 0) scale(0.985);\n  }\n  100% {\n    transform: translate3d(var(--lucky-x-to, 4px), var(--lucky-y-to, 18px), 0) scale(0.975);\n  }\n}\n"""
)

# Update regression expectations so a future refactor cannot silently make only the focus card move again.
replace_once(
    'tests/homeLuckyDrawUi.test.ts',
    """  assert.match(css, /\\.audio-card-grid\\.lucky-spin-active > \\.lucky-card \\{[\\s\\S]*animation: echostars-lucky-reel/);\n  assert.match(css, /\\.audio-card-grid\\.lucky-spin-active > \\.lucky-card:nth-child\\(2\\)/);\n  assert.match(css, /\\.audio-card-grid\\.lucky-win-active > \\.lucky-card\\[data-lucky-winner=\"true\"\\]/);\n  assert.match(css, /\\.lucky-winner-badge \\{[\\s\\S]*top: -1\\.25rem/);\n""",
    """  assert.match(app, /--lucky-x-from/);\n  assert.match(app, /--lucky-y-to/);\n  assert.match(app, /--lucky-duration/);\n  assert.match(css, /\\.audio-card-grid\\.lucky-spin-active > \\.lucky-card \\{[\\s\\S]*animation-name: echostars-lucky-reel/);\n  assert.match(css, /animation-duration: var\\(--lucky-duration, 190ms\\)/);\n  assert.match(css, /\\.audio-card-grid\\.lucky-spin-active > \\.lucky-card:nth-child\\(2\\) \\{[\\s\\S]*box-shadow/);\n  assert.match(css, /\\.audio-card-grid\\.lucky-win-active > \\.lucky-card\\[data-lucky-winner=\"true\"\\]/);\n  assert.match(css, /\\.lucky-winner-badge \\{[\\s\\S]*top: -2\\.2rem/);\n"""
)

replace_once('public/sw.js', 'echostars-shell-v93', 'echostars-shell-v94')
replace_once(
    'tests/releaseIntegrity.test.ts',
    """test('v93 is the single current PWA cache version', () => {\n  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v93'/);\n""",
    """test('v94 is the single current PWA cache version', () => {\n  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v94'/);\n"""
)

replace_once(
    'src/changelogReleaseNotes.ts',
    """    '「🫵好手氣」抽卡動畫再優化：轉輪時畫面中的卡片會一起上下滾動，第二張維持聚光；中獎後不再自動捲動畫面，中獎光效與標籤會持續保留，點空白處、重新整理或回首頁才清除。中獎標籤上移避免遮住標題；首頁「網友關鍵字」的展開／收起固定靠右。',\n""",
    """    '「🫵好手氣」抽卡動畫再優化：轉輪時畫面中的卡片會一起上下滾動，第二張維持聚光；中獎後不再自動捲動畫面，中獎光效與標籤會持續保留，點空白處、重新整理或回首頁才清除。中獎標籤上移避免遮住標題；首頁「網友關鍵字」的展開／收起固定靠右。',\n    '好手氣實機動畫再加強：每張可見卡片改用不同的位移方向、距離、速度與延遲一起滾動，暗色卡也會明顯參與轉輪；第二張只保留聚光、不再以另一套動畫覆蓋。中獎標籤再往上移到標題區外，避免遮住音檔名稱。',\n"""
)
