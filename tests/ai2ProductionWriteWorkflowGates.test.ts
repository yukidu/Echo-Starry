import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const productionWorkflows: readonly [string, string][] = [
  ['starry-id-health-repair.yml', 'REPAIR_STARRY_ID_PRODUCTION'],
  ['starry-id-migrate.yml', 'MIGRATE_STARRY_ID_PRODUCTION'],
  ['starry-id-provision.yml', 'PROVISION_STARRY_ID_PRODUCTION'],
  ['starry-id-spouse-backfill.yml', 'BACKFILL_STARRY_ID_PRODUCTION'],
  ['starbeauty-deploy.yml', 'DEPLOY_STARBEAUTY_PRODUCTION'],
  ['starry-id-private-report-export.yml', 'EXPORT_STARRY_ID_PRIVATE_REPORT'],
];

for (const [filename, approval] of productionWorkflows) {
  test(`AI2/B ${filename}: production workflow is gated and never auto-runs`, () => {
    const source = readFileSync(`.github/workflows/${filename}`, 'utf8');
    assert.doesNotMatch(source, /^  push:/m, 'main push must never run production workflow');
    assert.doesNotMatch(source, /^  schedule:/m, 'cron must never run production workflow');
    assert.match(source, /^  workflow_dispatch:/m, 'manual trigger required');
    assert.match(source, /github\.ref == 'refs\/heads\/main'/, 'only main can be used');
    assert.ok(source.includes(`inputs.approval_phrase == '${approval}'`), 'exact typed phrase required');
    assert.match(source, /^    environment: starry-production-write$/m, 'protected environment required');
    assert.match(source, /secrets\.STARRY_PRODUCTION_WRITE_APPROVAL_KEY/, 'separate approval secret required');
    assert.match(source, /if \[ -z "\$\{STARRY_PRODUCTION_WRITE_APPROVAL_KEY:-\}" \]/, 'missing key must fail closed');
    const approvalStep = source.indexOf('Verify independent production approval gate');
    const checkoutStep = source.indexOf('actions/checkout@');
    assert.ok(approvalStep !== -1 && checkoutStep > approvalStep, 'approval must be checked first');
  });
}

test('AI2/B all production write gates are independently documented', () => {
  assert.equal(new Set(productionWorkflows.map(([filename]) => filename)).size, productionWorkflows.length);
  assert.equal(new Set(productionWorkflows.map(([,approval]) => approval)).size, productionWorkflows.length);
});
