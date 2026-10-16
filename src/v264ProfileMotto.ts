import { setPendingProfileMotto } from './profileMottoSaveBridge';

const EDIT_SECTION_ID = 'profile-motto-edit-v270';
const DISPLAY_SECTION_ID = 'profile-motto-display-v270';
const FLOATING_ACTIONS_ID = 'profile-floating-actions-v270';
const LEGACY_IDS = [
  'profile-motto-display-v264',
  'profile-motto-primary',
  'profile-motto-primary-v264',
  'profile-motto-edit-v264'
];

let observer: MutationObserver | null = null;
let renderScheduled = false;
let loadingQuote = false;

function currentUser() {
  try {
    return JSON.parse(localStorage.getItem('sq_current_user_v1') || 'null');
  } catch {
    return null;
  }
}

function currentMotto() {
  return String(currentUser()?.motto || '').trim();
}

function removeNode(node: Element | null) {
  if (node && !node.closest(`#${EDIT_SECTION_ID}`) && !node.closest(`#${DISPLAY_SECTION_ID}`)) node.remove();
}

function removeLegacyMottoUi(page: HTMLElement) {
  for (const id of LEGACY_IDS) removeNode(document.getElementById(id));
  page.querySelectorAll<HTMLElement>('[data-starry-extension-field="motto"], [data-starry-field="motto"], [data-profile-motto-primary]')
    .forEach(node => removeNode(node));

  for (const label of Array.from(page.querySelectorAll('label'))) {
    if ((label.textContent || '').replace(/\s+/g, ' ').trim().startsWith('座右銘') && !label.closest(`#${EDIT_SECTION_ID}`)) {
      const wrapper = label.closest('[data-starry-extension-field], [data-starry-field], .sm\\:col-span-2') || label.parentElement;
      removeNode(wrapper);
    }
  }
}

function findEditCard(page: HTMLElement) {
  const title = Array.from(page.querySelectorAll('span')).find(node => (node.textContent || '').trim() === '編輯個人基本資料');
  return title?.closest('.rounded-2xl') as HTMLElement | null;
}

function findNativeAction(page: HTMLElement, text: '儲存' | '取消') {
  return Array.from(page.querySelectorAll<HTMLButtonElement>('button')).find(button =>
    !button.closest(`#${FLOATING_ACTIONS_ID}`) && (button.textContent || '').replace(/[💾✅]/g, '').trim() === text
  ) || null;
}

function captureDraft(page: HTMLElement) {
  const textarea = page.querySelector<HTMLTextAreaElement>(`#${EDIT_SECTION_ID} textarea`);
  if (textarea) setPendingProfileMotto(textarea.value);
}

async function rollRandomMotto(button: HTMLButtonElement, textarea: HTMLTextAreaElement, status: HTMLElement) {
  if (loadingQuote) return;
  loadingQuote = true;
  button.disabled = true;
  status.textContent = '正在抽一句…';
  try {
    const response = await fetch(`/api/random-motto?t=${Date.now()}`, {
      method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    const motto = String(data?.motto || '').trim();
    if (!response.ok || !motto) throw new Error(data?.error || '目前無法取得繁星雞湯');
    textarea.value = motto;
    setPendingProfileMotto(motto);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    status.textContent = '已從繁星雞湯帶入，可再自行修改';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : '目前無法取得繁星雞湯';
  } finally {
    loadingQuote = false;
    button.disabled = false;
  }
}

function ensureEditSection(page: HTMLElement, editCard: HTMLElement) {
  document.getElementById(DISPLAY_SECTION_ID)?.remove();
  let section = document.getElementById(EDIT_SECTION_ID) as HTMLElement | null;
  if (section && section.previousElementSibling !== editCard) {
    section.remove();
    section = null;
  }
  if (section) return;

  section = document.createElement('section');
  section.id = EDIT_SECTION_ID;
  section.dataset.profileMottoPrimary = '1';
  section.className = 'mt-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 p-4';

  const heading = document.createElement('div');
  heading.className = 'font-bold text-slate-800 dark:text-slate-100 mb-1';
  heading.textContent = '座右銘';

  const note = document.createElement('div');
  note.className = 'text-xs text-slate-500 dark:text-slate-400 mb-2';
  note.textContent = '可自行輸入，或從繁星雞湯隨機抽一句；按上方或下方「儲存」會與個人資料一起同步 Starry ID。';

  const textarea = document.createElement('textarea');
  textarea.rows = 3;
  textarea.maxLength = 200;
  textarea.placeholder = '寫下你的座右銘';
  textarea.value = currentMotto();
  textarea.className = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-hidden';
  textarea.addEventListener('input', () => setPendingProfileMotto(textarea.value));

  const row = document.createElement('div');
  row.className = 'mt-2 flex items-center gap-2 flex-wrap';
  const dice = document.createElement('button');
  dice.type = 'button';
  dice.dataset.profileMottoDice = 'edit-only';
  dice.className = 'px-4 py-2 rounded-xl border font-bold bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100';
  dice.textContent = '🎲 隨機一句';
  const status = document.createElement('span');
  status.className = 'text-xs text-slate-500 dark:text-slate-400';
  dice.addEventListener('click', () => void rollRandomMotto(dice, textarea, status));
  row.append(dice, status);
  section.append(heading, note, textarea, row);
  editCard.insertAdjacentElement('afterend', section);
}

function ensureFloatingActions(page: HTMLElement) {
  const nativeSave = findNativeAction(page, '儲存');
  const nativeCancel = findNativeAction(page, '取消');
  if (!nativeSave || !nativeCancel) return;
  nativeSave.dataset.profileNativeSave = '1';
  nativeSave.addEventListener('click', () => captureDraft(page), { once: true });

  let bar = document.getElementById(FLOATING_ACTIONS_ID) as HTMLElement | null;
  if (bar) return;
  bar = document.createElement('div');
  bar.id = FLOATING_ACTIONS_ID;
  bar.className = 'fixed left-1/2 -translate-x-1/2 bottom-3 z-[240] w-[calc(100%-24px)] max-w-2xl rounded-[28px] bg-white/95 dark:bg-slate-900/95 shadow-2xl border border-slate-200 dark:border-slate-700 p-3 grid grid-cols-2 gap-3';

  const save = document.createElement('button');
  save.type = 'button';
  save.dataset.profileFloatingSave = '1';
  save.className = 'min-h-[68px] rounded-2xl bg-emerald-600 text-white text-2xl font-black shadow-lg';
  save.textContent = '💾 儲存';
  save.addEventListener('click', () => {
    captureDraft(page);
    nativeSave.click();
  });

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.dataset.profileFloatingCancel = '1';
  cancel.className = 'min-h-[68px] rounded-2xl bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white text-2xl font-black shadow-lg';
  cancel.textContent = '取消';
  cancel.addEventListener('click', () => {
    setPendingProfileMotto(null);
    nativeCancel.click();
  });

  bar.append(save, cancel);
  document.body.appendChild(bar);
}

function ensureDisplaySection(page: HTMLElement) {
  document.getElementById(EDIT_SECTION_ID)?.remove();
  document.getElementById(FLOATING_ACTIONS_ID)?.remove();
  // Non-edit mode deliberately has no dice button. It is a read-only motto view.
  let section = document.getElementById(DISPLAY_SECTION_ID) as HTMLElement | null;
  if (!section) {
    section = document.createElement('section');
    section.id = DISPLAY_SECTION_ID;
    section.className = 'mt-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 p-4';
    const label = document.createElement('div');
    label.className = 'text-xs font-bold text-slate-500 dark:text-slate-400 mb-1';
    label.textContent = '座右銘';
    const value = document.createElement('div');
    value.dataset.profileMottoDisplayValue = '1';
    value.className = 'text-base font-semibold text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-words';
    section.append(label, value);
    page.appendChild(section);
  }
  const value = section.querySelector<HTMLElement>('[data-profile-motto-display-value]');
  if (value) value.textContent = currentMotto() || '未填寫';
  section.querySelectorAll('[data-profile-motto-dice], button').forEach(node => node.remove());
}

function renderNow() {
  observer?.disconnect();
  try {
    const page = document.querySelector('.profile-page') as HTMLElement | null;
    if (!page) {
      document.getElementById(FLOATING_ACTIONS_ID)?.remove();
      document.getElementById(EDIT_SECTION_ID)?.remove();
      document.getElementById(DISPLAY_SECTION_ID)?.remove();
      setPendingProfileMotto(null);
      return;
    }
    removeLegacyMottoUi(page);
    const editCard = findEditCard(page);
    if (editCard) {
      ensureEditSection(page, editCard);
      ensureFloatingActions(page);
    } else {
      setPendingProfileMotto(null);
      ensureDisplaySection(page);
    }
  } finally {
    observer?.observe(document.documentElement, { childList: true, subtree: true });
  }
}

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    renderNow();
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  observer = new MutationObserver(scheduleRender);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('click', scheduleRender, true);
  window.addEventListener('echostars:profile-motto-saved', scheduleRender);
  scheduleRender();
}
