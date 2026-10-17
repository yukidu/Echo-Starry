import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('v300 sentence policy uses semantic punctuation, Whisper VAD pause boundaries, then a 12-character fallback', () => {
  const gateway = read('worker/transcriptV281Gateway.ts');
  assert.match(gateway, /MAX_SENTENCE_CHARS\s*=\s*12/);
  assert.match(gateway, /MIN_SOFT_BREAK_CHARS\s*=\s*5/);
  assert.match(gateway, /PAUSE_BREAK_SECONDS\s*=\s*0\.35/);
  assert.match(gateway, /語意標點優先/);
  assert.match(gateway, /Whisper\/VAD/);
  assert.match(gateway, /12 字上限作最後保險/);
  assert.match(gateway, /order:\s*\['semantic-punctuation','whisper-vad-pause-boundary','12-character-fallback'\]/);
  assert.match(gateway, /hardBreaks:\s*'。！？!\?；;'/);
  assert.match(gateway, /softBreaks:\s*'，,、：:'/);
  assert.match(gateway, /sourcePauseAfterSeconds/);
  assert.match(gateway, /sourcePauseBoundary/);
});

test('v300 future Chinese transcripts restore natural semantic punctuation without rewriting spoken content', () => {
  const workflow = read('worker/transcriptWorkflowV282.ts');
  assert.match(workflow, /restore natural Taiwan Chinese punctuation from the spoken meaning and phrasing/);
  assert.match(workflow, /Do not add, remove, paraphrase, summarize, translate or reorder spoken content/);
  assert.match(workflow, /use question marks only for actual questions/);
  assert.match(workflow, /vad_filter:\s*true/);
  assert.match(workflow, /version:\s*5/);
});
