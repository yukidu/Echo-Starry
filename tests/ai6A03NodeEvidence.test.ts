import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('AI6 A03 committed cross-App authority contract executes with Node runner', () => {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NODE_TEST_')));
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/ai6A03AuthorityContract.test.mjs'], {
    cwd: new URL('../', import.meta.url).pathname,
    encoding: 'utf8',
    env,
    timeout: 30000,
  });
  console.log('AI6_A03_NODE_STDOUT_BEGIN');
  console.log(result.stdout ?? '');
  console.log('AI6_A03_NODE_STDOUT_END');
  console.log('AI6_A03_NODE_STDERR_BEGIN');
  console.log(result.stderr ?? '');
  console.log('AI6_A03_NODE_STDERR_END');
  console.log('AI6_A03_EXIT_CODE', result.status);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /# tests 21\b/);
  assert.match(result.stdout, /# pass 21\b/);
  assert.match(result.stdout, /# fail 0\b/);
  assert.match(result.stdout, /# skipped 0\b/);
});
