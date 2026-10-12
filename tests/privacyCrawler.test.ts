import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const router = readFileSync(new URL('../worker/privacyCrawlerRouter.ts', import.meta.url), 'utf8');
const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

test('site declares global noindex and nofollow directives', () => {
  assert.match(index, /name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex"/);
  assert.match(index, /name="googlebot" content="noindex, nofollow, noarchive, nosnippet, noimageindex"/);
  assert.match(index, /name="bingbot" content="noindex, nofollow, noarchive, nosnippet, noimageindex"/);
});

test('robots.txt denies all crawlers and explicitly names major AI crawlers', () => {
  assert.match(robots, /User-agent: \*\s+Disallow: \//);
  for (const agent of ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'Google-Extended', 'ClaudeBot', 'CCBot', 'PerplexityBot', 'Applebot-Extended', 'Bytespider', 'cohere-ai']) {
    assert.ok(robots.includes(`User-agent: ${agent}`), `${agent} should be explicitly denied`);
  }
});

test('worker blocks known search and AI crawler user agents', () => {
  for (const token of ['Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Meta-ExternalAgent']) {
    assert.ok(router.includes(token), `${token} should be blocked at the Worker edge`);
  }
  assert.match(router, /status: 403/);
  assert.match(router, /X-Robots-Tag/);
});

test('all site requests run through privacy crawler router', () => {
  assert.match(wrangler, /main = "worker\/privacyCrawlerRouter\.ts"/);
  assert.match(wrangler, /run_worker_first = \["\/\*"\]/);
});
