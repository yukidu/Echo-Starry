import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MAX_TRACK_SPEAKERS,
  normalizeTrackSpeakers,
  parseSpeakerInput,
  speakerDisplay,
  speakerMatchesHiddenEntry
} from '../shared/speakers';

const router = readFileSync(new URL('../worker/favoriteRouter.ts', import.meta.url), 'utf8');
const relationship = readFileSync(new URL('../src/v184SpeakerRelationship.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/v185MultiSpeakerUi.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../migrations/v185_track_speakers.sql', import.meta.url), 'utf8');

test('v185 stores at most five ordered speakers and displays them with ampersands without spaces', () => {
  assert.equal(MAX_TRACK_SPEAKERS, 5);
  assert.deepEqual(parseSpeakerInput('王一&王二＆王三／王四+王五'), ['王一', '王二', '王三', '王四', '王五']);
  assert.deepEqual(normalizeTrackSpeakers(['王一', '王二', '王三', '王四', '王五', '王六']), ['王一', '王二', '王三', '王四', '王五']);
  assert.equal(speakerDisplay(['王一', '王二', '王三']), '王一&王二&王三');
  assert.equal(speakerDisplay([' 王一 ', ' 王二 ']).includes(' '), false);
});

test('v185 dislike matching uses exact speaker identity instead of substring guessing', () => {
  assert.equal(speakerMatchesHiddenEntry('彭建屏&洪美香', '洪美香'), true);
  assert.equal(speakerMatchesHiddenEntry('彭建屏', '彭建屏&洪美香'), true);
  assert.equal(speakerMatchesHiddenEntry('洪美香', '彭建屏&洪美香'), true);
  assert.equal(speakerMatchesHiddenEntry('王小明美', '王小明'), false);
  assert.equal(speakerMatchesHiddenEntry('其他講者', '洪美香'), false);
});

test('v185 keeps the established worker wrapper chain while adding normalized speaker relations', () => {
  assert.match(router, /import appWorker from '\.\/adminUserDeleteRouter'/);
  assert.match(router, /MULTI_SPEAKER_MIGRATION = 'multi-speakers-v185'/);
  assert.match(router, /CREATE TABLE IF NOT EXISTS track_speakers/);
  assert.match(router, /SELECT id, speaker FROM tracks/);
  assert.match(router, /INSERT OR REPLACE INTO track_speakers/);
  assert.match(router, /speakerDisplay\(names\)/);
  assert.match(router, /parsed\.length > MAX_TRACK_SPEAKERS/);
  assert.match(migration, /position INTEGER NOT NULL CHECK\(position >= 0 AND position < 5\)/);
});

test('v185 upload and edit UI can add four co-speakers and sends canonical speakers in track writes', () => {
  assert.match(ui, /＋ 增加共同演講者/);
  assert.match(ui, /MAX_TRACK_SPEAKERS - 1/);
  assert.match(ui, /body\.speakers = names/);
  assert.match(ui, /body\.speaker = speakerDisplay\(names\)/);
  assert.match(ui, /最多 \$\{MAX_TRACK_SPEAKERS\} 位演講者/);
});

test('v184 dislike consumers are transparently upgraded to the v185 exact identity model', () => {
  assert.match(relationship, /import '\.\/v185MultiSpeakerUi'/);
  assert.match(relationship, /from '\.\.\/shared\/speakers'/);
  assert.doesNotMatch(relationship, /track\.includes\(/);
});
