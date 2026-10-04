import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('home keyword drawer explains multi-select and uses larger keyword text', () => {
  assert.match(app, /網友關鍵字（可複選多個條件）/);
  assert.match(app, /px-2 py-1 rounded-lg text-sm font-semibold/);
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
