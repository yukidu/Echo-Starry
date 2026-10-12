import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../src/v193RankBadgeVisual.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/v193RankBadgeVisual.css', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v193 historical detail badge alignment remains documented in source', () => {
  assert.match(css, /button:has\(> \.v190-rank-badge-motion\)[\s\S]*top:\s*\.35rem\s*!important/);
  assert.match(css, /left:\s*calc\(100% \+ \.25rem\)\s*!important/);
});

test('v193 historical sparkle implementation remains available for release history', () => {
  const keyframeStart = css.indexOf('@keyframes v193-rank-badge-twinkle');
  const keyframeEnd = css.indexOf('}', css.indexOf('72%', keyframeStart)) + 1;
  const keyframes = css.slice(keyframeStart, keyframeEnd);
  assert.match(keyframes, /opacity/);
  assert.doesNotMatch(keyframes, /translate|rotate/);
  for (const suffix of ['four', 'five', 'six', 'seven', 'eight']) {
    assert.ok(script.includes(`v193-rank-badge-sparkle--${suffix}`));
  }
});

test('v193 historical homepage badge implementation remains in source but is superseded', () => {
  assert.match(script, /data-v193-home-rank-badge/);
  assert.match(script, /photoButton\.appendChild\(image\)/);
  assert.match(css, /\.v193-home-rank-badge\s*\{[\s\S]*top:\s*\.3rem;[\s\S]*right:\s*\.3rem;/);
});

test('v194 supersedes the v193 visual runtime while preserving v193 release notes', () => {
  assert.doesNotMatch(script, /MutationObserver/);
  assert.match(index, /v193ReleaseNote\.ts/);
  assert.doesNotMatch(index, /src\/v193RankBadgeVisual\.ts/);
  assert.match(index, /src\/v194RankBadgeCrownDots\.ts/);
});
