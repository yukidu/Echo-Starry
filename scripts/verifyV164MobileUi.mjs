import { spawn, spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const APP_URL = process.env.ECHOSTARS_UI_CHECK_URL || 'http://127.0.0.1:4173/';
const DEBUG_PORT = Number(process.env.ECHOSTARS_CHROME_DEBUG_PORT || 9226);
const SCREENSHOT = '/tmp/echostars-v164-mobile-ui.png';
const DEBUG_JSON = '/tmp/echostars-v164-mobile-ui-debug.json';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  const userDataDir = `/tmp/echostars-v164-ui-${process.pid}`;
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
    const targetResponse = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(APP_URL)}`, { method: 'PUT' });
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

    const waitFor = async (expression, label, attempts = 80) => {
      for (let i = 0; i < attempts; i += 1) {
        if (await evaluate(expression)) return;
        await delay(125);
      }
      throw new Error(`Timed out waiting for ${label}.`);
    };

    const realClick = async ({ x, y }) => {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await delay(60);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      await delay(140);
    };

    const centerOf = async expression => {
      const rect = await evaluate(`(() => { const el = ${expression}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, width: r.width, height: r.height }; })()`);
      if (!rect) throw new Error(`Could not resolve click target: ${expression}`);
      return rect;
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: APP_URL });
    await waitFor('document.readyState === "complete" && !!document.querySelector("button[data-main-menu=\\"hamburger\\"]")', 'navbar hamburger');
    await waitFor('!!document.querySelector(".echostars-summon-button")', 'v164 summon button class');

    const summon = await evaluate(`(() => {
      const button = document.querySelector('.echostars-summon-button');
      if (!button) return null;
      const rect = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      const before = getComputedStyle(button, '::before');
      const label = button.querySelector('span');
      const after = label ? getComputedStyle(label, '::after') : null;
      return {
        height: rect.height,
        width: rect.width,
        fontSize: style.fontSize,
        starContent: before.content,
        labelContent: after?.content || '',
        className: button.className
      };
    })()`);
    if (!summon) throw new Error('Summon button was not found.');
    if (Math.abs(summon.height - 46) > 1.5) throw new Error(`Summon button height changed: ${JSON.stringify(summon)}`);
    if (parseFloat(summon.fontSize) < 18) throw new Error(`Summon button font is not visibly larger: ${JSON.stringify(summon)}`);
    if (!summon.starContent.includes('✦')) throw new Error(`Dedicated summon star icon missing: ${JSON.stringify(summon)}`);
    if (!summon.labelContent.includes('召喚繁星')) throw new Error(`Summon visible label override missing: ${JSON.stringify(summon)}`);

    const openMenu = async () => {
      await evaluate(`document.querySelector('button[data-main-menu="hamburger"]')?.click()`);
      await waitFor('!!document.querySelector(".mobile-menu-panel")', 'mobile menu');
      await delay(120);
    };

    await openMenu();
    const shellState = await evaluate(`(() => {
      const shell = document.querySelector('.mobile-menu-shell');
      if (!shell) return null;
      const style = getComputedStyle(shell);
      const rect = shell.getBoundingClientRect();
      return { pointerEvents: style.pointerEvents, position: style.position, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    })()`);
    if (!shellState || shellState.pointerEvents !== 'auto' || shellState.position !== 'fixed') {
      throw new Error(`Menu interaction shield is not active: ${JSON.stringify(shellState)}`);
    }

    const themePoint = await centerOf(`document.querySelector('.mobile-menu-panel svg.lucide-moon, .mobile-menu-panel svg.lucide-sun')?.closest('button')`);
    await evaluate(`(() => {
      window.__v164ProbeClicks = 0;
      const probe = document.createElement('button');
      probe.id = 'v164-under-menu-probe';
      probe.textContent = 'probe';
      probe.style.cssText = 'position:fixed;z-index:1;left:${Math.max(0, themePoint.x - 40)}px;top:${Math.max(70, themePoint.y - 22)}px;width:80px;height:44px;';
      probe.addEventListener('click', () => { window.__v164ProbeClicks += 1; });
      document.body.appendChild(probe);
    })()`);
    await realClick(themePoint);
    await waitFor('!document.querySelector(".mobile-menu-panel")', 'menu close after normal action');
    const insideProbeClicks = await evaluate('window.__v164ProbeClicks || 0');
    if (insideProbeClicks !== 0) throw new Error(`Menu action clicked through to page underneath: ${insideProbeClicks}`);

    await openMenu();
    const fontPoint = await centerOf(`document.querySelector('.navbar-menu-font-controls button:not(:disabled)')`);
    await realClick(fontPoint);
    const fontMenuStillOpen = await evaluate('!!document.querySelector(".mobile-menu-panel")');
    if (!fontMenuStillOpen) throw new Error('Font-size control unexpectedly closed the menu.');

    await evaluate(`(() => {
      window.__v164OutsideProbeClicks = 0;
      const probe = document.createElement('button');
      probe.id = 'v164-outside-probe';
      probe.textContent = 'outside probe';
      probe.style.cssText = 'position:fixed;z-index:1;left:0;top:260px;width:32px;height:80px;';
      probe.addEventListener('click', () => { window.__v164OutsideProbeClicks += 1; });
      document.body.appendChild(probe);
    })()`);
    await realClick({ x: 12, y: 300 });
    await waitFor('!document.querySelector(".mobile-menu-panel")', 'menu close after outside tap');
    const outsideProbeClicks = await evaluate('window.__v164OutsideProbeClicks || 0');
    if (outsideProbeClicks !== 0) throw new Error(`Outside menu tap leaked through shield: ${outsideProbeClicks}`);

    const luckyLayout = await evaluate(`(() => {
      const fixture = document.createElement('div');
      fixture.id = 'v164-lucky-fixture';
      fixture.className = 'audio-card-grid lucky-win-active';
      fixture.style.cssText = 'position:relative;width:380px;margin:16px;';
      fixture.innerHTML = '<div class="lucky-card" data-lucky-winner="true"><div class="lucky-answer-notice">這是宇宙繁星給你的回應<br>貼紙額外加碼＋0張</div><div class="lucky-winner-badge">✨ 好手氣！✨</div><div class="audio-card" style="height:160px">音檔卡</div></div>';
      document.body.appendChild(fixture);
      const notice = fixture.querySelector('.lucky-answer-notice').getBoundingClientRect();
      const badge = fixture.querySelector('.lucky-winner-badge').getBoundingClientRect();
      const card = fixture.querySelector('.audio-card').getBoundingClientRect();
      return {
        notice: { top: notice.top, bottom: notice.bottom, position: getComputedStyle(fixture.querySelector('.lucky-answer-notice')).position },
        badge: { top: badge.top, bottom: badge.bottom, position: getComputedStyle(fixture.querySelector('.lucky-winner-badge')).position },
        card: { top: card.top, bottom: card.bottom }
      };
    })()`);
    if (luckyLayout.notice.position !== 'relative' || luckyLayout.badge.position !== 'relative') {
      throw new Error(`Lucky result is still floating on mobile: ${JSON.stringify(luckyLayout)}`);
    }
    if (luckyLayout.notice.bottom > luckyLayout.badge.top + 1 || luckyLayout.badge.bottom > luckyLayout.card.top + 1) {
      throw new Error(`Lucky result overlaps the badge/audio card: ${JSON.stringify(luckyLayout)}`);
    }

    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(SCREENSHOT, Buffer.from(shot.data, 'base64'));
    await writeFile(DEBUG_JSON, JSON.stringify({ summon, shellState, insideProbeClicks, fontMenuStillOpen, outsideProbeClicks, luckyLayout }, null, 2), 'utf8');

    console.log('v164 mobile browser UI verified: summon styling, no menu tap-through, keep-open exceptions, outside shield, and non-overlapping lucky result.');
    console.log(`Evidence: ${SCREENSHOT}, ${DEBUG_JSON}`);
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
