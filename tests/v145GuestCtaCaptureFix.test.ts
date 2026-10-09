import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fix = readFileSync(new URL('../src/v145GuestCtaCaptureFix.ts', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v145 CTA fix listens on window capture so it still runs after v144 stopPropagation', () => {
  assert.match(fix, /window\.addEventListener\('click',[\s\S]*true\);/);
  assert.match(fix, /\.v141-member-teaser-unlock/);
  assert.match(fix, /navbar-menu-identity/);
  assert.match(fix, /button\[data-main-menu="hamburger"\]/);
});

test('v145 CTA fix remains bounded and loads after v145 architecture', () => {
  assert.match(fix, /attempts >= 18/);
  assert.match(fix, /window\.setInterval\(tryOpen, 80\)/);
  const architecture = indexHtml.indexOf('/src/v145BlackFilterArchitecture.ts');
  const captureFix = indexHtml.indexOf('/src/v145GuestCtaCaptureFix.ts');
  assert.ok(architecture >= 0);
  assert.ok(captureFix > architecture);
});
