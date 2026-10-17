import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wrangler = readFileSync('wrangler.toml', 'utf8');
const workflow = readFileSync('worker/transcriptWorkflowV282.ts', 'utf8');
const server = readFileSync('container/audio-segmenter/server.mjs', 'utf8');
const entry = readFileSync('worker/starryMainAudioSegmenterEntry.ts', 'utf8');

test('v282 keeps the original safe router as default entry', () => {
  assert.match(entry, /export \{ default \} from '\.\/starryMainInlineLoginRouter'/);
});

test('v282 uses ffmpeg time-based segments instead of byte slicing', () => {
  assert.match(server, /spawn\('ffmpeg'/);
  assert.match(server, /'-ss'/);
  assert.match(server, /'-t'/);
  assert.doesNotMatch(workflow, /CHUNK_BYTES/);
  assert.match(workflow, /SEGMENT_SECONDS = 180/);
});

test('v282 binds a durable-object container and new transcript workflow entry', () => {
  assert.match(wrangler, /AUDIO_SEGMENTER/);
  assert.match(wrangler, /AudioSegmenterContainer/);
  assert.match(wrangler, /worker\/starryMainAudioSegmenterEntry\.ts/);
  assert.match(entry, /TranscriptWorkflow.*transcriptWorkflowV282/);
});

test('v282 stores json txt and vtt transcript formats', () => {
  assert.match(workflow, /transcript\.json/);
  assert.match(workflow, /transcript\.txt/);
  assert.match(workflow, /transcript\.vtt/);
  assert.match(workflow, /toVtt\(segments\)/);
});
