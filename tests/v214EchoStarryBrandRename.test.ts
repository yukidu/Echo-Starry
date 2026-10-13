import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const STARRY_CLIENT_ID = '661055525630-633btocuq7hs6pu7v5gkg3n2fouupubp.apps.googleusercontent.com';
const LEGACY_CLIENT_ID = '400699489182-lb412nhvj4s6t1qr5ovkg40hc646dq79.apps.googleusercontent.com';

test('v214/v219: project brand surfaces stay Echo-Starry while navbar displays 繁星回聲', () => {
  const index = read('index.html');
  const manifest = read('public/manifest.webmanifest');
  const metadata = read('metadata.json');
  const navbar = read('src/components/Navbar.tsx');
  const googleUx = read('src/googleIdentityPlatformUx.ts');

  assert.match(index, /<title>Echo-Starry<\/title>/);
  assert.match(index, /apple-mobile-web-app-title\" content=\"Echo-Starry\"/);
  assert.match(index, /og:title\" content=\"Echo-Starry\"/);
  assert.equal(JSON.parse(manifest).name, 'Echo-Starry');
  assert.equal(JSON.parse(manifest).short_name, 'Echo-Starry');
  assert.equal(JSON.parse(metadata).name, 'Echo-Starry');
  assert.match(navbar, />繁星回聲<\/span>/);
  assert.match(navbar, /登入繁星回聲/);
  assert.match(googleUx, /登入 Echo-Starry/);
});

test('v214: new custom domain and workers.dev backup both keep iOS Google redirect support', () => {
  const googleUx = read('src/googleIdentityPlatformUx.ts');
  assert.match(googleUx, /'echo\.starry\.phd'/);
  assert.match(googleUx, /'echostars\.yukidu\.workers\.dev'/);
  assert.match(googleUx, /PROD_HOSTS\.has\(window\.location\.hostname\)/);
});

test('v214: custom domain uses Starry Google client while workers.dev keeps legacy client', () => {
  const auth = read('src/config/auth.ts');
  const workerAuth = read('worker/authRouter.ts');
  assert.match(auth, new RegExp(STARRY_CLIENT_ID.replaceAll('.', '\\.')));
  assert.match(auth, new RegExp(LEGACY_CLIENT_ID.replaceAll('.', '\\.')));
  assert.match(auth, /hostname === 'echostars\.yukidu\.workers\.dev'/);
  assert.match(workerAuth, new RegExp(STARRY_CLIENT_ID.replaceAll('.', '\\.')));
  assert.match(workerAuth, new RegExp(LEGACY_CLIENT_ID.replaceAll('.', '\\.')));
  assert.match(workerAuth, /audience: \[\.\.\.GOOGLE_CLIENT_IDS\]/);
});

test('v214: rename preserves legacy internal identity keys and Cloudflare resource ids', () => {
  const index = read('index.html');
  const navbar = read('src/components/Navbar.tsx');
  const googleUx = read('src/googleIdentityPlatformUx.ts');
  const wrangler = read('wrangler.toml');

  assert.match(index, /echostars_user_font_zoom_v1/);
  assert.match(navbar, /echostars_user_font_zoom_v1/);
  assert.match(googleUx, /echostars_auth_return_v1/);
  assert.match(wrangler, /name = \"echostars\"/);
  assert.match(wrangler, /pattern = \"echo\.starry\.phd\"/);
});

test('v214: App legacy display text is rewritten at build time without runtime work', () => {
  const vite = read('vite.config.ts');
  assert.match(vite, /echo-starry-brand-compatibility/);
  assert.match(vite, /code\.replaceAll\('繁星回聲', 'Echo-Starry'\)/);
  assert.doesNotMatch(vite, /setInterval|setTimeout|MutationObserver/);
});
