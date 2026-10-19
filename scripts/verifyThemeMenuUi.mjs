import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { writeFile } from 'node:fs/promises';

const APP_URL = process.env.ECHOSTARS_UI_CHECK_URL || 'http://127.0.0.1:4173/';
const CONFIGURED_DEBUG_PORT = Number(process.env.ECHOSTARS_CHROME_DEBUG_PORT || 0);
const SCREENSHOT_BEFORE = '/tmp/echostars-theme-menu-before.png';
const SCREENSHOT_AFTER = '/tmp/echostars-theme-menu-after.png';
const DEBUG_JSON = '/tmp/echostars-theme-menu-debug.json';

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

async function allocateDebugPort() {
  if (CONFIGURED_DEBUG_PORT > 0) return CONFIGURED_DEBUG_PORT;
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForChromeHost(port, attempts = 160) {
  // Chromium may bind IPv4 or IPv6 depending on the CI runner.
  const hosts = [`http://127.0.0.1:${port}`, `http://[::1]:${port}`];
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    for (const host of hosts) {
      try {
        const response = await fetch(`${host}/json/version`);
        if (response.ok) return host;
        lastError = new Error(`${host}: ${response.status}`);
      } catch (error) {
        lastError = error;
      }
    }
    await delay(250);
  }
  throw lastError || new Error('Chrome debugging endpoint failed to start.');
}

async function main() {
  const chromeBinary = resolveChromeBinary();
  const debugPort = await allocateDebugPort();
  const userDataDir = `/tmp/echostars-theme-ui-${process.pid}`;
  const chrome = spawn(chromeBinary, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--window-size=412,915',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  let chromeErrors = '';
  chrome.stderr.on('data', chunk => {
    chromeErrors += String(chunk);
    if (chromeErrors.length > 12000) chromeErrors = chromeErrors.slice(-12000);
  });

  try {
    const debugHost = await waitForChromeHost(debugPort);
    const targetResponse = await fetch(
      `${debugHost}/json/new?${encodeURIComponent(APP_URL)}`,
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

    const captureThemeRowBase64 = async () => {
      const rect = await evaluate(`(() => {
        const panel = document.querySelector('.mobile-menu-panel');
        const icon = panel?.querySelector('svg.lucide-moon, svg.lucide-sun');
        const button = icon?.closest('button');
        const row = button?.closest('.mobile-menu-row') || button;
        if (!row) return null;
        const r = row.getBoundingClientRect();
        return {
          x: Math.max(0, r.x - 6),
          y: Math.max(0, r.y - 6),
          width: Math.min(innerWidth - Math.max(0, r.x - 6), r.width + 12),
          height: Math.min(innerHeight - Math.max(0, r.y - 6), r.height + 12)
        };
      })()`);
      if (!rect || rect.width <= 0 || rect.height <= 0) return '';
      const shot = await send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 70,
        captureBeyondViewport: false,
        clip: { ...rect, scale: 1 }
      });
      return shot.data || '';
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: APP_URL });
    await waitFor('document.readyState === "complete" && !!document.querySelector("button[data-main-menu=\\"hamburger\\"]")', 'navbar hamburger');

    const openMenu = async () => {
      await evaluate(`document.querySelector('button[data-main-menu="hamburger"]')?.click()`);
      await waitFor('!!document.querySelector(".mobile-menu-panel")', 'hamburger menu');
      await delay(200);
    };

    await openMenu();

    const readThemeState = async () => evaluate(`(() => {
      const panel = document.querySelector('.mobile-menu-panel');
      if (!panel) return null;
      const icon = panel.querySelector('svg.lucide-moon, svg.lucide-sun');
      const button = icon?.closest('button');
      if (!icon || !button) return null;
      const span = button.querySelector('span');
      const kind = icon.classList.contains('lucide-moon') ? 'moon' : icon.classList.contains('lucide-sun') ? 'sun' : 'unknown';
      const buttonStyle = getComputedStyle(button);
      const spanStyle = span ? getComputedStyle(span) : null;
      return {
        kind,
        text: button.innerText.trim().replace(/\\s+/g, ' '),
        textContent: (button.textContent || '').trim().replace(/\\s+/g, ' '),
        spanText: span ? span.innerText.trim().replace(/\\s+/g, ' ') : null,
        spanTextContent: span ? (span.textContent || '').trim().replace(/\\s+/g, ' ') : null,
        ariaLabel: button.getAttribute('aria-label'),
        buttonDisplay: buttonStyle.display,
        buttonVisibility: buttonStyle.visibility,
        buttonOpacity: buttonStyle.opacity,
        spanDisplay: spanStyle?.display || null,
        spanVisibility: spanStyle?.visibility || null,
        spanOpacity: spanStyle?.opacity || null,
        spanFontSize: spanStyle?.fontSize || null,
        width: Math.round(button.getBoundingClientRect().width),
        height: Math.round(button.getBoundingClientRect().height),
        panelWidth: Math.round(panel.getBoundingClientRect().width),
        overflow: button.scrollWidth > button.clientWidth + 1,
        html: button.outerHTML
      };
    })()`);

    const assertState = state => {
      if (!state) throw new Error('Theme action button was not found in the rendered menu.');
      const expected = state.kind === 'moon' ? '關燈' : state.kind === 'sun' ? '開燈' : null;
      if (!expected) throw new Error(`Unexpected theme icon state: ${JSON.stringify(state)}`);
      if (state.text !== expected || state.spanText !== expected || state.textContent !== expected) {
        throw new Error(`Theme action label mismatch. expected=${expected}, rendered=${JSON.stringify(state)}`);
      }
      if (state.text.includes('/') || state.text.includes('／') || state.textContent.includes('/') || state.textContent.includes('／')) {
        throw new Error(`Legacy combined label is still visible/present: ${JSON.stringify(state)}`);
      }
      if (state.spanDisplay === 'none' || state.spanVisibility === 'hidden' || state.spanOpacity === '0' || state.spanFontSize === '0px') {
        throw new Error(`Theme action label is not visibly rendered: ${JSON.stringify(state)}`);
      }
      if (state.overflow) throw new Error(`Theme action row overflows its button: ${JSON.stringify(state)}`);
      return expected;
    };

    const before = await readThemeState();
    await capture(SCREENSHOT_BEFORE);
    const beforeCrop = await captureThemeRowBase64();
    console.log(`THEME_ROW_BEFORE=${JSON.stringify(before)}`);
    if (beforeCrop) console.log(`THEME_ROW_BEFORE_JPEG_BASE64=${beforeCrop}`);
    const beforeExpected = assertState(before);

    await evaluate(`(() => {
      const icon = document.querySelector('.mobile-menu-panel svg.lucide-moon, .mobile-menu-panel svg.lucide-sun');
      icon?.closest('button')?.click();
    })()`);
    await waitFor('!document.querySelector(".mobile-menu-panel")', 'hamburger menu to close after theme action');
    await delay(150);

    await openMenu();
    const after = await readThemeState();
    await capture(SCREENSHOT_AFTER);
    const afterCrop = await captureThemeRowBase64();
    console.log(`THEME_ROW_AFTER=${JSON.stringify(after)}`);
    if (afterCrop) console.log(`THEME_ROW_AFTER_JPEG_BASE64=${afterCrop}`);
    const afterExpected = assertState(after);
    if (before.kind === after.kind || beforeExpected === afterExpected) {
      throw new Error(`Theme toggle did not change action state. before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    }

    // Regression for the React hamburger menu: an inside action must navigate
    // before the document-level outside-click dismiss handler unmounts the menu.
    await evaluate(`(() => {
      const panel = document.querySelector('.mobile-menu-panel');
      const ranking = Array.from(panel?.querySelectorAll('button') || [])
        .find(button => button.textContent?.trim() === '排行榜');
      if (!ranking) throw new Error('排行榜 action is missing from hamburger menu');
      ranking.click();
    })()`);
    await waitFor('document.body.dataset.mainTab === "stats"', 'ranking tab navigation from hamburger');
    await waitFor('!document.querySelector(".mobile-menu-panel")', 'hamburger closure after ranking action');

    await writeFile(DEBUG_JSON, JSON.stringify({ before, after, menuClosedAfterToggle: true, rankingClickNavigated: true }, null, 2), 'utf8');
    console.log(`Browser UI verified: ${before.kind} -> ${before.text}; menu closed; reopened -> ${after.kind} -> ${after.text}`);
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
