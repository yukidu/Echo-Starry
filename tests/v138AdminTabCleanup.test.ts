import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cleanup = readFileSync(new URL('../src/v138AdminTabCleanup.ts', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('admin cleanup climbs ancestors so page and modal presentations are both supported', () => {
  assert.match(cleanup, /while \(candidate\)/);
  assert.match(cleanup, /candidate = candidate\.parentElement/);
  assert.match(cleanup, /後台管理中心/);
  assert.match(cleanup, /buttonTexts\.includes\('數據中心'\)/);
});

test('only the moved audio tab is hidden and made keyboard unreachable', () => {
  assert.match(cleanup, /cleanAdminText\(button\.textContent\) === '音檔'/);
  assert.match(cleanup, /v139MovedAudioTab/);
  assert.match(cleanup, /aria-hidden/);
  assert.match(cleanup, /tabIndex = -1/);
  assert.match(cleanup, /display: none !important/);
  assert.doesNotMatch(cleanup, /顯示/);
});

test('admin cleanup loads after the v138 upload management integration', () => {
  const managementIndex = indexHtml.indexOf('/src/v138UploadAdminRework.tsx');
  const cleanupIndex = indexHtml.indexOf('/src/v138AdminTabCleanup.ts');
  assert.ok(managementIndex >= 0);
  assert.ok(cleanupIndex > managementIndex);
});
