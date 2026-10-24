import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('AI4 A02 isolated Python candidate runs on frozen A01 fixture', () => {
  const result = spawnSync('python3', ['tests/ai4-snext-a02/candidate.py'], {
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  console.log('AI4_A02_PYTHON_STDOUT_BEGIN');
  console.log(result.stdout);
  console.log('AI4_A02_PYTHON_STDOUT_END');
  console.log('AI4_A02_PYTHON_STDERR_BEGIN');
  console.log(result.stderr);
  console.log('AI4_A02_PYTHON_STDERR_END');
  console.log('AI4_A02_PYTHON_EXIT_CODE', result.status);
  assert.equal(result.status, 0, 'offline Python runner must exit 0');
  assert.match(result.stdout, /TOTAL \| 100 \|/);
  assert.match(result.stdout, /NO_SOURCE=10 ABSTENTION_NOT_IMPLEMENTED_NOT_VERIFIED/);
  assert.match(result.stdout, /REVOKED_EXCLUDED=10\/10 CORPUS_ONLY_NOT_AUTHORIZATION/);
  assert.match(result.stdout, /PRODUCT_SEARCH=NOT_TESTED/);
});
