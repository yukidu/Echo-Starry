import { spawn, spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import net from 'node:net';

const APP_URL = process.env.ECHOSTARS_UI_CHECK_URL || 'http://127.0.0.1:4173/';
const DEBUG_JSON = '/tmp/echostars-v167-category-filter-state.json';
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

async function main() {
  const seededTracks = [
    ['v167-business', '事業'],
    ['v167-nutrition', '營養'],
    ['v167-mindset', '心態思維']
  ].map(([id, category], index) => ({
    id,
    title: `V167 ${category} 測試音檔`,
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
    speechDate: '2026-10-10',
    requiredRank: '公開',
    seriesOrder: String(index + 1),
    uploadDate: `2026-10-10T0${index}:00:00.000Z`,
    description: '',
    audioUrl: '',
    likedBy: [],
    ratings: {},
    stickerUnlockCost: 0
  }));

  const port = await freePort();
  const chrome = spawn(chromeBinary(), [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars',
    '--window-size=412,915', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/echostars-v167-category-${process.pid}`, 'about:blank'
  ], { stdio: 'ignore' });

  try {
    await waitJson(`http://127.0.0.1:${port}/json/version`);
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about%3Ablank`, { method: 'PUT' });
    const target = await targetResponse.json();
    const socket = new WebSocket(target.webSocketDebuggerUrl);
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
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const callId = id++;
      pending.set(callId, { resolve, reject });
      socket.send(JSON.stringify({ id: callId, method, params }));
    });
    const evaluate = async expression => {
      const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Evaluation failed');
      return response.result?.value;
    };
    const waitFor = async (expression, label) => {
      for (let i = 0; i < 100; i += 1) {
        if (await evaluate(expression)) return;
        await delay(100);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const capture = async path => {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(path, Buffer.from(shot.data, 'base64'));
    };

    await send('Page.enable');
    await send('Runtime.enable');
    const seedScript = `(() => {
      try {
        localStorage.removeItem('sq_current_user_v1');
        localStorage.setItem('echostars_live_categories_v71', ${JSON.stringify(JSON.stringify(['事業', '營養', '心態思維']))});
        localStorage.setItem('echostars_home_cache_v3_3', ${JSON.stringify(JSON.stringify({ tracks: seededTracks, categories: ['全部', '事業', '營養', '心態思維'], savedAt: Date.now() }))});
      } catch (_) {}
    })();`;
    await send('Page.addScriptToEvaluateOnNewDocument', { source: seedScript });
    await send('Page.navigate', { url: APP_URL });
    await waitFor(`document.readyState === 'complete' && document.querySelectorAll('.v145-filter-button').length === 4`, 'four filter buttons');
    await waitFor(`document.querySelectorAll('[data-track-card-id]').length === 3`, 'seeded home cards');

    const states = [];
    const readState = () => evaluate(`(() => ({
      label: document.querySelector('[data-v145-label="category"]')?.textContent?.trim() || '',
      cards: Array.from(document.querySelectorAll('[data-track-card-id]')).map(el => el.getAttribute('data-track-card-id')),
      pageOpen: !!document.querySelector('[data-v167-filter-page="category"]'),
      pageOptions: Array.from(document.querySelectorAll('[data-v167-filter-page="category"] [data-v167-option]')).map(el => (el.textContent || '').trim())
    }))()`);

    const chooseCategory = async (displayLabel, expectedLabel, expectedCards, index) => {
      await evaluate(`document.querySelector('.v145-filter-button[data-v145-button="category"]')?.click()`);
      await waitFor(`!!document.querySelector('[data-v167-filter-page="category"]')`, `full-page category view for ${displayLabel}`);
      const before = await readState();
      if (!before.pageOptions.includes(displayLabel)) {
        throw new Error(`Missing category option ${displayLabel}; available=${JSON.stringify(before.pageOptions)}`);
      }
      await capture(`/tmp/echostars-v167-category-${index}-page.png`);
      const clicked = await evaluate(`(() => {
        const button = Array.from(document.querySelectorAll('[data-v167-filter-page="category"] [data-v167-option]')).find(el => (el.textContent || '').trim().replace(/✓$/,'').trim() === ${JSON.stringify(displayLabel)});
        if (!button) return false;
        button.click();
        return true;
      })()`);
      if (!clicked) throw new Error(`Could not click full-page category option ${displayLabel}`);

      await waitFor(`!document.querySelector('[data-v167-filter-page]')`, `category page close for ${displayLabel}`);
      await waitFor(`document.querySelector('[data-v145-label="category"]')?.textContent?.trim() === ${JSON.stringify(expectedLabel)}`, `category label ${expectedLabel}`);
      await waitFor(`JSON.stringify(Array.from(document.querySelectorAll('[data-track-card-id]')).map(el => el.getAttribute('data-track-card-id')).sort()) === ${JSON.stringify(JSON.stringify([...expectedCards].sort()))}`, `filtered cards for ${expectedLabel}`);

      const state = await readState();
      states.push({ requested: displayLabel, ...state });
      if (JSON.stringify([...state.cards].sort()) !== JSON.stringify([...expectedCards].sort())) {
        throw new Error(`Category filter mismatch for ${expectedLabel}: ${JSON.stringify(state)}`);
      }
      await capture(`/tmp/echostars-v167-category-${index}-result.png`);
    };

    await chooseCategory('事業', '事業', ['v167-business'], 1);
    await chooseCategory('營養', '營養', ['v167-nutrition'], 2);
    await chooseCategory('心態思維', '心態思維', ['v167-mindset'], 3);
    await chooseCategory('全部分類', '全部分類', ['v167-business', 'v167-nutrition', 'v167-mindset'], 4);

    await writeFile(DEBUG_JSON, JSON.stringify({ states }, null, 2), 'utf8');
    console.log('v167 full-page category filtering verified across four consecutive selections:', JSON.stringify(states));
    socket.close();
  } finally {
    chrome.kill('SIGTERM');
  }
}

main().catch(async error => {
  try { await writeFile(DEBUG_JSON, JSON.stringify({ fatal: String(error?.stack || error) }, null, 2), 'utf8'); } catch {}
  console.error(error?.stack || error);
  process.exitCode = 1;
});
