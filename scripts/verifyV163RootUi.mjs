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
    `--user-data-dir=/tmp/echostars-v163-root-ui-${process.pid}`, 'about:blank'
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
    await waitFor(`document.readyState === 'complete' && !!document.querySelector('button[data-main-menu="hamburger"]') && !!document.querySelector('.v141-home-search-row')`, 'home UI');

    const summonState = await evaluate(`(() => {
      const button = document.querySelector('.v141-home-search-row > button:first-child');
      const span = button?.querySelector('span');
      if (!button || !span) return null;
      const style = getComputedStyle(button);
      return {
        height: style.height,
        width: Math.round(button.getBoundingClientRect().width),
        fontContent: getComputedStyle(span, '::after').content,
        iconContent: getComputedStyle(button, '::before').content,
        animationName: style.animationName,
        backgroundImage: style.backgroundImage,
        touchAction: style.touchAction
      };
    })()`);
    if (!summonState || summonState.height !== '50px' || summonState.width < 133 || !summonState.fontContent.includes('召喚繁星') || !summonState.iconContent.includes('✦') || summonState.animationName === 'none' || summonState.backgroundImage === 'none' || summonState.touchAction !== 'manipulation') {
      throw new Error(`Summon button mismatch: ${JSON.stringify(summonState)}`);
    }

    const luckyState = await evaluate(`(() => {
      const fixture = document.createElement('div');
      fixture.className = 'audio-card-grid';
      fixture.style.display = 'block';
      fixture.style.position = 'relative';
      fixture.style.width = '360px';
      fixture.style.minHeight = '260px';
      fixture.innerHTML = '<div class="lucky-card" data-lucky-winner="true" style="position:relative;width:360px;min-height:120px;display:block"><div class="lucky-answer-notice">宇宙繁星給你的回應 +20</div><div class="lucky-winner-badge">✨ 好手氣！✨</div><div class="audio-card" style="height:120px;width:360px">WINNER</div></div><div class="lucky-card" style="position:relative;z-index:300;width:360px"><div class="audio-card" style="height:120px;width:360px">NEXT CARD</div></div>';
      document.body.appendChild(fixture);
      const winner = fixture.querySelector('.lucky-card[data-lucky-winner="true"]');
      const notice = fixture.querySelector('.lucky-answer-notice');
      const badge = fixture.querySelector('.lucky-winner-badge');
      const ns = getComputedStyle(notice);
      const bs = getComputedStyle(badge);
      const ws = getComputedStyle(winner);
      const gs = getComputedStyle(fixture);
      const policyText = document.getElementById('echostars-v156-fast-ui-polish')?.textContent || '';
      const noticeSizingRule = /lucky-answer-notice[\s\S]*?width:\s*max-content\s*!important;[\s\S]*?max-width:\s*min\(88vw,\s*28rem\)\s*!important;/.test(policyText);
      const noticeHasText = Boolean(notice.textContent?.trim());
      fixture.classList.add('lucky-spin-active');
      const spinPointerEvents = getComputedStyle(fixture.querySelector('.audio-card')).pointerEvents;
      const result = {
        gridZ: Number(gs.zIndex || 0),
        winnerPosition: ws.position,
        winnerZ: Number(ws.zIndex || 0),
        noticePosition: ns.position,
        noticeZ: Number(ns.zIndex || 0),
        noticeBottom: ns.bottom,
        noticeSizingRule,
        noticeHasText,
        badgePosition: bs.position,
        badgeZ: Number(bs.zIndex || 0),
        spinPointerEvents
      };
      fixture.remove();
      return result;
    })()`);
    if (
      luckyState.gridZ < 700 ||
      luckyState.winnerPosition !== 'relative' ||
      luckyState.winnerZ < 700 ||
      luckyState.noticePosition !== 'absolute' ||
      luckyState.noticeZ <= luckyState.winnerZ ||
      luckyState.noticeBottom === 'auto' ||
      !luckyState.noticeSizingRule ||
      !luckyState.noticeHasText ||
      luckyState.badgePosition !== 'absolute' ||
      luckyState.badgeZ <= luckyState.winnerZ ||
      luckyState.spinPointerEvents !== 'none'
    ) {
      throw new Error(`Lucky floating overlay mismatch: ${JSON.stringify(luckyState)}`);
    }

    const playbackPolicyState = await evaluate(`(async () => {
      const blockedAudio = document.createElement('audio');
      let blockedName = '';
      let blockedMessage = '';
      try { await blockedAudio.play(); } catch (error) {
        blockedName = error?.name || '';
        blockedMessage = error?.message || '';
      }

      const intentButton = document.createElement('button');
      intentButton.setAttribute('aria-label', '開始播放');
      document.body.appendChild(intentButton);
      intentButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      const allowedAudio = document.createElement('audio');
      let allowedMessage = '';
      try { await allowedAudio.play(); } catch (error) { allowedMessage = error?.message || ''; }
      intentButton.remove();

      return {
        blockedName,
        blockedMessage,
        allowedMessage
      };
    })()`);
    if (
      playbackPolicyState.blockedName !== 'NotAllowedError' ||
      !playbackPolicyState.blockedMessage.includes('explicit user action') ||
      playbackPolicyState.allowedMessage.includes('explicit user action')
    ) {
      throw new Error(`Manual playback policy mismatch: ${JSON.stringify(playbackPolicyState)}`);
    }

    const menuState = await evaluate(`(async () => {
      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
      const hamburger = document.querySelector('button[data-main-menu="hamburger"]');
      const open = async () => {
        if (hamburger.getAttribute('aria-expanded') !== 'true') hamburger.click();
        await delay(80);
      };
      const isOpen = () => hamburger.getAttribute('aria-expanded') === 'true' && !!document.querySelector('.mobile-menu-panel');

      await open();
      document.querySelector('main')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
      await delay(80);
      const closedByOutsidePointer = !isOpen();

      await open();
      document.dispatchEvent(new Event('scroll', { bubbles: false }));
      await delay(80);
      const closedByOutsideScroll = !isOpen();

      await open();
      const fontButton = document.querySelector('.mobile-menu-panel button[aria-label="放大字體"]');
      fontButton?.click();
      await delay(80);
      const fontKeepsOpen = isOpen();

      const paletteButton = document.querySelector('.mobile-menu-panel button[aria-label="好心情"]');
      paletteButton?.click();
      await delay(80);
      const paletteKeepsOpen = isOpen();

      return { closedByOutsidePointer, closedByOutsideScroll, fontKeepsOpen, paletteKeepsOpen };
    })()`);
    if (!menuState.closedByOutsidePointer || !menuState.closedByOutsideScroll || !menuState.fontKeepsOpen || !menuState.paletteKeepsOpen) {
      throw new Error(`Hamburger dismissal mismatch: ${JSON.stringify(menuState)}`);
    }

    const state = { summonState, luckyState, playbackPolicyState, menuState };
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile('/tmp/echostars-v163-root-ui.png', Buffer.from(shot.data, 'base64'));
    await writeFile('/tmp/echostars-v163-root-ui-state.json', JSON.stringify(state, null, 2));
    console.log('v165 root UI verified:', JSON.stringify(state));
    socket.close();
  } finally {
    chrome.kill('SIGTERM');
  }
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
