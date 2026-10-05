import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/components/DetailView.tsx', import.meta.url), 'utf8');

test('home keyword header uses one expand/collapse label without redundant drawer close button', () => {
  assert.match(app, /showKeywordsDrawer \? '▲收起' : '▼展開'/);
  assert.match(app, /網友關鍵字\(可複選多個\)/);
  assert.match(app, /<span>按此 <\/span>/);
  assert.doesNotMatch(app, /aria-label="收起網友關鍵字"/);
});

test('detail keyword header is compact and no longer shows keyword count', () => {
  assert.match(detail, /showDetailKeywords \? '▲收起' : '▼展開'/);
  assert.match(detail, /網友關鍵字\(登入可自訂新增\)/);
  assert.doesNotMatch(detail, /\{trackKeywords\.length\}\/50 組/);
  assert.match(detail, /showDetailKeywords \? 'p-3 sm:p-4' : 'px-3 py-2 sm:px-4 sm:py-2'/);
  assert.match(detail, /px-3\.5 pt-0 pb-28 sm:px-6/);
});

test('detail title and interaction row use the compact presentation', () => {
  assert.match(detail, /tracking-tight leading-\[1\.05\]/);
  assert.match(detail, /text-slate-400 py-0\.5 select-none/);
  assert.doesNotMatch(detail, /text-slate-400 bg-white\/85 dark:bg-slate-800\/80 py-1 sm:py-1\.5 px-2\.5 sm:px-3 rounded-2xl border/);
});
