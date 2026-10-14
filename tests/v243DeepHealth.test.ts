import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const favoriteRouter = readFileSync(new URL('../worker/favoriteRouter.ts', import.meta.url), 'utf8');
const dislike = readFileSync(new URL('../src/v181HomeToolbarDislike.ts', import.meta.url), 'utf8');
const dislikeFavorites = readFileSync(new URL('../src/v183DislikeFavoritesPolish.ts', import.meta.url), 'utf8');

test('leaderboard uses real D1 data and real completed playback memories', () => {
  assert.match(favoriteRouter, /url\.pathname === '\/api\/leaderboard'/);
  assert.match(favoriteRouter, /source: 'd1-real-data'/);
  assert.match(favoriteRouter, /COUNT\(DISTINCT pm\.trackId\)/);
  assert.match(favoriteRouter, /COALESCE\(pm\.completed,0\)=1/);
});

test('track aggregates are canonicalized from source-of-truth fields', () => {
  assert.match(favoriteRouter, /const likes = likedBy\.length/);
  assert.match(favoriteRouter, /const ratingCount = scores\.length/);
  assert.match(favoriteRouter, /SELECT trackId, COUNT\(\*\) AS count FROM comments GROUP BY trackId/);
  assert.match(favoriteRouter, /UPDATE tracks SET likes = \?, rating = \?, ratingCount = \?, commentsCount = \?/);
});

test('new tracks do not receive a synthetic five-star rating', () => {
  const start = favoriteRouter.indexOf('if (isCreate) {');
  const end = favoriteRouter.indexOf('return { body: nextBody, names };', start);
  assert.ok(start >= 0 && end > start);
  const createPolicy = favoriteRouter.slice(start, end);
  assert.match(createPolicy, /canonicalRating\(nextBody\.ratings\)/);
  assert.match(createPolicy, /nextBody\.commentsCount = 0/);
  assert.doesNotMatch(createPolicy, /rating\s*=\s*5/);
});

test('dislike reuses card speaker and hides optimistically before persistence', () => {
  assert.match(dislike, /querySelector<HTMLImageElement>\('img\[alt\]'\)/);
  assert.doesNotMatch(dislike, /void loadTrackSpeakerMap\(\)\.then/);
  const addIndex = dislike.indexOf('hiddenSpeakers.add(speakerName)');
  const persistIndex = dislike.indexOf('await persistDislike(speakerName)');
  assert.ok(addIndex >= 0 && persistIndex > addIndex);
  assert.match(dislike, /requestAnimationFrame/);
});

test('hidden-speaker full track loading is deferred until favorites counts are visible', () => {
  const start = dislikeFavorites.indexOf('async function loadHiddenSpeakers');
  const end = dislikeFavorites.indexOf('async function removeHiddenSpeaker', start);
  assert.ok(start >= 0 && end > start);
  const loadPolicy = dislikeFavorites.slice(start, end);
  assert.doesNotMatch(loadPolicy, /loadTrackSpeakers/);
  assert.match(dislikeFavorites, /if \(names\.length && !trackSpeakersLoaded\)/);
});
