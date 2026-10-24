import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const A02_SOURCE = 'tests/ai4-snext-a02/candidate.py';
const FROZEN_CASES = 'tests/ai4-snext-a01/synthetic-120.json';
// AI2-only baseline correctness repair; original AI4 A02 blob was 9c029ff6a130aa18a58423a83271c53e6cf8d481.
const SOURCE_BLOB = '3c83e2c9bf42fb353b220ff59da6c4f0edb7a92f';
const CASES_BLOB = '93bf9fcb0b793a7d9904b85ce5ed699b0a906549';

function gitBlobSha(path: string) {
  const bytes = readFileSync(path);
  return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
}

test('AI4 A03: execute exact AI2 repaired-baseline A02 candidate and frozen A01 data on GitHub runner', { timeout: 360_000 }, () => {
  assert.equal(gitBlobSha(A02_SOURCE), SOURCE_BLOB, 'the integrated Python source MUST be byte-identical to the AI2 reviewed GitHub blob');
  assert.equal(gitBlobSha(FROZEN_CASES), CASES_BLOB, 'the A01 synthetic fixture MUST be byte-identical to its frozen GitHub blob');

  const proc = spawnSync('python3', [A02_SOURCE], {
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  console.log('AI4_A03_EXACT_A02_SOURCE_BLOB', SOURCE_BLOB);
  console.log('AI4_A03_EXACT_A01_FIXTURE_BLOB', CASES_BLOB);
  console.log('AI4_A03_CHILD_PYTHON_STDOUT_BEGIN');
  console.log(proc.stdout ?? '');
  console.log('AI4_A03_CHILD_PYTHON_STDOUT_END');
  console.log('AI4_A03_CHILD_PYTHON_STDERR_BEGIN');
  console.log(proc.stderr ?? '');
  console.log('AI4_A03_CHILD_PYTHON_STDERR_END');
  console.log('AI4_A03_CHILD_PYTHON_EXIT_CODE', proc.status, 'signal', proc.signal, 'error', proc.error?.message ?? '(none)');
  assert.equal(proc.status, 0, 'the integrated AI2 candidate runner must succeed');

  const row = /TOTAL \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+)/.exec(proc.stdout ?? '');
  assert.ok(row, 'required before/after totals must actually be printed by Python');
  const [total, old1, old5, new1, new5] = row.slice(1).map(Number);
  console.log('AI4_A03_EXACT_COUNTS', JSON.stringify({ total, old1, old5, new1, new5 }));
  console.log('AI4_A03_CANDIDATE_90_GATE', new5 >= 90 ? 'CANDIDATE_ONLY_PASS_NOT_BLIND' : 'FAIL');
  assert.equal(total, 100);
  // The existing A01 tool ran on the exact same frozen cases and reported 54/66.
  // If A02's "before" differs, do not publish an apparently valid before/after comparison.
  assert.equal(old1, 54, 'A02 before/after Top-1 MUST reproduce frozen A01, otherwise comparison FAIL');
  assert.equal(old5, 66, 'A02 before/after Top-5 MUST reproduce frozen A01, otherwise comparison FAIL');
  assert.match(proc.stdout, /NO_SOURCE=10 ABSTENTION_NOT_IMPLEMENTED_NOT_VERIFIED/);
  assert.match(proc.stdout, /REVOKED_EXCLUDED=10\/10 CORPUS_ONLY_NOT_AUTHORIZATION/);
  assert.match(proc.stdout, /THIRD_PARTY_BLIND=NOT_VERIFIED/);
});
