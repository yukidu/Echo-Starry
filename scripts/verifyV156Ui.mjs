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
    `--user-data-dir=/tmp/echostars-v156-ui-${process.pid}`, 'about:blank'
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
    await waitFor(`document.readyState === 'complete' && !!document.querySelector('[data-v145-filter-toolbar]')`, 'home filter toolbar');

    const filterState = await evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('.v145-filter-button'));
      const first = buttons[0];
      const style = first ? getComputedStyle(first) : null;
      return {
        count: buttons.length,
        height: style?.height || '',
        fontSize: style?.fontSize || '',
        advancedIconCount: document.querySelectorAll('[data-v145-button="advanced"] .v145-filter-sliders').length
      };
    })()`);
    if (filterState.count !== 4 || filterState.height !== '40px' || filterState.fontSize !== '14px' || filterState.advancedIconCount !== 0) {
      throw new Error(`Filter visual mismatch: ${JSON.stringify(filterState)}`);
    }

    const luckyState = await evaluate(`(() => {
      const fixture = document.createElement('div');
      fixture.className = 'audio-card-grid lucky-spin-active';
      fixture.innerHTML = '<div class="lucky-card">1</div><div class="lucky-card">2</div>';
      document.body.appendChild(fixture);
      const first = getComputedStyle(fixture.children[0]);
      const second = getComputedStyle(fixture.children[1]);
      const result = { firstOpacity: first.opacity, secondOpacity: second.opacity, firstShadow: first.boxShadow, secondAnimation: second.animationName };
      fixture.remove();
      return result;
    })()`);
    if (luckyState.firstOpacity !== '1' || luckyState.secondOpacity !== '0.48' || luckyState.firstShadow === 'none' || luckyState.secondAnimation !== 'none') {
      throw new Error(`Lucky spotlight mismatch: ${JSON.stringify(luckyState)}`);
    }

    const dynamicState = await evaluate(`(async () => {
      localStorage.removeItem('sq_current_user_v1');
      const textarea = document.createElement('textarea');
      textarea.placeholder = '按這裡寫下您的心得收穫...';
      document.body.appendChild(textarea);
      textarea.click();
      await new Promise(resolve => setTimeout(resolve, 240));
      const guestPlaceholder = textarea.placeholder;
      textarea.remove();

      localStorage.setItem('sq_current_user_v1', JSON.stringify({ id: 'v156-ui-user', name: '測試會員' }));
      const row = document.createElement('div');
      row.dataset.v142FavoritesMenu = '1';
      row.innerHTML = '<span class="navbar-pin-placeholder"></span><button type="button" aria-label="我的收藏"><span>我的收藏</span></button>';
      document.body.appendChild(row);
      row.click();
      await new Promise(resolve => setTimeout(resolve, 240));
      const pin = row.querySelector('[data-v156-favorites-pin]');
      const pinExists = !!pin;
      pin?.click();
      await new Promise(resolve => setTimeout(resolve, 80));
      const topExists = !!document.querySelector('[data-v156-favorites-top]');
      const pinPressed = pin?.getAttribute('aria-pressed') || '';
      row.remove();
      localStorage.removeItem('sq_current_user_v1');
      return { guestPlaceholder, pinExists, topExists, pinPressed };
    })()`);
    if (dynamicState.guestPlaceholder !== '按此分享你的心得收穫' || !dynamicState.pinExists || !dynamicState.topExists || dynamicState.pinPressed !== 'true') {
      throw new Error(`Dynamic UI mismatch: ${JSON.stringify(dynamicState)}`);
    }

    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile('/tmp/echostars-v156-home-ui.png', Buffer.from(shot.data, 'base64'));
    await writeFile('/tmp/echostars-v156-ui-state.json', JSON.stringify({ filterState, luckyState, dynamicState }, null, 2));
    console.log('v156 real-browser UI verified:', JSON.stringify({ filterState, luckyState, dynamicState }));
    socket.close();
  } finally {
    chrome.kill('SIGTERM');
  }
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
