import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflows = [
  ['starry-id-health-repair.yml', 'REPAIR_STARRY_ID_PRODUCTION'],
  ['starry-id-migrate.yml', 'MIGRATE_STARRY_ID_PRODUCTION'],
  ['starry-id-provision.yml', 'PROVISION_STARRY_ID_PRODUCTION'],
  ['starry-id-spouse-backfill.yml', 'BACKFILL_STARRY_ID_PRODUCTION'],
];

for (const [filename, phrase] of workflows) {
  test(`${filename} requires main + manual approval and cannot run on push`, () => {
    const workflow = readFileSync(`.github/workflows/${filename}`, 'utf8');
    assert.doesNotMatch(workflow, /^  push:/m);
    assert.match(workflow, /^  workflow_dispatch:/m);
    assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
    assert.ok(workflow.includes(`inputs.approval_phrase == '${phrase}'`));
  });
}
