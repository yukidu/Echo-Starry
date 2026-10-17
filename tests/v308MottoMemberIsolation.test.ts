import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const crown = readFileSync(new URL('../src/taiwanCrownMenuLink.ts', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../src/components/ProfileModal.tsx', import.meta.url), 'utf8');
const central = readFileSync(new URL('../worker/starryIdCentralRouter.ts', import.meta.url), 'utf8');
const section = crown.slice(crown.indexOf('function syncProfileMottoFields() {'), crown.indexOf('function renderCrownPageIfOpen()'));

test('only the signed-in user profile is eligible for legacy motto injection', () => {
  assert.match(section, /document\.querySelector<HTMLElement>\('\.profile-page'\)/);
  assert.match(section, /ownProfile\.querySelectorAll<HTMLElement>\('span, label'\)/);
  assert.doesNotMatch(section, /document\.querySelectorAll<HTMLElement>\('span, label'\)/);
});

test('native profile motto takes precedence and old injected notes are cleaned up', () => {
  assert.match(section, /data-profile-motto-primary/);
  assert.match(section, /data-profile-motto-readonly/);
  assert.match(section, /if \(!ownProfile\?\.contains\(node\) \|\| hasNativeMotto\) node\.remove\(\)/);
  assert.match(section, /if \(!ownProfile \|\| hasNativeMotto\) return/);
  assert.match(profile, /currentUser\.motto \|\| '未填寫'/);
});

test('central profile data continues to be read per member, not from the viewer', () => {
  assert.match(central, /p\.motto/);
  assert.match(central, /motto: row\.motto \|\| ''/);
  assert.match(crown, /quote\.textContent = `“ \$\{person\.quote\}`/);
});
