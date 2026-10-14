import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const hotfix = fs.readFileSync('worker/starryIdV246FreezeHotfix.ts','utf8');
const wrangler = fs.readFileSync('wrangler.toml','utf8');

test('v246 removes the broad mutation observer that caused the Starry ID UI loop', () => {
  assert.doesNotMatch(hotfix, /new MutationObserver/);
  assert.match(hotfix, /document\.addEventListener\('click'/);
  assert.match(hotfix, /scheduleSync/);
});

test('v246 avoids rewriting identical battery DOM values', () => {
  assert.match(hotfix, /if\(v\.textContent!==nextText\)v\.textContent=nextText/);
  assert.match(hotfix, /if\(eye\.textContent!==icon\)eye\.textContent=icon/);
});

test('v246 only intercepts the Starry ID battery client and delegates everything else', () => {
  assert.match(hotfix, /url\.hostname === 'id\.starry\.phd'/);
  assert.match(hotfix, /url\.pathname === '\/starry-id-v245\.js'/);
  assert.match(hotfix, /return baseWorker\.fetch\(request, env, ctx\)/);
  assert.match(wrangler, /main = "worker\/starryIdV246FreezeHotfix\.ts"/);
});
