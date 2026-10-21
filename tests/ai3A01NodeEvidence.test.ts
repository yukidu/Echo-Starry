// AI3 A01: make existing regression runner execute the actual isolated .mjs file.
// No production imports, no network calls, no paid Provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('AI3 A01: execute 30 synthetic Node tests with complete TAP stdout/stderr', () => {
  const file = fileURLToPath(new URL('./ai3-s-next-a01-offline.test.mjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], {
    encoding: 'utf8', timeout: 120_000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  process.stdout.write('\nAI3_A01_CHILD_NODE_STDOUT_BEGIN\n' + (result.stdout ?? '') + '\nAI3_A01_CHILD_NODE_STDOUT_END\n');
  process.stderr.write('\nAI3_A01_CHILD_NODE_STDERR_BEGIN\n' + (result.stderr ?? '') + '\nAI3_A01_CHILD_NODE_STDERR_END\n');
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, 'synthetic child node --test must exit zero');
  assert.match(result.stdout, /# tests 30(?:\r?\n|$)/);
  assert.match(result.stdout, /# pass 30(?:\r?\n|$)/);
  assert.match(result.stdout, /# fail 0(?:\r?\n|$)/);
});
