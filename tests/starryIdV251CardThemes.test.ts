import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STARRY_CARD_THEMES } from '../worker/starryIdV251CardThemes';

const root = process.cwd();
const source = readFileSync(join(root, 'worker/starryIdV251CardThemes.ts'), 'utf8');
const privacyRouter = readFileSync(join(root, 'worker/privacyCrawlerRouter.ts'), 'utf8');

test('v251 exposes exactly ten uniquely named fixed public-card themes', () => {
  assert.equal(STARRY_CARD_THEMES.length, 10);
  assert.equal(new Set(STARRY_CARD_THEMES.map(theme => theme.id)).size, 10);
  assert.equal(new Set(STARRY_CARD_THEMES.map(theme => theme.name)).size, 10);
  assert.deepEqual(STARRY_CARD_THEMES.map(theme => theme.name), [
    '繁星深空','曜金尊爵','極光秘境','晨曦紙境','霓虹脈衝',
    '森語自然','海洋流光','緋櫻和風','月白極簡','皇家寶石'
  ]);
});

test('every theme has dedicated public and edit-preview styling', () => {
  for (const theme of STARRY_CARD_THEMES) {
    assert.ok(source.includes(`data-card-theme=\\"${theme.id}\\"`), `${theme.id} public style missing`);
    assert.ok(source.includes(`data-card-preview-theme=\\"${theme.id}\\"`), `${theme.id} edit preview style missing`);
  }
  assert.match(source, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(source, /html\[data-starry-theme=/);
});

test('edit mode has a top-right theme select with instant preview and persistence', () => {
  assert.match(source, /v251CardThemePicker/);
  assert.match(source, /v251CardThemeSelect/);
  assert.match(source, /apply\(next\);busy=true/);
  assert.match(source, /api\('PUT',\{theme:next\}\)/);
  assert.match(source, /public_card_preferences/);
});

test('privacy entrypoint handles theme API before v211 and enhances final Starry ID HTML', () => {
  assert.match(privacyRouter, /handleStarryIdV251CardTheme/);
  assert.match(privacyRouter, /enhanceStarryIdV251CardThemeResponse/);
  assert.match(privacyRouter, /starryV251Direct/);
  assert.match(privacyRouter, /v251StarryIdResponse/);
});
