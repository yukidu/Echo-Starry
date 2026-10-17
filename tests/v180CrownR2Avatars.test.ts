import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ts = readFileSync(new URL('../src/v180CrownR2Avatars.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/v174CrownTruePage.ts', import.meta.url), 'utf8');
const crown = readFileSync(new URL('../src/taiwanCrownMenuLink.ts', import.meta.url), 'utf8');

test('v180 uses zero-padded Success_Crown keys on the current site', () => {
  assert.ok(ts.includes("const CROWN_R2_ORIGIN = '';"));
  assert.ok(ts.includes("const CROWN_R2_FOLDER = 'Success_Crown';"));
  assert.match(ts, /id\.padStart\(2, '0'\)/);
});

test('v180 verifies several supported image extensions before replacing the working avatar', () => {
  assert.match(ts, /R2_IMAGE_EXTENSIONS = \['jpg', 'jpeg', 'png', 'webp', 'JPG', 'JPEG', 'PNG', 'WEBP'\]/);
  assert.match(ts, /await probeImage\(candidate\)/);
  assert.match(ts, /Keep the already-working original image visible/);
  assert.match(ts, /if \(resolved\)[\s\S]*img\.src = resolved/);
  assert.match(ts, /Leave the original avatar untouched if no matching R2 file exists/);
});

test('v180 adds a cache-busting query for replaced R2 objects', () => {
  assert.match(ts, /CROWN_R2_CACHE_BUSTER/);
  assert.match(ts, /\?v=\$\{CROWN_R2_CACHE_BUSTER\}/);
});

test('v180 is loaded after v179', () => {
  assert.match(entry, /import '\.\/v179CrownPolish';[\s\S]*import '\.\/v180CrownR2Avatars';/);
});

test('crown portraits load via local Worker before falling back to the original image', () => {
  assert.match(crown, /function crownR2AvatarUrl\(id: string\)/);
  assert.match(crown, /Success_Crown/);
  assert.match(crown, /id\.padStart\(2, '0'\)/);
  assert.ok(crown.includes('appendAvatar(avatar, crownR2AvatarUrl(person.id), person.name,'));
  assert.ok(crown.includes('if (fallbackSource && !triedFallback)'));
  assert.ok(ts.includes("startsWith('/api/r2/file/Success_Crown%2F')"));
});
