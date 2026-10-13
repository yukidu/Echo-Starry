import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { enhanceStarryIdV218Response } from '../worker/starryIdV218ResponseEnhancer';

const root = process.cwd();
const enhancerSource = readFileSync(join(root, 'worker/starryIdV218ResponseEnhancer.ts'), 'utf8');
const privacySource = readFileSync(join(root, 'worker/privacyCrawlerRouter.ts'), 'utf8');

test('member center keeps the original Starry ID brand after login', async () => {
  const request = new Request('https://id.starry.phd/');
  const response = new Response('<html><body><div class="brand"><b>Starry ID</b></div></body></html>', {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
  const enhanced = await enhanceStarryIdV218Response(request, response);
  const html = await enhanced.text();
  assert.match(html, /originalBrand=brand\?\{html:brand\.innerHTML,className:brand\.className\}/);
  assert.match(html, /restoreBrand\(\)/);
  assert.match(html, /Starry ID/);
});

test('My Card button is four characters, immediately left of hamburger, and opens the public card URL', async () => {
  const request = new Request('https://id.starry.phd/');
  const response = new Response('<html><body><button id="myCardBtn">我的電子名片</button></body></html>', {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
  const enhanced = await enhanceStarryIdV218Response(request, response);
  const html = await enhanced.text();
  assert.match(html, /clone\.textContent='我的名片'/);
  assert.match(html, /fetch\('\/api\/card-settings'/);
  assert.match(html, /location\.href=await cardUrl\(\)/);
  assert.match(html, /actions\.insertBefore\(card,burger\)/);
  assert.match(html, /t==='我的電子名片'\|\|t==='我的名片'/);
});

test('toolbar observer is idempotent and cannot retrigger itself forever on mobile', () => {
  assert.match(enhancerSource, /if\(\(card\.textContent\|\|'\'\)!=='我的名片'\)card\.textContent='我的名片'/);
  assert.match(enhancerSource, /if\(card\.title!=='開啟我的公開名片'\)card\.title='開啟我的公開名片'/);
  assert.match(enhancerSource, /let syncing=false/);
  assert.match(enhancerSource, /if\(syncing\)return/);
  assert.match(enhancerSource, /const target=q\('\.topbar'\)\|\|document\.body/);
  assert.match(enhancerSource, /observer\.observe\(target,\{subtree:true,childList:true\}\)/);
  assert.doesNotMatch(enhancerSource, /observer\.observe\(document\.documentElement/);
  assert.doesNotMatch(enhancerSource, /attributeFilter:\['class'\]/);
});

test('public card removes the owner-only return bar completely', async () => {
  const request = new Request('https://id.starry.phd/122');
  const response = new Response('<html><head><style>.owner{position:sticky;top:0;padding:10px;text-align:center;background:#0b1528e8;backdrop-filter:blur(12px);z-index:4}.owner a{color:#dce7ff}</style></head><body><div class="owner"><a href="/">← 回到我的 Starry ID 會員中心</a></div><main>card</main></body></html>', {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
  const enhanced = await enhanceStarryIdV218Response(request, response);
  const html = await enhanced.text();
  assert.doesNotMatch(html, /回到我的 Starry ID 會員中心/);
  assert.doesNotMatch(html, /class="owner"/);
  assert.match(html, /<main>card<\/main>/);
});

test('v218 response enhancement stays layered after v211 and v212 without changing PWA or native dependencies', () => {
  assert.match(privacySource, /enhanceStarryIdV218Response/);
  assert.match(privacySource, /starryV212Response \|\| starryV211Response/);
  assert.match(enhancerSource, /url\.hostname !== STAR_DOMAIN/);
  assert.doesNotMatch(enhancerSource, /@capacitor|firebase/i);
});
