import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = readFileSync(new URL('../src/v126MenuPolish.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');

test('v126 removes the retired duplicate bottom font controls', () => {
  assert.match(policy, /LEGACY_FONT_CONTROL_SELECTOR = '\[data-echostars-font-control\]'/);
  assert.match(policy, /element\.dataset\.echostarsFontControl !== 'v126-disabled'\) element\.remove\(\)/);
  assert.match(policy, /sentinel\.dataset\.echostarsFontControl = 'v126-disabled'/);
});

test('personal font zoom starts at 100 percent and cannot shrink below it', () => {
  assert.match(index, /echostarsFontZoomValue < 1/);
  assert.match(policy, /Math\.min\(1\.4, Math\.max\(1, raw\)\)/);
  assert.match(policy, /if \(clampPersonalFontZoom\(\) <= 1\)/);
  assert.match(policy, /button\.disabled = zoom <= 1/);
});

test('visitor menu shows the animal beside the nickname and keeps sticker label concise', () => {
  assert.match(policy, /VISITOR_KEY = 'sq_visitor_identity_v1'/);
  assert.match(policy, /animal\.textContent = readVisitorEmoji\(\)/);
  assert.match(policy, /name\.prepend\(animal\)/);
  assert.match(policy, /label\.textContent = '我的貼紙'/);
});

test('installed PWA hides install status and promotes random palette to the same header action area', () => {
  assert.match(policy, /getInstalledRelatedApps/);
  assert.match(policy, /componentReportsInstalled/);
  assert.match(policy, /installButton\?\.style\.setProperty\('display', 'none', 'important'\)/);
  assert.match(policy, /paletteRow\?\.style\.setProperty\('display', 'none', 'important'\)/);
  assert.match(policy, /shortcut\.className = 'navbar-menu-palette-shortcut'/);
  assert.match(policy, /headerActions\.prepend\(shortcut\)/);
  assert.match(policy, /shortcut\.addEventListener\('click', \(\) => paletteButton\.click\(\)\)/);
});

test('main logo and site title keep fixed pixel sizing while page text zooms', () => {
  assert.match(navbar, /brand-logo-glow/);
  assert.match(navbar, /echo-wave-text/);
  assert.match(policy, /\.brand-logo-glow > div:first-child[\s\S]*width: 32px !important;[\s\S]*height: 32px !important;/);
  assert.match(policy, /\.brand-logo-glow \.echo-wave-text[\s\S]*font-size: 16px !important;/);
  assert.match(policy, /@media \(min-width: 640px\)[\s\S]*font-size: 20px !important;/);
});
