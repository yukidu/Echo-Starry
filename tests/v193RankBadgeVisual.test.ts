import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../src/v193RankBadgeVisual.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/v193RankBadgeVisual.css', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v193 detail badge is aligned to the top with breathing room', () => {
  assert.match(css, /button:has\(> \.v190-rank-badge-motion\)[\s\S]*top:\s*\.35rem\s*!important/);
  assert.match(css, /left:\s*calc\(100% \+ \.25rem\)\s*!important/);
});

test('v193 detail sparkles only twinkle in place without movement or rotation', () => {
  const keyframeStart = css.indexOf('@keyframes v193-rank-badge-twinkle');
  const keyframeEnd = css.indexOf('}', css.indexOf('72%', keyframeStart)) + 1;
  const keyframes = css.slice(keyframeStart, keyframeEnd);
  assert.match(keyframes, /opacity/);
  assert.doesNotMatch(keyframes, /translate|rotate/);
  for (const suffix of ['four', 'five', 'six', 'seven', 'eight']) {
    assert.ok(script.includes(`v193-rank-badge-sparkle--${suffix}`));
  }
});

test('v193 adds a tiny static rank badge to the home cover top-right corner', () => {
  assert.match(script, /data-v193-home-rank-badge/);
  assert.match(script, /photoButton\.appendChild\(image\)/);
  assert.match(css, /\.v193-home-rank-badge\s*\{[\s\S]*top:\s*\.3rem;[\s\S]*right:\s*\.3rem;/);
  assert.match(css, /width:\s*1\.55rem/);
  assert.match(css, /animation:\s*none\s*!important/);
});

test('v193 remains mutation-observer free and is loaded by index', () => {
  assert.doesNotMatch(script, /MutationObserver/);
  assert.match(index, /v193ReleaseNote\.ts/);
  assert.match(index, /v193RankBadgeVisual\.ts/);
});
