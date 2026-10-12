import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/components/DetailView.tsx', import.meta.url), 'utf8');
const card = readFileSync(new URL('../src/components/AudioCard.tsx', import.meta.url), 'utf8');

test('home advanced-filter heading owns expand and collapse state without drawer X', () => {
  assert.match(app, /按此/);
  assert.match(app, /showKeywordsDrawer \? '▲收起' : '▼展開'/);
  assert.match(app, /進階篩選/);
  assert.match(app, /網友關鍵字/);
  assert.match(app, /\(可複選多個\)/);
  assert.match(app, /text-\[11px\]/);
  assert.doesNotMatch(app, /aria-label=\"收起網友關鍵字\"/);
});

test('detail keyword heading is compact, count-free and login-aware', () => {
  assert.match(detail, /showDetailKeywords \? 'p-3 sm:p-4' : 'px-3 py-1\.5 sm:px-4 sm:py-2'/);
  assert.match(detail, /showDetailKeywords \? '▲收起' : '▼展開'/);
  assert.match(detail, /網友關鍵字/);
  assert.match(detail, /currentUser \? '\(可自訂新增\)' : '\(登入可自訂新增\)'/);
  assert.match(detail, /text-\[9px\]/);
  assert.doesNotMatch(detail, /\{trackKeywords\.length\}\/50 組/);
});

test('detail reaction strip has no decorative rounded backing frame', () => {
  assert.doesNotMatch(detail, /bg-white\/85 dark:bg-slate-800\/80 py-1 sm:py-1\.5 px-2\.5 sm:px-3 rounded-2xl border border-slate-200\/60/);
  assert.match(detail, /text-slate-600 dark:text-slate-400 py-0\.5 select-none/);
});

test('long titles use very tight multiline leading on home and detail', () => {
  assert.match(detail, /tracking-tight leading-\[1\.02\]/);
  assert.match(card, /font-black text-slate-900 dark:text-slate-100 leading-\[1\.02\]/);
});
