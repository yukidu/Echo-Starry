const ENABLE_V145_BLACK_FILTER_ARCHITECTURE = true;
const STYLE_ID = 'echostars-v145-black-filter-architecture';
const ROOT_ID = 'echostars-v145-filter-root';
const HOME_CACHE_KEY = 'echostars_home_cache_v3_3';

type SortDirection = 'asc' | 'desc';
type ProxySortState = { field: string; direction: SortDirection };

let syncFrame = 0;
let proxySortState: ProxySortState = { field: '權限', direction: 'asc' };
let registerTimer = 0;
let categoryTimer = 0;
let keywordTimer = 0;

function isGuestMode() {
  try { return !localStorage.getItem('sq_current_user_v1'); }
  catch { return true; }
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /*
     * v145 可快速復原：把檔案最上方 ENABLE_V145_BLACK_FILTER_ARCHITECTURE 改成 false，
     * 舊版 React 篩選列會立即恢復，不必刪除原始功能。
     */
    html.echostars-v145-filter .v141-home-search-row > button:first-child {
      display: none !important;
    }
    html.echostars-v145-filter .v141-home-search-row {
      gap: 0 !important;
    }
    html.echostars-v145-filter .v141-home-search-row input {
      height: 52px !important;
      border-radius: 18px !important;
      background: linear-gradient(180deg,#172235 0%,#111827 100%) !important;
      color: #f8fafc !important;
      border: 1px solid #43506a !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.055), 0 9px 22px rgba(2,6,23,.22) !important;
    }
    html.echostars-v145-filter .v141-home-search-row input::placeholder {
      color: #a9b3c4 !important;
    }
    html.echostars-v145-filter .v141-home-search-row svg {
      color: #e2e8f0 !important;
    }
    html.echostars-v145-filter .v141-keywords,
    html.echostars-v145-filter .sort-toolbar {
      display: none !important;
    }
    #${ROOT_ID} {
      position: relative;
      z-index: 70;
      display: grid;
      grid-template-columns: repeat(4,minmax(0,1fr));
      gap: .46rem;
      margin-top: -.08rem;
    }
    #${ROOT_ID} .v145-filter-cell { position: relative; min-width: 0; }
    #${ROOT_ID} .v145-filter-main {
      width: 100%;
      min-width: 0;
      height: 50px;
      border-radius: 15px;
      border: 1px solid #43506a;
      background: linear-gradient(180deg,#1c2738 0%,#111827 100%);
      color: #f8fafc;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: .3rem;
      padding: 0 .48rem;
      font-size: .9rem;
      line-height: 1;
      font-weight: 850;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 8px 18px rgba(2,6,23,.22);
      cursor: pointer;
      transition: transform .16s ease, border-color .16s ease, filter .16s ease;
    }
    #${ROOT_ID} .v145-filter-main:hover {
      filter: brightness(1.08);
      transform: translateY(-1px);
    }
    #${ROOT_ID} .v145-filter-main[data-active="true"] {
      border-color: color-mix(in srgb,var(--color-primary,#c06c84) 74%,#f59e0b);
      box-shadow: 0 0 0 1px color-mix(in srgb,var(--color-primary,#c06c84) 38%,transparent),
                  inset 0 1px 0 rgba(255,255,255,.06), 0 9px 20px rgba(2,6,23,.25);
    }
    #${ROOT_ID} .v145-filter-arrow {
      flex: 0 0 auto;
      font-size: .75rem;
      opacity: .86;
    }
    #${ROOT_ID} .v145-filter-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #${ROOT_ID} .v145-filter-menu,
    #${ROOT_ID} .v145-advanced-panel {
      position: absolute;
      top: calc(100% + .45rem);
      left: 0;
      min-width: 100%;
      width: max-content;
      max-width: min(92vw,25rem);
      padding: .42rem;
      border-radius: 15px;
      border: 1px solid #3b475c;
      background: rgba(15,23,42,.985);
      color: #f8fafc;
      box-shadow: 0 18px 40px rgba(2,6,23,.42);
      backdrop-filter: blur(14px);
      z-index: 140;
    }
    #${ROOT_ID} .v145-filter-menu[hidden],
    #${ROOT_ID} .v145-advanced-panel[hidden] { display: none !important; }
    #${ROOT_ID} .v145-filter-menu button {
      width: 100%;
      min-width: 8.8rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .5rem;
      padding: .62rem .72rem;
      border-radius: 10px;
      color: #e5e7eb;
      font-size: .82rem;
      font-weight: 760;
      text-align: left;
      cursor: pointer;
    }
    #${ROOT_ID} .v145-filter-menu button:hover,
    #${ROOT_ID} .v145-filter-menu button[data-selected="true"] {
      background: rgba(255,255,255,.09);
      color: #fff;
    }
    #${ROOT_ID} .v145-advanced-panel {
      right: 0;
      left: auto;
      width: min(92vw,29rem);
      padding: .75rem;
    }
    #${ROOT_ID} .v145-advanced-title {
      margin: 0 0 .45rem;
      font-size: .75rem;
      font-weight: 900;
      color: #cbd5e1;
      letter-spacing: .02em;
    }
    #${ROOT_ID} .v145-chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: .38rem;
      margin-bottom: .72rem;
    }
    #${ROOT_ID} .v145-chip {
      min-height: 34px;
      padding: .42rem .64rem;
      border-radius: 10px;
      border: 1px solid #3b475c;
      background: #172033;
      color: #eef2f7;
      font-size: .75rem;
      font-weight: 780;
      cursor: pointer;
    }
    #${ROOT_ID} .v145-chip:hover,
    #${ROOT_ID} .v145-chip[data-selected="true"] {
      border-color: color-mix(in srgb,var(--color-primary,#c06c84) 68%,#64748b);
      background: color-mix(in srgb,var(--color-primary,#c06c84) 28%,#172033);
    }
    #${ROOT_ID} .v145-keywords {
      display: flex;
      flex-wrap: wrap;
      gap: .32rem;
      max-height: 9.5rem;
      overflow-y: auto;
      padding-right: .15rem;
    }
    #${ROOT_ID} .v145-panel-actions {
      display: flex;
      gap: .42rem;
      margin-top: .7rem;
    }
    #${ROOT_ID} .v145-panel-action {
      flex: 1;
      min-height: 38px;
      border-radius: 11px;
      border: 1px solid #43506a;
      background: #1f2937;
      color: #f8fafc;
      font-size: .77rem;
      font-weight: 850;
      cursor: pointer;
    }
    #${ROOT_ID} .v145-panel-action.primary {
      background: var(--color-primary,#c06c84);
      border-color: color-mix(in srgb,var(--color-primary,#c06c84) 72%,white);
    }
    html.echostars-v145-filter .v141-member-teaser-summary .v141-member-teaser-unlock {
      flex: 0 0 auto !important;
      width: auto !important;
      min-width: 0 !important;
      max-width: min(76vw,18rem) !important;
      min-height: 42px !important;
      margin: .52rem auto 0 !important;
      padding: .62rem 1.15rem !important;
      border-radius: 14px !important;
    }
    @media (max-width: 639px) {
      #${ROOT_ID} { gap: .3rem; }
      #${ROOT_ID} .v145-filter-main {
        height: 46px;
        border-radius: 13px;
        font-size: .72rem;
        padding-inline: .3rem;
        gap: .18rem;
      }
      #${ROOT_ID} .v145-filter-arrow { font-size: .64rem; }
      #${ROOT_ID} .v145-advanced-panel { width: min(95vw,27rem); }
      html.echostars-v145-filter .v141-member-teaser-summary .v141-member-teaser-unlock {
        max-width: min(78vw,16rem) !important;
        font-size: .82rem !important;
      }
    }
    @media (max-width: 390px) {
      #${ROOT_ID} .v145-filter-main { font-size: .66rem; }
    }
  `;
  document.head.appendChild(style);
}

function homeShell() {
  return document.querySelector<HTMLElement>('.v141-home-shell');
}

function originalToolbar() {
  return homeShell()?.querySelector<HTMLElement>(':scope > .sort-toolbar') || null;
}

function keywordBlock() {
  return homeShell()?.querySelector<HTMLElement>(':scope > .v141-keywords') || null;
}

function searchRow() {
  return homeShell()?.querySelector<HTMLElement>(':scope > .v141-home-search-row') || null;
}

function labelText(button: Element | null | undefined) {
  return (button?.textContent || '').replace(/\s+/g,'').trim();
}

function originalSortButton(field: string) {
  const toolbar = originalToolbar();
  if (!toolbar) return null;
  const normalized = field === '留言' ? '心得' : field;
  return Array.from(toolbar.querySelectorAll<HTMLButtonElement>('.sort-toolbar-item > button'))
    .find(button => labelText(button).startsWith(normalized)) || null;
}

function activeOriginalSortField() {
  const toolbar = originalToolbar();
  if (!toolbar) return '';
  const active = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('.sort-toolbar-item > button'))
    .find(button => button.classList.contains('ring-2'));
  if (!active) return '';
  const text = labelText(active);
  if (text.startsWith('心得')) return '留言';
  for (const field of ['權限','評價','按讚','貼紙','時間']) {
    if (text.startsWith(field)) return field;
  }
  return '';
}

function setProxySort(field: string, direction: SortDirection) {
  const button = originalSortButton(field);
  if (!button) return;
  const activeField = activeOriginalSortField();
  const defaultDirection: SortDirection = field === '貼紙' ? 'asc' : 'desc';

  if (activeField !== field) {
    button.click();
    proxySortState = { field, direction: defaultDirection };
    if (defaultDirection !== direction) {
      window.setTimeout(() => {
        originalSortButton(field)?.click();
        proxySortState = { field, direction };
        syncLabels();
      }, 70);
    }
  } else if (proxySortState.field !== field) {
    proxySortState = { field, direction };
  } else if (proxySortState.direction !== direction) {
    button.click();
    proxySortState = { field, direction };
  }
  syncLabels();
}

function readCachedCategories(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOME_CACHE_KEY) || 'null');
    const values: string[] = Array.isArray(parsed?.categories) ? parsed.categories.map(String) : [];
    return values.length ? values : ['全部'];
  } catch {
    return ['全部'];
  }
}

function openOriginalCategoryMenu() {
  const toolbar = originalToolbar();
  if (!toolbar) return;
  const categoryButton = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('.sort-toolbar-item > button'))
    .find(button => labelText(button).startsWith('分類'));
  if (!categoryButton) return;
  const existingOptions = categoryOptionButtons();
  if (existingOptions.length === 0) categoryButton.click();
}

function categoryOptionButtons() {
  const toolbar = originalToolbar();
  if (!toolbar) return [] as HTMLButtonElement[];
  const buttons = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('.sort-toolbar-item div.absolute button'));
  return buttons.filter(button => Boolean(labelText(button)));
}

function currentCategoryFromOriginal() {
  const selected = categoryOptionButtons().find(button => button.className.includes('bg-white/25'));
  const text = labelText(selected);
  return text || '全部';
}

function chooseCategory(category: string) {
  openOriginalCategoryMenu();
  window.setTimeout(() => {
    const target = categoryOptionButtons().find(button => labelText(button) === category);
    target?.click();
    const root = document.getElementById(ROOT_ID);
    if (root) root.dataset.category = category;
    closeAllMenus();
    syncLabels();
  }, 60);
}

function createMenuButton(text: string, onClick: () => void, selected = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.dataset.selected = selected ? 'true' : 'false';
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

function closeAllMenus(except?: HTMLElement | null) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  root.querySelectorAll<HTMLElement>('.v145-filter-menu,.v145-advanced-panel').forEach(menu => {
    if (menu !== except) menu.hidden = true;
  });
  root.querySelectorAll<HTMLButtonElement>('.v145-filter-main').forEach(button => {
    const owned = button.nextElementSibling as HTMLElement | null;
    button.dataset.active = owned && !owned.hidden ? 'true' : 'false';
  });
}

function toggleMenu(button: HTMLButtonElement, menu: HTMLElement, beforeOpen?: () => void) {
  const willOpen = menu.hidden;
  closeAllMenus(menu);
  if (willOpen) {
    beforeOpen?.();
    menu.hidden = false;
    button.dataset.active = 'true';
  } else {
    menu.hidden = true;
    button.dataset.active = 'false';
  }
}

function buildCategoryMenu(menu: HTMLElement) {
  menu.replaceChildren();
  openOriginalCategoryMenu();
  if (categoryTimer) window.clearTimeout(categoryTimer);
  categoryTimer = window.setTimeout(() => {
    const root = document.getElementById(ROOT_ID);
    const selected = root?.dataset.category || currentCategoryFromOriginal() || '全部';
    const live: string[] = categoryOptionButtons().map(button => labelText(button));
    const source: string[] = live.length ? live : readCachedCategories();
    const categories: string[] = Array.from(new Set<string>(source.filter(Boolean)));
    menu.replaceChildren(...categories.map(category =>
      createMenuButton(category === '全部' ? '全部分類' : category, () => chooseCategory(category), category === selected)
    ));
  }, 55);
}

function ensureKeywordDrawerOpen() {
  const block = keywordBlock();
  if (!block) return;
  const toggle = Array.from(block.querySelectorAll<HTMLButtonElement>('button'))
    .find(button => (button.textContent || '').includes('網友關鍵字'));
  if (toggle?.getAttribute('aria-expanded') !== 'true') toggle?.click();
}

function keywordSourceButtons() {
  const block = keywordBlock();
  if (!block) return [] as HTMLButtonElement[];
  return Array.from(block.querySelectorAll<HTMLButtonElement>('button')).filter(button => {
    const text = labelText(button);
    return /\(\d+\)$/.test(text) && !button.title.includes('移除此關鍵字');
  });
}

function renderKeywordProxy(container: HTMLElement) {
  ensureKeywordDrawerOpen();
  if (keywordTimer) window.clearTimeout(keywordTimer);
  keywordTimer = window.setTimeout(() => {
    const source = keywordSourceButtons();
    const seen = new Set<string>();
    const buttons: HTMLButtonElement[] = [];
    source.forEach(sourceButton => {
      const text = labelText(sourceButton);
      if (!text || seen.has(text)) return;
      seen.add(text);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'v145-chip';
      button.textContent = text;
      button.dataset.selected = sourceButton.className.includes('bg-amber-600') ? 'true' : 'false';
      button.addEventListener('click', () => {
        const live = keywordSourceButtons().find(candidate => labelText(candidate) === text);
        live?.click();
        window.setTimeout(() => renderKeywordProxy(container), 55);
      });
      buttons.push(button);
    });
    container.replaceChildren(...buttons);
    if (buttons.length === 0) {
      const empty = document.createElement('span');
      empty.textContent = '目前條件下沒有可選的網友關鍵字';
      empty.style.cssText = 'font-size:.75rem;color:#94a3b8;padding:.2rem 0;';
      container.appendChild(empty);
    }
  }, 65);
}

function resetKeywords() {
  const block = keywordBlock();
  const reset = Array.from(block?.querySelectorAll<HTMLButtonElement>('button') || [])
    .find(button => labelText(button) === '重設');
  reset?.click();
}

function triggerLuckyDraw() {
  const button = searchRow()?.querySelector<HTMLButtonElement>(':scope > button:first-child');
  button?.click();
  closeAllMenus();
}

function openGuestRegistrationReliable() {
  if (!isGuestMode()) return;
  if (registerTimer) window.clearInterval(registerTimer);

  let attempts = 0;
  const tryOpen = () => {
    const identity = document.querySelector<HTMLButtonElement>('.navbar-menu-identity');
    if (identity) {
      window.clearInterval(registerTimer);
      registerTimer = 0;
      identity.click();
      return;
    }
    const login = Array.from(document.querySelectorAll<HTMLButtonElement>('.navbar-menu-footer-button'))
      .find(button => labelText(button) === '登入');
    if (login) {
      window.clearInterval(registerTimer);
      registerTimer = 0;
      login.click();
      return;
    }
    const hamburger = document.querySelector<HTMLButtonElement>('button[data-main-menu="hamburger"]');
    if (hamburger?.getAttribute('aria-expanded') !== 'true') hamburger?.click();
    attempts += 1;
    if (attempts >= 18) {
      window.clearInterval(registerTimer);
      registerTimer = 0;
    }
  };

  tryOpen();
  if (!registerTimer && attempts > 0 && attempts < 18) {
    registerTimer = window.setInterval(tryOpen, 80);
  }
}

function patchGuestCta() {
  const button = document.querySelector<HTMLButtonElement>('.v141-member-teaser-unlock');
  if (!button || !isGuestMode()) return;
  const label = '註冊會員了解更多 →';
  if (button.textContent !== label) button.textContent = label;
  button.setAttribute('aria-label', '開啟註冊登入畫面');
}

function makeCell(label: string) {
  const cell = document.createElement('div');
  cell.className = 'v145-filter-cell';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'v145-filter-main';
  const text = document.createElement('span');
  text.className = 'v145-filter-label';
  text.textContent = label;
  const arrow = document.createElement('span');
  arrow.className = 'v145-filter-arrow';
  arrow.textContent = '▼';
  button.append(text, arrow);
  cell.appendChild(button);
  return { cell, button, text, arrow };
}

function buildRoot() {
  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.dataset.category = '全部';
  root.dataset.recency = '最新上架';
  root.dataset.popularity = '熱門推薦';

  const category = makeCell('全部分類');
  const categoryMenu = document.createElement('div');
  categoryMenu.className = 'v145-filter-menu';
  categoryMenu.hidden = true;
  category.cell.appendChild(categoryMenu);
  category.button.addEventListener('click', event => {
    event.stopPropagation();
    toggleMenu(category.button, categoryMenu, () => buildCategoryMenu(categoryMenu));
  });

  const recency = makeCell('最新上架');
  const recencyMenu = document.createElement('div');
  recencyMenu.className = 'v145-filter-menu';
  recencyMenu.hidden = true;
  recencyMenu.append(
    createMenuButton('最新上架', () => {
      root.dataset.recency = '最新上架';
      setProxySort('時間','desc');
      closeAllMenus();
    }, true),
    createMenuButton('最早上架', () => {
      root.dataset.recency = '最早上架';
      setProxySort('時間','asc');
      closeAllMenus();
    })
  );
  recency.cell.appendChild(recencyMenu);
  recency.button.addEventListener('click', event => {
    event.stopPropagation();
    toggleMenu(recency.button, recencyMenu);
  });

  const popularity = makeCell('熱門推薦');
  const popularityMenu = document.createElement('div');
  popularityMenu.className = 'v145-filter-menu';
  popularityMenu.hidden = true;
  popularityMenu.append(
    createMenuButton('熱門推薦', () => {
      root.dataset.popularity = '熱門推薦';
      setProxySort('按讚','desc');
      closeAllMenus();
    }, true),
    createMenuButton('最高評價', () => {
      root.dataset.popularity = '最高評價';
      setProxySort('評價','desc');
      closeAllMenus();
    }),
    createMenuButton('最多心得', () => {
      root.dataset.popularity = '最多心得';
      setProxySort('留言','desc');
      closeAllMenus();
    })
  );
  popularity.cell.appendChild(popularityMenu);
  popularity.button.addEventListener('click', event => {
    event.stopPropagation();
    toggleMenu(popularity.button, popularityMenu);
  });

  const advanced = makeCell('進階篩選');
  advanced.arrow.textContent = '☷';
  const panel = document.createElement('div');
  panel.className = 'v145-advanced-panel';
  panel.hidden = true;

  const sortTitle = document.createElement('p');
  sortTitle.className = 'v145-advanced-title';
  sortTitle.textContent = '排序方式';
  const sortRow = document.createElement('div');
  sortRow.className = 'v145-chip-row';
  [
    ['權限','權限','asc'],
    ['心得','留言','desc'],
    ['貼紙','貼紙','asc'],
    ['評價','評價','desc'],
    ['按讚','按讚','desc']
  ].forEach(([label,field,direction]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'v145-chip';
    button.textContent = label;
    button.addEventListener('click', () => setProxySort(field, direction as SortDirection));
    sortRow.appendChild(button);
  });

  const keywordTitle = document.createElement('p');
  keywordTitle.className = 'v145-advanced-title';
  keywordTitle.textContent = '網友關鍵字（可複選）';
  const keywords = document.createElement('div');
  keywords.className = 'v145-keywords';

  const actions = document.createElement('div');
  actions.className = 'v145-panel-actions';
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'v145-panel-action';
  reset.textContent = '清除關鍵字';
  reset.addEventListener('click', () => {
    resetKeywords();
    window.setTimeout(() => renderKeywordProxy(keywords), 55);
  });
  const lucky = document.createElement('button');
  lucky.type = 'button';
  lucky.className = 'v145-panel-action primary';
  lucky.textContent = '💫 召喚繁星解答';
  lucky.addEventListener('click', triggerLuckyDraw);
  actions.append(reset, lucky);

  panel.append(sortTitle, sortRow, keywordTitle, keywords, actions);
  advanced.cell.appendChild(panel);
  advanced.button.addEventListener('click', event => {
    event.stopPropagation();
    toggleMenu(advanced.button, panel, () => renderKeywordProxy(keywords));
  });

  root.append(category.cell, recency.cell, popularity.cell, advanced.cell);
  return root;
}

function syncLabels() {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  const labels = root.querySelectorAll<HTMLElement>('.v145-filter-label');
  const category = root.dataset.category || '全部';
  if (labels[0]) labels[0].textContent = category === '全部' ? '全部分類' : category;
  if (labels[1]) labels[1].textContent = root.dataset.recency || '最新上架';
  if (labels[2]) labels[2].textContent = root.dataset.popularity || '熱門推薦';
  root.querySelectorAll<HTMLButtonElement>('.v145-chip-row .v145-chip').forEach(button => {
    const field = button.textContent === '心得' ? '留言' : button.textContent || '';
    button.dataset.selected = proxySortState.field === field ? 'true' : 'false';
  });
}

function installArchitecture() {
  if (!ENABLE_V145_BLACK_FILTER_ARCHITECTURE) {
    document.documentElement.classList.remove('echostars-v145-filter');
    document.getElementById(ROOT_ID)?.remove();
    return;
  }
  const shell = homeShell();
  const toolbar = originalToolbar();
  if (!shell || !toolbar) return;
  document.documentElement.classList.add('echostars-v145-filter');
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = buildRoot();
    toolbar.insertAdjacentElement('afterend', root);
  }
  patchGuestCta();
  syncLabels();
}

function sync() {
  installStyles();
  installArchitecture();
  patchGuestCta();
}

function queueSync() {
  if (syncFrame) return;
  syncFrame = window.requestAnimationFrame(() => {
    syncFrame = 0;
    sync();
  });
}

installStyles();
sync();

document.addEventListener('click', event => {
  const target = event.target as Element | null;
  if (target?.closest('.v141-member-teaser-unlock')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    openGuestRegistrationReliable();
    return;
  }
  if (!target?.closest(`#${ROOT_ID}`)) closeAllMenus();
}, true);

window.addEventListener('pageshow', queueSync);
window.addEventListener('storage', event => {
  if (event.key === HOME_CACHE_KEY || event.key === 'sq_current_user_v1') queueSync();
});

const observer = new MutationObserver(queueSync);
observer.observe(document.body, { childList: true, subtree: true });
