import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * G1: regression guard for six privileged GitHub workflows.
 * Does NOT prove real GitHub Environment reviewer or Cloudflare controls.
 * These tests never dispatch production workflows.
 */
const CF = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'] as const;
const LINE = ['LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN'] as const;
const definitions = [
  { file: 'starry-id-health-repair.yml', phrase: 'REPAIR_STARRY_ID_PRODUCTION', job: 'repair-and-verify',
    privileged: ['Verify Cloudflare credentials', 'Capture immediate pre-repair D1 recovery point',
      'Execute controlled central health repair', 'Install central database protections',
      'Deep verify repaired central database'].map(name => ({ name, keys: CF })) },
  { file: 'starry-id-migrate.yml', phrase: 'MIGRATE_STARRY_ID_PRODUCTION', job: 'migrate',
    privileged: ['Verify Cloudflare credentials', 'Migrate EchoStars member profiles to Starry ID',
      'Migrate EchoStars sticker ledger to central battery ledger',
      'Retire verified legacy sticker ledger'].map(name => ({ name, keys: CF })) },
  { file: 'starry-id-provision.yml', phrase: 'PROVISION_STARRY_ID_PRODUCTION', job: 'provision-and-audit',
    privileged: ['Detect Cloudflare credentials',
      'Provision central D1 and audit source members'].map(name => ({ name, keys: CF })) },
  { file: 'starry-id-spouse-backfill.yml', phrase: 'BACKFILL_STARRY_ID_PRODUCTION', job: 'backfill-and-verify',
    privileged: ['Validate one-time backfill before production access',
      'Capture immediate pre-backfill D1 recovery point',
      'Backfill exactly three approved spouse groups and verify'].map(name => ({ name, keys: CF })) },
  { file: 'starbeauty-deploy.yml', phrase: 'DEPLOY_STARBEAUTY_PRODUCTION', job: 'deploy',
    privileged: [{ name: 'Verify Cloudflare credentials', keys: CF },
      { name: 'Provision D1 and R2', keys: CF }, { name: 'Deploy Worker', keys: CF },
      { name: 'Configure LINE secrets when present', keys: [...CF, ...LINE] }] },
  { file: 'starry-id-private-report-export.yml', phrase: 'EXPORT_STARRY_ID_PRIVATE_REPORT',
    job: 'export-encrypted-report',
    privileged: ['Validate read-only exporter',
      'Read duplicate distributor groups only'].map(name => ({ name, keys: CF })) }
] as const;
type Definition = typeof definitions[number];
const privilegedKeys = new Set<string>([...CF, ...LINE]);

function inspectWorkflow(source: string, definition: Definition): string[] {
  const errors: string[] = [];
  const triggers = source.match(/^on:\r?\n([\s\S]*?)(?=^(?:permissions|concurrency|env|jobs):)/m)?.[1] ?? '';
  const events = Array.from(triggers.matchAll(/^  ([\w-]+):/gm), m => m[1]);
  if (events.join(',') !== 'workflow_dispatch') errors.push('unexpected automatic event');
  if (!triggers.includes('approval_phrase:') || !triggers.includes('required: true')) errors.push('missing required input');
  if (!source.includes('    if: ' + '$' + "{{ github.ref == 'refs/heads/main' && inputs.approval_phrase == '" + definition.phrase + "' }}"))
    errors.push('missing exact main and phrase condition');
  if (!source.includes('    environment: starry-production-write')) errors.push('missing protected environment');
  if (!source.includes('  group: starry-production-write') ||
      !source.includes('  cancel-in-progress: false')) errors.push('missing shared noncancelling lock');
  if (!source.includes('permissions:\n  contents: read')) errors.push('permissions too broad or missing');
  const jobs = source.slice(source.indexOf('\njobs:\n') + 7);
  const names = Array.from(jobs.matchAll(/^  ([\w-]+):\s*$/gm), m => m[1]);
  if (names.length !== 1 || names[0] !== definition.job) errors.push('unexpected privileged job');

  const stepStart = source.indexOf('    steps:\n');
  if (stepStart < 0) return [...errors, 'missing steps'];
  const header = source.slice(0, stepStart);
  if (/secrets\.(?:CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID|LINE_CHANNEL_SECRET|LINE_CHANNEL_ACCESS_TOKEN)/.test(header))
    errors.push('production credentials exposed at workflow/job scope');
  const steps = source.slice(stepStart + '    steps:\n'.length)
    .split(/(?=^      - )/m).filter(Boolean);
  const first = steps[0] ?? '';
  if (!first.startsWith('      - name: Verify independent production approval gate\n') ||
      !first.includes('secrets.STARRY_PRODUCTION_WRITE_APPROVAL_KEY') ||
      !first.includes('exit 1')) errors.push('approval must fail closed before checkout/install');
  const expected = new Map<string, readonly string[]>(
    definition.privileged.map(step => [step.name, step.keys])
  );
  for (const step of steps) {
    const name = step.match(/^      - name: ([^\n]+)\n/)?.[1] ?? '';
    const actualKeys = Array.from(step.matchAll(/^          ([A-Z_]+):\s*\$\{\{ secrets\.([A-Z_]+) \}\}$/gm))
      .filter(match => privilegedKeys.has(match[1]) || privilegedKeys.has(match[2]))
      .map(match => {
        if (match[1] !== match[2]) errors.push('credential key mismatch: ' + name);
        return match[1];
      });
    if (actualKeys.length && !expected.has(name)) errors.push('unapproved credential step: ' + name);
    if (expected.has(name)) {
      const wanted = expected.get(name) ?? [];
      if (actualKeys.slice().sort().join(',') !== wanted.slice().sort().join(','))
        errors.push('missing or extra scoped credentials: ' + name);
    }
  }
  return errors;
}

test('G1 registers each sensitive workflow and approval phrase exactly once', () => {
  assert.equal(new Set(definitions.map(d => d.file)).size, 6);
  assert.equal(new Set(definitions.map(d => d.phrase)).size, 6);
});
for (const definition of definitions) {
  const content = readFileSync('.github/workflows/' + definition.file, 'utf8');
  test('G1 ' + definition.file + ' is manually gated and scopes production credentials', () => {
    assert.deepEqual(inspectWorkflow(content, definition), []);
  });
  test('G1 ' + definition.file + ' detects reintroduced automatic runs', () => {
    const mutated = content.replace('  workflow_dispatch:', '  push:\n    branches: [main]\n  workflow_dispatch:');
    assert.ok(inspectWorkflow(mutated, definition).includes('unexpected automatic event'));
  });
  test('G1 ' + definition.file + ' rejects unapproved branches', () => {
    const mutated = content.replace('refs/heads/main', 'refs/heads/preview');
    assert.ok(inspectWorkflow(mutated, definition).includes('missing exact main and phrase condition'));
  });
  test('G1 ' + definition.file + ' rejects unprotected jobs', () => {
    const mutated = content.replace('    environment: starry-production-write', '    environment: staging');
    assert.ok(inspectWorkflow(mutated, definition).includes('missing protected environment'));
  });
  test('G1 ' + definition.file + ' prevents credentials from reaching install steps', () => {
    const mutated = content.replace('    steps:\n', '    env:\n      CLOUDFLARE_API_TOKEN: ' +
      '$' + '{{ secrets.CLOUDFLARE_API_TOKEN }}\n    steps:\n');
    assert.ok(inspectWorkflow(mutated, definition).includes('production credentials exposed at workflow/job scope'));
  });
  test('G1 ' + definition.file + ' requires credentials on approved steps only', () => {
    const step = definition.privileged[0];
    const start = '      - name: ' + step.name + '\n        env:\n';
    const mutated = content.replace(start, '      - name: ' + step.name + '\n');
    assert.ok(inspectWorkflow(mutated, definition).some(error => error.startsWith('missing or extra scoped credentials')));
  });
  test('G1 ' + definition.file + ' requires approvals before any command', () => {
    const mutated = content.replace('Verify independent production approval gate', 'Skipped approval gate');
    assert.ok(inspectWorkflow(mutated, definition).includes('approval must fail closed before checkout/install'));
  });
}
