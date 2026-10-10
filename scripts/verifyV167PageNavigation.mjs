import { spawn, spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import net from 'node:net';

const APP_URL = process.env.ECHOSTARS_UI_CHECK_URL || 'http://127.0.0.1:4173/';
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
  const port = await freePort();
  const chrome = spawn(chromeBinary(), [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars',
    '--window-size=412,915', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/echostars-v169-filter-${process.pid}`, 'about:blank'
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
      for (let i = 0; i < 80; i += 1) {
        if (await evaluate(expression)) return;
        await delay(100);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: APP_URL });
    await waitFor(`document.readyState === 'complete' && document.querySelectorAll('.v145-filter-button').length === 4`, 'four home filter buttons');

    // Category and advanced return to direct dropdowns; they must never create a v167 full page.
    await evaluate(`document.querySelector('.v145-filter-button[data-v145-button="category"]')?.click()`);
    await waitFor(`document.querySelector('[data-v145-menu="category"]') && !document.querySelector('[data-v145-menu="category"]').hidden`, 'category dropdown');
    const categoryState = await evaluate(`(() => ({
      menuOpen: !document.querySelector('[data-v145-menu="category"]')?.hidden,
      fullPage: !!document.querySelector('[data-v167-filter-page]'),
      optionCount: document.querySelectorAll('[data-v145-menu="category"] button').length
    }))()`);
    if (!categoryState.menuOpen || categoryState.fullPage || categoryState.optionCount < 1) throw new Error(`Category dropdown mismatch: ${JSON.stringify(categoryState)}`);
    await evaluate(`document.body.click()`);

    await evaluate(`document.querySelector('.v145-filter-button[data-v145-button="advanced"]')?.click()`);
    await waitFor(`document.querySelector('[data-v145-menu="advanced"]') && !document.querySelector('[data-v145-menu="advanced"]').hidden`, 'advanced dropdown');
    const advancedState = await evaluate(`(() => ({
      menuOpen: !document.querySelector('[data-v145-menu="advanced"]')?.hidden,
      fullPage: !!document.querySelector('[data-v167-filter-page]'),
      optionCount: document.querySelectorAll('[data-v145-menu="advanced"] button').length
    }))()`);
    if (!advancedState.menuOpen || advancedState.fullPage || advancedState.optionCount < 2) throw new Error(`Advanced dropdown mismatch: ${JSON.stringify(advancedState)}`);
    await evaluate(`document.body.click()`);

    // Time and popular are direct cycle buttons. Their labels must show the live mode.
    const timeBefore = await evaluate(`document.querySelector('[data-v145-label="time"]')?.textContent?.trim() || ''`);
    await evaluate(`document.querySelector('.v145-filter-button[data-v145-button="time"]')?.click()`);
    await waitFor(`document.querySelector('.v145-filter-button[data-v145-button="time"]')?.dataset.active === 'true'`, 'time sort active');
    const timeFirst = await evaluate(`document.querySelector('[data-v145-label="time"]')?.textContent?.trim() || ''`);
    await evaluate(`document.querySelector('.v145-filter-button[data-v145-button="time"]')?.click()`);
    await waitFor(`document.querySelector('[data-v145-label="time"]')?.textContent?.trim() !== ${JSON.stringify(timeFirst)}`, 'time sort cycle');
    const timeSecond = await evaluate(`document.querySelector('[data-v145-label="time"]')?.textContent?.trim() || ''`);
    if (timeBefore !== '最新上架' || timeFirst !== '最新上架' || timeSecond !== '最早上架') {
      throw new Error(`Time cycle mismatch: ${JSON.stringify({ timeBefore, timeFirst, timeSecond })}`);
    }

    await evaluate(`document.querySelector('.v145-filter-button[data-v145-button="popular"]')?.click()`);
    await waitFor(`document.querySelector('.v145-filter-button[data-v145-button="popular"]')?.dataset.active === 'true'`, 'popular sort active');
    const popularFirst = await evaluate(`document.querySelector('[data-v145-label="popular"]')?.textContent?.trim() || ''`);
    await evaluate(`document.querySelector('.v145-filter-button[data-v145-button="popular"]')?.click()`);
    await waitFor(`document.querySelector('[data-v145-label="popular"]')?.textContent?.trim() !== ${JSON.stringify(popularFirst)}`, 'popular sort cycle');
    const popularSecond = await evaluate(`document.querySelector('[data-v145-label="popular"]')?.textContent?.trim() || ''`);
    if (popularFirst !== '評價最高' || popularSecond !== '按讚最多') {
      throw new Error(`Popular cycle mismatch: ${JSON.stringify({ popularFirst, popularSecond })}`);
    }

    const activePaletteState = await evaluate(`(() => {
      const active = document.querySelector('.v145-filter-button[data-v145-button="popular"]');
      const probe = document.createElement('div');
      probe.style.backgroundColor = 'var(--color-primary,#c06c84)';
      document.body.appendChild(probe);
      const result = {
        active: active?.dataset.active === 'true',
        activeBg: active ? getComputedStyle(active).backgroundColor : '',
        primaryBg: getComputedStyle(probe).backgroundColor,
        activeColor: active ? getComputedStyle(active).color : '',
        fullPage: !!document.querySelector('[data-v167-filter-page]')
      };
      probe.remove();
      return result;
    })()`);
    if (!activePaletteState.active || activePaletteState.activeBg !== activePaletteState.primaryBg || activePaletteState.fullPage) {
      throw new Error(`Active palette mismatch: ${JSON.stringify(activePaletteState)}`);
    }

    // The audio editor remains a real full page below the navbar.
    const editorState = await evaluate(`(async () => {
      const fixture = document.createElement('div');
      fixture.className = 'v161-track-editor-overlay';
      fixture.innerHTML = '<div class="upload-modal-overlay upload-page"><div><h2>編輯音檔</h2><form id="track-upload-form"></form></div></div>';
      document.body.appendChild(fixture);
      await new Promise(resolve => setTimeout(resolve, 120));
      const main = document.querySelector('#root main');
      const nested = fixture.querySelector('.upload-modal-overlay');
      const result = {
        htmlClass: document.documentElement.classList.contains('echostars-v167-audio-editor-page'),
        pageMarker: fixture.dataset.v167Page || '',
        editorPosition: getComputedStyle(fixture).position,
        nestedPosition: nested ? getComputedStyle(nested).position : '',
        mainDisplay: main ? getComputedStyle(main).display : '',
        aria: fixture.getAttribute('aria-label') || ''
      };
      fixture.remove();
      await new Promise(resolve => setTimeout(resolve, 120));
      result.restored = !document.documentElement.classList.contains('echostars-v167-audio-editor-page');
      return result;
    })()`);
    if (!editorState.htmlClass || editorState.pageMarker !== 'audio-editor' || editorState.editorPosition !== 'static' || editorState.nestedPosition !== 'static' || editorState.mainDisplay !== 'none' || editorState.aria !== '編輯音檔頁面' || !editorState.restored) {
      throw new Error(`Audio editor page mismatch: ${JSON.stringify(editorState)}`);
    }

    const state = { categoryState, advancedState, timeBefore, timeFirst, timeSecond, popularFirst, popularSecond, activePaletteState, editorState };
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile('/tmp/echostars-v169-filter-toolbar.png', Buffer.from(shot.data, 'base64'));
    await writeFile('/tmp/echostars-v169-filter-toolbar-state.json', JSON.stringify(state, null, 2));
    console.log('v169 direct filter behavior verified:', JSON.stringify(state));
    socket.close();
  } finally {
    chrome.kill('SIGTERM');
  }
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
