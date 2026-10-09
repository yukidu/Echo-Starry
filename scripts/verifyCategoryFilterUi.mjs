import { spawn, spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const APP_URL = process.env.ECHOSTARS_UI_CHECK_URL || 'http://127.0.0.1:4173/';
const DEBUG_PORT = Number(process.env.ECHOSTARS_CATEGORY_CHROME_DEBUG_PORT || 9223);
const DEBUG_JSON = '/tmp/echostars-category-filter-debug.json';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resolveChromeBinary() {
  const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes('/')) return candidate;
    const probe = spawnSync('which', [candidate], { encoding: 'utf8' });
    if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.trim();
  }
  throw new Error(`Chrome/Chromium not found. Checked: ${candidates.join(', ')}`);
}

async function waitForJson(url, attempts = 60) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function main() {
  const chromeBinary = resolveChromeBinary();
  const userDataDir = `/tmp/echostars-category-ui-${process.pid}`;
  const chrome = spawn(chromeBinary, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars',
    '--window-size=412,915', '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${userDataDir}`, 'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let chromeErrors = '';
  chrome.stderr.on('data', chunk => {
    chromeErrors += String(chunk);
    if (chromeErrors.length > 12000) chromeErrors = chromeErrors.slice(-12000);
  });

  try {
    await waitForJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const targetResponse = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about%3Ablank`, { method: 'PUT' });
    if (!targetResponse.ok) throw new Error(`Could not open browser target: ${targetResponse.status}`);
    const target = await targetResponse.json();
    if (!target.webSocketDebuggerUrl) throw new Error('Browser target did not expose a DevTools websocket.');

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out connecting to DevTools websocket.')), 10000);
      socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
      socket.addEventListener('error', event => { clearTimeout(timeout); reject(event.error || new Error('DevTools websocket failed.')); }, { once: true });
    });

    let nextId = 1;
    const pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else waiter.resolve(message.result || {});
    });

    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });

    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed.');
      return result.result?.value;
    };

    const waitFor = async (expression, label, attempts = 100) => {
      for (let i = 0; i < attempts; i += 1) {
        if (await evaluate(expression)) return;
        await delay(100);
      }
      throw new Error(`Timed out waiting for ${label}.`);
    };

    const capture = async path => {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(path, Buffer.from(shot.data, 'base64'));
    };

    await send('Page.enable');
    await send('Runtime.enable');

    const seededTracks = [
      ['v155-business', '事業'],
      ['v155-nutrition', '營養'],
      ['v155-mindset', '心態思維']
    ].map(([id, category], index) => ({
      id,
      title: `V155 ${category} 測試音檔`,
      speaker: '測試講者',
      speakerRank: '無',
      speakerAvatar: '',
      category,
      categories: [category],
      rating: 0,
      ratingCount: 0,
      commentsCount: 0,
      likes: 0,
      duration: '10:00',
      durationSeconds: 600,
      series: '',
      speechDate: '2026-10-09',
      requiredRank: '公開',
      seriesOrder: String(index + 1),
      uploadDate: `2026-10-09T0${index}:00:00.000Z`,
      description: '',
      audioUrl: '',
      likedBy: [],
      ratings: {},
      stickerUnlockCost: 0
    }));

    const seedScript = `(() => {
      try {
        localStorage.removeItem('sq_current_user_v1');
        localStorage.setItem('echostars_home_cache_v3_3', ${JSON.stringify(JSON.stringify({
          tracks: seededTracks,
          categories: ['全部', '事業', '營養', '心態思維'],
          savedAt: Date.now()
        }))});
      } catch (_) {}
    })();`;
    await send('Page.addScriptToEvaluateOnNewDocument', { source: seedScript });
    await send('Page.navigate', { url: APP_URL });

    await waitFor(`document.readyState === 'complete' && !!document.querySelector('[data-v145-filter-toolbar]')`, 'v145 filter toolbar');
    await waitFor(`document.querySelectorAll('[data-track-card-id]').length === 3`, 'seeded home cards');

    const readState = () => evaluate(`(() => ({
      label: document.querySelector('[data-v145-label="category"]')?.textContent?.trim() || '',
      cards: Array.from(document.querySelectorAll('[data-track-card-id]')).map(el => el.getAttribute('data-track-card-id')),
      menuVisible: (() => {
        const menu = document.querySelector('[data-v145-menu="category"]');
        return !!menu && !menu.hidden;
      })()
    }))()`);

    const chooseCategory = async (displayLabel, expectedLabel, expectedCards, shotIndex) => {
      await evaluate(`document.querySelector('[data-v145-button="category"]')?.click()`);
      await waitFor(`(() => { const m = document.querySelector('[data-v145-menu="category"]'); return !!m && !m.hidden; })()`, `category menu open for ${displayLabel}`);
      await evaluate(`(() => {
        const button = Array.from(document.querySelectorAll('[data-v145-menu="category"] button'))
          .find(el => (el.textContent || '').trim() === ${JSON.stringify(displayLabel)});
        if (!button) throw new Error('Missing category option: ${displayLabel}');
        button.click();
      })()`);

      await waitFor(`document.querySelector('[data-v145-label="category"]')?.textContent?.trim() === ${JSON.stringify(expectedLabel)}`, `custom category label ${expectedLabel}`);
      await waitFor(`JSON.stringify(Array.from(document.querySelectorAll('[data-track-card-id]')).map(el => el.getAttribute('data-track-card-id')).sort()) === ${JSON.stringify(JSON.stringify([...expectedCards].sort()))}`, `filtered cards for ${expectedLabel}`);

      const state = await readState();
      if (JSON.stringify([...state.cards].sort()) !== JSON.stringify([...expectedCards].sort())) {
        throw new Error(`Category filter mismatch for ${expectedLabel}: ${JSON.stringify(state)}`);
      }
      await capture(`/tmp/echostars-category-${shotIndex}-${expectedLabel.replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, '-')}.png`);
      return state;
    };

    const states = [];
    states.push(await chooseCategory('事業', '事業', ['v155-business'], 1));
    states.push(await chooseCategory('營養', '營養', ['v155-nutrition'], 2));
    states.push(await chooseCategory('心態思維', '心態思維', ['v155-mindset'], 3));
    states.push(await chooseCategory('全部分類', '全部分類', ['v155-business', 'v155-nutrition', 'v155-mindset'], 4));

    await writeFile(DEBUG_JSON, JSON.stringify({ states }, null, 2), 'utf8');
    console.log('Category filter browser UI verified across four consecutive selections without reload.');
    console.log(JSON.stringify(states));
    socket.close();
  } catch (error) {
    if (chromeErrors.trim()) {
      console.error('Chrome stderr (tail):');
      console.error(chromeErrors.trim());
    }
    throw error;
  } finally {
    chrome.kill('SIGTERM');
    await delay(150);
    if (!chrome.killed) chrome.kill('SIGKILL');
  }
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
