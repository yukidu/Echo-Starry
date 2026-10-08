import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/components/Navbar.css', import.meta.url), 'utf8');

test('top navigation toolbar stays on one row and scrolls internally when space is tight', () => {
  assert.match(css, /\.navbar-main-row\s*\{[\s\S]*max-width:\s*none\s*!important/);
  assert.match(css, /\.navbar-top-toolbar\s*\{[\s\S]*position:\s*absolute\s*!important/);
  assert.match(css, /\.navbar-top-toolbar\s*\{[\s\S]*top:\s*50%/);
  assert.match(css, /\.navbar-top-toolbar\s*\{[\s\S]*transform:\s*translateY\(-50%\)/);
  assert.match(css, /\.navbar-top-toolbar\s*\{[\s\S]*flex-wrap:\s*nowrap\s*!important/);
  assert.match(css, /\.navbar-top-toolbar\s*\{[\s\S]*overflow-x:\s*auto/);
  assert.match(css, /\.navbar-top-toolbar\s*\{[\s\S]*overflow-y:\s*hidden/);
});
