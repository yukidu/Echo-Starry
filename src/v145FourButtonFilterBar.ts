const STYLE_ID = 'echostars-v145-four-button-filter-bar';
const BAR_ID = 'echostars-v145-filter-bar';
const HOME_CACHE_KEY = 'echostars_home_cache_v3_3';
export const FILTER_RESTORE_CODE = 'FILTER-RESTORE-01';
let syncFrame = 0;

type SortDirection = 'asc' | 'desc';
type MenuKind = 'category' | 'latest' | 'popular' | 'advanced';

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* FILTER-RESTORE-01: remove v145 script from index.html to restore v144 filter UI. */
    .v141-member-teaser-summary .v141-member-teaser-unlock {
      flex: 0 0 auto !important;
      width: auto !important;
      max-width: min(100%, 18rem) !important;
      min-height: 42px !important;
      margin: .52rem auto 0 !important;
      padding: .62rem 1.25rem !important;
      border-radius: 999px !important;
      white-space: normal !important;
    }
    html.echostars-v141-home .sort-toolbar.v145-legacy-toolbar {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      clip-path: inset(50%) !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
    .v145-primary-filter-bar {
      position: relative;
      z-index: 120;
      display: grid;
      grid-template-columns: 1.13fr 1fr 1fr 1.13fr;
      gap: .42rem;
      width: 100%;
      margin: .04rem 0 .12rem;
    }
    .v145-filter-slot { position: relative; min-width: 0; }
    .v145-filter-main {
      appearance: none;
      width: 100%;
      height: 48px;
      padding: 0 .5rem;
      border-radius: 15px;
      border: 1px solid rgba(100,116,139,.68);
      background: linear-gradient(180deg,#1d293b 0%,#111827 100%);
      color: #f8fafc;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.055), 0 8px 18px rgba(2,6,23,.28);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: .26rem;
      font-size: .78rem;
      font-weight: 850;
      line-height: 1;
      white-space: nowrap;
      cursor: pointer;
      transition: transform .14s ease, border-color .14s ease, background .14s ease;
    }
    .v145-filter-main:hover,
    .v145-filter-main[aria-expanded="true"] {
      border-color: color-mix(in srgb,var(--color-primary,#c06c84) 62%,#64748b);
      background: linear-gradient(180deg,#263449 0%,#172033 100%);
    }
    .v145-filter-main:active { transform: scale(.98); }
    .v145-filter-main svg { width: 1.05rem; height: 1.05rem; flex: 0 0 auto; }
    .v145-filter-chevron { font-size: .72rem; opacity: .82; transform: translateY(-1px); }
    .v145-filter-menu {
      position: absolute;
      top: calc(100% + .5rem);
      left: 0;
      z-index: 180;
      min-width: 9.5rem;
      max-width: min(88vw,21rem);
      padding: .38rem;
      border-radius: 15px;
      border: 1px solid rgba(71,85,105,.86);
      background: rgba(15,23,42,.985);
      color: #f8fafc;
      box-shadow: 0 18px 40px rgba(2,6,23,.46);
      backdrop-filter: blur(14px);
    }
    .v145-filter-slot:last-child .v145-filter-menu { left: auto; right: 0; }
    .v145-filter-menu[hidden] { display: none !important; }
    .v145-filter-menu button {
      appearance: none;
      width: 100%;
      border: 0;
      border-radius: 10px;
      padding: .62rem .7rem;
      background: transparent;
      color: #e2e8f0;
      text-align: left;
      font-size: .78rem;
      font-weight: 760;
      cursor: pointer;
    }
    .v145-filter-menu button:hover { background: rgba(255,255,255,.08); color: #fff; }
    .v145-filter-menu-title {
      padding: .35rem .55rem .25rem;
      color: #94a3b8;
      font-size: .66rem;
      font-weight: 850;
      letter-spacing: .04em;
    }
    .v145-advanced-grid {
      display: grid;
      grid-template-columns: repeat(2,minmax(0,1fr));
      gap: .18rem;
      width: min(20rem,82vw);
    }
    .v145-advanced-grid button { text-align: center; padding-inline: .35rem; }
    .v142-favorites-mode > .v145-primary-filter-bar { display: none !important; }
    @media (max-width: 639px) {
      .v141-member-teaser-summary .v141-member-teaser-unlock {
        max-width: 16.5rem !important;
        padding-inline: 1rem !important;
      }
      .v145-primary-filter-bar { gap: .28rem; }
      .v145-filter-main {
        height: 46px;
        padding-inline: .24rem;
        border-radius: 13px;
        font-size: 10px;
        gap: .16rem;
      }
      .v145-filter-main svg { width: .9rem; height: .9rem; }
      .v145-filter-chevron { font-size: 9px; }
    }
  `;
  document.head.appendChild(style);
  document.documentElement.dataset.filterRestoreCode = FILTER_RESTORE_CODE;
}

function legacyToolbar() {
  return document.querySelector<HTMLElement>('.sort-toolbar:not(.v145-primary-filter-bar)');
}
function cleanText(value?: string | null) { return String(value || '').replace(/\s+/g, '').trim(); }
function legacyButtons() {
  const toolbar = legacyToolbar();
  return toolbar ? Array.from(toolbar.querySelectorAll<HTMLButtonElement>('.sort-toolbar-item > button')) : [];
}
function findLegacyButton(label: string) {
  const target = cleanText(label);
  return legacyButtons().find(button => cleanText(button.textContent) === target) || null;
}
function directionOf(button: HTMLButtonElement): SortDirection | null {
  const icon = button.querySelector<HTMLElement>('.sort-direction-icon');
  if (!icon) return null;
  const paths = Array.from(icon.querySelectorAll('path'))
    .map(path => String(path.getAttribute('d') || '').replace(/[\s,]/g, '').toLowerCase()).join('|');
  if (paths.includes('m125v14') || paths.includes('m1912-77-7-7')) return 'desc';
  if (paths.includes('m1219v5') || paths.includes('m5127-777')) return 'asc';
  return null;
}
function afterReactPaint() {
  return new Promise<void>(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
}
async function driveSort(label: string, desired: SortDirection) {
  const button = findLegacyButton(label);
  if (!button) return;
  let direction = directionOf(button);
  if (!direction) {
    button.click();
    await afterReactPaint();
    direction = directionOf(button);
  }
  if (direction && direction !== desired) {
    button.click();
    await afterReactPaint();
  } else if (!direction && desired === 'asc') {
    button.click();
    await afterReactPaint();
  }
}
function readCategories() {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOME_CACHE_KEY) || 'null');
    const categories = Array.isArray(parsed?.categories) ? parsed.categories.map(String).filter(Boolean) : [];
    const unique = Array.from(new Set(categories));
    return unique.includes('全部') ? unique : ['全部', ...unique];
  } catch { return ['全部']; }
}
async function driveCategory(category: string) {
  const toolbar = legacyToolbar();
  const categoryButton = findLegacyButton('分類');
  if (!toolbar || !categoryButton) return;
  const findOption = () => Array.from(toolbar.querySelectorAll<HTMLButtonElement>('button'))
    .find(button => button !== categoryButton && cleanText(button.textContent) === cleanText(category));
  let option = findOption();
  if (!option) {
    categoryButton.click();
    await afterReactPaint();
    option = findOption();
  }
  option?.click();
  await afterReactPaint();
}
function makeSlidersIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('aria-hidden', 'true');
  [['4','6','20','6'],['4','12','20','12'],['4','18','20','18']].forEach(([x1,y1,x2,y2]) => {
    const line = document.createElementNS(ns, 'line'); line.setAttribute('x1', x1); line.setAttribute('y1', y1); line.setAttribute('x2', x2); line.setAttribute('y2', y2); svg.appendChild(line);
  });
  [['9','6'],['15','12'],['11','18']].forEach(([cx,cy]) => {
    const circle = document.createElementNS(ns, 'circle'); circle.setAttribute('cx', cx); circle.setAttribute('cy', cy); circle.setAttribute('r', '2'); circle.setAttribute('fill', '#111827'); svg.appendChild(circle);
  });
  return svg;
}
function closeAllMenus(except?: MenuKind) {
  document.querySelectorAll<HTMLElement>('.v145-filter-menu').forEach(menu => { if (menu.dataset.menuKind !== except) menu.hidden = true; });
  document.querySelectorAll<HTMLButtonElement>('.v145-filter-main').forEach(button => { if (button.dataset.menuKind !== except) button.setAttribute('aria-expanded', 'false'); });
}
function menuButton(text: string, action: () => void | Promise<void>) {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = text;
  button.addEventListener('click', event => { event.stopPropagation(); closeAllMenus(); void action(); });
  return button;
}
function populateMenu(kind: MenuKind, menu: HTMLElement) {
  menu.replaceChildren();
  if (kind === 'category') {
    readCategories().forEach(category => menu.appendChild(menuButton(category === '全部' ? '全部分類' : category, () => driveCategory(category))));
    return;
  }
  if (kind === 'latest') {
    menu.append(menuButton('最新上架', () => driveSort('時間', 'desc')), menuButton('最早上架', () => driveSort('時間', 'asc')));
    return;
  }
  if (kind === 'popular') {
    menu.append(
      menuButton('熱門推薦（按讚最多）', () => driveSort('按讚', 'desc')),
      menuButton('評價最高', () => driveSort('評價', 'desc')),
      menuButton('心得最多', () => driveSort('心得', 'desc'))
    );
    return;
  }
  const title = document.createElement('div'); title.className = 'v145-filter-menu-title'; title.textContent = '更多排序方式';
  const grid = document.createElement('div'); grid.className = 'v145-advanced-grid';
  grid.append(
    menuButton('權限：公開→高階', () => driveSort('權限', 'asc')),
    menuButton('權限：高階→公開', () => driveSort('權限', 'desc')),
    menuButton('貼紙：低→高', () => driveSort('貼紙', 'asc')),
    menuButton('貼紙：高→低', () => driveSort('貼紙', 'desc')),
    menuButton('評價最高', () => driveSort('評價', 'desc')),
    menuButton('心得最多', () => driveSort('心得', 'desc')),
    menuButton('按讚最多', () => driveSort('按讚', 'desc')),
    menuButton('最新上架', () => driveSort('時間', 'desc'))
  );
  menu.append(title, grid);
}
function makeSlot(kind: MenuKind, label: string, slider = false) {
  const slot = document.createElement('div'); slot.className = 'v145-filter-slot';
  const main = document.createElement('button'); main.type = 'button'; main.className = 'v145-filter-main'; main.dataset.menuKind = kind;
  main.setAttribute('aria-expanded', 'false'); main.setAttribute('aria-haspopup', 'menu');
  if (slider) main.appendChild(makeSlidersIcon());
  const text = document.createElement('span'); text.textContent = label; main.appendChild(text);
  if (!slider) { const chevron = document.createElement('span'); chevron.className = 'v145-filter-chevron'; chevron.textContent = '▼'; chevron.setAttribute('aria-hidden', 'true'); main.appendChild(chevron); }
  const menu = document.createElement('div'); menu.className = 'v145-filter-menu'; menu.dataset.menuKind = kind; menu.hidden = true; menu.setAttribute('role', 'menu');
  main.addEventListener('click', event => {
    event.stopPropagation();
    const open = menu.hidden;
    closeAllMenus(open ? kind : undefined);
    menu.hidden = !open;
    main.setAttribute('aria-expanded', String(open));
    if (open) populateMenu(kind, menu);
  });
  slot.append(main, menu);
  return slot;
}
function createBar() {
  const bar = document.createElement('section');
  bar.id = BAR_ID; bar.className = 'v145-primary-filter-bar'; bar.dataset.restoreCode = FILTER_RESTORE_CODE; bar.setAttribute('aria-label', '首頁分類與排序');
  bar.append(makeSlot('category', '全部分類'), makeSlot('latest', '最新上架'), makeSlot('popular', '熱門推薦'), makeSlot('advanced', '進階篩選', true));
  return bar;
}
function sync() {
  installStyles();
  const legacy = legacyToolbar();
  const current = document.getElementById(BAR_ID);
  if (!legacy) { current?.remove(); return; }
  legacy.classList.add('v145-legacy-toolbar');
  if (!current) legacy.before(createBar());
  else if (current.nextElementSibling !== legacy) legacy.before(current);
}
function queueSync() {
  if (syncFrame) return;
  syncFrame = window.requestAnimationFrame(() => { syncFrame = 0; sync(); });
}
installStyles();
sync();
document.addEventListener('click', event => {
  const target = event.target as Element | null;
  if (target?.closest(`#${BAR_ID}`)) return;
  closeAllMenus();
});
window.addEventListener('pageshow', queueSync);
window.addEventListener('storage', event => { if (event.key === HOME_CACHE_KEY) queueSync(); });
const observer = new MutationObserver(queueSync);
observer.observe(document.body, { childList: true, subtree: true });
