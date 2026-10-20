import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const file = new URL('../docs/p1a-offline-demo/index.html', import.meta.url);
const html = readFileSync(file, 'utf8');

test('P1-A has all six offline navigation pages', () => {
  for (const id of ['home', 'cost', 'search', 'stats', 'safety', 'backup']) {
    assert.match(html, new RegExp('<section id="' + id + '"'));
    assert.match(html, new RegExp('data-tab="' + id + '"'));
  }
});

test('P1-A never loads remote resources or accesses live services', () => {
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|<iframe\b|<img[^>]+src=|@import\b/i);
  assert.doesNotMatch(html, /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b|\bsendBeacon\s*\(/);
  assert.doesNotMatch(html, /\blocalStorage\b|\bsessionStorage\b|\bdocument\.cookie\b/);
});

test('P1-A keeps sensitive actions disabled', () => {
  for (const label of ['儲存正式預算（鎖定）', '匯出私人資料（鎖定）', '還原（鎖定）', '刪除（鎖定）']) {
    assert.ok(html.includes(label));
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(html, new RegExp('<button[^>]*disabled[^>]*>' + escaped));
  }
});

test('P1-A identifies synthetic data and unknown real spending', () => {
  assert.match(html, /DEMO｜全部假資料/);
  assert.match(html, /實際支出：未知/);
  assert.match(html, /47\.5%/);
  assert.match(html, /第二位可信真人管理員：缺少/);
});

test('P1-A uses responsive layout and keyboard-visible focus', () => {
  assert.match(html, /@media\(max-width:650px\)/);
  assert.match(html, /:focus-visible/);
  assert.match(html, /aria-selected/);
});
