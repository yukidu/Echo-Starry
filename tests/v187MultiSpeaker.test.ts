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

const upload = readFileSync(new URL('../src/components/UploadModal.tsx', import.meta.url), 'utf8');
const router = readFileSync(new URL('../worker/favoriteRouter.ts', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

 test('v187 supports one primary plus four co-speakers and canonical ampersand display', () => {
  assert.equal(MAX_TRACK_SPEAKERS, 5);
  assert.deepEqual(parseSpeakerInput('王一 & 王二＆王三'), ['王一', '王二', '王三']);
  assert.deepEqual(normalizeTrackSpeakers(['王一', '王二', '王三', '王四', '王五', '王六']), ['王一', '王二', '王三', '王四', '王五']);
  assert.equal(speakerDisplay(['王一', '王二', '王三']), '王一&王二&王三');
  assert.equal(speakerDisplay(['王一', '王二']).includes(' & '), false);
});

test('v187 does not split unrelated punctuation in legacy names', () => {
  assert.deepEqual(parseSpeakerInput('王一/王二'), ['王一/王二']);
  assert.deepEqual(parseSpeakerInput('王一,王二'), ['王一,王二']);
  assert.deepEqual(parseSpeakerInput('王一+王二'), ['王一+王二']);
});

test('v187 hidden-speaker matching uses exact individual identities', () => {
  assert.equal(speakerMatchesHiddenEntry('彭建屏&洪美香', '洪美香'), true);
  assert.equal(speakerMatchesHiddenEntry('彭建屏', '彭建屏&洪美香'), true);
  assert.equal(speakerMatchesHiddenEntry('王小明美', '王小明'), false);
});

test('v187 stores ordered speakers separately while keeping legacy speaker display compatible', () => {
  assert.match(router, /MULTI_SPEAKER_MIGRATION = 'multi-speakers-v187'/);
  assert.match(router, /CREATE TABLE IF NOT EXISTS track_speakers/);
  assert.match(router, /SELECT id, speaker FROM tracks/);
  assert.match(router, /INSERT OR REPLACE INTO track_speakers/);
  assert.match(router, /speaker: speakerDisplay\(names\)/);
  assert.match(router, /delete nextBody\.speakers/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS track_speakers/);
});

test('v187 upload/edit UI uses React state directly and sends ordered speaker names', () => {
  assert.match(upload, /coSpeakers/);
  assert.match(upload, /MAX_TRACK_SPEAKERS/);
  assert.match(upload, /speakers: resolvedSpeakers/);
  assert.match(upload, /增加共同演講者/);
  assert.match(upload, /共同演講者/);
  assert.doesNotMatch(upload, /MutationObserver/);
});
