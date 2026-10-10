import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const completion = readFileSync(new URL('../src/v173ChangelogCompletion.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

test('v173 changelog formally fills every recent version from v158 through v173', () => {
  for (let version = 158; version <= 173; version += 1) {
    assert.match(completion, new RegExp(`version:\\s*['\"]v${version}['\"]`), `missing v${version}`);
  }
});

test('v173 is the only newest recent release and completion loads after legacy release notes', () => {
  assert.match(completion, /version:\s*['"]v173['"][\s\S]*?isLatest:\s*true/);
  assert.equal((completion.match(/isLatest:\s*true/g) || []).length, 1);

  const legacyPosition = index.indexOf('/src/changelogReleaseNotes.ts');
  const completionPosition = index.indexOf('/src/v173ChangelogCompletion.ts');
  assert.ok(legacyPosition >= 0, 'legacy changelog loader missing');
  assert.ok(completionPosition > legacyPosition, 'v173 completion must load after legacy notes');
});

test('temporary v172 injected changelog card is no longer loaded', () => {
  assert.doesNotMatch(main, /v171ChangelogNote/);
  assert.match(completion, /移除 v172 額外插入的獨立改版提示卡/);
});

test('recent release notes remain user-facing and include the major v158-v172 milestones', () => {
  assert.match(completion, /美力之星 StarBeauty/);
  assert.match(completion, /召喚繁星/);
  assert.match(completion, /音檔工作區/);
  assert.match(completion, /臺灣皇冠大使/);
  assert.match(completion, /座右銘/);
});
