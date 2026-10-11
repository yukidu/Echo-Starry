import { spawn, spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import net from 'node:net';

const APP_URL = process.env.ECHOSTARS_UI_CHECK_URL || 'http://127.0.0.1:4173/';
const SCREENSHOT_PATH = '/tmp/echostars-v176-crown-story-inpage.png';
const STATE_PATH = '/tmp/echostars-v176-crown-story-inpage-state.json';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function chromeBinary() {
  for (const name of [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean)) {
    if (name.includes('/')) return name;
    const probe = spawnSync('which', [name], { encoding: 'utf8' });
    if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.trim();
  }
  throw new Error('Chrome/Chromium not found');
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address()?.port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitJson(url) {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {}
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function makeSilentWavDataUri(seconds = 8, sampleRate = 8000) {
  const sampleCount = Math.max(1, Math.floor(seconds * sampleRate));
  const dataSize = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  return `data:audio/wav;base64,${wav.toString('base64')}`;
}

async function main() {
  const diagnostics = {
    acceptance: 'same page: Crown list -> story -> next -> previous -> back to list; the exact same audio element must keep playing and currentTime must keep advancing',
    appUrl: APP_URL,
    checkpoints: [],
    success: false,
    error: null
  };

  const port = await freePort();
  const chrome = spawn(chromeBinary(), [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required', '--window-size=412,915',
    '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/echostars-profile-v176-${process.pid}`, 'about:blank'
  ], { stdio: 'ignore' });

  let socket = null;
  let send = null;
  let evaluate = null;

  const saveEvidence = async () => {
    if (send) {
      try {
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        if (shot?.data) await writeFile(SCREENSHOT_PATH, Buffer.from(shot.data, 'base64'));
      } catch {}
    }
    try {
      await writeFile(STATE_PATH, JSON.stringify(diagnostics, null, 2));
    } catch {}
  };

  try {
    await waitJson(`http://127.0.0.1:${port}/json/version`);
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about%3Ablank`, { method: 'PUT' });
    const target = await targetResponse.json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });

    let id = 1;
    const pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (!message.id || !pending.has(message.id)) return;
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result || {});
    });
    send = (method, params = {}) => new Promise((resolve, reject) => {
      const callId = id++;
      pending.set(callId, { resolve, reject });
      socket.send(JSON.stringify({ id: callId, method, params }));
    });
    evaluate = async expression => {
      const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Evaluation failed');
      return response.result?.value;
    };
    const waitFor = async (expression, label, attempts = 120) => {
      for (let i = 0; i < attempts; i += 1) {
        if (await evaluate(expression)) return;
        await delay(100);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const pageTargetCount = async () => {
      const result = await send('Target.getTargets');
      return (result.targetInfos || []).filter(info => info.type === 'page').length;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: APP_URL });
    await waitFor(`document.readyState === 'complete' && !!document.querySelector('button[data-main-menu="hamburger"]') && !!document.querySelector('audio')`, 'home UI');

    await evaluate(`document.querySelector('button[data-main-menu="hamburger"]')?.click()`);
    await waitFor(`!!document.querySelector('[data-taiwan-crown-menu] button[aria-label="臺灣皇冠大使"]')`, 'Crown menu row');
    await evaluate(`document.querySelector('[data-taiwan-crown-menu] button[aria-label="臺灣皇冠大使"]')?.click()`);
    await waitFor(`document.body.dataset.taiwanCrownOpen === 'true' && document.querySelectorAll('#taiwan-crown-integrated-page a.taiwan-crown-card[href]').length === 13`, '13-person Crown list');

    const pageUrl = await evaluate('location.href');
    const targetsBefore = await pageTargetCount();
    const testAudioSrc = makeSilentWavDataUri();
    const audioSetup = await evaluate(`(async () => {
      const audio = document.querySelector('audio');
      if (!audio) return { ok: false, reason: 'audio element missing' };
      window.__v176AudioNode = audio;
      window.__v176AudioSrc = ${JSON.stringify(testAudioSrc)};
      audio.pause();
      audio.src = window.__v176AudioSrc;
      audio.loop = true;
      audio.volume = 0.01;
      audio.currentTime = 0;
      audio.load();
      try {
        await audio.play();
        return { ok: true, paused: audio.paused, currentTime: audio.currentTime, currentSrc: audio.currentSrc };
      } catch (error) {
        return { ok: false, reason: String(error?.message || error), paused: audio.paused, currentTime: audio.currentTime };
      }
    })()`);
    if (!audioSetup?.ok) throw new Error(`Could not start the shared audio element for continuity verification: ${JSON.stringify(audioSetup)}`);
    await waitFor(`(() => { const audio = document.querySelector('audio'); return audio === window.__v176AudioNode && !audio.paused && audio.currentTime > 0.08; })()`, 'shared audio playback');

    let previousTime = -1;
    const checkpoint = async label => {
      await delay(180);
      const state = await evaluate(`(() => {
        const audio = document.querySelector('audio');
        return {
          label: ${JSON.stringify(label)},
          sameNode: audio === window.__v176AudioNode,
          paused: audio?.paused ?? true,
          ended: audio?.ended ?? true,
          currentTime: Number(audio?.currentTime || 0),
          currentSrcMatches: Boolean(audio && audio.currentSrc === window.__v176AudioSrc),
          storyOpen: document.body.hasAttribute('data-taiwan-crown-story-open'),
          location: location.href
        };
      })()`);
      diagnostics.checkpoints.push(state);
      if (!state.sameNode || state.paused || state.ended || !state.currentSrcMatches) {
        throw new Error(`Shared player continuity failed at ${label}: ${JSON.stringify(state)}`);
      }
      if (previousTime >= 0 && state.currentTime <= previousTime + 0.02) {
        throw new Error(`Shared player time stopped advancing at ${label}: ${previousTime} -> ${state.currentTime}`);
      }
      previousTime = state.currentTime;
      return state;
    };

    await checkpoint('crown-list');

    await evaluate(`document.querySelector('#taiwan-crown-integrated-page a.taiwan-crown-card[href]')?.click()`);
    await waitFor(`document.body.hasAttribute('data-taiwan-crown-story-open') && !!document.querySelector('[data-v176-crown-story-content]')`, 'first local in-page story');
    const targetsAfterOpen = await pageTargetCount();
    const firstState = await evaluate(`(() => ({
      storyOpen: document.body.hasAttribute('data-taiwan-crown-story-open'),
      listHidden: Boolean(document.querySelector('#taiwan-crown-integrated-page .taiwan-crown-page-shell')?.hidden),
      hamburgerExists: Boolean(document.querySelector('button[data-main-menu="hamburger"]')),
      title: document.querySelector('.v176-crown-story-name')?.textContent || '',
      quote: document.querySelector('.v176-crown-story-quote')?.textContent || '',
      source: document.querySelector('[data-v176-crown-story-content]')?.getAttribute('data-source-url') || '',
      backExists: Boolean(document.querySelector('[data-v176-crown-story-view] button[aria-label="返回臺灣皇冠大使清單"]')),
      nextExists: Boolean(document.querySelector('[data-v176-crown-story-view] button[aria-label="下一位皇冠大使"]'))
    }))()`);
    if (targetsAfterOpen !== targetsBefore || !firstState.storyOpen || !firstState.listHidden || !firstState.hamburgerExists || firstState.title !== '陳婉芬 嵇龍生' || !firstState.quote || !firstState.source.includes('member2.html') || !firstState.backExists || !firstState.nextExists || await evaluate('location.href') !== pageUrl) {
      throw new Error(`v176 first-story mismatch: targets ${targetsBefore}->${targetsAfterOpen}; state=${JSON.stringify(firstState)}`);
    }
    await checkpoint('first-story');

    await evaluate(`document.querySelector('[data-v176-crown-story-view] button[aria-label="下一位皇冠大使"]')?.click()`);
    await waitFor(`document.querySelector('.v176-crown-story-name')?.textContent === '傅後堅'`, 'next Crown story');
    const nextState = await evaluate(`({
      title: document.querySelector('.v176-crown-story-name')?.textContent || '',
      toolbarTitle: document.querySelector('.v176-crown-story-heading strong')?.textContent || '',
      counter: document.querySelector('.v176-crown-story-heading span')?.textContent || '',
      source: document.querySelector('[data-v176-crown-story-content]')?.getAttribute('data-source-url') || ''
    })`);
    if (nextState.title !== '傅後堅' || nextState.toolbarTitle !== '傅後堅' || nextState.counter !== '2 / 13' || !nextState.source.includes('member3.html')) {
      throw new Error(`v176 next-story mismatch: ${JSON.stringify(nextState)}`);
    }
    await checkpoint('next-story');

    await evaluate(`document.querySelector('[data-v176-crown-story-view] button[aria-label="上一位皇冠大使"]')?.click()`);
    await waitFor(`document.querySelector('.v176-crown-story-name')?.textContent === '陳婉芬 嵇龍生'`, 'previous Crown story');
    const previousState = await evaluate(`({
      title: document.querySelector('.v176-crown-story-name')?.textContent || '',
      counter: document.querySelector('.v176-crown-story-heading span')?.textContent || '',
      source: document.querySelector('[data-v176-crown-story-content]')?.getAttribute('data-source-url') || ''
    })`);
    if (previousState.title !== '陳婉芬 嵇龍生' || previousState.counter !== '1 / 13' || !previousState.source.includes('member2.html')) {
      throw new Error(`v176 previous-story mismatch: ${JSON.stringify(previousState)}`);
    }
    await checkpoint('previous-story');

    await evaluate(`document.querySelector('[data-v176-crown-story-view] button[aria-label="返回臺灣皇冠大使清單"]')?.click()`);
    await waitFor(`!document.body.hasAttribute('data-taiwan-crown-story-open') && !document.querySelector('[data-v176-crown-story-view]') && !document.querySelector('#taiwan-crown-integrated-page .taiwan-crown-page-shell')?.hidden`, 'return to Crown list');
    await checkpoint('back-to-list');

    const targetsFinal = await pageTargetCount();
    const finalState = await evaluate(`({
      hamburgerExists: Boolean(document.querySelector('button[data-main-menu="hamburger"]')),
      cardCount: document.querySelectorAll('#taiwan-crown-integrated-page a.taiwan-crown-card[href]').length,
      storyViewExists: Boolean(document.querySelector('[data-v176-crown-story-view]')),
      location: location.href
    })`);
    if (targetsFinal !== targetsBefore || !finalState.hamburgerExists || finalState.cardCount !== 13 || finalState.storyViewExists || finalState.location !== pageUrl) {
      throw new Error(`v176 return-state mismatch: targets ${targetsBefore}->${targetsFinal}; state=${JSON.stringify(finalState)}`);
    }

    diagnostics.targets = { before: targetsBefore, afterOpen: targetsAfterOpen, final: targetsFinal };
    diagnostics.firstState = firstState;
    diagnostics.nextState = nextState;
    diagnostics.previousState = previousState;
    diagnostics.finalState = finalState;
    diagnostics.success = true;
    await saveEvidence();
    console.log('v176 Crown same-page + uninterrupted shared player verified:', JSON.stringify(diagnostics));
  } catch (error) {
    diagnostics.error = String(error?.stack || error);
    await saveEvidence();
    throw error;
  } finally {
    try { socket?.close(); } catch {}
    chrome.kill('SIGTERM');
  }
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});