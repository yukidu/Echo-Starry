import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('injected transcript notice widget never installs the former recursive document observer', () => {
  const script = read('public/transcript-user-notifications.js');
  const app = read('src/components/NotificationsView.tsx');
  const html = read('index.html');
  const serviceWorker = read('public/sw.js');
  assert.doesNotMatch(script, /new MutationObserver/);
  assert.doesNotMatch(script, /observer\.observe\(document\.documentElement/);
  assert.match(script, /window\.addEventListener\('echostars:notifications-mounted', scan\)/);
  assert.match(script, /state\.root === root && root\.isConnected/);
  assert.match(app, /window\.dispatchEvent\(new Event\('echostars:notifications-mounted'\)\)/);
  assert.match(app, /setMentionsLoadError\(true\);\s*setMentionsLoading\(false\);/);
  assert.match(html, /transcript-user-notifications\.js\?v=318/);
  assert.match(serviceWorker, /echostars-shell-v183/);
});

test('populated notifications render once despite repeated mount signals, then render on a new screen', async () => {
  const source = read('public/transcript-user-notifications.js');
  const events = new Map<string, Array<() => void>>();
  let fetchCount = 0;
  let renderCount = 0;
  let root = makeRoot();
  function makeRoot() {
    let injected: any = null;
    const parent: any = {
      isConnected: true,
      classList: { contains: (value: string) => value === 'space-y-3' || value === 'max-w-2xl' },
      querySelector: () => injected,
      firstElementChild: null,
      appendChild: (child: any) => { injected = child; },
      insertBefore: (child: any) => { injected = child; }
    };
    return parent;
  }
  const doc = {
    body: { dataset: { mainTab: 'notifications' } },
    head: { appendChild: () => {} },
    createElement: (tag: string) => {
      if (tag === 'style') return { textContent: '' };
      const box: any = {
        dataset: {},
        className: '',
        classList: {remove: () => {}},
        querySelectorAll: () => [],
        remove: () => {}
      };
      Object.defineProperty(box, 'innerHTML', {
        set(value: string) { if (value) renderCount++; }
      });
      return box;
    },
    querySelectorAll: (selector: string) => selector === 'h2' ? [{ textContent: '繁星動態通知與獎銜審核', parentElement: root }] : []
  };
  const win: any = {
    addEventListener: (event: string, callback: () => void) => {
      events.set(event, [...events.get(event) || [], callback]);
    }
  };
  runInNewContext(source, {
    window: win, document: doc,
    MutationObserver: class {
      constructor() { throw new Error('A global observer would recreate the infinite render loop'); }
    },
    fetch: async () => {
      fetchCount++;
      return {ok: true, status: 200, json: async () => ({
        notifications: [{id: 'n1', title: '轉錄完成', body: '逐字稿通知', createdAt: Date.now(), isRead: false}]
      })};
    },
    Date,
    console
  }, { timeout: 2000 });

  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(fetchCount, 1);
  assert.equal(renderCount, 1);
  for (let i = 0; i < 100; i++) events.get('echostars:notifications-mounted')?.forEach(callback => callback());
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(fetchCount, 1, 'same screen should never refetch on redundant events');
  assert.equal(renderCount, 1, 'same screen should never rewrite and trigger other observers');

  root.isConnected = false;
  root = makeRoot();
  events.get('echostars:notifications-mounted')?.forEach(callback => callback());
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(fetchCount, 1, 'return to inbox should reuse fresh notifications');
  assert.equal(renderCount, 2, 'newly mounted page should show the cached notice exactly once');
});
