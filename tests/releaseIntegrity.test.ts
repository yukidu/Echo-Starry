import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/regression.yml', import.meta.url), 'utf8');

test('v93 is the single current PWA cache version', () => {
  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v93'/);
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

test('release verification keeps regression tests and the production build as explicit gates', () => {
  assert.equal(pkg.scripts.verify, 'npm test && npm run build');
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run build/);
  assert.match(wrangler, /\[build\][\s\S]*command = "npm run build"/);
  assert.doesNotMatch(wrangler, /command = "npm run verify"/);
});

test('preview configuration stays isolated from production storage bindings', () => {
  assert.match(wrangler, /previews = \{ \}/);
});
