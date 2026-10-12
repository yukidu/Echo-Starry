import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profile = readFileSync(new URL('../src/components/ProfileModal.tsx', import.meta.url), 'utf8');
const router = readFileSync(new URL('../worker/organizationRouter.ts', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../src/components/UplineManagement.tsx', import.meta.url), 'utf8');

test('profile upline autocomplete reads the same canonical names maintained by Admin > 上手名單', () => {
  assert.match(admin, /\/api\/admin\/uplines/);
  assert.match(router, /\/api\/organization\/upline-suggestions/);
  assert.match(router, /SELECT kind,name FROM upline_names/);
  assert.match(profile, /fetch\('\/api\/organization\/upline-suggestions'/);
  assert.match(profile, /uplineDirectory\.platinum\.filter/);
  assert.match(profile, /uplineDirectory\.diamond\.filter/);
  assert.doesNotMatch(profile, /if \(u\.platinumUpline\) set\.add/);
  assert.doesNotMatch(profile, /if \(u\.diamondUpline\) set\.add/);
});

test('platinum and diamond fields still open and apply related-name suggestions', () => {
  assert.match(profile, /setActiveSuggestField\('platinum'\)/);
  assert.match(profile, /setActiveSuggestField\('diamond'\)/);
  assert.match(profile, /activeSuggestField === 'platinum' && platinumSuggestions\.length > 0/);
  assert.match(profile, /activeSuggestField === 'diamond' && diamondSuggestions\.length > 0/);
  assert.match(profile, /setPlatinumUpline\(nameItem\)/);
  assert.match(profile, /setDiamondUpline\(nameItem\)/);
});
