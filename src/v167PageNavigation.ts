const STYLE_ID = 'echostars-v167-page-navigation';

type FilterKey = 'category' | 'time' | 'popular' | 'advanced';

let activeFilterPage: HTMLElement | null = null;
let activeFilterHost: HTMLElement | null = null;
let bypassToolbarCapture = false;

const FILTER_PAGE_TITLES: Record<FilterKey, string> = {
  category: '分類',
  time: '時間排序',
  popular: '熱門推薦',
  advanced: '進階篩選'
};

const TIME_OPTIONS = ['最新上架', '最早上架'];
const POPULAR_OPTIONS = ['評價最高', '按讚最多', '心得最多', '收藏人數'];

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* v167: the four home filter buttons open a real in-flow page instead of a popup menu. */
    [data-v167-filter-hidden="1"] { display: none !important; }
    .v167-filter-page {
      width: 100%;
      min-height: 70dvh;
      position: static;
      z-index: auto;
    }
    .v167-filter-page-card {
      width: 100%;
      min-height: 70dvh;
      overflow: hidden;
      border: 1px solid rgb(226 232 240);
      border-radius: 1rem;
      background: rgb(255 255 255);
      display: flex;
      flex-direction: column;
    }
    .dark .v167-filter-page-card {
      border-color: rgb(51 65 85);
      background: rgb(15 23 42);
    }
    .v167-filter-page-head {
      min-height: 3.6rem;
      padding: .75rem 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .75rem;
      color: white;
      background: var(--color-primary,#c06c84);
    }
    .v167-filter-page-title {
      margin: 0;
      font-size: 1.08rem;
      line-height: 1.2;
      font-weight: 900;
    }
    .v167-filter-page-close {
      min-width: 2.5rem;
      min-height: 2.5rem;
      border: 0;
      border-radius: .75rem;
      background: rgba(255,255,255,.14);
      color: white;
      font-size: 1.25rem;
      font-weight: 900;
      cursor: pointer;
    }
    .v167-filter-page-close:hover,
    .v167-filter-page-close:focus-visible { background: rgba(255,255,255,.24); outline: none; }
    .v167-filter-page-body {
      flex: 1;
      padding: .75rem;
      color: rgb(30 41 59);
    }
    .dark .v167-filter-page-body { color: rgb(241 245 249); }
    .v167-filter-page-note {
      margin: 0 0 .7rem;
      font-size: .75rem;
      color: rgb(100 116 139);
    }
    .dark .v167-filter-page-note { color: rgb(148 163 184); }
    .v167-filter-page-options { display: grid; gap: .5rem; }
    .v167-filter-page-option {
      width: 100%;
      min-height: 3.15rem;
      padding: .7rem .9rem;
      border: 1px solid rgb(226 232 240);
      border-radius: .9rem;
      background: rgb(248 250 252);
      color: rgb(30 41 59);
      text-align: left;
      font-size: .88rem;
      font-weight: 850;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .75rem;
    }
    .dark .v167-filter-page-option {
      border-color: rgb(51 65 85);
      background: rgb(30 41 59);
      color: rgb(241 245 249);
    }
    .v167-filter-page-option:hover,
    .v167-filter-page-option:focus-visible {
      outline: none;
      border-color: color-mix(in srgb,var(--color-primary,#c06c84) 45%,rgb(203 213 225));
      background: color-mix(in srgb,var(--color-primary,#c06c84) 7%,rgb(248 250 252));
    }
    .dark .v167-filter-page-option:hover,
    .dark .v167-filter-page-option:focus-visible {
      background: color-mix(in srgb,var(--color-primary,#c06c84) 12%,rgb(30 41 59));
    }
    .v167-filter-page-option[data-selected="true"] {
      border-color: var(--color-primary,#c06c84);
      box-shadow: inset 0 0 0 1px var(--color-primary,#c06c84);
      color: var(--color-primary,#c06c84);
    }
    .v167-filter-page-check { font-size: 1rem; font-weight: 900; }

    /* v167: the audio editor portal becomes an in-flow page below the real navbar.
       The original upload/management page stays mounted in the background so React state
       is preserved, but it is not an interactive popup and cannot cover this page. */
    html.echostars-v167-audio-editor-page,
    html.echostars-v167-audio-editor-page body { min-height: 100%; }
    html.echostars-v167-audio-editor-page body { overflow-y: auto !important; }
    html.echostars-v167-audio-editor-page #root > .min-h-screen,
    html.echostars-v167-audio-editor-page #root > div { min-height: 0 !important; }
    html.echostars-v167-audio-editor-page #root main { display: none !important; }
    html.echostars-v167-audio-editor-page #root .upload-modal-overlay.upload-page { display: none !important; }
    html.echostars-v167-audio-editor-page .v161-track-editor-overlay[data-v167-page="audio-editor"] {
      position: static !important;
      inset: auto !important;
      z-index: auto !important;
      width: 100% !important;
      height: auto !important;
      min-height: calc(100dvh - 4rem) !important;
      margin: 0 auto !important;
      padding: 1rem !important;
      overflow: visible !important;
      background: transparent !important;
      pointer-events: auto !important;
    }
    html.echostars-v167-audio-editor-page .v161-track-editor-overlay[data-v167-page="audio-editor"] > .upload-modal-overlay {
      position: static !important;
      inset: auto !important;
      z-index: auto !important;
      display: block !important;
      width: 100% !important;
      height: auto !important;
      min-height: calc(100dvh - 6rem) !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
      background: transparent !important;
      backdrop-filter: none !important;
    }
    html.echostars-v167-audio-editor-page .v161-track-editor-overlay[data-v167-page="audio-editor"] > .upload-modal-overlay > div {
      width: 100% !important;
      max-width: 72rem !important;
      min-height: calc(100dvh - 6rem) !important;
      margin: 0 auto !important;
      border: 1px solid rgb(226 232 240);
      border-radius: 1rem;
      overflow: hidden;
      box-shadow: none !important;
    }
    .dark.echostars-v167-audio-editor-page .v161-track-editor-overlay[data-v167-page="audio-editor"] > .upload-modal-overlay > div {
      border-color: rgb(51 65 85);
    }
    @media (max-width: 639px) {
      html.echostars-v167-audio-editor-page .v161-track-editor-overlay[data-v167-page="audio-editor"] {
        min-height: calc(100dvh - 3.5rem) !important;
        padding: .55rem !important;
      }
      html.echostars-v167-audio-editor-page .v161-track-editor-overlay[data-v167-page="audio-editor"] > .upload-modal-overlay,
      html.echostars-v167-audio-editor-page .v161-track-editor-overlay[data-v167-page="audio-editor"] > .upload-modal-overlay > div {
        min-height: calc(100dvh - 4.6rem) !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function toolbarButton(key: FilterKey) {
  return document.querySelector<HTMLButtonElement>(`.v145-filter-button[data-v145-button="${key}"]`);
}

function toolbarLabel(key: FilterKey) {
  return toolbarButton(key)?.querySelector<HTMLElement>(`[data-v145-label="${key}"]`)?.textContent?.trim() || '';
}

function toolbarActive(key: FilterKey) {
  return toolbarButton(key)?.dataset.active === 'true';
}

function menuOptions(key: 'category' | 'advanced') {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(`[data-v145-menu="${key}"] button`));
}

function closeFilterPage() {
  if (activeFilterHost) {
    Array.from(activeFilterHost.children).forEach(child => {
      if (child instanceof HTMLElement) delete child.dataset.v167FilterHidden;
    });
    delete activeFilterHost.dataset.v167FilterPageOpen;
  }
  activeFilterPage?.remove();
  activeFilterPage = null;
  activeFilterHost = null;
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function clickToolbarBypass(button: HTMLButtonElement) {
  bypassToolbarCapture = true;
  try { button.click(); }
  finally { bypassToolbarCapture = false; }
}

function waitForToolbarSync() {
  return new Promise<void>(resolve => window.setTimeout(resolve, 70));
}

async function chooseCycleOption(key: 'time' | 'popular', targetLabel: string) {
  const button = toolbarButton(key);
  if (!button) return;
  const maxAttempts = key === 'popular' ? 6 : 4;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (toolbarActive(key) && toolbarLabel(key) === targetLabel) return;
    clickToolbarBypass(button);
    await waitForToolbarSync();
  }
}

async function applyFilterChoice(key: FilterKey, label: string, index: number) {
  if (key === 'category' || key === 'advanced') {
    const option = menuOptions(key)[index];
    option?.click();
    await waitForToolbarSync();
    return;
  }
  await chooseCycleOption(key, label);
}

function pageEntries(key: FilterKey) {
  if (key === 'category') return menuOptions('category').map(button => button.textContent?.trim() || '').filter(Boolean);
  if (key === 'advanced') return menuOptions('advanced').map(button => button.textContent?.trim() || '').filter(Boolean);
  if (key === 'time') return TIME_OPTIONS;
  return POPULAR_OPTIONS;
}

function entrySelected(key: FilterKey, label: string) {
  if (key === 'category') return toolbarLabel('category') === label;
  if (key === 'time' || key === 'popular') return toolbarActive(key) && toolbarLabel(key) === label;
  return false;
}

function openFilterPage(key: FilterKey) {
  installStyles();
  closeFilterPage();

  const toolbar = document.querySelector<HTMLElement>('[data-v145-filter-toolbar]');
  const host = toolbar?.parentElement;
  if (!toolbar || !host) return;

  const page = document.createElement('section');
  page.className = 'v167-filter-page';
  page.dataset.v167FilterPage = key;
  page.setAttribute('aria-label', `${FILTER_PAGE_TITLES[key]}頁面`);

  const card = document.createElement('div');
  card.className = 'v167-filter-page-card';

  const head = document.createElement('div');
  head.className = 'v167-filter-page-head';
  const title = document.createElement('h2');
  title.className = 'v167-filter-page-title';
  title.textContent = FILTER_PAGE_TITLES[key];
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'v167-filter-page-close';
  close.dataset.v167FilterPageClose = '1';
  close.setAttribute('aria-label', '返回首頁');
  close.title = '返回首頁';
  close.textContent = '×';
  close.addEventListener('click', closeFilterPage);
  head.append(title, close);

  const body = document.createElement('div');
  body.className = 'v167-filter-page-body';
  const note = document.createElement('p');
  note.className = 'v167-filter-page-note';
  note.textContent = '請選擇一個條件，完成後會回到首頁播放清單。';
  const options = document.createElement('div');
  options.className = 'v167-filter-page-options';

  pageEntries(key).forEach((label, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'v167-filter-page-option';
    option.dataset.v167Option = label;
    option.dataset.selected = entrySelected(key, label) ? 'true' : 'false';
    const text = document.createElement('span');
    text.textContent = label;
    option.appendChild(text);
    if (option.dataset.selected === 'true') {
      const check = document.createElement('span');
      check.className = 'v167-filter-page-check';
      check.textContent = '✓';
      option.appendChild(check);
    }
    option.addEventListener('click', () => {
      option.disabled = true;
      void applyFilterChoice(key, label, index).finally(closeFilterPage);
    });
    options.appendChild(option);
  });

  body.append(note, options);
  card.append(head, body);
  page.appendChild(card);
  host.appendChild(page);

  activeFilterPage = page;
  activeFilterHost = host;
  host.dataset.v167FilterPageOpen = 'true';
  Array.from(host.children).forEach(child => {
    if (child !== page && child instanceof HTMLElement) child.dataset.v167FilterHidden = '1';
  });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function syncAudioEditorPage() {
  const editor = document.querySelector<HTMLElement>('.v161-track-editor-overlay');
  const active = Boolean(editor);
  document.documentElement.classList.toggle('echostars-v167-audio-editor-page', active);
  if (editor) {
    editor.dataset.v167Page = 'audio-editor';
    editor.setAttribute('aria-label', '編輯音檔頁面');
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  }
}

installStyles();
syncAudioEditorPage();

document.addEventListener('click', event => {
  if (bypassToolbarCapture) return;
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest<HTMLButtonElement>('.v145-filter-button[data-v145-button]');
  if (!button) return;
  const key = button.dataset.v145Button as FilterKey | undefined;
  if (!key || !(key in FILTER_PAGE_TITLES)) return;
  event.preventDefault();
  event.stopPropagation();
  openFilterPage(key);
}, true);

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && activeFilterPage) closeFilterPage();
});

window.addEventListener('pageshow', () => {
  closeFilterPage();
  syncAudioEditorPage();
});

const observer = new MutationObserver(() => syncAudioEditorPage());
observer.observe(document.body, { childList: true, subtree: true });
