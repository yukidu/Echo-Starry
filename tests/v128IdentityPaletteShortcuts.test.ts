import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const menuPolicy = readFileSync(new URL('../src/v127MenuIdentityPalette.ts', import.meta.url), 'utf8');

test('v128 identity header opens login for visitors and personal center for members', () => {
  assert.match(menuPolicy, /info\.dataset\.v128IdentityAction = isVisitor \? 'login' : 'profile'/);
  assert.match(menuPolicy, /aria-label', isVisitor \? '登入繁星回聲' : '開啟個人中心'/);
  assert.match(menuPolicy, /panel\.querySelector<HTMLButtonElement>\('\.navbar-menu-login-shortcut'\)\?\.click\(\)/);
  assert.match(menuPolicy, /includes\('個人中心'\)/);
  assert.match(menuPolicy, /event\.key !== 'Enter' && event\.key !== ' '/);
});
