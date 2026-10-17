import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wrangler = readFileSync('wrangler.toml', 'utf8');
const workflow = readFileSync('worker/transcriptWorkflowV282.ts', 'utf8');
const server = readFileSync('container/audio-segmenter/server.mjs', 'utf8');
const entry = readFileSync('worker/starryMainInlineLoginRouter.ts', 'utf8');
const segmenter = readFileSync('worker/audioSegmenterContainer.ts', 'utf8');

test('v282 keeps the audited safe router as the production entry', () => {
  assert.match(wrangler, /main\s*=\s*"worker\/starryMainInlineLoginRouter\.ts"/);
});

test('v282 uses ffmpeg time-based segments instead of byte slicing', () => {
  assert.match(server, /spawn\('ffmpeg'/);
  assert.match(server, /'-ss'/);
  assert.match(server, /'-t'/);
  assert.doesNotMatch(workflow, /CHUNK_BYTES/);
  assert.match(workflow, /SEGMENT_SECONDS = 180/);
});

test('v282 waits for container running before opening its port', () => {
  const waitIndex = segmenter.indexOf('&& !container.running');
  const portIndex = segmenter.indexOf('container.getTcpPort(PORT)');
  assert.ok(waitIndex >= 0, 'must wait for container.running');
  assert.ok(portIndex > waitIndex, 'getTcpPort must happen only after running wait');
});

test('v282 binds a durable-object container and new transcript workflow through safe entry', () => {
  assert.match(wrangler, /AUDIO_SEGMENTER/);
  assert.match(wrangler, /AudioSegmenterContainer/);
  assert.match(entry, /TranscriptWorkflow.*transcriptWorkflowV282/);
  assert.match(entry, /AudioSegmenterContainer.*audioSegmenterContainer/);
});

test('v282 stores json txt and vtt transcript formats', () => {
  assert.match(workflow, /transcript\.json/);
  assert.match(workflow, /transcript\.txt/);
  assert.match(workflow, /transcript\.vtt/);
  assert.match(workflow, /toVtt\(segments\)/);
});
