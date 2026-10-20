import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../docs/p1a-offline-demo/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'offline demo script exists');

class FakeElement {
  value = '';
  textContent = '';
  className = '';
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  listeners = new Map<string, (event: { target: FakeElement }) => void>();
  children: FakeElement[] = [];
  classList = { toggle: (name: string, active: boolean) => { this.attributes.set('class:' + name, String(active)); } };
  constructor(readonly id = '') {}
  addEventListener(name: string, fn: (event: { target: FakeElement }) => void) { this.listeners.set(name, fn); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  replaceChildren(...children: FakeElement[]) { this.children = children; }
  append(child: FakeElement) { this.children.push(child); }
  trigger(name: string) {
    const fn = this.listeners.get(name);
    assert.ok(fn, this.id + ' missing ' + name + ' handler');
    fn({ target: this });
  }
}

function launch() {
  const ids = ['budget', 'scenario', 'estimate', 'find', 'query', 'results', 'period', 'statsview', 'state', 'stateview', 'backupid', 'backupview'];
  const nodes = Object.fromEntries(ids.map(id => [id, new FakeElement(id)])) as Record<string, FakeElement>;
  nodes.budget.value = '0';
  nodes.scenario.value = '1';
  nodes.period.value = '7';
  nodes.state.value = 'unknown';
  nodes.backupid.value = '42';
  const pages = ['home', 'cost', 'search', 'stats', 'safety', 'backup'].map(id => new FakeElement(id));
  const tabs = pages.map(page => { const tab = new FakeElement('tab-' + page.id); tab.dataset.tab = page.id; return tab; });
  const document = {
    getElementById: (id: string) => {
      assert.ok(nodes[id], 'unknown element ' + id);
      return nodes[id];
    },
    querySelectorAll: (selector: string) => selector === '.page' ? pages : selector === '[data-tab]' ? tabs : [],
    createElement: () => new FakeElement()
  };
  runInNewContext(script!, { document, Number, Math, String });
  return { nodes, pages, tabs };
}

test('offline navigation changes exactly one visible page', () => {
  const { pages, tabs } = launch();
  for (const tab of tabs) {
    tab.trigger('click');
    assert.equal(pages.filter(page => page.attributes.get('class:hidden') === 'false').length, 1);
    assert.equal(pages.find(page => page.attributes.get('class:hidden') === 'false')?.id, tab.dataset.tab);
    assert.equal(tabs.filter(t => t.attributes.get('aria-selected') === 'true').length, 1);
  }
});

test('cost calculator never grants production budget', () => {
  const { nodes } = launch();
  nodes.budget.value = '1000';
  nodes.scenario.value = '2';
  nodes.budget.trigger('input');
  assert.ok(nodes.estimate.textContent.includes('這不會改變正式 NT$0 預算'));
  nodes.budget.value = '0';
  nodes.budget.trigger('input');
  assert.ok(nodes.estimate.textContent.includes('這不會改變正式 NT$0 預算'));
});

test('offline search never invents a missing result', () => {
  const { nodes } = launch();
  nodes.query.value = '不存在的虛構音檔';
  nodes.find.trigger('click');
  assert.match(nodes.results.children[0]?.textContent ?? '', /不會猜測答案/);
  nodes.query.value = '新人';
  nodes.find.trigger('click');
  assert.ok(nodes.results.children.length > 0);
  assert.match(nodes.results.children[0].textContent, /虛構音檔/);
});

test('stats, security and backup selectors only change fake display', () => {
  const { nodes } = launch();
  nodes.period.value = '30';
  nodes.period.trigger('change');
  assert.match(nodes.statsview.children[1]?.textContent ?? '', /合成假資料/);
  nodes.state.value = 'normal';
  nodes.state.trigger('change');
  assert.match(nodes.stateview.textContent, /不代表其他領域安全/);
  nodes.backupid.value = '43';
  nodes.backupid.trigger('change');
  assert.match(nodes.backupview.textContent, /真實未核實/);
});
