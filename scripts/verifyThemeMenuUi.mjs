import { spawn, spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const APP_URL = process.env.ECHOSTARS_UI_CHECK_URL || 'http://127.0.0.1:4173/';
const DEBUG_PORT = Number(process.env.ECHOSTARS_CHROME_DEBUG_PORT || 9222);
const SCREENSHOT_BEFORE = '/tmp/echostars-theme-menu-before.png';
const SCREENSHOT_AFTER = '/tmp/echostars-theme-menu-after.png';

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resolveChromeBinary() {
  const candidates = [
    process.env.CHROME_BIN,
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser'
  ].filter(Boolean);

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
  const userDataDir = `/tmp/echostars-theme-ui-${process.pid}`;
  const chrome = spawn(chromeBinary, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--window-size=412,915',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let chromeErrors = '';
  chrome.stderr.on('data', chunk => {
    chromeErrors += String(chunk);
    if (chromeErrors.length > 12000) chromeErrors = chromeErrors.slice(-12000);
  });

  try {
    await waitForJson(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const targetResponse = await fetch(
      `http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(APP_URL)}`,
      { method: 'PUT' }
    );
    if (!targetResponse.ok) {
      throw new Error(`Could not open browser target: ${targetResponse.status} ${await targetResponse.text()}`);
    }
    const target = await targetResponse.json();
    if (!target.webSocketDebuggerUrl) throw new Error('Browser target did not expose a DevTools websocket.');

    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out connecting to DevTools websocket.')), 10000);
      socket.addEventListener('open', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      socket.addEventListener('error', event => {
        clearTimeout(timeout);
        reject(event.error || new Error('DevTools websocket failed.'));
      }, { once: true });
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
      const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed.');
      }
      return result.result?.value;
    };

    const waitFor = async (expression, label, attempts = 80) => {
      for (let i = 0; i < attempts; i += 1) {
        if (await evaluate(expression)) return;
        await delay(125);
      }
      throw new Error(`Timed out waiting for ${label}.`);
    };

    const capture = async path => {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(path, Buffer.from(shot.data, 'base64'));
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: APP_URL });
    await waitFor('document.readyState === "complete" && !!document.querySelector("button[data-main-menu=\\"hamburger\\"]")', 'navbar hamburger');

    await evaluate(`document.querySelector('button[data-main-menu="hamburger"]')?.click()`);
    await waitFor('!!document.querySelector(".mobile-menu-panel")', 'hamburger menu');

    const readThemeState = async () => evaluate(`(() => {
      const panel = document.querySelector('.mobile-menu-panel');
      if (!panel) return null;
      const icon = panel.querySelector('svg.lucide-moon, svg.lucide-sun');
      const button = icon?.closest('button');
      if (!icon || !button) return null;
      const kind = icon.classList.contains('lucide-moon') ? 'moon' : icon.classList.contains('lucide-sun') ? 'sun' : 'unknown';
      return {
        kind,
        text: button.innerText.trim().replace(/\\s+/g, ' '),
        width: Math.round(button.getBoundingClientRect().width),
        panelWidth: Math.round(panel.getBoundingClientRect().width),
        overflow: button.scrollWidth > button.clientWidth + 1
      };
    })()`);

    const assertState = state => {
      if (!state) throw new Error('Theme action button was not found in the rendered menu.');
      const expected = state.kind === 'moon' ? '關燈' : state.kind === 'sun' ? '開燈' : null;
      if (!expected) throw new Error(`Unexpected theme icon state: ${JSON.stringify(state)}`);
      if (state.text !== expected) {
        throw new Error(`Theme action label mismatch. icon=${state.kind}, expected=${expected}, visible=${state.text}`);
      }
      if (state.text.includes('/') || state.text.includes('／')) {
        throw new Error(`Legacy combined label is still visible: ${state.text}`);
      }
      if (state.overflow) throw new Error(`Theme action row overflows its button: ${JSON.stringify(state)}`);
      return expected;
    };

    const before = await readThemeState();
    const beforeExpected = assertState(before);
    await capture(SCREENSHOT_BEFORE);

    await evaluate(`(() => {
      const icon = document.querySelector('.mobile-menu-panel svg.lucide-moon, .mobile-menu-panel svg.lucide-sun');
      icon?.closest('button')?.click();
    })()`);
    await delay(250);

    const after = await readThemeState();
    const afterExpected = assertState(after);
    if (before.kind === after.kind || beforeExpected === afterExpected) {
      throw new Error(`Theme toggle did not change action state. before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    }
    await capture(SCREENSHOT_AFTER);

    console.log(`Browser UI verified: ${before.kind} -> ${before.text}; ${after.kind} -> ${after.text}`);
    console.log(`Screenshots: ${SCREENSHOT_BEFORE}, ${SCREENSHOT_AFTER}`);

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
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
