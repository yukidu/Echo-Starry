import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/components/Navbar.css', import.meta.url), 'utf8');

test('main-menu navigation clears the previous page before opening another page', () => {
  assert.match(navbar, /if \(currentTab !== 'home'\) onSelectTab\('home'\);[\s\S]*onSelectTab\(tab\);/);
  assert.match(navbar, /document\.body\.dataset\.mainTab = currentTab/);
});

test('mobile menu hugs its content and keeps only counts in the palette primary color', () => {
  assert.match(css, /\.mobile-menu-panel\s*\{[\s\S]*width:\s*max-content;/);
  assert.match(navbar, /mobile-menu-accent-number[\s\S]*pendingAuditCount/);
  assert.match(navbar, /mobile-menu-accent-number sticker-menu-amount[\s\S]*stickerBalanceText/);
  assert.match(css, /\.mobile-menu-accent-number,[\s\S]*color:\s*var\(--color-primary,\s*#c06c84\)\s*!important;/);
});

test('upload audio is presented as page content instead of a fixed overlay', () => {
  assert.match(css, /body\[data-main-tab="upload"\] \.upload-modal-overlay\s*\{[\s\S]*position:\s*relative\s*!important;[\s\S]*background:\s*transparent\s*!important;/);
  assert.match(css, /body\[data-main-tab="upload"\] \.upload-modal-overlay form\s*\{[\s\S]*max-height:\s*none\s*!important;[\s\S]*overflow:\s*visible\s*!important;/);
});
