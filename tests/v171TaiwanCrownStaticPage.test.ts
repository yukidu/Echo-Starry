import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../public/taiwan-crown.html', import.meta.url), 'utf8');

test('Taiwan Crown page is a standalone mobile-safe HTML document', () => {
  assert.match(page, /<!doctype html>/i);
  assert.match(page, /<html lang="zh-Hant">/);
  assert.match(page, /viewport-fit=cover/);
  assert.match(page, /<title>臺灣皇冠大使｜繁星回聲<\/title>/);
  assert.match(page, /class="page-shell"/);
  assert.match(page, /prefers-reduced-motion: reduce/);
});

test('personalization never asks for a name and keeps user-controlled text as textContent', () => {
  assert.doesNotMatch(page, /<input[^>]+(?:name|nickname)/i);
  assert.match(page, /displayName\.textContent/);
  assert.match(page, /identityNote\.textContent/);
  assert.match(page, /autoName\.textContent/);
  assert.match(page, /quote\.textContent/);
});
