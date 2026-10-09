from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    p.write_text(text.replace(old, new, 1))


app = 'src/App.tsx'
replace_once(app, """  const [luckyAnswerText, setLuckyAnswerText] = useState<string | null>(null);
  const luckyTimersRef = useRef<number[]>([]);
  const luckyAudioContextRef = useRef<AudioContext | null>(null);
""", """  const [luckyAnswerText, setLuckyAnswerText] = useState<string | null>(null);
  const luckyTimersRef = useRef<number[]>([]);
  const luckyAudioContextRef = useRef<AudioContext | null>(null);
  const luckyRequestPending = useRef(false);
  const luckyDrawGenerationRef = useRef(0);
""")

replace_once(app, """  const resetLuckyDrawState = useCallback(() => {
    clearLuckyTimers();
    setLuckyPhase('idle');
    setLuckyOrderIds(null);
    setLuckyWinnerId(null);
    setLuckyAnswerText(null);
  }, [clearLuckyTimers]);
""", """  const resetLuckyDrawState = useCallback(() => {
    luckyDrawGenerationRef.current += 1;
    luckyRequestPending.current = false;
    clearLuckyTimers();
    setLuckyPhase('idle');
    setLuckyOrderIds(null);
    setLuckyWinnerId(null);
    setLuckyAnswerText(null);
  }, [clearLuckyTimers]);
""")

old_lucky = """  const luckyRequestPending = useRef(false);
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
"""

new_lucky = """  const handleLuckyDraw = (anchor: HTMLElement) => {
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

    // v148: the visual reel has a hard, short budget. Sticker validation may finish
    // later, but network latency is never allowed to keep the phone animating/reordering.
    getLuckyAudioContext();
    const baseIds = filteredTracks.map(track => track.id);
    const winner = candidates[Math.floor(Math.random() * candidates.length)];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const visualSpinSteps = Math.max(10, Math.min(14, candidates.length * 2));
    const drawGeneration = ++luckyDrawGenerationRef.current;
    let spinStep = 0;
    let visualComplete = false;
    let settled = false;
    let approvalState: 'pending' | 'approved' | 'failed' = currentUser ? 'pending' : 'approved';
    let approvalError: unknown = null;
    let luckyNotice: any = { bonus: 0, settings: getFeedbackRules() };
    const isCurrentDraw = () => luckyDrawGenerationRef.current === drawGeneration;

    luckyRequestPending.current = true;
    setLuckyOrderIds(baseIds);
    setLuckyWinnerId(null);
    setLuckyPhase('spin');

    const fail = () => {
      if (settled || !isCurrentDraw()) return;
      settled = true;
      clearLuckyTimers();
      luckyRequestPending.current = false;
      setLuckyPhase('idle');
      setLuckyOrderIds(null);
      setLuckyWinnerId(null);
      setLuckyAnswerText(null);
      showPermissionAlert(approvalError instanceof Error ? approvalError.message : '貼紙不足或連線失敗，無法召喚繁星解答', anchor);
    };

    const finish = () => {
      if (settled || !isCurrentDraw()) return;
      settled = true;
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

    const completeVisualSpin = () => {
      if (visualComplete || settled || !isCurrentDraw()) return;
      visualComplete = true;
      setLuckyOrderIds(moveTrackIdToSecondSlot(baseIds, winner.id));
      setLuckyWinnerId(null);
      // Stop the reel immediately. If the server is still validating stickers,
      // keep the chosen card still instead of burning CPU/GPU with an endless reel.
      setLuckyPhase('idle');
      if (approvalState === 'approved') finish();
      else if (approvalState === 'failed') fail();
    };

    const approvalPromise = currentUser
      ? apiJson('/api/stickers/lucky-spend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationId: crypto.randomUUID(), trackId: winner.id })
        }).then(data => {
          if (!isCurrentDraw() || settled) return;
          luckyNotice = data;
          approvalState = 'approved';
          void refreshStickerSummary();
          if (visualComplete) finish();
        }).catch(error => {
          if (!isCurrentDraw() || settled) return;
          approvalError = error;
          approvalState = 'failed';
          if (visualComplete) fail();
        })
      : Promise.resolve().then(() => {
          if (!isCurrentDraw() || settled) return;
          approvalState = 'approved';
          if (visualComplete) finish();
        });

    const approvalTimeout = window.setTimeout(() => {
      if (!isCurrentDraw() || settled || approvalState !== 'pending') return;
      approvalError = new Error('連線時間過久，請再試一次。');
      approvalState = 'failed';
      if (visualComplete) fail();
    }, 20000);
    luckyTimersRef.current.push(approvalTimeout);

    if (reducedMotion || candidates.length === 1 || filteredTracks.length === 1) {
      completeVisualSpin();
      void approvalPromise;
      return;
    }

    const spin = () => {
      if (settled || !isCurrentDraw()) return;
      if (approvalState === 'failed') {
        fail();
        return;
      }
      if (spinStep >= visualSpinSteps) {
        completeVisualSpin();
        return;
      }

      const candidate = candidates[Math.floor(Math.random() * candidates.length)];
      setLuckyOrderIds(moveTrackIdToSecondSlot(baseIds, candidate.id));
      setLuckyWinnerId(null);
      setLuckyPhase('spin');
      if (spinStep % 2 === 0) playLuckyTick(spinStep);

      const progress = Math.min(1, spinStep / Math.max(1, visualSpinSteps - 1));
      const delay = Math.round(62 + progress * progress * 70);
      spinStep += 1;
      const timer = window.setTimeout(spin, delay);
      luckyTimersRef.current.push(timer);
    };

    spin();
    void approvalPromise;
  };
"""
replace_once(app, old_lucky, new_lucky)

css = 'src/index.css'
replace_once(css, """.audio-card-grid.lucky-spin-active > .lucky-card {
  filter: brightness(0.34) saturate(0.55);
  opacity: 0.48;
  z-index: 10;
  animation: echostars-lucky-reel 180ms cubic-bezier(.35,0,.65,1) infinite alternate;
}

.audio-card-grid.lucky-spin-active > .lucky-card:nth-child(3n + 1) {
  animation-delay: -55ms;
}

.audio-card-grid.lucky-spin-active > .lucky-card:nth-child(3n + 3) {
  animation-delay: -105ms;
  animation-direction: alternate-reverse;
}

.audio-card-grid.lucky-spin-active > .lucky-card:nth-child(2) {
  filter: brightness(1.18) saturate(1.2);
  opacity: 1;
  z-index: 20;
  box-shadow: 0 0 0 3px var(--color-primary, #c06c84), 0 0 30px var(--color-primary, #c06c84);
  animation: echostars-lucky-reel-focus 170ms ease-in-out infinite alternate;
}
""", """.audio-card-grid.lucky-spin-active > .lucky-card {
  filter: none;
  opacity: 0.48;
  z-index: 10;
  animation: none;
  transition: opacity 80ms linear, box-shadow 80ms linear;
}

.audio-card-grid.lucky-spin-active > .lucky-card:nth-child(2) {
  filter: none;
  opacity: 1;
  z-index: 20;
  box-shadow: 0 0 0 3px var(--color-primary, #c06c84), 0 0 24px var(--color-primary, #c06c84);
  animation: echostars-lucky-reel-focus 160ms ease-in-out infinite alternate;
  will-change: transform;
}
""")

observer_old = """const observer = new MutationObserver(queueSync);
observer.observe(document.body, { childList: true, subtree: true });
"""
observer_new = """function shouldSkipLuckyGridMutations(records: MutationRecord[]) {
  const grid = document.querySelector<HTMLElement>('.audio-card-grid.lucky-spin-active');
  return Boolean(grid && records.length && records.every(record => record.target === grid || grid.contains(record.target)));
}

const observer = new MutationObserver(records => {
  if (shouldSkipLuckyGridMutations(records)) return;
  queueSync();
});
observer.observe(document.body, { childList: true, subtree: true });
"""
for path in [
    'src/v141HomeVisualRefresh.ts',
    'src/v143FavoriteCountCtaPolish.ts',
    'src/v144GuestCtaFilterPreview.ts',
    'src/v145FourFilterToolbar.ts',
]:
    replace_once(path, observer_old, observer_new)

test_path = Path('tests/homeLuckyDrawUi.test.ts')
test_text = test_path.read_text()
old_assert = "  assert.match(css, /\\.audio-card-grid\\.lucky-spin-active > \\.lucky-card \\{[\\s\\S]*animation: echostars-lucky-reel/);\n"
new_assert = "  assert.match(css, /\\.audio-card-grid\\.lucky-spin-active > \\.lucky-card \\{[\\s\\S]*animation: none/);\n  assert.match(css, /\\.audio-card-grid\\.lucky-spin-active > \\.lucky-card:nth-child\\(2\\) \\{[\\s\\S]*animation: echostars-lucky-reel-focus/);\n"
if test_text.count(old_assert) != 1:
    raise SystemExit('tests/homeLuckyDrawUi.test.ts: expected old lucky animation assertion once')
test_path.write_text(test_text.replace(old_assert, new_assert, 1))

Path('tests/v148LuckyDrawStability.test.ts').write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const observers = [
  '../src/v141HomeVisualRefresh.ts',
  '../src/v143FavoriteCountCtaPolish.ts',
  '../src/v144GuestCtaFilterPreview.ts',
  '../src/v145FourFilterToolbar.ts'
].map(path => readFileSync(new URL(path, import.meta.url), 'utf8'));

test('v148 lucky reel has a bounded short visual budget independent of server approval', () => {
  assert.match(app, /const visualSpinSteps = Math\.max\(10, Math\.min\(14, candidates\.length \* 2\)\)/);
  assert.match(app, /const delay = Math\.round\(62 \+ progress \* progress \* 70\)/);
  assert.match(app, /if \(spinStep >= visualSpinSteps\) \{[\s\S]*completeVisualSpin\(\)/);
  assert.match(app, /if \(visualComplete\) finish\(\)/);
  assert.doesNotMatch(app, /minSpinSteps/);
  assert.doesNotMatch(app, /progress \* progress \* 190/);
  assert.doesNotMatch(app, /:\s*140;/);
});

test('v148 reset cancels the active draw generation and unlocks the summon action', () => {
  assert.match(app, /luckyDrawGenerationRef\.current \+= 1;[\s\S]*luckyRequestPending\.current = false;/);
  assert.match(app, /const drawGeneration = \+\+luckyDrawGenerationRef\.current/);
  assert.match(app, /const isCurrentDraw = \(\) => luckyDrawGenerationRef\.current === drawGeneration/);
});

test('v148 mobile reel animates only the focus card instead of every card', () => {
  assert.match(css, /\.audio-card-grid\.lucky-spin-active > \.lucky-card \{[\s\S]*filter: none;[\s\S]*animation: none;/);
  assert.match(css, /\.audio-card-grid\.lucky-spin-active > \.lucky-card:nth-child\(2\) \{[\s\S]*will-change: transform/);
});

test('v148 legacy DOM polish observers sleep during lucky-grid reorder churn', () => {
  for (const source of observers) {
    assert.match(source, /shouldSkipLuckyGridMutations/);
    assert.match(source, /record\.target === grid \|\| grid\.contains\(record\.target\)/);
  }
});
""")
