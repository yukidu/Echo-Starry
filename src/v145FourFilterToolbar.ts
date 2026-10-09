const STYLE_ID = 'echostars-v145-four-filter-toolbar';
const HOME_CACHE_KEY = 'echostars_home_cache_v3_3';
const RESTORE_CODE = 'FILTER-RESTORE-145';
let syncFrame = 0;
let categoryLabel = '全部分類';
let openMenuKey = '';

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* ${RESTORE_CODE}: remove/disable only this v145 toolbar layer to restore the previous filter row. */
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
      border: 1px solid #41506a;
      background: linear-gradient(180deg,#1d293b 0%,#111827 100%);
      color: #f8fafc;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 8px 18px rgba(2,6,23,.25);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: .28rem;
      font-size: .78rem;
      font-weight: 850;
      line-height: 1;
      white-space: nowrap;
      cursor: pointer;
      transition: border-color .15s ease, background .15s ease, transform .15s ease, box-shadow .15s ease;
    }
    .v145-filter-button:hover,
    .v145-filter-button[data-open="true"] {
      border-color: color-mix(in srgb,var(--color-primary,#c06c84) 68%,#64748b);
      background: linear-gradient(180deg,#26364e 0%,#172033 100%);
      box-shadow: 0 0 0 1px color-mix(in srgb,var(--color-primary,#c06c84) 18%,transparent), 0 9px 20px rgba(2,6,23,.28);
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
      color: #cbd5e1;
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
      border: 1px solid #334155;
      background: rgba(15,23,42,.98);
      color: #f8fafc;
      box-shadow: 0 16px 36px rgba(2,6,23,.42);
      backdrop-filter: blur(14px);
      z-index: 260;
    }
    .v145-filter-group:nth-child(3) .v145-filter-menu,
    .v145-filter-group:nth-child(4) .v145-filter-menu { left: auto; right: 0; }
    .v145-filter-menu button {
      width: 100%;
      border: 0;
      border-radius: 10px;
      padding: .62rem .7rem;
      background: transparent;
      color: #e2e8f0;
      text-align: left;
      font-size: .78rem;
      font-weight: 750;
      white-space: nowrap;
      cursor: pointer;
    }
    .v145-filter-menu button:hover,
    .v145-filter-menu button:focus-visible {
      outline: none;
      background: color-mix(in srgb,var(--color-primary,#c06c84) 22%,#111827);
      color: #fff;
    }
    .v145-filter-menu-note {
      padding: .45rem .7rem .25rem;
      color: #94a3b8;
      font-size: .64rem;
      line-height: 1.35;
      white-space: normal;
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

function setOriginalSort(label: string, direction: 'asc' | 'desc') {
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
  document.querySelectorAll<HTMLButtonElement>('.v145-filter-button').forEach(button => { button.dataset.open = 'false'; });
}

function createMenu(key: string, entries: Array<{ label: string; run: () => void }>, note?: string) {
  const menu = document.createElement('div');
  menu.className = 'v145-filter-menu';
  menu.dataset.v145Menu = key;
  menu.hidden = true;
  entries.forEach(entry => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = entry.label;
    button.addEventListener('click', event => {
      event.stopPropagation();
      closeMenus();
      entry.run();
    });
    menu.appendChild(button);
  });
  if (note) {
    const help = document.createElement('div');
    help.className = 'v145-filter-menu-note';
    help.textContent = note;
    menu.appendChild(help);
  }
  return menu;
}

function createFilterGroup(key: string, label: string, menu: HTMLElement, advanced = false) {
  const group = document.createElement('div');
  group.className = 'v145-filter-group';
  group.dataset.v145Group = key;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'v145-filter-button';
  button.dataset.v145Button = key;
  button.dataset.open = 'false';
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');

  if (advanced) button.appendChild(makeSlidersSvg());
  const text = document.createElement('span');
  text.className = 'v145-filter-button-label';
  text.dataset.v145Label = key;
  text.textContent = label;
  button.appendChild(text);
  if (!advanced) {
    const chevron = document.createElement('span');
    chevron.className = 'v145-filter-chevron';
    chevron.textContent = '▼';
    button.appendChild(chevron);
  }

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

function createToolbar() {
  const bar = document.createElement('section');
  bar.className = 'v145-filter-toolbar';
  bar.dataset.v145FilterToolbar = '1';
  bar.setAttribute('aria-label', '首頁分類與排序');

  const categoryMenu = createMenu('category', readCategories().map(category => ({
    label: category === '全部' ? '全部分類' : category,
    run: () => setOriginalCategory(category)
  })));
  const timeMenu = createMenu('time', [
    { label: '最新上架', run: () => setOriginalSort('時間', 'desc') },
    { label: '最早上架', run: () => setOriginalSort('時間', 'asc') }
  ]);
  const popularMenu = createMenu('popular', [
    { label: '評價最高', run: () => setOriginalSort('評價', 'desc') },
    { label: '按讚最多', run: () => setOriginalSort('按讚', 'desc') },
    { label: '心得最多', run: () => setOriginalSort('心得', 'desc') }
  ]);
  const advancedMenu = createMenu('advanced', [
    { label: '權限：公開 → 高階', run: () => setOriginalSort('權限', 'asc') },
    { label: '權限：高階 → 公開', run: () => setOriginalSort('權限', 'desc') },
    { label: '貼紙排序', run: () => setOriginalSort('貼紙', 'asc') },
    { label: '恢復預設排序', run: () => setOriginalSort('權限', 'asc') }
  ], `快速復原代碼：${RESTORE_CODE}`);

  bar.append(
    createFilterGroup('category', categoryLabel, categoryMenu),
    createFilterGroup('time', '最新上架', timeMenu),
    createFilterGroup('popular', '熱門推薦', popularMenu),
    createFilterGroup('advanced', '進階篩選', advancedMenu, true)
  );
  return bar;
}

function syncToolbar() {
  installStyles();
  const original = getOriginalToolbar();
  if (!original) return;
  original.classList.add('v145-original-sort-engine');
  original.setAttribute('aria-hidden', 'true');
  original.dataset.v145RestoreCode = RESTORE_CODE;

  let custom = document.querySelector<HTMLElement>('[data-v145-filter-toolbar]');
  if (!custom) {
    custom = createToolbar();
    original.before(custom);
  } else if (custom.nextElementSibling !== original) {
    original.before(custom);
  }
  const categoryText = custom.querySelector<HTMLElement>('[data-v145-label="category"]');
  if (categoryText && categoryText.textContent !== categoryLabel) categoryText.textContent = categoryLabel;
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

const observer = new MutationObserver(queueSync);
observer.observe(document.body, { childList: true, subtree: true });
