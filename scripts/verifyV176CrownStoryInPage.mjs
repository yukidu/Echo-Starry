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

function flattenFrames(tree, output = []) {
  if (!tree) return output;
  if (tree.frame) output.push(tree.frame);
  for (const child of tree.childFrames || []) flattenFrames(child, output);
  return output;
}

async function main() {
  const port = await freePort();
  const chrome = spawn(chromeBinary(), [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars',
    '--window-size=412,915', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/echostars-v176-crown-story-${process.pid}`, 'about:blank'
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
    const waitFor = async (expression, label, attempts = 120) => {
      for (let i = 0; i < attempts; i += 1) {
        if (await evaluate(expression)) return;
        await delay(100);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const waitForFrame = async memberId => {
      for (let i = 0; i < 120; i += 1) {
        const tree = await send('Page.getFrameTree');
        const frame = flattenFrames(tree.frameTree).find(candidate => String(candidate.url || '').includes(`/wechat/aep/member/member${memberId}.html`));
        if (frame) return frame;
        await delay(125);
      }
      const tree = await send('Page.getFrameTree');
      throw new Error(`Official story frame member${memberId} did not load. Frames: ${JSON.stringify(flattenFrames(tree.frameTree).map(frame => frame.url))}`);
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: APP_URL });
    await waitFor(`document.readyState === 'complete' && !!document.querySelector('button[data-main-menu="hamburger"]') && !!document.querySelector('audio')`, 'home UI');

    await evaluate(`document.querySelector('audio').dataset.v176Continuity = 'same-audio-node'`);
    await evaluate(`document.querySelector('button[data-main-menu="hamburger"]')?.click()`);
    await waitFor(`!!document.querySelector('[data-taiwan-crown-menu] button[aria-label="臺灣皇冠大使"]')`, 'Crown menu row');
    await evaluate(`document.querySelector('[data-taiwan-crown-menu] button[aria-label="臺灣皇冠大使"]')?.click()`);
    await waitFor(`document.body.dataset.taiwanCrownOpen === 'true' && document.querySelectorAll('#taiwan-crown-integrated-page a.taiwan-crown-card[href]').length === 13`, 'Crown list');

    await evaluate(`document.querySelector('#taiwan-crown-integrated-page a.taiwan-crown-card[href]')?.click()`);
    await waitFor(`document.body.hasAttribute('data-taiwan-crown-story-open') && !!document.querySelector('[data-v176-crown-story-frame]')`, 'in-page story viewer');

    const firstFrame = await waitForFrame('2');
    const isolated = await send('Page.createIsolatedWorld', { frameId: firstFrame.id, worldName: 'v176-story-check', grantUniveralAccess: false });
    const frameDoc = await send('Runtime.evaluate', {
      contextId: isolated.executionContextId,
      expression: `({ href: location.href, title: document.title, childCount: document.body?.children?.length || 0, height: document.documentElement?.scrollHeight || 0, text: (document.body?.innerText || '').slice(0, 300) })`,
      returnByValue: true
    });
    const officialState = frameDoc.result?.value;
    if (!officialState || !String(officialState.href || '').includes('/wechat/aep/member/member2.html') || officialState.childCount < 1 || officialState.height < 100) {
      throw new Error(`Official Amway story did not render inside frame: ${JSON.stringify(officialState)}`);
    }

    const appState = await evaluate(`(() => ({
      storyOpen: document.body.hasAttribute('data-taiwan-crown-story-open'),
      storyFrameSrc: document.querySelector('[data-v176-crown-story-frame]')?.getAttribute('src') || '',
      listHidden: Boolean(document.querySelector('#taiwan-crown-integrated-page .taiwan-crown-page-shell')?.hidden),
      hamburgerExists: Boolean(document.querySelector('button[data-main-menu="hamburger"]')),
      audioSame: document.querySelector('audio')?.dataset.v176Continuity === 'same-audio-node',
      backExists: Boolean(document.querySelector('[data-v176-crown-story-view] button[aria-label="返回臺灣皇冠大使清單"]')),
      nextExists: Boolean(document.querySelector('[data-v176-crown-story-view] button[aria-label="下一位皇冠大使"]'))
    }))()`);
    if (!appState.storyOpen || !appState.storyFrameSrc.includes('member2.html') || !appState.listHidden || !appState.hamburgerExists || !appState.audioSame || !appState.backExists || !appState.nextExists) {
      throw new Error(`v176 in-page shell mismatch: ${JSON.stringify(appState)}`);
    }

    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile('/tmp/echostars-v176-crown-story-inpage.png', Buffer.from(shot.data, 'base64'));

    await evaluate(`document.querySelector('[data-v176-crown-story-view] button[aria-label="下一位皇冠大使"]')?.click()`);
    await waitFor(`document.querySelector('[data-v176-crown-story-frame]')?.getAttribute('src')?.includes('member3.html')`, 'next Crown story');
    await waitForFrame('3');

    const nextState = await evaluate(`({
      audioSame: document.querySelector('audio')?.dataset.v176Continuity === 'same-audio-node',
      title: document.querySelector('.v176-crown-story-heading strong')?.textContent || '',
      counter: document.querySelector('.v176-crown-story-heading span')?.textContent || ''
    })`);
    if (!nextState.audioSame || nextState.title !== '傅後堅' || nextState.counter !== '2 / 13') {
      throw new Error(`v176 next-story mismatch: ${JSON.stringify(nextState)}`);
    }

    await evaluate(`document.querySelector('[data-v176-crown-story-view] button[aria-label="返回臺灣皇冠大使清單"]')?.click()`);
    await waitFor(`!document.body.hasAttribute('data-taiwan-crown-story-open') && !document.querySelector('[data-v176-crown-story-view]') && !document.querySelector('#taiwan-crown-integrated-page .taiwan-crown-page-shell')?.hidden`, 'return to Crown list');

    const finalState = await evaluate(`({
      audioSame: document.querySelector('audio')?.dataset.v176Continuity === 'same-audio-node',
      hamburgerExists: Boolean(document.querySelector('button[data-main-menu="hamburger"]')),
      cardCount: document.querySelectorAll('#taiwan-crown-integrated-page a.taiwan-crown-card[href]').length
    })`);
    if (!finalState.audioSame || !finalState.hamburgerExists || finalState.cardCount !== 13) {
      throw new Error(`v176 return-state mismatch: ${JSON.stringify(finalState)}`);
    }

    const state = { officialState, appState, nextState, finalState };
    await writeFile('/tmp/echostars-v176-crown-story-inpage-state.json', JSON.stringify(state, null, 2));
    console.log('v176 Crown in-page story verified:', JSON.stringify(state));
    socket.close();
  } finally {
    chrome.kill('SIGTERM');
  }
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
