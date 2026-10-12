import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../src/v193RankBadgeVisual.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/v193RankBadgeVisual.css', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v193 detail badge remains aligned to the top with breathing room', () => {
  assert.match(css, /button:has\(> \.v190-rank-badge-motion\)[\s\S]*top:\s*\.35rem\s*!important/);
  assert.match(css, /left:\s*calc\(100% \+ \.25rem\)\s*!important/);
});

test('v194 supersedes v193 home badges and injected sparkle nodes', () => {
  assert.match(script, /data-v193-home-rank-badge/);
  assert.match(script, /data-v193-rank-sparkle/);
  assert.match(script, /\.forEach\(node => node\.remove\(\)\)/);
  assert.doesNotMatch(script, /photoButton\.appendChild\(image\)/);
  assert.doesNotMatch(script, /speakerRankBadge/);
  assert.doesNotMatch(script, /\/api\/tracks\?v193_rank_badge/);
  assert.doesNotMatch(css, /v193-home-rank-badge/);
  assert.doesNotMatch(css, /v193-rank-badge-twinkle/);
});

test('v193 keeps preview-only badge image source compatibility', () => {
  assert.match(script, /PROD_ORIGIN/);
  assert.match(script, /img\.v190-rank-badge-image/);
  assert.match(script, /current\.pathname\.startsWith\('\/api\/r2\/file\/'\)/);
});

test('v193 remains mutation-observer free and v194 is loaded after it', () => {
  assert.doesNotMatch(script, /MutationObserver/);
  assert.match(index, /v193ReleaseNote\.ts/);
  assert.match(index, /v194ReleaseNote\.ts/);
  const v193 = index.indexOf('/src/v193RankBadgeVisual.ts');
  const v194 = index.indexOf('/src/v194RankBadgeCleanup.ts');
  assert.ok(v193 >= 0 && v194 > v193);
});
