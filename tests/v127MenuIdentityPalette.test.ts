import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = readFileSync(new URL('../src/v127MenuIdentityPalette.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v127 random palette keeps the hamburger menu open without changing other navigation actions', () => {
  assert.match(policy, /function isPaletteClickInsideMenu\(target: Element\)/);
  assert.match(policy, /target\.closest\('\.navbar-menu-palette-shortcut'\)/);
  assert.match(policy, /includes\('切換配色'\)/);
  assert.match(policy, /function keepMenuOpenAfterPalette\(\)/);
  assert.match(policy, /button\[data-main-menu="hamburger"\]/);
  assert.match(policy, /if \(isPaletteClickInsideMenu\(target\)\) \{[\s\S]*keepMenuOpenAfterPalette\(\);[\s\S]*return;/);
});

test('v127 identity block has a larger fixed icon and a three-character text column', () => {
  assert.match(policy, /TEXT_COLUMN_WIDTH = 48/);
  assert.match(policy, /ICON_SIZE = 36/);
  assert.match(policy, /\.v127-identity-info[\s\S]*padding-left: \$\{ICON_SIZE \+ 9\}px/);
  assert.match(policy, /\.v127-identity-name,[\s\S]*width: \$\{TEXT_COLUMN_WIDTH\}px !important/);
  assert.match(policy, /function fitThreeCharacterWidth\(element: HTMLElement, text: string, basePx: number, minPx: number\)/);
  assert.match(policy, /length <= 3 \? basePx : Math\.max\(minPx/);
  assert.match(policy, /fitThreeCharacterWidth\(name, visibleText\(name\), 15, 9\)/);
  assert.match(policy, /fitThreeCharacterWidth\(role, visibleText\(role\), 12, 8\.5\)/);
});

test('v127 applies the same identity layout to visitors and members without duplicating the visitor animal', () => {
  assert.match(policy, /USER_KEY = 'sq_current_user_v1'/);
  assert.match(policy, /readMemberAvatar\(\)/);
  assert.match(policy, /icon\.className = isVisitor \? 'v126-visitor-animal v127-identity-icon' : 'v127-identity-icon'/);
  assert.match(policy, /if \(isVisitor\) icon\.classList\.add\('v126-visitor-animal'\)/);
  assert.match(policy, /icon\.textContent = avatar \|\| \(isVisitor \? '🦁' : '👤'\)/);
  assert.match(policy, /text-align: left !important/);
});

test('v127 remains event driven and loads after v126 polish', () => {
  assert.doesNotMatch(policy, /new MutationObserver/);
  assert.match(policy, /button\[data-main-menu="hamburger"\]/);
  const oldIndex = index.indexOf('/src/v126MenuPolish.ts');
  const newIndex = index.indexOf('/src/v127MenuIdentityPalette.ts');
  assert.ok(oldIndex >= 0 && newIndex > oldIndex);
});
