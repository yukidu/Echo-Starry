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

test('upload audio is document-flow content without the shared modal height cap', () => {
  const upload = readFileSync(new URL('../src/components/UploadModal.tsx', import.meta.url), 'utf8');
  assert.match(upload, /className="upload-modal-overlay upload-page"/);
  assert.doesNotMatch(upload, /className="app-modal-overlay upload-modal-overlay/);
  assert.doesNotMatch(upload, /max-h-\[75vh\]/);
  assert.match(css, /\.upload-page > div \{ max-height: none/);
});
