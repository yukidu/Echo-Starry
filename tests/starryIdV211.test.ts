import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const router = readFileSync(join(root, 'worker/starryIdV211Router.ts'), 'utf8');
const privacy = readFileSync(join(root, 'worker/privacyCrawlerRouter.ts'), 'utf8');
const schema = readFileSync(join(root, 'starry-id/schema.sql'), 'utf8');
const verifySchema = readFileSync(join(root, 'starry-id/verify-schema.mjs'), 'utf8');
const packageJson = readFileSync(join(root, 'package.json'), 'utf8');
const sw = readFileSync(join(root, 'public/sw.js'), 'utf8');

test('v211 is layered on the existing privacy router instead of replacing the worker entry', () => {
  assert.match(privacy, /handleStarryIdV211/);
  assert.match(privacy, /handleStarryIdCentral/);
  assert.match(privacy, /const starryV211Response = await handleStarryIdV211/);
  assert.match(router, /url\.hostname!==STAR_DOMAIN/);
  assert.match(router, /const STAR_DOMAIN = 'id\.starry\.phd'/);
});

test('electronic cards use formal D1 schema and schema verification', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS public_cards/);
  assert.match(schema, /seq INTEGER PRIMARY KEY AUTOINCREMENT/);
  assert.match(schema, /slug TEXT NOT NULL UNIQUE/);
  assert.match(schema, /cardNumber TEXT NOT NULL UNIQUE/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS profile_field_visibility/);
  assert.match(verifySchema, /'public_cards'/);
  assert.match(verifySchema, /'profile_field_visibility'/);
});

test('non-Amway members get n-number cards while Amway ID controls its own URL slug', () => {
  assert.match(router, /const number = `n\$\{Number\(row\.seq\)\}`/);
  assert.match(router, /\^n\[1-9\]\[0-9\]\*\$/);
  assert.match(router, /const amwaySlug = slugify\(member\.amwayId\)/);
  assert.match(router, /identifierLabel: text\(member\.amwayId\) \? '會員編號 \/ Amway ID' : '電子名片編號'/);
  assert.match(router, /data\.cardUrl = `https:\/\/\$\{STAR_DOMAIN\}\/\$\{card\.slug\}`/);
});

test('field visibility is per-field and defaults only phone and birthday to hidden', () => {
  assert.match(router, /const DEFAULT_HIDDEN = new Set\(\['phone','birthday'\]\)/);
  assert.match(router, /profile_field_visibility/);
  assert.match(router, /visibility\[field\] = !DEFAULT_HIDDEN\.has\(field\)/);
  assert.match(router, /visibility\[row\.fieldName\] = Boolean\(row\.isVisible\)/);
});

test('public visitor card hides owner menu and exposes a floating login only for visitors', () => {
  assert.match(router, /const owner=viewer===card\.userId/);
  assert.match(router, /rows\.filter\(\(\[key\]\)=>owner\|\|visibility\[key\]!==false\)/);
  assert.match(router, /owner\?'<div class="owner"/);
  assert.match(router, /owner\?'':`<a class="login" href="\/">登入 Starry ID<\/a>`/);
  assert.match(router, /\.login\{position:fixed;right:18px;bottom:18px/);
});

test('member center has sticky menu, theme control, hamburger and ecosystem links', () => {
  assert.match(router, /\.topbar\{position:sticky;top:0/);
  assert.match(router, /開燈 \/ 關燈/);
  assert.match(router, /burger\.textContent='☰'/);
  for (const url of ['https://id.starry.phd', 'https://echo.starry.phd', 'https://download.starry.phd', 'https://go.starry.phd']) {
    assert.ok(router.includes(url), `missing ecosystem app link ${url}`);
  }
});

test('life numerology grid preserves the existing five-ring semantics', () => {
  for (const semantic of ['birth', 'birthday', 'zodiac', 'talent', 'life']) {
    assert.ok(router.includes(`'${semantic}'`) || router.includes(`.${semantic}`), `missing numerology semantic ${semantic}`);
  }
  assert.match(router, /const layout=\[1,4,7,2,5,8,3,6,9\]/);
  assert.match(router, /生命靈數九宮格/);
});

test('Capacitor-ready change does not add native dependencies or rewrite the service worker contract', () => {
  assert.doesNotMatch(packageJson, /@capacitor|firebase/i);
  assert.doesNotMatch(sw, /capacitor|firebase/i);
});
