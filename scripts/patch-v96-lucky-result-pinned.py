from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f'missing expected block in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))


replace_once(
    'src/App.tsx',
    "import { moveTrackIdToSecondSlot, sortDefaultHomeTracks } from './homePlaylistPolicy';",
    "import { sortDefaultHomeTracks } from './homePlaylistPolicy';"
)

replace_once(
    'src/App.tsx',
    "  const [luckyPhase, setLuckyPhase] = useState<'idle' | 'spin' | 'win'>('idle');\n  const [luckyOrderIds, setLuckyOrderIds] = useState<string[] | null>(null);\n  const [luckySpinTrackId, setLuckySpinTrackId] = useState<string | null>(null);",
    "  const [luckyPhase, setLuckyPhase] = useState<'idle' | 'spin' | 'win'>('idle');\n  const [luckySpinTrackId, setLuckySpinTrackId] = useState<string | null>(null);"
)

replace_once(
    'src/App.tsx',
    "    setLuckyPhase('idle');\n    setLuckyOrderIds(null);\n    setLuckySpinTrackId(null);",
    "    setLuckyPhase('idle');\n    setLuckySpinTrackId(null);"
)

replace_once(
    'src/App.tsx',
    "  const displayedTracks = useMemo(() => {\n    // During the reel animation the list itself stays frozen. Only slot #2 swaps\n    // its card content, which gives a slot-machine feel without moving nearby cards.\n    if (luckyPhase === 'spin' && luckySpinTrackId) {\n      const spinTrack = filteredTracks.find(track => track.id === luckySpinTrackId);\n      if (!spinTrack) return filteredTracks;\n      if (filteredTracks.length <= 1) return [spinTrack];\n      return [filteredTracks[0], spinTrack, ...filteredTracks.slice(2)];\n    }\n\n    if (!luckyOrderIds) return filteredTracks;\n    const byId = new Map(filteredTracks.map(track => [track.id, track]));\n    const ordered = luckyOrderIds.map(id => byId.get(id)).filter((track): track is Track => Boolean(track));\n    const included = new Set(ordered.map(track => track.id));\n    return [...ordered, ...filteredTracks.filter(track => !included.has(track.id))];\n  }, [filteredTracks, luckyPhase, luckySpinTrackId, luckyOrderIds]);",
    "  const displayedTracks = useMemo(() => {\n    // Keep the reel/result in the same visual slot. The final winner is already\n    // rendered in slot #2 before the phase changes to win, so mobile scroll\n    // anchoring never sees a whole-list reorder at the end of the animation.\n    if ((luckyPhase === 'spin' || luckyPhase === 'win') && luckySpinTrackId) {\n      const spinTrack = filteredTracks.find(track => track.id === luckySpinTrackId);\n      if (!spinTrack) return filteredTracks;\n      if (filteredTracks.length <= 1) return [spinTrack];\n      return [filteredTracks[0], spinTrack, ...filteredTracks.slice(2)];\n    }\n\n    return filteredTracks;\n  }, [filteredTracks, luckyPhase, luckySpinTrackId]);"
)

replace_once(
    'src/App.tsx',
    "    const baseIds = filteredTracks.map(track => track.id);\n    const winner = candidates[Math.floor(Math.random() * candidates.length)];",
    "    const winner = candidates[Math.floor(Math.random() * candidates.length)];"
)

replace_once(
    'src/App.tsx',
    "    const finish = () => {\n      setLuckySpinTrackId(null);\n      setLuckyOrderIds(moveTrackIdToSecondSlot(baseIds, winner.id));\n      setLuckyWinnerId(winner.id);\n      setLuckyPhase('win');\n      playLuckyWin();\n    };",
    "    const finish = () => {\n      // Do not reorder the whole list here. Keep the winner in the exact same\n      // second slot that the last reel frame already rendered.\n      setLuckySpinTrackId(winner.id);\n      setLuckyWinnerId(winner.id);\n      setLuckyPhase('win');\n      playLuckyWin();\n    };"
)

replace_once(
    'src/App.tsx',
    "    const spin = (index: number) => {\n      if (index >= reel.length - 1) {\n        finish();\n        return;\n      }\n      const candidate = reel[index];\n      setLuckyOrderIds(null);\n      setLuckySpinTrackId(candidate.id);",
    "    const spin = (index: number) => {\n      if (index >= reel.length) {\n        finish();\n        return;\n      }\n      const candidate = reel[index];\n      setLuckySpinTrackId(candidate.id);"
)

# Update lucky draw regression to lock in the no-reorder mobile behavior.
p = Path('tests/homeLuckyDrawUi.test.ts')
text = p.read_text()
text = text.replace("  assert.match(app, /moveTrackIdToSecondSlot/);\n", "  assert.doesNotMatch(app, /moveTrackIdToSecondSlot/);\n")
text = text.replace(
    "  assert.match(app, /luckyPhase === 'spin' && luckySpinTrackId/);\n",
    "  assert.match(app, /\(luckyPhase === 'spin' \\|\\| luckyPhase === 'win'\) && luckySpinTrackId/);\n"
)
text = text.replace(
    "  assert.match(app, /setLuckySpinTrackId\\(candidate\\.id\\)/);\n",
    "  assert.match(app, /setLuckySpinTrackId\\(candidate\\.id\\)/);\n  assert.match(app, /setLuckySpinTrackId\\(winner\\.id\\)/);\n  assert.doesNotMatch(app, /luckyOrderIds/);\n  assert.match(app, /if \\(index >= reel\\.length\\)/);\n"
)
p.write_text(text)

replace_once(
    'public/sw.js',
    "const CACHE_NAME = 'echostars-shell-v95';",
    "const CACHE_NAME = 'echostars-shell-v96';"
)

replace_once(
    'tests/releaseIntegrity.test.ts',
    "test('v95 is the single current PWA cache version', () => {\n  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v95'/);",
    "test('v96 is the single current PWA cache version', () => {\n  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v96'/);"
)

replace_once(
    'src/changelogReleaseNotes.ts',
    "    '依手機實機錄影重新整理好手氣動畫：抽卡時首頁清單不再整體重排或晃動，第一張、第三張及其他暗色卡固定原位，只讓第二張聚光槽快速更換音檔，搭配短距離滑入、模糊退去與掃光；抽中後才正式定格到第二張。中獎標籤再上移，避免壓住標題。',",
    "    '依手機實機錄影重新整理好手氣動畫：抽卡時首頁清單不再整體重排或晃動，第一張、第三張及其他暗色卡固定原位，只讓第二張聚光槽快速更換音檔，搭配短距離滑入、模糊退去與掃光；抽中後才正式定格到第二張。中獎標籤再上移，避免壓住標題。',\n    '修正手機版好手氣抽完後找不到結果卡的問題：最後一個轉輪畫面就先顯示真正中獎音檔，結束時直接在同一個第二張聚光槽定格，不再重新排序整份播放清單，因此不會觸發手機瀏覽器捲動錨定把結果推到畫面外。',"
)

print('v96 patch applied')
