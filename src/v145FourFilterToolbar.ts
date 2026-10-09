const STYLE_ID = 'echostars-v145-four-filter-toolbar';
const HOME_CACHE_KEY = 'echostars_home_cache_v3_3';
let syncFrame = 0;
let categoryLabel = '全部分類';
let categoryWasChosen = false;
let openMenuKey = '';
let activeSortGroup: '' | 'time' | 'popular' | 'advanced' = '';
let timeModeIndex = 0;
let popularModeIndex = 0;

type SortDirection = 'asc' | 'desc';
type SortMode = { label: string; originalLabel?: string; direction?: SortDirection; favorite?: boolean };
type CachedTrack = { id?: string; favoriteCount?: number };

const TIME_MODES: SortMode[] = [
  { label: '最新上架', originalLabel: '時間', direction: 'desc' },
  { label: '最早上架', originalLabel: '時間', direction: 'asc' }
];

const POPULAR_MODES: SortMode[] = [
  { label: '評價最高', originalLabel: '評價', direction: 'desc' },
  { label: '按讚最多', originalLabel: '按讚', direction: 'desc' },
  { label: '心得最多', originalLabel: '心得', direction: 'desc' },
  { label: '收藏人數', favorite: true }
];

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .v141-member-teaser-summary .v141-member-teaser-unlock {
      flex: 0 0 76% !important;
      width: 76% !important;
      max-width: 360px !important;
      min-width: 0 !important;
      margin: .52rem auto 0 !important;
      padding-inline: .85rem !important;
    }

    html.echostars-v141-home .sort-toolbar.v145-original-sort-engine {
      position: absolute !important;
      left: -10000px !important;
      top: 0 !important;
      width: 1px !important;
      height: 1px !important;
      margin: 0 !important;
      padding: 0 !important;
      opacity: 0 !important;
      overflow: visible !important;
      pointer-events: none !important;
      z-index: -1 !important;
    }

    .v145-filter-toolbar {
      position: relative;
      z-index: 45;
      display: grid;
      grid-template-columns: 1.08fr 1fr 1fr 1.12fr;
      gap: .42rem;
      width: 100%;
      margin: .12rem 0 .08rem;
    }
    .v145-filter-group { position: relative; min-width: 0; }
    .v145-filter-button {
      appearance: none;
      width: 100%;
      height: 48px;
      min-width: 0;
      padding: 0 .55rem;
      border-radius: 15px;
      border: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 64%,white);
      background: var(--color-primary,#c06c84);
      color: #fff;
      box-shadow: 0 8px 18px color-mix(in srgb,var(--color-primary,#c06c84) 24%,transparent);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: .28rem;
      font-size: .78rem;
      font-weight: 900;
      line-height: 1;
      white-space: nowrap;
      cursor: pointer;
      transition: border-color .15s ease, background .15s ease, transform .15s ease, box-shadow .15s ease, filter .15s ease;
    }
    .v145-filter-button:hover,
    .v145-filter-button[data-open="true"] {
      filter: brightness(1.08);
      border-color: color-mix(in srgb,var(--color-primary,#c06c84) 44%,white);
    }
    .v145-filter-button[data-active="true"] {
      background: color-mix(in srgb,var(--color-primary,#c06c84) 70%,white);
      border-color: #fff;
      box-shadow:
        0 0 0 3px color-mix(in srgb,var(--color-primary,#c06c84) 26%,transparent),
        0 10px 24px color-mix(in srgb,var(--color-primary,#c06c84) 42%,transparent);
      transform: translateY(-1px);
      filter: saturate(1.16) brightness(1.08);
    }
    .v145-filter-button:active { transform: scale(.98); }
    .v145-filter-button-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .v145-filter-chevron {
      flex: 0 0 auto;
      font-size: .72rem;
      color: rgba(255,255,255,.9);
      transform: translateY(-1px);
    }
    .v145-filter-sliders {
      width: 1.05rem;
      height: 1.05rem;
      flex: 0 0 auto;
      display: block;
    }
    .v145-filter-menu {
      position: absolute;
      top: calc(100% + .42rem);
      left: 0;
      min-width: 100%;
      width: max-content;
      max-width: min(78vw, 260px);
      padding: .35rem;
      border-radius: 14px;
      border: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 56%,white);
      background: color-mix(in srgb,var(--color-primary,#c06c84) 84%,#111827);
      color: #fff;
      box-shadow: 0 16px 36px color-mix(in srgb,var(--color-primary,#c06c84) 34%,transparent);
      backdrop-filter: blur(14px);
      z-index: 260;
    }
    .v145-filter-group:nth-child(4) .v145-filter-menu { left: auto; right: 0; }
    .v145-filter-menu button {
      width: 100%;
      border: 0;
      border-radius: 10px;
      padding: .62rem .7rem;
      background: transparent;
      color: #fff;
      text-align: left;
      font-size: .78rem;
      font-weight: 800;
      white-space: nowrap;
      cursor: pointer;
    }
    .v145-filter-menu button:hover,
    .v145-filter-menu button:focus-visible,
    .v145-filter-menu button[data-selected="true"] {
      outline: none;
      background: color-mix(in srgb,var(--color-primary,#c06c84) 62%,white);
      color: #fff;
    }

    @media (max-width: 639px) {
      .v141-member-teaser-summary .v141-member-teaser-unlock {
        flex-basis: 78% !important;
        width: 78% !important;
        max-width: 310px !important;
        font-size: .8rem !important;
      }
      .v145-filter-toolbar { gap: .28rem; }
      .v145-filter-button {
        height: 46px;
        padding: 0 .22rem;
        border-radius: 13px;
        font-size: .66rem;
        gap: .16rem;
      }
      .v145-filter-chevron { font-size: .62rem; }
      .v145-filter-sliders { width: .9rem; height: .9rem; }
      .v145-filter-menu button { font-size: .74rem; }
    }

    @media (max-width: 365px) {
      .v145-filter-toolbar { gap: .2rem; }
      .v145-filter-button { font-size: .6rem; }
    }
  `;
  document.head.appendChild(style);
}

function readCategories(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOME_CACHE_KEY) || 'null');
    const rawCategories: unknown[] = Array.isArray(parsed?.categories) ? parsed.categories : [];
    const categories: string[] = rawCategories.map((value: unknown) => String(value)).filter(Boolean);
    const unique: string[] = Array.from(new Set<string>(categories));
    if (!unique.includes('全部')) unique.unshift('全部');
    return unique.length ? unique : ['全部'];
  } catch {
    return ['全部'];
  }
}

function readCachedTracks(): CachedTrack[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOME_CACHE_KEY) || 'null');
    return Array.isArray(parsed?.tracks) ? parsed.tracks : [];
  } catch {
    return [];
  }
}

function getOriginalToolbar() {
  return document.querySelector<HTMLElement>('.sort-toolbar');
}

function originalButtons() {
  const toolbar = getOriginalToolbar();
  if (!toolbar) return [] as HTMLButtonElement[];
  return Array.from(toolbar.querySelectorAll<HTMLButtonElement>('.sort-toolbar-item > button'));
}

function findOriginalButton(label: string) {
  return originalButtons().find(button => (button.textContent || '').replace(/\s+/g, '').startsWith(label));
}

function currentSortDirection(button: HTMLButtonElement) {
  if (button.querySelector('.lucide-arrow-down')) return 'desc';
  if (button.querySelector('.lucide-arrow-up')) return 'asc';
  return '';
}

function clearFavoriteOrder() {
  document.querySelectorAll<HTMLElement>('[data-track-card-id]').forEach(card => {
    if (card.dataset.v145FavoriteOrder === '1') {
      card.style.removeProperty('order');
      delete card.dataset.v145FavoriteOrder;
    }
  });
}

function applyFavoriteOrder() {
  const counts = new Map<string, number>();
  readCachedTracks().forEach(track => {
    const id = String(track.id || '');
    if (!id) return;
    counts.set(id, Math.max(0, Number(track.favoriteCount || 0)));
  });
  const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-track-card-id]'));
  const ranked = cards
    .map((card, index) => ({ card, index, id: String(card.dataset.trackCardId || ''), count: counts.get(String(card.dataset.trackCardId || '')) || 0 }))
    .sort((a, b) => b.count - a.count || a.index - b.index);
  ranked.forEach((item, index) => {
    item.card.style.order = String(index);
    item.card.dataset.v145FavoriteOrder = '1';
  });
}

function setOriginalSort(label: string, direction: SortDirection) {
  clearFavoriteOrder();
  let attempt = 0;
  const apply = () => {
    const button = findOriginalButton(label);
    if (!button) return;
    const active = button.classList.contains('ring-2');
    const current = currentSortDirection(button);
    if (active && current === direction) return;
    button.click();
    attempt += 1;
    if (attempt < 3) window.setTimeout(apply, 40);
  };
  apply();
}

function setOriginalCategory(category: string) {
  const toolbar = getOriginalToolbar();
  const categoryButton = findOriginalButton('分類');
  if (!toolbar || !categoryButton) return;

  let attempt = 0;
  const choose = () => {
    const option = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button !== categoryButton && button.textContent?.trim() === category);
    if (option) {
      option.click();
      categoryLabel = category === '全部' ? '全部分類' : category;
      categoryWasChosen = true;
      queueSync();
      return;
    }
    if (attempt === 0) categoryButton.click();
    attempt += 1;
    if (attempt < 9) {
      window.setTimeout(choose, 45);
    } else {
      const openedCategoryButton = findOriginalButton('分類');
      if (openedCategoryButton?.getAttribute('aria-expanded') === 'true') openedCategoryButton.click();
    }
  };
  choose();
}

function makeSlidersSvg() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'v145-filter-sliders');
  const lines = [
    ['4','21','14','21'], ['4','10','2','10'], ['4','10','22','10'],
    ['4','3','6','3'], ['4','3','22','3'], ['4','17','10','17'], ['4','17','22','17']
  ];
  lines.forEach(values => {
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', values[0]);
    line.setAttribute('x2', values[1]);
    line.setAttribute('y1', values[2]);
    line.setAttribute('y2', values[3]);
    svg.appendChild(line);
  });
  return svg;
}

function closeMenus() {
  openMenuKey = '';
  document.querySelectorAll<HTMLElement>('[data-v145-menu]').forEach(menu => { menu.hidden = true; });
  document.querySelectorAll<HTMLButtonElement>('.v145-filter-button').forEach(button => {
    button.dataset.open = 'false';
    button.setAttribute('aria-expanded', 'false');
  });
}

function createMenu(key: string, entries: Array<{ label: string; selected?: () => boolean; run: () => void }>) {
  const menu = document.createElement('div');
  menu.className = 'v145-filter-menu';
  menu.dataset.v145Menu = key;
  menu.hidden = true;
  entries.forEach(entry => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = entry.label;
    if (entry.selected?.()) button.dataset.selected = 'true';
    button.addEventListener('click', event => {
      event.stopPropagation();
      closeMenus();
      entry.run();
    });
    menu.appendChild(button);
  });
  return menu;
}

function createMenuGroup(key: string, label: string, menu: HTMLElement, advanced = false) {
  const group = document.createElement('div');
  group.className = 'v145-filter-group';
  group.dataset.v145Group = key;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'v145-filter-button';
  button.dataset.v145Button = key;
  button.dataset.open = 'false';
  button.dataset.active = 'false';
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');

  if (advanced) button.appendChild(makeSlidersSvg());
  const text = document.createElement('span');
  text.className = 'v145-filter-button-label';
  text.dataset.v145Label = key;
  text.textContent = label;
  button.appendChild(text);
  const chevron = document.createElement('span');
  chevron.className = 'v145-filter-chevron';
  chevron.textContent = '▼';
  button.appendChild(chevron);

  button.addEventListener('click', event => {
    event.stopPropagation();
    const willOpen = openMenuKey !== key || menu.hidden;
    closeMenus();
    if (willOpen) {
      openMenuKey = key;
      menu.hidden = false;
      button.dataset.open = 'true';
      button.setAttribute('aria-expanded', 'true');
    }
  });

  group.append(button, menu);
  return group;
}

function createCycleGroup(key: 'time' | 'popular', label: string, onPress: () => void) {
  const group = document.createElement('div');
  group.className = 'v145-filter-group';
  group.dataset.v145Group = key;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'v145-filter-button';
  button.dataset.v145Button = key;
  button.dataset.open = 'false';
  button.dataset.active = 'false';
  const text = document.createElement('span');
  text.className = 'v145-filter-button-label';
  text.dataset.v145Label = key;
  text.textContent = label;
  button.appendChild(text);
  button.addEventListener('click', event => {
    event.stopPropagation();
    closeMenus();
    onPress();
  });
  group.appendChild(button);
  return group;
}

function activateTimeCycle() {
  if (activeSortGroup === 'time') timeModeIndex = (timeModeIndex + 1) % TIME_MODES.length;
  activeSortGroup = 'time';
  const mode = TIME_MODES[timeModeIndex];
  if (mode.originalLabel && mode.direction) setOriginalSort(mode.originalLabel, mode.direction);
  queueSync();
}

function activatePopularCycle() {
  if (activeSortGroup === 'popular') popularModeIndex = (popularModeIndex + 1) % POPULAR_MODES.length;
  else popularModeIndex = 0;
  activeSortGroup = 'popular';
  const mode = POPULAR_MODES[popularModeIndex];
  if (mode.favorite) applyFavoriteOrder();
  else if (mode.originalLabel && mode.direction) setOriginalSort(mode.originalLabel, mode.direction);
  queueSync();
}

function activateAdvanced(label: string, direction: SortDirection) {
  activeSortGroup = 'advanced';
  setOriginalSort(label, direction);
  queueSync();
}

function createToolbar() {
  const bar = document.createElement('section');
  bar.className = 'v145-filter-toolbar';
  bar.dataset.v145FilterToolbar = '1';
  bar.setAttribute('aria-label', '首頁分類與排序');

  const categoryMenu = createMenu('category', readCategories().map(category => ({
    label: category === '全部' ? '全部分類' : category,
    selected: () => categoryLabel === (category === '全部' ? '全部分類' : category),
    run: () => setOriginalCategory(category)
  })));
  const advancedMenu = createMenu('advanced', [
    { label: '權限：公開 → 高階', run: () => activateAdvanced('權限', 'asc') },
    { label: '權限：高階 → 公開', run: () => activateAdvanced('權限', 'desc') },
    { label: '貼紙排序', run: () => activateAdvanced('貼紙', 'asc') },
    { label: '恢復預設排序', run: () => activateAdvanced('權限', 'asc') }
  ]);

  bar.append(
    createMenuGroup('category', categoryLabel, categoryMenu),
    createCycleGroup('time', TIME_MODES[timeModeIndex].label, activateTimeCycle),
    createCycleGroup('popular', '熱門推薦', activatePopularCycle),
    createMenuGroup('advanced', '進階篩選', advancedMenu, true)
  );
  return bar;
}

function syncToolbar() {
  installStyles();
  const original = getOriginalToolbar();
  if (!original) return;
  original.classList.add('v145-original-sort-engine');
  original.setAttribute('aria-hidden', 'true');

  let custom = document.querySelector<HTMLElement>('[data-v145-filter-toolbar]');
  if (!custom) {
    custom = createToolbar();
    original.before(custom);
  } else if (custom.nextElementSibling !== original) {
    original.before(custom);
  }

  const labels: Record<string, string> = {
    category: categoryLabel,
    time: TIME_MODES[timeModeIndex].label,
    popular: activeSortGroup === 'popular' ? POPULAR_MODES[popularModeIndex].label : '熱門推薦',
    advanced: '進階篩選'
  };
  Object.entries(labels).forEach(([key, value]) => {
    const label = custom?.querySelector<HTMLElement>(`[data-v145-label="${key}"]`);
    if (label && label.textContent !== value) label.textContent = value;
  });

  const activeStates: Record<string, boolean> = {
    category: categoryWasChosen,
    time: activeSortGroup === 'time',
    popular: activeSortGroup === 'popular',
    advanced: activeSortGroup === 'advanced'
  };
  Object.entries(activeStates).forEach(([key, active]) => {
    const button = custom?.querySelector<HTMLButtonElement>(`[data-v145-button="${key}"]`);
    if (button) button.dataset.active = active ? 'true' : 'false';
  });

  if (activeSortGroup === 'popular' && POPULAR_MODES[popularModeIndex].favorite) applyFavoriteOrder();
}

function queueSync() {
  if (syncFrame) return;
  syncFrame = window.requestAnimationFrame(() => {
    syncFrame = 0;
    syncToolbar();
  });
}

installStyles();
syncToolbar();

document.addEventListener('click', event => {
  const target = event.target as Element | null;
  if (!target?.closest('[data-v145-filter-toolbar]')) closeMenus();
});

window.addEventListener('pageshow', queueSync);
window.addEventListener('storage', event => {
  if (event.key === HOME_CACHE_KEY) queueSync();
});
window.addEventListener('echostars-favorites-changed', () => window.setTimeout(queueSync, 250));

const observer = new MutationObserver(queueSync);
observer.observe(document.body, { childList: true, subtree: true });
