import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/components/Navbar.css', import.meta.url), 'utf8');

test('mobile menu shell floats above the page without covering the unused page area', () => {
  assert.match(css, /\.mobile-menu-shell\s*\{[\s\S]*position:\s*absolute;/);
  assert.match(css, /\.mobile-menu-shell\s*\{[\s\S]*top:\s*100%;/);
  assert.match(css, /\.mobile-menu-shell\s*\{[\s\S]*background:\s*transparent;/);
  assert.match(css, /\.mobile-menu-shell\s*\{[\s\S]*pointer-events:\s*none;/);
  assert.match(css, /\.mobile-menu-panel\s*\{[\s\S]*pointer-events:\s*auto;/);
});

test('dark mobile menu panel has a visibly distinct surface and stronger separation', () => {
  assert.match(css, /\.dark \.mobile-menu-panel\s*\{[\s\S]*background:\s*rgb\(30 41 59 \/ 0\.99\);/);
  assert.match(css, /\.dark \.mobile-menu-panel\s*\{[\s\S]*border-color:\s*rgb\(100 116 139 \/ 0\.95\);/);
  assert.match(css, /\.dark \.mobile-menu-panel\s*\{[\s\S]*0 22px 58px rgb\(0 0 0 \/ 0\.65\)/);
});

test('uninstalled status is left aligned beside the menu label using menu-sized parenthesized text', () => {
  assert.match(css, /button\[aria-label="安裝到桌面"\] > span:last-child\s*\{[\s\S]*margin-left:\s*0 !important;/);
  assert.match(css, /button\[aria-label="安裝到桌面"\] > span:last-child::after\s*\{[\s\S]*content:\s*"（未安裝）";/);
  assert.match(css, /button\[aria-label="安裝到桌面"\] > span:last-child::after\s*\{[\s\S]*font-size:\s*0\.875rem;/);
});
