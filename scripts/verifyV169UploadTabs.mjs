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


    const waitFor = async (expression, label, limit = 100) => {
      for (let attempt = 0; attempt < limit; attempt++) {
        if (await evaluate(expression)) return;
        await delay(150);
      }
      throw new Error('Timed out waiting for ' + label);
    };

    // Test the real React interface with local-only credentials and a mocked track.
    await waitFor("!!document.querySelector('[data-main-menu=\\\"hamburger\\\"]')", 'initial navbar');
    await evaluate("localStorage.setItem('sq_current_user_v1', JSON.stringify({id:'u-admin',email:'yukidu@gmail.com',role:'超級管理員',name:'測試管理員',isAdminUser:true}));");
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
      const original = window.fetch;
      window.fetch = function(input,init){
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if(new URL(url,location.origin).pathname==='/api/tracks'){
          const fixture = {id:'qa-fixture-001',title:'React 頁面測試音檔',speaker:'測試演講者',speakerRank:'無',requiredRank:'無',guestVisible:true,isPrivateVip:false,stickerUnlockCost:0,audioUrl:'',categories:['事業'],keywords:[],uploaderId:'u-admin',uploaderEmail:'yukidu@gmail.com',uploadDate:'2026/10/19'};
          return Promise.resolve(new Response(JSON.stringify({tracks:[fixture]}),{status:200,headers:{'Content-Type':'application/json'}}));
        }
        return original.apply(this,arguments);
      };
    })();`});
    await send('Page.reload',{ignoreCache:true});
    await waitFor("!!document.querySelector('[data-main-menu=\\\"hamburger\\\"]')", 'logged-in navbar');
    await evaluate("document.querySelector('[data-main-menu=\\\"hamburger\\\"]').click()");
    await waitFor("!!document.querySelector('.mobile-menu-panel')", 'hamburger menu');
    const navLabel = await evaluate("Array.from(document.querySelectorAll('.mobile-menu-panel button')).find(b=>b.textContent?.includes('音檔管理'))?.textContent?.trim()||''");
    if(!navLabel)throw Error('音檔管理 entry missing from main navbar');
    await evaluate("Array.from(document.querySelectorAll('.mobile-menu-panel button')).find(b=>b.textContent?.includes('音檔管理'))?.click()");
    await waitFor("!!document.querySelector('[data-audio-workspace-page=\\\"index\\\"]')", 'real React workspace');
    const initial = await evaluate(`(() => ({
      page:!!document.querySelector('[data-audio-workspace-page="index"]'),
      labels:Array.from(document.querySelectorAll('.audio-workspace-tab')).map(b=>b.textContent.trim()),
      active:Array.from(document.querySelectorAll('.audio-workspace-tab')).find(b=>b.getAttribute('aria-selected')==='true')?.textContent.trim()||'',
      rows:document.querySelectorAll('.audio-workspace-tabs').length,
      legacy:document.querySelectorAll('.v139-upload-tabs,.v161-manage-tabs').length,
      forms:document.querySelectorAll('#track-upload-form').length,
      viewport:document.documentElement.scrollWidth,
      screen:innerWidth
    }))()`);
    const expected=['上傳音檔','管理音檔','網友音檔','逐字稿','AI問問題','AI演講者'];
    if(JSON.stringify(initial.labels)!==JSON.stringify(expected)||initial.rows!==1||initial.legacy!==0||initial.forms!==1||initial.viewport>initial.screen+3)throw Error('Six-tab workspace mismatch: '+JSON.stringify(initial));
    const select = async label => {
      await evaluate(`Array.from(document.querySelectorAll('.audio-workspace-tab')).find(b=>b.textContent.trim()===${JSON.stringify(label)})?.click()`);
      await waitFor(`Array.from(document.querySelectorAll('.audio-workspace-tab')).some(b=>b.textContent.trim()===${JSON.stringify(label)}&&b.getAttribute('aria-selected')==='true')`,label+' selected');
      const count=await evaluate("document.querySelectorAll('#track-upload-form').length");
      if(count!==(label==='上傳音檔'?1:0))throw Error('Unexpected mounted form count in '+label+': '+count);
    };
    for(const label of expected.slice(1))await select(label);
    await select('管理音檔');
    await waitFor("!!document.querySelector('.v161-track-row .v161-edit')", 'track fetched to React list');
    await evaluate("document.querySelector('.v161-track-row .v161-edit')?.click()");
    await waitFor("!!document.querySelector('[data-audio-workspace-page=\\\"editor\\\"]')", 'independent audio editor');
    const editor=await evaluate(`(() => {
      const marker=document.querySelector('[data-audio-workspace-page="editor"]');
      const shell=marker?.querySelector('.upload-modal-overlay');
      return {
        editor:!!marker,
        forms:document.querySelectorAll('#track-upload-form').length,
        modal:!!marker?.closest('.v161-track-editor-overlay'),
        position:shell?getComputedStyle(shell).position:'',
        title:marker?.textContent.slice(0,80)||'',
        back:!!Array.from(marker?.querySelectorAll('button')||[]).find(b=>b.textContent.includes('返回音檔管理'))
      };
    })()`);
    if(!editor.editor||editor.forms!==1||editor.modal||editor.position==='fixed'||!editor.back)throw Error('Independent editor page mismatch: '+JSON.stringify(editor));
    await evaluate("Array.from(document.querySelectorAll('[data-audio-workspace-page=\\\"editor\\\"] button')).find(b=>b.textContent.includes('返回音檔管理'))?.click()");
    await waitFor("!!document.querySelector('[data-audio-workspace-page=\\\"index\\\"]')", 'return to management page');
    const restored=await evaluate("document.querySelectorAll('#track-upload-form').length===0&&Array.from(document.querySelectorAll('.audio-workspace-tab')).some(b=>b.textContent.trim()==='管理音檔'&&b.getAttribute('aria-selected')==='true')");
    if(!restored)throw Error('Returning from audio editor did not restore management page');
    const result={initial,editor,restored};
    const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    await writeFile('/tmp/echostars-v169-upload-tabs.png',Buffer.from(shot.data,'base64'));
    await writeFile('/tmp/echostars-v169-upload-tabs-state.json',JSON.stringify(result,null,2));
    console.log('Real six-tab React audio workspace verified:',JSON.stringify(result));
    socket.close();
  } finally {
    chrome.kill('SIGTERM');
  }
}

main().catch(error=>{
  console.error(error?.stack||error);
  process.exitCode=1;
});
