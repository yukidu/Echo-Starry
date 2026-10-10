import { spawn, spawnSync } from 'node:child_process';
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
    `--user-data-dir=/tmp/echostars-v168-ui-${process.pid}`, 'about:blank'
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
    await delay(250);

    const state = await evaluate(`(() => {
      let backgroundSubmit = 0;
      let editorSubmit = 0;

      const background = document.createElement('form');
      background.id = 'track-upload-form';
      background.addEventListener('submit', event => { event.preventDefault(); backgroundSubmit += 1; });
      document.body.appendChild(background);

      const editor = document.createElement('div');
      editor.className = 'v161-track-editor-overlay';
      const shell = document.createElement('div');
      shell.className = 'upload-modal-overlay upload-page';
      const card = document.createElement('div');
      const save = document.createElement('button');
      save.type = 'submit';
      save.setAttribute('form', 'track-upload-form');
      save.textContent = '儲存';
      const form = document.createElement('form');
      form.id = 'track-upload-form';
      form.addEventListener('submit', event => { event.preventDefault(); editorSubmit += 1; });
      card.append(save, form);
      shell.appendChild(card);
      editor.appendChild(shell);
      document.body.appendChild(editor);

      save.click();
      const result = { backgroundSubmit, editorSubmit };
      editor.remove();
      background.remove();
      return result;
    })()`);

    if (state.backgroundSubmit !== 0 || state.editorSubmit !== 1) {
      throw new Error(`Audio edit save routed to the wrong form: ${JSON.stringify(state)}`);
    }

    console.log('v168 audio edit save verified:', JSON.stringify(state));
    socket.close();
  } finally {
    chrome.kill('SIGTERM');
  }
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
