import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../src/components/ProfileModal.tsx', import.meta.url), 'utf8');

test('profile modal receives the loaded member list so upline autocomplete is not empty', () => {
  assert.match(app, /<ProfileModal[\s\S]*allUsers=\{allUsers\}/);
  assert.match(app, /isProfileOpen[\s\S]*fetchAllUsers\(\)/);
});

test('platinum and diamond fields show related member and existing-upline suggestions while typing or focusing', () => {
  assert.match(profile, /const platinumSuggestions = useMemo/);
  assert.match(profile, /if \(u\.platinumUpline\) set\.add\(u\.platinumUpline\)/);
  assert.match(profile, /const diamondSuggestions = useMemo/);
  assert.match(profile, /if \(u\.diamondUpline\) set\.add\(u\.diamondUpline\)/);
  assert.match(profile, /setActiveSuggestField\('platinum'\)/);
  assert.match(profile, /setActiveSuggestField\('diamond'\)/);
  assert.match(profile, /activeSuggestField === 'platinum' && platinumSuggestions\.length > 0/);
  assert.match(profile, /activeSuggestField === 'diamond' && diamondSuggestions\.length > 0/);
  assert.match(profile, /setPlatinumUpline\(nameItem\)/);
  assert.match(profile, /setDiamondUpline\(nameItem\)/);
});
