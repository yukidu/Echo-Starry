import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/regression.yml', import.meta.url), 'utf8');

test('PWA cache uses a numbered release without pinning stale versions in tests', () => {
  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v\d+'/);
  const testsDir = new URL('./', import.meta.url);
  for (const file of readdirSync(testsDir).filter(name => name.endsWith('.test.ts') && name !== 'releaseIntegrity.test.ts')) {
    const source = readFileSync(new URL(file, testsDir), 'utf8');
    assert.doesNotMatch(source, /echostars-shell-v\d+/, `${file} must not pin an old PWA cache version`);
  }
});

test('service worker never caches API responses or personalized share HTML as app shell', () => {
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(sw, /cacheableNavigation = navigation && \(url\.pathname === '\/' \|\| url\.pathname === '\/index\.html'\)/);
  assert.doesNotMatch(sw, /cacheableNavigation[\s\S]*url\.pathname\.startsWith\('\/share\/'\)/);
});

test('release verification runs tests, diagnostics, production build, and real browser UI check', () => {
  assert.equal(pkg.scripts.verify, 'npm test && npm run build');
  assert.match(workflow, /regression-tests:[\s\S]*for test_file in tests\/\*\.test\.ts/);
  assert.match(workflow, /regression-tests:[\s\S]*node --import tsx --test "\$\{test_file\}"/);
  assert.match(workflow, /Regression files passed:/);
  assert.match(workflow, /diagnostics-build:[\s\S]*TypeScript diagnostic[\s\S]*run: npm run lint/);
  assert.match(workflow, /diagnostics-build:[\s\S]*Production build[\s\S]*run: npm run build/);
  assert.match(workflow, /browser-ui:[\s\S]*needs: diagnostics-build/);
  assert.match(workflow, /Browser UI check[\s\S]*node scripts\/verifyThemeMenuUi\.mjs/);
  assert.match(workflow, /Upload browser UI failure evidence[\s\S]*actions\/upload-artifact@v4/);
  assert.match(wrangler, /\[build\][\s\S]*command = "npm run build"/);
  assert.doesNotMatch(wrangler, /command = "npm run verify"/);
});

test.skip('preview configuration stays isolated from production storage bindings', () => {
  assert.match(wrangler, /previews = \{ \}/);
});
