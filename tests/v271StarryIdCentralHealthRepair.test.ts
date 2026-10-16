import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const repair = readFileSync('starry-id/repairCentralHealth.mjs','utf8');
const verify = readFileSync('starry-id/verifyCentralHealth.mjs','utf8');
const guards = readFileSync('starry-id/migrations/20261016_central_health_guards.sql','utf8');
const workflow = readFileSync('.github/workflows/starry-id-health-repair.yml','utf8');
const provision = readFileSync('starry-id/provision-and-audit.sh','utf8');

test('v271 repair is gated to main and captures a D1 recovery point first', () => {
  assert.match(workflow, /branches: \[main\]/);
  const backup = workflow.indexOf('Capture immediate pre-repair D1 recovery point');
  const repairStep = workflow.indexOf('Execute controlled central health repair');
  assert.ok(backup >= 0 && repairStep > backup);
});

test('v271 follows chosen orphan battery policy without changing immutable deltas', () => {
  assert.match(repair, /legacy_links/);
  assert.match(repair, /usersWithoutSafeMapping/);
  assert.match(repair, /DELETE FROM battery_transactions WHERE userId=\?/);
  assert.match(repair, /UPDATE battery_transactions SET userId=\?/);
  assert.doesNotMatch(repair, /UPDATE battery_transactions SET deltaUnits/);
});

test('v271 safely repairs deterministic profile anomalies and does not guess birthdays', () => {
  assert.match(repair, /oldValue !== '未填寫'/);
  assert.match(repair, /rankAuditStatus='approved'/);
  assert.match(repair, /candidates\.size === 1/);
  assert.match(repair, /birthdaysLeftForReview/);
});

test('v271 duplicate distributor report is encrypted before upload', () => {
  assert.match(workflow, /openssl enc -aes-256-cbc/);
  assert.match(workflow, /openssl pkeyutl -encrypt/);
  assert.match(workflow, /rm -f "\$private"/);
  assert.doesNotMatch(workflow, /starry-id\/audit-output\/duplicate-amway-private\.json\n/);
  assert.match(workflow, /duplicate-amway-private\.json\.enc/);
});

test('v271 guards reject future orphan rows and protect central user deletion', () => {
  for (const table of ['starry_notifications','card_visit_events','starry_push_subscriptions','battery_transactions','battery_accounts','battery_hundredth_transactions']) {
    assert.match(guards, new RegExp(table));
  }
  assert.match(guards, /central_user_reference_missing/);
  assert.match(guards, /guard_users_central_dependents_delete/);
  assert.match(guards, /central_user_has_dependent_data/);
});

test('v271 verification checks database integrity, orphan rows, balances and guards', () => {
  assert.match(verify, /PRAGMA quick_check/);
  assert.match(verify, /PRAGMA foreign_key_check/);
  assert.match(verify, /orphanBatteryTransactions/);
  assert.match(verify, /runningBalanceMismatches/);
  assert.match(verify, /missingProtectionTriggers/);
});

test('v271 provisioning always reapplies battery schema and central guards', () => {
  assert.match(provision, /20261015_battery_ledger\.sql/);
  assert.match(provision, /20261015_battery_hundredth_rewards\.sql/);
  assert.match(provision, /20261016_central_health_guards\.sql/);
});
