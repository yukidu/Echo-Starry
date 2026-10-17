import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('v299 workflow immediately hands off after success or failure', () => {
  const workflow = read('worker/transcriptWorkflowV282.ts');
  assert.match(workflow, /queueNextTranscriptV293/);
  assert.match(workflow, /queueFollowingTranscript/);
  assert.match(workflow, /includeFailed:\s*false/);
  assert.match(workflow, /queue-next-transcript/);
  assert.match(workflow, /queue-next-after-failure/);
  assert.match(workflow, /status='ready'/);
  assert.match(workflow, /status='failed'/);
});

test('v299 scheduler keeps at most five transcript workflows active and fills empty slots atomically', () => {
  const scheduler = read('worker/transcriptSequentialSchedulerV293.ts');
  assert.match(scheduler, /MAX_CONCURRENT_TRANSCRIPTS\s*=\s*5/);
  assert.match(scheduler, /INSERT OR IGNORE INTO transcript_index/);
  assert.match(scheduler, /UPDATE transcript_index[\s\S]*SET status='queued'/);
  assert.match(scheduler, /LIMIT \(SELECT MAX\(0, \? - COUNT\(\*\)\) FROM transcript_index WHERE status IN \('queued','processing'\)\)/);
  assert.match(scheduler, /RETURNING trackId,durationSeconds/);
  assert.match(scheduler, /echo-v299-auto-/);
  assert.match(scheduler, /targetConcurrency:\s*MAX_CONCURRENT_TRANSCRIPTS/);
});

test('v299 automatic handoff skips failed recordings while watchdog may retry them', () => {
  const scheduler = read('worker/transcriptSequentialSchedulerV293.ts');
  assert.match(scheduler, /type QueueNextOptions/);
  assert.match(scheduler, /includeFailed\?: boolean/);
  assert.match(scheduler, /options\.includeFailed !== false/);
  assert.match(scheduler, /i\.status IN \('pending','failed'\)/);
  assert.match(scheduler, /i\.status='pending'/);
});

test('v299 keeps the 15-minute cron as recovery watchdog', () => {
  const wrangler = read('wrangler.toml');
  assert.match(wrangler, /crons\s*=\s*\["\*\/15 \* \* \* \*"\]/);
});
