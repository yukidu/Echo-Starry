/**
 * A03 real-SQLite proof bridge; picked up by existing Regression audit
 * tests/*.test.ts loop. No production resources, no fake in-memory ledger.
 * Python executes SQL extracted verbatim from the Worker-callable module,
 * against an on-disk SQLite file with concurrent independent connections.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('AI3 A03: run 32 real SQLite transaction tests and save complete original output', () => {
  const env = Object.fromEntries(
    Object.entries({ ...process.env, NODE_OPTIONS: '' })
      .filter(([key]) => !key.startsWith('NODE_TEST_'))
  );
  const run = spawnSync('python3', ['-u', 'tests/ai3-a03/test_ledger.py'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024, env,
  });
  console.log('\nAI3_A03_REAL_SQLITE_STDOUT_BEGIN\n' + (run.stdout ?? '') +
    '\nAI3_A03_REAL_SQLITE_STDOUT_END');
  console.log('\nAI3_A03_REAL_SQLITE_STDERR_BEGIN\n' + (run.stderr ?? '') +
    '\nAI3_A03_REAL_SQLITE_STDERR_END');
  assert.equal(run.error, undefined, String(run.error));
  assert.equal(run.status, 0, 'Real SQLite Python runner must exit zero');
  assert.match(run.stderr, /Ran 32 tests in [\d.]+s/);
  assert.match(run.stderr, /\nOK\s*$/);
  assert.doesNotMatch(run.stderr, /FAIL|ERROR/);
});
