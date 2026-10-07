import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const navbarCss = readFileSync(new URL('../src/components/Navbar.css', import.meta.url), 'utf8');

test('hamburger drawer remains the React menu controlled by the navbar on every viewport size', () => {
  assert.match(navbar, /isMobileMenuOpen &&/);
  assert.match(navbar, /<div className="mobile-menu-shell">/);
  assert.doesNotMatch(navbar, /mobile-menu-shell md:hidden/);
  assert.match(navbar, /mobile-menu-panel animate-in slide-in-from-top-2/);
});

test('hamburger drawer hugs the longest label and stays on the right', () => {
  assert.match(navbarCss, /\.mobile-menu-shell\s*\{[\s\S]*justify-content:\s*flex-end;/);
  assert.match(navbarCss, /\.mobile-menu-panel\s*\{[\s\S]*width:\s*max-content;/);
  assert.match(navbarCss, /max-width:\s*calc\(100vw - 1\.5rem\);/);
});
