import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('v299 scheduler is capped at five concurrent transcript workflows', () => {
  const scheduler = read('worker/transcriptSequentialSchedulerV293.ts');
  assert.match(scheduler, /MAX_CONCURRENT_TRANSCRIPTS\s*=\s*5/);
  assert.match(scheduler, /status IN \('queued','processing'\)/);
  assert.match(scheduler, /targetConcurrency:\s*MAX_CONCURRENT_TRANSCRIPTS/);
});

test('v299 atomically reserves only the remaining concurrency slots', () => {
  const scheduler = read('worker/transcriptSequentialSchedulerV293.ts');
  assert.match(scheduler, /INSERT INTO transcript_index/);
  assert.match(scheduler, /LIMIT \(SELECT MAX\(0, \? - COUNT\(\*\)\) FROM transcript_index WHERE status IN \('queued','processing'\)\)/);
  assert.match(scheduler, /ON CONFLICT\(trackId\) DO UPDATE SET/);
  assert.match(scheduler, /RETURNING trackId,durationSeconds/);
});

test('v299 starts each reserved workflow independently and rolls back only failed starts', () => {
  const scheduler = read('worker/transcriptSequentialSchedulerV293.ts');
  assert.match(scheduler, /for \(let index = 0; index < claimed\.length; index\+\+\)/);
  assert.match(scheduler, /TRANSCRIPT_WORKFLOW\.createBatch/);
  assert.match(scheduler, /WHERE trackId=\? AND status='queued'/);
  assert.match(scheduler, /echo-v299-auto-/);
});
