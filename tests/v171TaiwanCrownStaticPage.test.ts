import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const legacyPage = new URL('../public/taiwan-crown.html', import.meta.url);

test('v171 standalone Taiwan Crown page stays retired after v172 app integration', () => {
  assert.equal(existsSync(legacyPage), false);
});
