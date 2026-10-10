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
    `--user-data-dir=/tmp/echostars-v174-crown-${process.pid}`, 'about:blank'
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

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: APP_URL });
    await waitFor(`document.readyState === 'complete' && !!document.querySelector('button[data-main-menu="hamburger"]')`, 'home navbar');

    await evaluate(`document.querySelector('button[data-main-menu="hamburger"]')?.click()`);
    await waitFor(`!!document.querySelector('[data-taiwan-crown-menu] button[aria-label="臺灣皇冠大使"]')`, 'Crown menu row');
    await evaluate(`document.querySelector('[data-taiwan-crown-menu] button[aria-label="臺灣皇冠大使"]')?.click()`);
    await waitFor(`document.body.dataset.taiwanCrownOpen === 'true' && !!document.querySelector('#taiwan-crown-integrated-page:not([hidden])')`, 'Crown page open');
    await delay(120);

    const state = await evaluate(`(() => {
      const page = document.getElementById('taiwan-crown-integrated-page');
      const appMain = document.querySelector('#root > div > main');
      const homeSearch = document.querySelector('.v141-home-search-row');
      const navbar = document.querySelector('header');
      if (!page || !appMain) return null;
      const pageStyle = getComputedStyle(page);
      const mainStyle = getComputedStyle(appMain);
      const pageRect = page.getBoundingClientRect();
      const navRect = navbar?.getBoundingClientRect();
      return {
        truePage: page.getAttribute('data-v174-true-page'),
        pagePosition: pageStyle.position,
        pageOverflowY: pageStyle.overflowY,
        pageTop: Math.round(pageRect.top),
        navbarBottom: navRect ? Math.round(navRect.bottom) : null,
        mainDisplay: mainStyle.display,
        homeVisibleRects: homeSearch ? homeSearch.getClientRects().length : 0,
        cardCount: page.querySelectorAll('.taiwan-crown-card').length,
        backgroundImage: pageStyle.backgroundImage,
        bodyOpen: document.body.dataset.taiwanCrownOpen
      };
    })()`);

    if (!state || state.truePage !== 'true' || state.pagePosition === 'fixed' || state.mainDisplay !== 'none' || state.homeVisibleRects !== 0 || state.cardCount !== 13 || state.bodyOpen !== 'true') {
      throw new Error(`Crown true-page mismatch: ${JSON.stringify(state)}`);
    }

    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile('/tmp/echostars-v174-crown-true-page.png', Buffer.from(shot.data, 'base64'));
    await writeFile('/tmp/echostars-v174-crown-true-page-state.json', JSON.stringify(state, null, 2));

    await evaluate(`document.querySelector('#taiwan-crown-integrated-page .taiwan-crown-back')?.click()`);
    await waitFor(`document.body.dataset.taiwanCrownOpen !== 'true' && getComputedStyle(document.querySelector('#root > div > main')).display !== 'none'`, 'return to home');

    console.log('v174 Crown true page verified:', JSON.stringify(state));
    socket.close();
  } finally {
    chrome.kill('SIGTERM');
  }
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
