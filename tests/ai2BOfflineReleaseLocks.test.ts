import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { a03Reserve, a03ClaimWithoutSending } from '../worker/starryAiA03OfflineLedger';
import { guardedStatistics, guardedExport } from '../ai5-a03/privateStatisticsGate';
import type { Ports, Policy, RequestScope } from '../ai5-a03/privateStatisticsGate';

// Defense in depth for this isolated PR only. These tests DO NOT authenticate
// real users or prove cross-Worker safety. Production activation is not approved.
test('AI2 B: AI3 local fee ledger cannot reserve or claim without explicit enablement', async () => {
  const reserve = await a03Reserve(undefined, undefined, {} as never);
  const claim = await a03ClaimWithoutSending(undefined, undefined, {} as never);
  assert.deepEqual(reserve, { allowed: false, reason: 'A03_DISABLED', providerCalls: 0 });
  assert.deepEqual(claim, { allowed: false, reason: 'A03_DISABLED', providerCalls: 0 });
});

test('AI2 B: AI5 statistics and CSV export return zero bytes when disabled', async () => {
  const request: RequestScope = {
    subjectId: 'test-subject', sessionId: 'test-session', appId: 'echo',
    reportId: 'test-report', action: 'stats.private.read', nonce: 'test-nonce'
  };
  const policy: Policy = { enabled: false, quotaKnown: false, minimumCohort: 5, maxRows: 50 };
  const unexpected = async (): Promise<never> => { throw new Error('disabled feature accessed authority/data'); };
  const ports: Ports = {
    check: unexpected,
    claimOnce: async () => { throw new Error('disabled feature claimed export'); },
    load: unexpected, now: () => 1000
  };
  assert.deepEqual(await guardedStatistics(request, policy, ports), { status: 'DENY', bytes: '' });
  assert.deepEqual(
    await guardedExport({ ...request, action: 'stats.report.export' }, policy, ports),
    { status: 'DENY', bytes: '' }
  );
});

test('AI2 B: staging A03 modules are not wired into the live Worker entrypoints', () => {
  for (const path of [
    'worker/starryMainInlineLoginRouter.ts',
    'worker/starryIdCentralRouter.ts'
  ]) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /starryAiA03OfflineLedger|ai5-a03\/privateStatisticsGate|ai6A03AuthorityContract|ai7A03RestoreEvidence/);
  }
});

test('AI2 B: Cloudflare production config uses exact current entrypoint, never A03 prototypes', () => {
  const config = readFileSync('wrangler.toml', 'utf8');
  assert.match(config, /main = "worker\/starryMainInlineLoginRouter\.ts"/);
  assert.doesNotMatch(config, /main\s*=.*(?:A03|ai5-a03)/);
});
