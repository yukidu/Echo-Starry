const V139_STYLE_ID = 'echostars-v139-home-upload-polish';
let selectedCategoryLabel = '全部';
let syncQueued = false;

type UploadWorkspaceTab = 'upload' | 'manage' | 'community';

function isGuestMode() {
  try { return !localStorage.getItem('sq_current_user_v1'); }
  catch { return true; }
}

function isSuperAdminMode() {
  try {
    const raw = localStorage.getItem('sq_current_user_v1');
    if (!raw) return false;
    const user = JSON.parse(raw);
    const email = String(user?.email || '').trim().toLowerCase();
    return email === 'yukidu@gmail.com' || user?.role === '超級管理員' || user?.id === 'u-admin';
  } catch {
    return false;
  }
}

function installV139Styles() {
  if (document.getElementById(V139_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = V139_STYLE_ID;
  style.textContent = `
    html.echostars-v139-guest .lucky-answer-notice { display: none !important; }

    button[data-v139-category-active="1"] {
      background: #f59e0b !important;
      color: #1f2937 !important;
      box-shadow: 0 0 0 2px rgba(245,158,11,.28), 0 4px 12px rgba(120,53,15,.18) !important;
    }
    button[data-v139-category-active="1"] svg { color: #1f2937 !important; }

    /* v169: upload/manage/community follows the same horizontal tab-strip idea as
       Personal Center. The save action remains in the real page header above it. */
    .v139-upload-tabs {
      display: flex;
      align-items: center;
      gap: .3rem;
      padding: .55rem .65rem;
      background: rgb(248 250 252);
      border-bottom: 1px solid rgb(226 232 240);
    }
    .dark .v139-upload-tabs {
      background: rgb(15 23 42);
      border-bottom-color: rgb(51 65 85);
    }
    .v139-upload-tabs-scroll {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: .4rem;
      overflow-x: auto;
      overscroll-behavior-x: contain;
      scroll-behavior: smooth;
      scroll-snap-type: x proximity;
      scrollbar-width: none;
      -ms-overflow-style: none;
      padding: .08rem .05rem;
    }
    .v139-upload-tabs-scroll::-webkit-scrollbar { display: none; }
    .v139-upload-tab-nav {
      flex: 0 0 auto;
      width: 2rem;
      height: 2rem;
      border: 0;
      border-radius: .6rem;
      background: transparent;
      color: rgb(100 116 139);
      font-size: 1.15rem;
      font-weight: 900;
      line-height: 1;
      cursor: pointer;
    }
    .v139-upload-tab-nav:hover,
    .v139-upload-tab-nav:focus-visible {
      outline: none;
      background: rgb(226 232 240);
      color: rgb(30 41 59);
    }
    .dark .v139-upload-tab-nav { color: rgb(148 163 184); }
    .dark .v139-upload-tab-nav:hover,
    .dark .v139-upload-tab-nav:focus-visible {
      background: rgb(51 65 85);
      color: rgb(241 245 249);
    }
    .v139-upload-tab {
      flex: 0 0 auto;
      min-width: 8.3rem;
      min-height: 2.45rem;
      padding: .45rem .85rem;
      scroll-snap-align: center;
      border: 1px solid rgb(203 213 225);
      border-radius: .8rem;
      background: white;
      color: rgb(71 85 105);
      font-weight: 900;
      font-size: .82rem;
      white-space: nowrap;
      transition: .15s ease;
    }
    .dark .v139-upload-tab {
      border-color: rgb(71 85 105);
      background: rgb(30 41 59);
      color: rgb(226 232 240);
    }
    .v139-upload-tab[aria-selected="true"] {
      border-color: var(--color-primary,#c06c84);
      background: var(--color-primary,#c06c84);
      color: white;
      box-shadow: 0 4px 14px color-mix(in srgb,var(--color-primary,#c06c84) 28%,transparent);
    }
    .upload-page[data-v139-upload-tab="upload"] .v138-track-management { display: none !important; }
    .upload-page[data-v139-upload-tab="manage"] #track-upload-form,
    .upload-page[data-v139-upload-tab="community"] #track-upload-form { display: none !important; }
    .upload-page[data-v139-upload-tab="manage"] [data-v139-upload-actions="1"],
    .upload-page[data-v139-upload-tab="community"] [data-v139-upload-actions="1"] { display: none !important; }
    .upload-page[data-v139-upload-tab="manage"] .v161-manage-tabs,
    .upload-page[data-v139-upload-tab="community"] .v161-manage-tabs { display: none !important; }

    @media (max-width: 639px) {
      .v139-upload-tabs { padding-inline: .45rem; gap: .18rem; }
      .v139-upload-tab-nav { width: 1.75rem; height: 1.85rem; }
      .v139-upload-tab { min-width: 7.6rem; min-height: 2.3rem; font-size: .76rem; }
    }
  `;
  document.head.appendChild(style);
}

function syncGuestMode() {
  const guest = isGuestMode();
  document.documentElement.classList.toggle('echostars-v139-guest', guest);

  document.querySelectorAll<HTMLElement>('[data-v139-hidden-zero-progress="1"]').forEach(badge => {
    if (!guest) {
      badge.style.removeProperty('display');
      delete badge.dataset.v139HiddenZeroProgress;
    }
  });
  if (!guest) return;

  document.querySelectorAll<HTMLElement>('.audio-card span').forEach(span => {
    if ((span.textContent || '').replace(/\s+/g, '') !== '[已聽0%]') return;
    const badge = span.parentElement;
    if (!badge || badge.dataset.v139HiddenZeroProgress === '1') return;
    badge.dataset.v139HiddenZeroProgress = '1';
    badge.style.setProperty('display', 'none', 'important');
  });
}

function findLuckyButton() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button => {
    const text = (button.textContent || '').replace(/\s+/g, '');
    return text.includes('召喚繁星解答') || text.includes('招喚繁星解答') || text === '招喚繁星';
  }) || null;
}

function syncLuckyButton() {
  const button = findLuckyButton();
  if (!button) return;
  const label = button.querySelector<HTMLElement>('span');
  if (label && label.textContent !== '招喚繁星') label.textContent = '招喚繁星';
  if (button.title !== '從目前條件下可播放的音檔中招喚繁星') {
    button.title = '從目前條件下可播放的音檔中招喚繁星';
  }
}

function findCategoryTrigger() {
  return document.querySelector<HTMLButtonElement>('button[title="點擊展開分類選單"]');
}

function applyCategoryLabel() {
  const trigger = findCategoryTrigger();
  if (!trigger) return;
  const label = trigger.querySelector<HTMLElement>('span');
  const active = selectedCategoryLabel !== '全部';
  const desiredText = active ? selectedCategoryLabel : '分類';
  if (label && label.textContent !== desiredText) label.textContent = desiredText;
  if (active && trigger.dataset.v139CategoryActive !== '1') trigger.dataset.v139CategoryActive = '1';
  if (!active && trigger.dataset.v139CategoryActive) delete trigger.dataset.v139CategoryActive;
}

function cleanOptionLabel(value: string) {
  return value.replace(/[✓✔☑]/g, '').replace(/\s+/g, ' ').trim();
}

function syncManagementMode(page: HTMLElement, tab: UploadWorkspaceTab) {
  if (tab === 'upload') return;
  const desired = tab === 'community' ? '網友音檔' : '我的音檔';
  const button = Array.from(page.querySelectorAll<HTMLButtonElement>('.v161-manage-tab'))
    .find(item => cleanOptionLabel(item.textContent || '') === desired);
  if (button && button.getAttribute('aria-selected') !== 'true') button.click();
}

function centerSelectedUploadTab(page: HTMLElement, tab: UploadWorkspaceTab) {
  const selected = page.querySelector<HTMLButtonElement>(`.v139-upload-tab[data-tab="${tab}"]`);
  const scroller = selected?.closest<HTMLElement>('.v139-upload-tabs-scroll');
  if (!selected || !scroller) return;
  const left = selected.offsetLeft - Math.max(0, (scroller.clientWidth - selected.offsetWidth) / 2);
  scroller.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
}

function setUploadTab(page: HTMLElement, tab: UploadWorkspaceTab) {
  const allowedTab: UploadWorkspaceTab = tab === 'community' && !isSuperAdminMode() ? 'manage' : tab;
  const changed = page.dataset.v139UploadTab !== allowedTab;
  if (changed) page.dataset.v139UploadTab = allowedTab;
  page.querySelectorAll<HTMLButtonElement>('.v139-upload-tab').forEach(button => {
    const desired = button.dataset.tab === allowedTab ? 'true' : 'false';
    if (button.getAttribute('aria-selected') !== desired) button.setAttribute('aria-selected', desired);
  });

  const header = page.querySelector<HTMLElement>(':scope > div > div:not(.v139-upload-tabs)');
  const heading = header?.querySelector<HTMLElement>('h2');
  const desiredHeading = allowedTab === 'community' ? '網友音檔' : allowedTab === 'manage' ? '管理音檔' : '上傳音檔';
  if (heading && heading.textContent !== desiredHeading) heading.textContent = desiredHeading;
  const actionGroup = header?.querySelector<HTMLElement>('div.flex.items-center.gap-2');
  if (actionGroup && actionGroup.dataset.v139UploadActions !== '1') actionGroup.dataset.v139UploadActions = '1';

  syncManagementMode(page, allowedTab);
  if (changed) centerSelectedUploadTab(page, allowedTab);
}

function makeScrollButton(direction: 'left' | 'right', scroller: HTMLElement) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'v139-upload-tab-nav';
  button.setAttribute('aria-label', direction === 'left' ? '向左移動標籤' : '向右移動標籤');
  button.title = direction === 'left' ? '向左移動標籤' : '向右移動標籤';
  button.textContent = direction === 'left' ? '‹' : '›';
  button.addEventListener('click', () => {
    scroller.scrollBy({ left: direction === 'left' ? -150 : 150, behavior: 'smooth' });
  });
  return button;
}

function syncUploadTabs() {
  document.querySelectorAll<HTMLElement>('.upload-page').forEach(page => {
    const management = page.querySelector('.v138-track-management');
    if (!management) return;

    let tabs = page.querySelector<HTMLElement>(':scope > div > .v139-upload-tabs');
    if (!tabs) {
      tabs = document.createElement('div');
      tabs.className = 'v139-upload-tabs';
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', '上傳音檔與管理');

      const scroller = document.createElement('div');
      scroller.className = 'v139-upload-tabs-scroll';

      const addTab = (key: UploadWorkspaceTab, label: string) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'v139-upload-tab';
        button.dataset.tab = key;
        button.textContent = label;
        button.addEventListener('click', () => setUploadTab(page, key));
        scroller.appendChild(button);
      };

      addTab('upload', '上傳音檔');
      addTab('manage', '管理音檔');
      if (isSuperAdminMode()) addTab('community', '網友音檔');

      tabs.append(makeScrollButton('left', scroller), scroller, makeScrollButton('right', scroller));

      const header = page.querySelector<HTMLElement>(':scope > div > div');
      if (header) header.after(tabs);
      else page.firstElementChild?.prepend(tabs);
    }

    const requested = page.dataset.v139UploadTab as UploadWorkspaceTab | undefined;
    const fallback: UploadWorkspaceTab = requested === 'manage' || requested === 'community' ? requested : 'upload';
    setUploadTab(page, fallback);
  });
}

function syncAll() {
  installV139Styles();
  syncGuestMode();
  syncLuckyButton();
  applyCategoryLabel();
  syncUploadTabs();
}

function queueSync() {
  if (syncQueued) return;
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    syncAll();
  });
}

document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  if (target.closest('.brand-logo-glow')) {
    selectedCategoryLabel = '全部';
    queueSync();
    return;
  }

  const clickedButton = target.closest<HTMLButtonElement>('button');
  const trigger = findCategoryTrigger();
  if (!clickedButton || !trigger || clickedButton === trigger) return;
  const container = trigger.parentElement;
  if (!container?.contains(clickedButton)) return;

  const option = cleanOptionLabel(clickedButton.textContent || '');
  if (!option || option.length > 24) return;
  selectedCategoryLabel = option;
  queueSync();
}, true);

installV139Styles();
syncAll();

const observer = new MutationObserver(queueSync);
observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
window.addEventListener('pageshow', syncAll);
window.addEventListener('storage', event => {
  if (event.key === 'sq_current_user_v1') syncAll();
});
