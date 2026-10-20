import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../docs/p1a-offline-demo/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';

test('P1-A stays a standalone offline document without remote dependencies', () => {
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /name="viewport"/);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i);
  assert.doesNotMatch(html, /<link\b[^>]*\bhref\s*=/i);
  assert.doesNotMatch(html, /<iframe\b/i);
  assert.doesNotMatch(style, /@import\b|url\s*\(/i);
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|navigator\.serviceWorker/i);
});

test('six unique offline pages have matching accessible tabs', () => {
  const tabs = [...html.matchAll(/<button\b[^>]*\brole="tab"[^>]*\bdata-tab="([^"]+)"[^>]*>/g)];
  const pages = [...html.matchAll(/<section\b[^>]*\bid="([^"]+)"[^>]*\brole="tabpanel"[^>]*>/g)];
  const expected = ['home', 'cost', 'search', 'stats', 'safety', 'backup'];
  assert.deepEqual(tabs.map(match => match[1]), expected);
  assert.deepEqual(pages.map(match => match[1]), expected);
  for (const id of expected) {
    assert.match(html, new RegExp('id="tab-' + id + '"[^>]*aria-controls="' + id + '"'));
    assert.match(html, new RegExp('id="' + id + '"[^>]*aria-labelledby="tab-' + id + '"'));
  }
});

test('all privileged action buttons remain disabled', () => {
  const buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
  for (const keyword of ['儲存正式預算', '匯出私人資料', '還原（鎖定）', '刪除（鎖定）']) {
    const button = buttons.find(match => match[2].includes(keyword));
    assert.ok(button, 'missing protected button: ' + keyword);
    assert.match(button[1], /\bdisabled\b/, keyword + ' must stay disabled');
  }
  assert.doesNotMatch(script, /\.disabled\s*=|removeAttribute\s*\(\s*['"]disabled|\.remove\s*\(\s*['"]disabled/);
});

test('demo never presents fake values as real money or member statistics', () => {
  assert.match(html, /DEMO｜全部假資料/);
  assert.match(html, /正式支出許可 NT\$0/);
  assert.match(html, /實際帳單金額未知/);
  assert.match(html, /私人使用統計｜合成假資料/);
  assert.match(html, /正式未驗證/);
  assert.match(script, /上述數字純屬合成假資料/);
});

test('missing audio source cannot become a fabricated citation', () => {
  assert.match(script, /不會猜測答案/);
  assert.match(script, /const examples=\[/);
  assert.doesNotMatch(script, /document\.write\s*\(|innerHTML\s*=/);
  assert.match(script, /\.textContent=/);
});

test('tab navigation supports keyboard movement and selected-state sync', () => {
  for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
    assert.ok(script.includes("event.key==='" + key + "'"), 'missing keyboard key ' + key);
  }
  assert.match(script, /event\.preventDefault\(\)/);
  assert.match(script, /tab\.setAttribute\('aria-selected',String\(active\)\)/);
  assert.match(script, /page\.hidden=!active/);
  assert.match(script, /tab\.tabIndex=active\?0:-1/);
});

test('mobile layout preserves horizontally scrollable tabs and one-column cards', () => {
  assert.match(style, /\.tabs\{[^}]*overflow-x:auto/);
  assert.match(style, /\.tabs button\{[^}]*min-height:44px/);
  assert.match(style, /@media\(max-width:650px\)\{[^}]*\.grid\{grid-template-columns:1fr\}/);
  assert.match(style, /table\{display:block;overflow-x:auto/);
  assert.match(style, /prefers-reduced-motion:reduce/);
});

test('backup restore and deletion remain offline and locked', () => {
  assert.match(html, /禁止還原與刪除/);
  assert.match(html, /第二位可信真人管理員：缺少/);
  assert.match(html, /第三獨立見證：未建立／未驗證/);
  assert.match(script, /真實未核實/);
  assert.doesNotMatch(script, /\b(delete|restore|migrate)\s*\(\s*(?:request|env|db)\b/i);
});
