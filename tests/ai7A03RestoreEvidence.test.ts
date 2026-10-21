// AI7 A03 isolated runner: Python stdlib SQLite + local fake R2 objects only.
// Called by existing regression CI tests/*.test.ts discovery; no production imports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const here = fileURLToPath(new URL('./ai7_a03/', import.meta.url));
const engine = resolve(here, 'offline_restore.py');
const suite = resolve(here, 'test_offline_restore.py');
const sha256 = (file: string): string => createHash('sha256').update(readFileSync(file)).digest('hex');

test('AI7 A03: execute exactly 50 real local SQLite + fake R2 cases from GitHub checkout', () => {
  const result = spawnSync('python3', [
    '-m', 'unittest', 'discover', '-s', here, '-p', 'test_offline_restore.py', '-v',
  ], {
    encoding: 'utf8', timeout: 120_000, maxBuffer: 5 * 1024 * 1024,
    env: Object.fromEntries(Object.entries({ ...process.env, PYTHONDONTWRITEBYTECODE: '1' })
      .filter(([key]) => !key.startsWith('NODE_TEST_'))),
  });
  console.log('AI7_A03_GITHUB_ENGINE_SHA256=' + sha256(engine));
  console.log('AI7_A03_GITHUB_SUITE_SHA256=' + sha256(suite));
  console.log('AI7_A03_PYTHON_RUNNER_STDOUT_BEGIN\n' + (result.stdout ?? '') + '\nAI7_A03_PYTHON_RUNNER_STDOUT_END');
  console.log('AI7_A03_PYTHON_RUNNER_STDERR_BEGIN\n' + (result.stderr ?? '') + '\nAI7_A03_PYTHON_RUNNER_STDERR_END');
  console.log('AI7_A03_PYTHON_EXIT_CODE=' + String(result.status));
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, 'Python isolated real SQLite+fake R2 runner must exit 0');
  assert.match(result.stderr, /Ran 50 tests in /);
  assert.match(result.stderr, /\nOK\s*$/);
  assert.doesNotMatch(result.stderr, /FAILED \(/);
});
