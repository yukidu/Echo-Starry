import { ThemePalette } from '../types';

const makeLightPalette = (
  id: string,
  name: string,
  primary: string,
  primaryHover: string
): ThemePalette => ({
  id,
  name,
  primary,
  primaryHover,
  lightPill: `${primary}1A`,
  accentScrubber: primary,
  gradientBg: `linear-gradient(135deg, ${primary}14 0%, ${primary}08 48%, #ffffff 100%)`,
  cardBg: '#ffffff',
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  borderSubtle: `${primary}28`
});

// 24 deliberately different color families across the full hue wheel + neutrals.
export const LIGHT_PALETTES: ThemePalette[] = [
  makeLightPalette('rose', '經典玫瑰', '#c13f6f', '#a8325e'),
  makeLightPalette('crimson', '緋紅', '#b82f3f', '#982532'),
  makeLightPalette('vermilion', '朱砂紅', '#c94b2a', '#aa3d21'),
  makeLightPalette('tangerine', '橘焰', '#d06a16', '#ad5610'),
  makeLightPalette('amber', '琥珀金', '#b47a08', '#956506'),
  makeLightPalette('mustard', '芥末黃', '#9b8616', '#7e6d12'),
  makeLightPalette('olive', '橄欖綠', '#718126', '#5d6b1f'),
  makeLightPalette('lime', '萊姆綠', '#4f922b', '#407923'),
  makeLightPalette('forest', '森林綠', '#2e7d45', '#256739'),
  makeLightPalette('emerald', '翡翠綠', '#16805f', '#12694f'),
  makeLightPalette('teal', '孔雀青', '#0b7e78', '#086864'),
  makeLightPalette('cyan', '湖水青', '#0b8199', '#096a7e'),
  makeLightPalette('sky', '晴空藍', '#2b7bb8', '#24669a'),
  makeLightPalette('cobalt', '鈷藍', '#3a63bd', '#30529f'),
  makeLightPalette('indigo', '靛青', '#5552b5', '#454293'),
  makeLightPalette('violet', '紫羅蘭', '#7048b5', '#5c3a96'),
  makeLightPalette('purple', '皇家紫', '#8b3fa4', '#713386'),
  makeLightPalette('magenta', '洋紅', '#aa367f', '#8e2b69'),
  makeLightPalette('fuchsia', '桃紫', '#bd3ca7', '#9e318b'),
  makeLightPalette('hot-pink', '亮粉紅', '#c7457f', '#a63869'),
  makeLightPalette('cocoa', '可可棕', '#8b5b3f', '#744b34'),
  makeLightPalette('copper', '赤銅', '#a85c32', '#8d4b29'),
  makeLightPalette('slate', '岩灰藍', '#526b82', '#43586b'),
  makeLightPalette('charcoal', '石墨灰', '#5d6570', '#4c535c')
];

export const DARK_THEME: ThemePalette = {
  id: 'fixed-dark',
  name: '深邃夜幕 (固定)',
  primary: '#c06c84',
  primaryHover: '#b15b73',
  lightPill: '#1a1e2b',
  accentScrubber: '#c06c84',
  gradientBg: 'linear-gradient(135deg, #0d0f17 0%, #131722 50%, #0c0e15 100%)',
  cardBg: '#181c28',
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  borderSubtle: '#23293b'
};

const LIGHT_PALETTE_STORAGE_KEY = 'sq_light_palette_id_v1';

function readStoredLightPalette(): ThemePalette | null {
  if (typeof window === 'undefined') return null;
  try {
    const storedId = window.localStorage.getItem(LIGHT_PALETTE_STORAGE_KEY);
    return LIGHT_PALETTES.find(palette => palette.id === storedId) || null;
  } catch {
    return null;
  }
}

function storeLightPalette(palette: ThemePalette) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LIGHT_PALETTE_STORAGE_KEY, palette.id);
  } catch {
    // Private browsing/storage quota failures should never block theme rendering.
  }
}

export function getRandomLightPalette(excludeId?: string): ThemePalette {
  // v178: a normal reload must keep the exact same palette. Preview and
  // production also begin from the same deterministic palette when no choice
  // has been stored yet, so visual verification is no longer affected by a
  // different random color on each origin/load.
  if (!excludeId) {
    const stored = readStoredLightPalette();
    if (stored) return stored;
    const initial = LIGHT_PALETTES[0];
    storeLightPalette(initial);
    return initial;
  }

  const filtered = LIGHT_PALETTES.filter(p => p.id !== excludeId);
  const pool = filtered.length > 0 ? filtered : LIGHT_PALETTES;
  const next = pool[Math.floor(Math.random() * pool.length)];
  storeLightPalette(next);
  return next;
}

/**
 * Requirement 20: 淺色系切換、深色系切換，主視覺色會維持同一個顏色。
 */
export function applyThemeToDom(palette: ThemePalette, isDark: boolean) {
  const root = document.documentElement;

  let themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!themeColorMeta) {
    themeColorMeta = document.createElement('meta');
    themeColorMeta.name = 'theme-color';
    document.head.appendChild(themeColorMeta);
  }
  themeColorMeta.content = palette.primary;

  root.style.setProperty('--color-primary', palette.primary);
  root.style.setProperty('--color-primary-hover', palette.primaryHover);
  root.style.setProperty('--color-accent-scrubber', palette.primary);

  if (isDark) {
    root.classList.add('dark');
    root.style.setProperty('--color-light-pill', '#1a1e2b');
    root.style.setProperty('--theme-box-bg', '#181c28');
    root.style.setProperty('--theme-gradient-bg', 'linear-gradient(135deg, #0d0f17 0%, #131722 50%, #0c0e15 100%)');
    root.style.setProperty('--theme-card-bg', '#181c28');
    root.style.setProperty('--theme-text-primary', '#f8fafc');
    root.style.setProperty('--theme-text-secondary', '#94a3b8');
    root.style.setProperty('--theme-border-subtle', '#23293b');
  } else {
    root.classList.remove('dark');
    root.style.setProperty('--color-light-pill', palette.lightPill);
    root.style.setProperty('--theme-box-bg', '#ffffff');
    root.style.setProperty('--color-primary-50', `${palette.primary}15`);
    root.style.setProperty('--theme-gradient-bg', palette.gradientBg);
    root.style.setProperty('--theme-card-bg', palette.cardBg);
    root.style.setProperty('--theme-text-primary', palette.textPrimary);
    root.style.setProperty('--theme-text-secondary', palette.textSecondary);
    root.style.setProperty('--theme-border-subtle', palette.borderSubtle);
  }
}
