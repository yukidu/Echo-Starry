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
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--window-size=412,915', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`,
    `--user-data-dir=/tmp/echostars-v169-upload-${process.pid}`, 'about:blank'
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

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url: APP_URL });
    for (let i = 0; i < 80; i += 1) {
      if (await evaluate(`document.readyState === 'complete'`)) break;
      await delay(100);
    }

    const state = await evaluate(`(async () => {
      localStorage.setItem('sq_current_user_v1', JSON.stringify({ id:'u-admin', email:'yukidu@gmail.com', role:'超級管理員', name:'測試管理員' }));

      const page = document.createElement('div');
      page.className = 'upload-page';
      page.innerHTML = '<div class="workspace">' +
        '<div class="header"><h2>上傳音檔</h2><div class="flex items-center gap-2"><button type="submit" form="track-upload-form">儲存</button></div></div>' +
        '<form id="track-upload-form"></form>' +
        '<section class="v138-track-management" data-v161-track-management="1">' +
          '<div class="v161-manage-tabs">' +
            '<button type="button" class="v161-manage-tab" aria-selected="true">我的音檔</button>' +
            '<button type="button" class="v161-manage-tab" aria-selected="false">網友音檔</button>' +
            '<button type="button" class="v161-manage-tab" aria-selected="false">🤖 逐字稿</button>' +
          '</div>' +
        '</section>' +
      '</div>';
      const innerTabs = page.querySelectorAll('.v161-manage-tab');
      innerTabs.forEach(button => button.addEventListener('click', () => {
        innerTabs.forEach(item => item.setAttribute('aria-selected', item === button ? 'true' : 'false'));
      }));
      document.body.appendChild(page);
      await new Promise(resolve => setTimeout(resolve, 180));

      const tabs = page.querySelector('.v139-upload-tabs');
      const scroller = page.querySelector('.v139-upload-tabs-scroll');
      const header = page.querySelector('.header');
      const children = Array.from(page.firstElementChild.children);
      const labels = Array.from(page.querySelectorAll('.v139-upload-tab')).map(button => (button.textContent || '').trim());
      const headerIndex = children.indexOf(header);
      const tabsIndex = children.indexOf(tabs);
      const initial = {
        labels,
        headerBeforeTabs: headerIndex >= 0 && tabsIndex > headerIndex,
        saveInHeader: !!header?.querySelector('button[form="track-upload-form"]'),
        overflowX: scroller ? getComputedStyle(scroller).overflowX : '',
        leftNav: !!tabs?.querySelector('button[aria-label="向左移動標籤"]'),
        rightNav: !!tabs?.querySelector('button[aria-label="向右移動標籤"]'),
        selected: page.querySelector('.v139-upload-tab[aria-selected="true"]')?.textContent?.trim() || ''
      };

      page.querySelector('.v139-upload-tab[data-tab="community"]')?.click();
      await new Promise(resolve => setTimeout(resolve, 80));
      const community = {
        pageTab: page.dataset.v139UploadTab || '',
        selected: page.querySelector('.v139-upload-tab[aria-selected="true"]')?.textContent?.trim() || '',
        innerSelected: Array.from(page.querySelectorAll('.v161-manage-tab')).find(button => button.getAttribute('aria-selected') === 'true')?.textContent?.trim() || '',
        formDisplay: getComputedStyle(page.querySelector('#track-upload-form')).display,
        innerTabsDisplay: getComputedStyle(page.querySelector('.v161-manage-tabs')).display
      };

      page.querySelector('.v139-upload-tab[data-tab="manage"]')?.click();
      await new Promise(resolve => setTimeout(resolve, 80));
      const manage = {
        pageTab: page.dataset.v139UploadTab || '',
        selected: page.querySelector('.v139-upload-tab[aria-selected="true"]')?.textContent?.trim() || '',
        innerSelected: Array.from(page.querySelectorAll('.v161-manage-tab')).find(button => button.getAttribute('aria-selected') === 'true')?.textContent?.trim() || ''
      };

      page.querySelector('.v139-upload-tab[data-tab="qa"]')?.click();
      await new Promise(resolve => setTimeout(resolve, 80));
      const qa = {
        pageTab: page.dataset.v139UploadTab || '',
        selected: page.querySelector('.v139-upload-tab[aria-selected="true"]')?.textContent?.trim() || '',
        innerSelected: Array.from(page.querySelectorAll('.v161-manage-tab')).find(button => button.getAttribute('aria-selected') === 'true')?.textContent?.trim() || '',
        formDisplay: getComputedStyle(page.querySelector('#track-upload-form')).display,
        innerTabsDisplay: getComputedStyle(page.querySelector('.v161-manage-tabs')).display
      };

      page.querySelector('.v139-upload-tab[data-tab="upload"]')?.click();
      await new Promise(resolve => setTimeout(resolve, 80));
      const upload = {
        pageTab: page.dataset.v139UploadTab || '',
        selected: page.querySelector('.v139-upload-tab[aria-selected="true"]')?.textContent?.trim() || '',
        formDisplay: getComputedStyle(page.querySelector('#track-upload-form')).display
      };

      page.remove();
      localStorage.removeItem('sq_current_user_v1');
      return { initial, community, manage, qa, upload };
    })()`);

    const expectedLabels = JSON.stringify(['上傳音檔','管理音檔','網友音檔','🤖 逐字稿']);
    if (JSON.stringify(state.initial.labels) !== expectedLabels || !state.initial.headerBeforeTabs || !state.initial.saveInHeader || state.initial.overflowX !== 'auto' || !state.initial.leftNav || !state.initial.rightNav || state.initial.selected !== '上傳音檔') {
      throw new Error(`Upload tab shell mismatch: ${JSON.stringify(state.initial)}`);
    }
    if (state.community.pageTab !== 'community' || state.community.selected !== '網友音檔' || state.community.innerSelected !== '網友音檔' || state.community.formDisplay !== 'none' || state.community.innerTabsDisplay !== 'none') {
      throw new Error(`Community tab mismatch: ${JSON.stringify(state.community)}`);
    }
    if (state.manage.pageTab !== 'manage' || state.manage.selected !== '管理音檔' || state.manage.innerSelected !== '我的音檔') {
      throw new Error(`Manage tab mismatch: ${JSON.stringify(state.manage)}`);
    }
    if (state.qa.pageTab !== 'qa' || state.qa.selected !== '🤖 逐字稿' || state.qa.innerSelected !== '🤖 逐字稿' || state.qa.formDisplay !== 'none' || state.qa.innerTabsDisplay !== 'none') {
      throw new Error(`Transcript QA tab mismatch: ${JSON.stringify(state.qa)}`);
    }
    if (state.upload.pageTab !== 'upload' || state.upload.selected !== '上傳音檔' || state.upload.formDisplay === 'none') {
      throw new Error(`Upload tab mismatch: ${JSON.stringify(state.upload)}`);
    }

    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile('/tmp/echostars-v169-upload-tabs.png', Buffer.from(shot.data, 'base64'));
    await writeFile('/tmp/echostars-v169-upload-tabs-state.json', JSON.stringify(state, null, 2));
    console.log('v169 upload tabs verified:', JSON.stringify(state));
    socket.close();
  } finally {
    chrome.kill('SIGTERM');
  }
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
