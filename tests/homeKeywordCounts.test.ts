import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('home keyword drawer explains multi-select and uses larger keyword text', () => {
  assert.match(app, /網友關鍵字\(可複選多個\)/);
  assert.match(app, /px-2 py-1 rounded-lg text-sm font-normal/);
  assert.match(app, /\{kw\}\(\{keywordMatchCounts\[kw\] \?\? 0\}\)/);
});

test('keyword counts are computed from the same home filters and update with selected intersections', () => {
  assert.match(app, /const keywordMatchCounts = useMemo/);
  assert.match(app, /trackMatchesHomeBaseFilters\(track, selectedCategory, selectedSpeakerRank, searchQuery\)/);
  assert.match(app, /selectedKeywords\.includes\(keyword\)/);
  assert.match(app, /activeKeywords\.every\(activeKeyword => trackMatchesHomeKeyword\(track, activeKeyword\)\)/);
  assert.match(app, /\[tracks, allAvailableKeywords, selectedCategory, selectedSpeakerRank, selectedKeywords, searchQuery\]/);
});

test('the playlist and keyword counters share one keyword matching rule', () => {
  assert.match(app, /selectedKeywords\.every\(keyword => trackMatchesHomeKeyword\(t, keyword\)\)/);
  assert.match(app, /function trackMatchesHomeKeyword/);
  assert.match(app, /function trackMatchesHomeSearch/);
});

test('zero-result keyword choices disappear while selected chips remain removable', () => {
  assert.match(app, /const visibleAvailableKeywords = useMemo/);
  assert.match(app, /allAvailableKeywords\.filter\(keyword => \(keywordMatchCounts\[keyword\] \?\? 0\) > 0\)/);
  assert.match(app, /const visibleSearchSuggestionKeywords = useMemo/);
  assert.match(app, /visibleAvailableKeywords\.map\(kw =>/);
  assert.match(app, /visibleSearchSuggestionKeywords\.map\(kw =>/);
  assert.match(app, /selectedKeywords\.map\(kw =>/);
});

test('keyword controls use consistent readable sizing and the heading owns expand/collapse without a close button', () => {
  assert.match(app, /網友關鍵字\(可複選多個\)/);
  assert.match(app, />\s*重設\s*<\/button>/);
  assert.match(app, /showKeywordsDrawer \? '▲收起' : '▼展開'/);
  assert.match(app, /aria-expanded=\{showKeywordsDrawer\}/);
  assert.doesNotMatch(app, /aria-label="收起網友關鍵字"/);
  assert.doesNotMatch(app, /w-11 h-11[\s\S]*text-4xl font-black/);
});

test('keyword chips stay regular weight and sort controls match search height', () => {
  assert.match(app, /px-2 py-1 rounded-lg text-sm font-normal/);
  assert.match(app, /rounded-full text-sm font-normal bg-amber-100/);
  assert.match(app, /px-2\.5 py-1 rounded-xl text-sm font-normal/);
  assert.match(app, /pl-10 pr-9 h-\[46px\] py-0 rounded-2xl/);
  assert.match(app, /h-\[46px\] px-3\.5 sm:px-4 py-0 rounded-2xl/);
  assert.ok((app.match(/w-full h-\[46px\] min-w-0/g) || []).length >= 3);
});
