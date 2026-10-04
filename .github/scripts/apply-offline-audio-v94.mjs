import fs from 'node:fs';

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`missing pattern: ${label}`);
  const next = source.replace(from, to);
  if (next === source) throw new Error(`replace failed: ${label}`);
  return next;
}

const appPath = 'src/App.tsx';
let app = fs.readFileSync(appPath, 'utf8');

app = replaceOnce(app,
`  handleTrackProgressOffline,\n  purgeStaleOfflineTracks\n} from './utils/offlineAudio';`,
`  handleTrackProgressOffline,\n  purgeStaleOfflineTracks,\n  requestPersistentOfflineStorage\n} from './utils/offlineAudio';`,
'offline import');

app = replaceOnce(app,
`  // Requirement 26: Fullscreen loading state when downloading/buffering audio\n  const [isLoadingAudio, setIsLoadingAudio] = useState(false);`,
`  // Fullscreen loading is reserved for the initial source load only.\n  // Short buffering caused by dragging/seeking must never keep covering the page.\n  const [isLoadingAudio, setIsLoadingAudio] = useState(false);\n  const audioInitialLoadRef = useRef(false);\n  const audioLoadingTimerRef = useRef<number | null>(null);\n\n  const clearAudioLoadingTimer = useCallback(() => {\n    if (audioLoadingTimerRef.current !== null) {\n      window.clearTimeout(audioLoadingTimerRef.current);\n      audioLoadingTimerRef.current = null;\n    }\n  }, []);\n\n  const beginInitialAudioLoad = useCallback(() => {\n    clearAudioLoadingTimer();\n    audioInitialLoadRef.current = true;\n    audioLoadingTimerRef.current = window.setTimeout(() => {\n      audioLoadingTimerRef.current = null;\n      if (audioInitialLoadRef.current) setIsLoadingAudio(true);\n    }, 350);\n  }, [clearAudioLoadingTimer]);\n\n  const finishInitialAudioLoad = useCallback(() => {\n    clearAudioLoadingTimer();\n    audioInitialLoadRef.current = false;\n    setIsLoadingAudio(false);\n  }, [clearAudioLoadingTimer]);`,
'loading state');

app = replaceOnce(app,
`    // Record to offline cache registry\n    recordOfflineTrack(track.id, track.audioUrl);\n\n    // Show huge loading overlay until audio starts playing\n    setIsLoadingAudio(true);`,
`    // Real offline storage stays enabled. Ask the browser for persistent storage\n    // when possible, then schedule the full-file Cache Storage write in background.\n    void requestPersistentOfflineStorage();\n    recordOfflineTrack(track.id, track.audioUrl);\n\n    // Only a genuinely slow initial source load may show the blocking overlay.\n    // Seek-time buffering after playback has started stays non-blocking.\n    beginInitialAudioLoad();`,
'play start');

app = replaceOnce(app,
`        .then(() => {\n          setIsPlaying(true);\n          setIsLoadingAudio(false);\n        })\n        .catch(() => {\n          setIsPlaying(true);\n          setIsLoadingAudio(false);\n        });`,
`        .then(() => {\n          setIsPlaying(true);\n          finishInitialAudioLoad();\n        })\n        .catch(() => {\n          setIsPlaying(true);\n          finishInitialAudioLoad();\n        });`,
'play promise loading');

app = replaceOnce(app,
`        onWaiting={() => setIsLoadingAudio(true)}\n        onCanPlay={() => setIsLoadingAudio(false)}\n        onError={() => {\n          setIsPlaying(false);\n          setIsLoadingAudio(false);\n        }}`,
`        onWaiting={() => {\n          // waiting fires frequently after timeline seeks. Once playback has already\n          // started, keep the player visible instead of reopening a fullscreen modal.\n          if (audioInitialLoadRef.current && audioLoadingTimerRef.current === null) {\n            beginInitialAudioLoad();\n          }\n        }}\n        onCanPlay={finishInitialAudioLoad}\n        onPlaying={finishInitialAudioLoad}\n        onError={() => {\n          setIsPlaying(false);\n          finishInitialAudioLoad();\n        }}`,
'audio events');

app = replaceOnce(app,
`          <p className="text-sm text-rose-200 mt-2 font-medium">\n            正在下載音訊檔案並進行離線儲存\n          </p>`,
`          <p className="text-sm text-rose-200 mt-2 font-medium text-center px-6">\n            正在準備音訊播放<br />離線儲存會在背景自動完成\n          </p>`,
'overlay copy');

fs.writeFileSync(appPath, app);

const swPath = 'public/sw.js';
let sw = fs.readFileSync(swPath, 'utf8');
sw = replaceOnce(sw, "const CACHE_NAME = 'echostars-shell-v93';", "const CACHE_NAME = 'echostars-shell-v94';", 'sw cache');
fs.writeFileSync(swPath, sw);

const releasePath = 'tests/releaseIntegrity.test.ts';
let release = fs.readFileSync(releasePath, 'utf8');
release = replaceOnce(release, "test('v93 is the single current PWA cache version', () => {\n  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v93'/);", "test('v94 is the single current PWA cache version', () => {\n  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v94'/);", 'release cache');
fs.writeFileSync(releasePath, release);

const changelogPath = 'src/changelogReleaseNotes.ts';
let changelog = fs.readFileSync(changelogPath, 'utf8');
const anchor = "    '「🫵好手氣」抽卡動畫再優化：轉輪時畫面中的卡片會一起上下滾動，第二張維持聚光；中獎後不再自動捲動畫面，中獎光效與標籤會持續保留，點空白處、重新整理或回首頁才清除。中獎標籤上移避免遮住標題；首頁「網友關鍵字」的展開／收起固定靠右。',";
changelog = replaceOnce(changelog, anchor, `${anchor}\n    '音檔播放與真正離線儲存重新分流：拖曳時間軸造成的短暫緩衝不再反覆蓋住整頁；完整音檔仍會實際寫入瀏覽器 Cache Storage，成功寫入並驗證後才算離線保存。背景下載延後並降低優先級、同時只下載一個音檔，減少和播放搶網路；聽完後不再立刻刪除，改為 15 天未使用才清理，並在瀏覽器支援時申請持久儲存。',`, 'changelog note');
fs.writeFileSync(changelogPath, changelog);

const communityPath = 'tests/community.test.ts';
let community = fs.readFileSync(communityPath, 'utf8');
community = replaceOnce(community,
`test('offline audio cleanup removes completed and stale cached objects', async () => {`,
`test('offline audio cleanup keeps completed files and removes only stale cached objects', async () => {`,
'community offline title');
community = replaceOnce(community,
`    offline.handleTrackProgressOffline('a', 96, 100);\n    await Promise.resolve(); await Promise.resolve();\n    assert.deepEqual(removed, ['https://audio.example/a.mp3']);`,
`    offline.handleTrackProgressOffline('a', 96, 100);\n    await Promise.resolve(); await Promise.resolve();\n    assert.deepEqual(removed, []);\n    assert.equal(offline.getOfflineRegistry().a.completed, true);`,
'community completed retention');
community = replaceOnce(community,
`    assert.equal(removed[1], 'https://audio.example/b.mp3');`,
`    assert.equal(removed[0], 'https://audio.example/b.mp3');`,
'community stale index');
fs.writeFileSync(communityPath, community);

const test = `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\n\nconst app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');\nconst offline = readFileSync(new URL('../src/utils/offlineAudio.ts', import.meta.url), 'utf8');\n\ntest('timeline seek buffering does not reopen the fullscreen initial-load overlay', () => {\n  assert.match(app, /audioInitialLoadRef/);\n  assert.match(app, /onWaiting=\\{\\(\\) => \\{[\\s\\S]*audioInitialLoadRef\\.current/);\n  assert.doesNotMatch(app, /onWaiting=\\{\\(\\) => setIsLoadingAudio\\(true\\)\\}/);\n  assert.match(app, /onCanPlay=\\{finishInitialAudioLoad\\}/);\n  assert.match(app, /onPlaying=\\{finishInitialAudioLoad\\}/);\n  assert.match(app, /正在準備音訊播放/);\n});\n\ntest('offline audio remains a real verified Cache Storage download', () => {\n  assert.match(offline, /caches\\.open\\(AUDIO_CACHE\\)/);\n  assert.match(offline, /await cache\\.put\\(audioUrl, response\\.clone\\(\\)\\)/);\n  assert.match(offline, /if \\(!\\(await cache\\.match\\(audioUrl\\)\\)\\) return false/);\n  assert.match(offline, /markCached\\(trackId, audioUrl\\)/);\n  assert.match(offline, /priority: 'low'/);\n  assert.match(offline, /cacheQueue/);\n});\n\ntest('completed recordings stay offline until the retention window expires', () => {\n  assert.match(offline, /if \\(ratio > 0\\.95\\) record\\.completed = true/);\n  const progressStart = offline.indexOf('export function handleTrackProgressOffline');\n  const progressEnd = offline.indexOf('/** Remove one track', progressStart);\n  const progressSection = offline.slice(progressStart, progressEnd);\n  assert.doesNotMatch(progressSection, /removeOfflineTrack\\(/);\n  assert.match(offline, /now - record\\.lastListenedAt > RETENTION_MS/);\n  assert.doesNotMatch(offline, /\\|\\| record\\.completed/);\n  assert.match(offline, /navigator\\.storage\\.persist\\(\\)/);\n});\n`;
fs.writeFileSync('tests/offlineAudioBehavior.test.ts', test);

// Remove the one-shot tooling from the final branch before committing.
fs.rmSync('.github/scripts/apply-offline-audio-v94.mjs', { force: true });
fs.rmSync('.github/workflows/apply-offline-audio-v94.yml', { force: true });
