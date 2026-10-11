import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isCombinedSpeakerName,
  speakerMatchesAnyHiddenEntry,
  speakerMatchesHiddenEntry,
  splitSpeakerNames
} from '../src/v184SpeakerRelationship';

const favoritesUi = readFileSync(new URL('../src/v183DislikeFavoritesPolish.ts', import.meta.url), 'utf8');
const dislikeUi = readFileSync(new URL('../src/v181HomeToolbarDislike.ts', import.meta.url), 'utf8');

test('v184 splits common combined speaker formats into individual names', () => {
  assert.deepEqual(splitSpeakerNames('彭建屏&洪美香'), ['彭建屏', '洪美香']);
  assert.deepEqual(splitSpeakerNames('彭建屏＆洪美香'), ['彭建屏', '洪美香']);
  assert.deepEqual(splitSpeakerNames('彭建屏／洪美香'), ['彭建屏', '洪美香']);
  assert.equal(isCombinedSpeakerName('彭建屏&洪美香'), true);
  assert.equal(isCombinedSpeakerName('洪美香'), false);
});

test('v184 single-name dislike hides combined speaker recordings containing that name', () => {
  assert.equal(speakerMatchesHiddenEntry('彭建屏&洪美香', '洪美香'), true);
  assert.equal(speakerMatchesHiddenEntry('洪美香', '洪美香'), true);
  assert.equal(speakerMatchesHiddenEntry('其他講者', '洪美香'), false);
});

test('v184 combined-name dislike expands to either person and hides all related recordings', () => {
  const hidden = '彭建屏&洪美香';
  assert.equal(speakerMatchesHiddenEntry('彭建屏', hidden), true);
  assert.equal(speakerMatchesHiddenEntry('洪美香', hidden), true);
  assert.equal(speakerMatchesHiddenEntry('彭建屏&洪美香', hidden), true);
  assert.equal(speakerMatchesHiddenEntry('彭建屏&第三人', hidden), true);
  assert.equal(speakerMatchesHiddenEntry('其他講者', hidden), false);
  assert.equal(speakerMatchesAnyHiddenEntry('彭建屏&洪美香', new Set(['洪美香'])), true);
});

test('v184 home cards use relationship matching instead of exact speaker equality', () => {
  assert.match(dislikeUi, /speakerMatchesAnyHiddenEntry\(speakerName, hiddenSpeakers\)/);
  assert.doesNotMatch(dislikeUi, /hiddenSpeakers\.has\(speakerName\)/);
});

test('v184 favorites separates combined and single names and shows related hidden track counts', () => {
  assert.match(favoritesUi, /夫妻／合併姓名/);
  assert.match(favoritesUi, /單人姓名/);
  assert.match(favoritesUi, /hiddenTrackCount\(speakerName\)/);
  assert.match(favoritesUi, /`（\$\{hiddenTrackCount\(speakerName\)\}）`/);
  assert.match(favoritesUi, /speakerMatchesHiddenEntry\(trackSpeaker, speakerName\)/);
});
