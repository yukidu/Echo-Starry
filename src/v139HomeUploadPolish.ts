const V139_STYLE_ID = 'echostars-v139-home-upload-polish';
let selectedCategoryLabel = '全部';
let syncQueued = false;

function isGuestMode() {
  try { return !localStorage.getItem('sq_current_user_v1'); }
  catch { return true; }
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

    .v139-upload-tabs {
      display: grid;
      grid-template-columns: repeat(2,minmax(0,1fr));
      gap: .45rem;
      padding: .7rem .8rem;
      background: rgb(248 250 252);
      border-bottom: 1px solid rgb(226 232 240);
    }
    .dark .v139-upload-tabs {
      background: rgb(15 23 42);
      border-bottom-color: rgb(51 65 85);
    }
    .v139-upload-tab {
      min-height: 2.6rem;
      border: 1px solid rgb(203 213 225);
      border-radius: .85rem;
      background: white;
      color: rgb(71 85 105);
      font-weight: 900;
      font-size: .85rem;
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
    .upload-page[data-v139-upload-tab="manage"] #track-upload-form { display: none !important; }
    .upload-page[data-v139-upload-tab="manage"] [data-v139-upload-actions="1"] { display: none !important; }
  `;
  document.head.appendChild(style);
}

function syncGuestMode() {
  document.documentElement.classList.toggle('echostars-v139-guest', isGuestMode());

  if (!isGuestMode()) return;
  document.querySelectorAll<HTMLElement>('.audio-card span').forEach(span => {
    if ((span.textContent || '').replace(/\s+/g, '') === '[已聽0%]') {
      const badge = span.parentElement;
      if (badge) badge.style.setProperty('display', 'none', 'important');
    }
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
  button.title = '從目前條件下可播放的音檔中招喚繁星';
}

function findCategoryTrigger() {
  return document.querySelector<HTMLButtonElement>('button[title="點擊展開分類選單"]');
}

function applyCategoryLabel() {
  const trigger = findCategoryTrigger();
  if (!trigger) return;
  const label = trigger.querySelector<HTMLElement>('span');
  const active = selectedCategoryLabel !== '全部';
  if (label) label.textContent = active ? selectedCategoryLabel : '分類';
  if (active) trigger.dataset.v139CategoryActive = '1';
  else delete trigger.dataset.v139CategoryActive;
}

function cleanOptionLabel(value: string) {
  return value.replace(/[✓✔☑]/g, '').replace(/\s+/g, ' ').trim();
}

function setUploadTab(page: HTMLElement, tab: 'upload' | 'manage') {
  page.dataset.v139UploadTab = tab;
  page.querySelectorAll<HTMLButtonElement>('.v139-upload-tab').forEach(button => {
    const active = button.dataset.tab === tab;
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  const header = page.querySelector<HTMLElement>(':scope > div > div:first-child');
  const heading = header?.querySelector<HTMLElement>('h2');
  if (heading) heading.textContent = tab === 'manage' ? '管理音檔' : '上傳音檔';
  const actionGroup = header?.querySelector<HTMLElement>('div.flex.items-center.gap-2');
  if (actionGroup) actionGroup.dataset.v139UploadActions = '1';
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

      const upload = document.createElement('button');
      upload.type = 'button';
      upload.className = 'v139-upload-tab';
      upload.dataset.tab = 'upload';
      upload.textContent = '上傳音檔';
      upload.addEventListener('click', () => setUploadTab(page, 'upload'));

      const manage = document.createElement('button');
      manage.type = 'button';
      manage.className = 'v139-upload-tab';
      manage.dataset.tab = 'manage';
      manage.textContent = '管理音檔';
      manage.addEventListener('click', () => setUploadTab(page, 'manage'));

      tabs.append(upload, manage);
      page.firstElementChild?.prepend(tabs);
    }

    const current = page.dataset.v139UploadTab === 'manage' ? 'manage' : 'upload';
    setUploadTab(page, current);
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
  if (event.key === 'sq_current_user_v1') syncGuestMode();
});
