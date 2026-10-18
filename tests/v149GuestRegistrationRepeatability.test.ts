import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const guestCta = readFileSync(new URL('../src/v144GuestCtaFilterPreview.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('v149 guest CTA routes every click straight to the profile login view', () => {
  assert.match(guestCta, /const state = \{ echostars: true, view: 'tab', tab: 'profile' \} as const/);
  assert.match(guestCta, /window\.dispatchEvent\(new PopStateEvent\('popstate', \{ state \}\)\)/);
  assert.doesNotMatch(guestCta, /registrationObserver|registrationTimer|findAndOpenGuestProfile/);
  assert.doesNotMatch(guestCta, /data-main-menu="hamburger"|navbar-menu-identity/);
});

test('v149 relies on the existing App popstate profile navigation contract', () => {
  assert.match(app, /setIsProfileOpen\(state\?\.tab === 'profile'\)/);
  assert.match(app, /state\.view === 'tab'[\s\S]*\['stats','notifications','profile','stickers','install','upload'\]\.includes/);
  assert.match(app, /setCurrentTab\(state\.tab!\)/);
});
