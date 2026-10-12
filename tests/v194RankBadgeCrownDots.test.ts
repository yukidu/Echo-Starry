import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../src/v194RankBadgeCrownDots.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/v194RankBadgeCrownDots.css', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v194 removes the homepage cover badge visual', () => {
  assert.match(script, /removeHomeBadges/);
  assert.match(script, /data-v193-home-rank-badge/);
  assert.doesNotMatch(index, /src\/v193RankBadgeVisual\.ts/);
});

test('v194 removes all legacy star sparkles from the detail badge', () => {
  assert.match(css, /\.v190-rank-badge-sparkle\s*\{[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /\.v190-rank-badge-motion::before,[\s\S]*\.v190-rank-badge-motion::after[\s\S]*content:\s*none\s*!important/);
  assert.match(script, /removeLegacyStars/);
});

test('v194 uses dense Crown Ambassador style round light points around the badge edge', () => {
  assert.match(script, /DENSE_DOT_COUNT = 32/);
  assert.match(script, /Math\.cos\(angle\) \* 48\.5/);
  assert.match(script, /Math\.sin\(angle\) \* 48\.5/);
  assert.match(css, /\.v194-rank-badge-dot\s*\{[\s\S]*border-radius:\s*999px/);
  assert.match(css, /background:\s*rgb\(255 255 255 \/ \.98\)/);
  assert.match(css, /v194RankBadgeIndependentDot/);
});

test('v194 keeps the v193 top alignment and does not use MutationObserver', () => {
  assert.match(css, /button:has\(> \.v190-rank-badge-motion\)[\s\S]*top:\s*\.35rem\s*!important/);
  assert.match(css, /left:\s*calc\(100% \+ \.25rem\)\s*!important/);
  assert.doesNotMatch(script, /MutationObserver/);
  assert.match(index, /v194ReleaseNote\.ts/);
  assert.match(index, /v194RankBadgeCrownDots\.ts/);
});
