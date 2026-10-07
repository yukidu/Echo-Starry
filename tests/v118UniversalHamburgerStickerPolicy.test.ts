import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const navbarCss = readFileSync(new URL('../src/components/Navbar.css', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../src/components/ProfileModal.tsx', import.meta.url), 'utf8');
const guide = readFileSync(new URL('../src/stickerGuidePolicy.ts', import.meta.url), 'utf8');
const luckyPolicy = readFileSync(new URL('../worker/luckyStickerMultiplierPolicyRouter.ts', import.meta.url), 'utf8');
const privacyRouter = readFileSync(new URL('../worker/privacyCrawlerRouter.ts', import.meta.url), 'utf8');

test('all viewport sizes use one hamburger main menu and brand never wraps', () => {
  assert.equal(navbar.includes('data-main-menu="hamburger"'), true);
  assert.equal(navbar.includes('whitespace-nowrap shrink-0'), true);
  assert.equal(navbar.includes('<div className="mobile-menu-shell">'), true);
  assert.equal(navbar.includes('hidden md:flex items-center'), false);
  assert.equal(navbarCss.includes('@media (min-width: 768px)'), false);
});

test('logout lives in hamburger menu only, not ProfileModal', () => {
  assert.equal(navbar.includes('title="登出目前帳號"'), true);
  assert.equal(navbar.includes('<span>登出</span>'), true);
  assert.equal(profile.includes('onLogout'), false);
  assert.equal(profile.includes('>登出<'), false);
});

test('palette and theme controls remain available after collapsing header actions', () => {
  assert.equal(navbar.includes('<span>切換配色</span>'), true);
  assert.equal(navbar.includes("{isDark ? '切換淺色模式' : '切換深色模式'}"), true);
});

test('Summon Stars completion reward is excluded from platinum earning multiplier', () => {
  assert.equal(guide.includes('earned(settings.luckyCompleteReward)'), false);
  assert.equal(guide.includes('召喚繁星完聽獎勵不套用白金級以上獲取倍數'), true);
  assert.equal(luckyPolicy.includes("WHEN NEW.type = 'lucky_complete_reward'"), true);
  assert.equal(luckyPolicy.includes('SELECT rewardUnits'), true);
  assert.equal(luckyPolicy.includes('sticker_lucky_complete_base_reward_v118'), true);
  assert.equal(privacyRouter.includes("import appWorker from './luckyStickerMultiplierPolicyRouter';"), true);
});
