import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Independent holdout hard gate. A failure must NOT be reclassified as PASS
// simply because other offline regression tests succeed.
test('AI2 A04: new synthetic holdout must achieve >=90% Top-5 AND refuse all no-source questions', { timeout: 180_000 }, () => {
  const result = spawnSync('python3', ['tests/ai2-a04/evaluate_holdout.py'], {
    encoding: 'utf8',
    timeout: 150_000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  console.log('AI2_A04_PYTHON_STDOUT_BEGIN');
  console.log(result.stdout ?? '');
  console.log('AI2_A04_PYTHON_STDOUT_END');
  console.log('AI2_A04_PYTHON_STDERR_BEGIN');
  console.log(result.stderr ?? '');
  console.log('AI2_A04_PYTHON_STDERR_END');
  console.log('AI2_A04_PYTHON_EXIT_CODE', result.status, 'signal', result.signal);
  assert.ifError(result.error);

  const line = (result.stdout ?? '').split('\n').find(line => line.startsWith('AI2_A04_HOLDOUT_RESULT='));
  assert.ok(line, 'must produce real holdout score with exact pinned candidate and fixture');
  const score = JSON.parse(line.slice('AI2_A04_HOLDOUT_RESULT='.length));
  assert.equal(score.cases, 50);
  assert.equal(score.answerable, 40);
  assert.equal(score.noSource, 10);
  assert.equal(score.thirdPartyBlind, 'NOT_VERIFIED', 'synthetic cannot be called third-party validation');
  assert.equal(score.liveAuthorization, 'NOT_VERIFIED');
  // Require both source-grounded quality and explicit safe refusal, otherwise fail.
  assert.equal(result.status, 0, 'release blocker: independent synthetic holdout quality/abstention is NOT approved');
  assert.equal(score.gate, 'PASS_SYNTHETIC_ONLY');
});
