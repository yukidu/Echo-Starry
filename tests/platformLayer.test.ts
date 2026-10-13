import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const platform = readFileSync(join(root, 'src/platform/index.ts'), 'utf8');
const shareModal = readFileSync(join(root, 'src/components/ShareModal.tsx'), 'utf8');
const pkg = readFileSync(join(root, 'package.json'), 'utf8');

test('platform detection is initialized once without listeners or polling', () => {
  assert.match(platform, /const standalone =/);
  assert.match(platform, /platformRuntime/);
  assert.doesNotMatch(platform, /setInterval|setTimeout|addEventListener\(['"](?:online|offline|resize|visibilitychange)/);
});

test('web adapters cover share file camera notification login and platform detection without native imports', () => {
  for (const name of ['share', 'copyText', 'pickFiles', 'capturePhoto', 'requestNotificationPermission', 'navigateToLogin', 'platformRuntime']) {
    assert.ok(platform.includes(name), `missing platform adapter ${name}`);
  }
  assert.doesNotMatch(platform, /@capacitor|firebase/i);
  assert.doesNotMatch(pkg, /@capacitor|firebase/i);
});

test('existing share UI uses the platform layer instead of direct browser share calls', () => {
  assert.match(shareModal, /from '\.\.\/platform'/);
  assert.match(shareModal, /await share\(/);
  assert.match(shareModal, /await copyText\(/);
  assert.doesNotMatch(shareModal, /navigator\.share|navigator\.clipboard/);
});
