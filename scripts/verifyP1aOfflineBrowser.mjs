import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const fileUrl = pathToFileURL(resolve('docs/p1a-offline-demo/index.html')).href;
const binary = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
  .filter(Boolean).map(x => x.includes('/') ? x : spawnSync('which', [x], { encoding: 'utf8' }).stdout.trim()).find(Boolean);
assert.ok(binary, 'Chrome/Chromium is required; cannot substitute a fake DOM');
const port = await new Promise((ok, fail) => {
  const s = createServer();
  s.on('error', fail);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); });
});
const chrome = spawn(binary, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + port,
  '--user-data-dir=/tmp/starry-p1a-ui-' + process.pid, 'about:blank'], { stdio: 'ignore' });
const pause = ms => new Promise(ok => setTimeout(ok, ms));
try {
  let host;
  for (let n = 0; n < 100; n++) {
    try { const r = await fetch('http://127.0.0.1:' + port + '/json/version'); if (r.ok) { host = 'http://127.0.0.1:' + port; break; } } catch {}
    await pause(150);
  }
  assert.ok(host, 'Chromium debugging endpoint did not start');
  const opened = await fetch(host + '/json/new?' + encodeURIComponent(fileUrl), { method: 'PUT' });
  assert.ok(opened.ok, 'Could not open offline P1-A document');
  const target = await opened.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', fail, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', e => {
    const msg = JSON.parse(String(e.data));
    if (!msg.id) return;
    const task = pending.get(msg.id);
    if (!task) return;
    pending.delete(msg.id);
    msg.error ? task.fail(new Error(msg.error.message)) : task.ok(msg.result);
  });
  const send = (method, params = {}) => new Promise((ok, fail) => {
    const id = ++seq;
    pending.set(id, { ok, fail });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Page.enable');
  await send('Runtime.enable');
  for (const [label, width, height, mobile] of [['手機', 375, 812, true], ['電腦', 1280, 800, false]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await send('Page.reload', { ignoreCache: true });
    let ready = false;
    for (let n = 0; n < 60; n++) {
      ready = await evaluate("document.readyState === 'complete' && !!document.getElementById('current-page')");
      if (ready) break;
      await pause(100);
    }
    assert.ok(ready, label + ': offline page failed to load');
    const initial = await evaluate(`(() => {
      const nav = document.querySelector('.tabs');
      const buttons = [...document.querySelectorAll('button[role="tab"]')];
      return { tabs: buttons.length, panels: document.querySelectorAll('[role="tabpanel"]').length,
        hint: document.querySelector('.tab-hint')?.textContent, current: document.getElementById('current-page')?.textContent,
        scrollable: nav.scrollWidth > nav.clientWidth, bodyOverflow: document.documentElement.scrollWidth > innerWidth,
        disabled: [...document.querySelectorAll('button[disabled]')].length,
        columns: getComputedStyle(document.querySelector('.grid')).gridTemplateColumns.split(' ').length };
    })()`);
    assert.equal(initial.tabs, 6, label + ': tab count');
    assert.equal(initial.panels, 6, label + ': panel count');
    assert.match(initial.hint, /左右滑動/);
    assert.equal(initial.current, '目前頁面：總覽');
    assert.equal(initial.bodyOverflow, false, label + ': unexpected horizontal page overflow');
    assert.ok(initial.disabled >= 4, label + ': protected actions not locked');
    if (mobile) { assert.equal(initial.scrollable, true, 'mobile tabs should scroll'); assert.equal(initial.columns, 1, 'mobile cards should use one column'); }
    for (const id of ['home', 'cost', 'search', 'stats', 'safety', 'backup']) {
      const state = await evaluate(`(() => {
        const tab = document.getElementById('tab-${id}');
        tab.click();
        return { label: document.getElementById('current-page').textContent,
          selected: document.querySelectorAll('[role="tab"][aria-selected="true"]').length,
          visible: [...document.querySelectorAll('[role="tabpanel"]')].filter(x => !x.hidden).map(x => x.id),
          disabled: [...document.querySelectorAll('button[disabled]')].length };
      })()`);
      assert.equal(state.label, '目前頁面：' + ({ home:'總覽',cost:'AI3 費用',search:'AI4 搜尋',stats:'AI5 統計',safety:'AI6 安全',backup:'AI7 備份' })[id], label + ' ' + id);
      assert.deepEqual(state.visible, [id], label + ': wrong visible panel');
      assert.equal(state.selected, 1, label + ': selected tab count');
      assert.ok(state.disabled >= 4, label + ': protected buttons changed');
    }
    console.log('PASS P1-A Chromium ' + label + ' ' + width + 'px: six tabs, scroll hint, active label, overflow, locked actions');
  }
  ws.close();
} finally {
  chrome.kill('SIGTERM');
}
