import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const upload = readFileSync(new URL('../src/components/UploadModal.tsx', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../worker/index.ts', import.meta.url), 'utf8');

test('R2 thumbnail selection is guarded and does not depend on stale malformed URLs', () => {
  assert.match(upload, /const nextUrl = typeof item\?\.url === 'string'/);
  assert.match(upload, /這張 R2 封面已失效/);
  assert.match(upload, /setCoverPreview\(nextUrl\)/);
});

test('manual R2 sync bypasses session and HTTP caches and replaces the local library', () => {
  assert.match(upload, /sessionStorage\.removeItem\(COVER_LIBRARY_CACHE_KEY\)/);
  assert.match(upload, /cache: 'no-store'/);
  assert.match(upload, /'Cache-Control': 'no-cache'/);
  assert.match(upload, /同步 R2/);
  assert.match(worker, /const forceCoverRefresh = url\.searchParams\.has\('refresh'\)/);
  assert.match(worker, /forceCoverRefresh \? 'no-store, max-age=0' : 'private, max-age=60'/);
});
