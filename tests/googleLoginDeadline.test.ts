import test from 'node:test';
import assert from 'node:assert/strict';
import { withGoogleLoginDeadline } from '../src/googleLoginDeadline';
import { readFileSync } from 'node:fs';

test('stalled request times out, aborts and allows a fresh attempt', async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(withGoogleLoginDeadline(s => {
    signal = s;
    return new Promise(() => {});
  }, 10), /登入連線逾時/);
  assert.equal(signal?.aborted, true);
  assert.equal(await withGoogleLoginDeadline(async () => 'verified', 10), 'verified');
});
test('response body stalls are bounded even when transport ignores abort', async () => {
  await assert.rejects(withGoogleLoginDeadline(async () => {
    await Promise.resolve();
    return new Promise(() => {});
  }, 10), /逾時/);
});
test('success and verification failures retain their original outcome', async () => {
  assert.equal(await withGoogleLoginDeadline(async () => 42, 100), 42);
  await assert.rejects(withGoogleLoginDeadline(async () => { throw new Error('invalid credential'); }, 100), /invalid credential/);
});
test('verified login does not wait for optional playback import and always releases its lock', () => {
  const bridge = readFileSync(new URL('../src/googleIdentityBridge.ts', import.meta.url), 'utf8');
  const login = bridge.slice(bridge.indexOf('async function handleGoogleCredential'), bridge.indexOf('function ensureGoogleInitialized'));
  assert.match(login, /if \(loginInFlight\) return/);
  assert.match(login, /withGoogleLoginDeadline/);
  assert.doesNotMatch(login, /await claimLocalPlayback/);
  assert.match(login, /finally \{\s*loginInFlight = false/);
});
