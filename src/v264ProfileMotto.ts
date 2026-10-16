const PROFILE_ROOT_SELECTOR = '.profile-page';
const CURRENT_USER_STORAGE = 'sq_current_user_v1';
const EDIT_ID = 'v264-profile-motto-edit';
const INPUT_ID = 'v264-profile-motto-input';
const DICE_ID = 'v264-profile-motto-dice';
const FLOATING_ACTIONS_ID = 'v266-profile-floating-actions';
const LEGACY_DISPLAY_ID = 'v264-profile-motto-display';

type StoredUser = {
  id?: string;
  email?: string;
  motto?: string;
  [key: string]: unknown;
};

let pendingMotto: string | null = null;
let saveArmed = false;
let savingMotto = false;
let toastTimer = 0;

function readCurrentUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem(CURRENT_USER_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as StoredUser : null;
  } catch {
    return null;
  }
}

function mottoStorageKey(user: StoredUser | null) {
  const identity = String(user?.id || user?.email || '').trim().toLowerCase();
  return identity ? `echostars-profile-motto-v264:${identity}` : '';
}

function readMotto(user = readCurrentUser()) {
  const key = mottoStorageKey(user);
  if (key) {
    const local = localStorage.getItem(key);
    if (local !== null) return local;
  }
  return String(user?.motto || '').trim();
}

function writeLocalMotto(motto: string) {
  const user = readCurrentUser();
  if (!user) return;
  user.motto = motto;
  localStorage.setItem(CURRENT_USER_STORAGE, JSON.stringify(user));
  const key = mottoStorageKey(user);
  if (key) localStorage.setItem(key, motto);
}

function findLabel(root: Element, text: string) {
  return Array.from(root.querySelectorAll('label,span')).find(element =>
    (element.textContent || '').trim().startsWith(text)
  ) || null;
}

function profileEditGrid(root: HTMLElement) {
  return findLabel(root, '姓名或暱稱')?.closest('.grid') as HTMLElement | null;
}

function findNativeAction(root: HTMLElement, label: '儲存' | '取消') {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(button => {
    if (button.closest(`#${FLOATING_ACTIONS_ID}`)) return false;
    return (button.textContent || '').replace(/\s+/g, ' ').trim() === label;
  }) || null;
}

function showSaveToast(message: string, kind: 'success' | 'error' = 'success') {
  document.getElementById('v266-profile-save-toast')?.remove();
  window.clearTimeout(toastTimer);
  const toast = document.createElement('div');
  toast.id = 'v266-profile-save-toast';
  toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  toast.className = `fixed left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom)+104px)] z-[170] px-5 py-3 rounded-2xl text-sm font-black shadow-2xl border ${kind === 'success' ? 'bg-emerald-600 text-white border-emerald-300' : 'bg-red-600 text-white border-red-300'}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  toastTimer = window.setTimeout(() => toast.remove(), kind === 'success' ? 2200 : 4200);
}

async function randomMotto(input: HTMLTextAreaElement, button: HTMLButtonElement) {
  if (button.disabled) return;
  button.disabled = true;
  const original = button.textContent || '🎲 隨機一句';
  button.textContent = '🎲 抽取中…';
  try {
    const response = await fetch(`/api/random-motto?t=${Date.now()}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !String(data?.motto || '').trim()) {
      throw new Error(data?.error || '目前無法取得繁星雞湯語錄');
    }
    const motto = String(data.motto).trim();
    input.value = motto;
    pendingMotto = motto;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '目前無法取得繁星雞湯語錄');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function makeEditField() {
  const wrapper = document.createElement('div');
  wrapper.id = EDIT_ID;
  wrapper.dataset.profileMottoPrimary = '1';
  wrapper.className = 'sm:col-span-2 bg-white dark:bg-slate-800 p-2.5 rounded-xl border-2 border-amber-200 dark:border-amber-800 shadow-sm';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between gap-2 mb-1';

  const label = document.createElement('label');
  label.htmlFor = INPUT_ID;
  label.className = 'font-black text-slate-800 dark:text-slate-100';
  label.textContent = '座右銘';

  const dice = document.createElement('button');
  dice.id = DICE_ID;
  dice.type = 'button';
  dice.className = 'shrink-0 px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 text-xs font-black shadow-sm hover:brightness-95 active:scale-95 disabled:opacity-50';
  dice.title = '從繁星雞湯隨機帶入一句話';
  dice.textContent = '🎲 隨機一句';

  const input = document.createElement('textarea');
  input.id = INPUT_ID;
  input.rows = 3;
  input.maxLength = 500;
  input.value = pendingMotto ?? readMotto();
  input.placeholder = '寫下你的座右銘，或按骰子從繁星雞湯隨機抽一句';
  input.className = 'w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-hidden resize-y leading-relaxed';
  input.addEventListener('input', () => { pendingMotto = input.value; });
  dice.addEventListener('click', () => void randomMotto(input, dice));

  const hint = document.createElement('p');
  hint.className = 'mt-1 text-[10px] text-slate-500 dark:text-slate-400';
  hint.textContent = '骰子內容來自繁星雞湯 Quotes Starry；按「儲存」後同步到 Starry ID。';

  header.append(label, dice);
  wrapper.append(header, input, hint);
  return wrapper;
}

function removeLegacyMottoUi(root: HTMLElement) {
  root.querySelector(`#${LEGACY_DISPLAY_ID}`)?.remove();
  root.querySelectorAll<HTMLElement>('[data-starry-extension-field="motto"]').forEach(node => node.remove());
}

function ensureEdit(root: HTMLElement) {
  const grid = profileEditGrid(root);
  if (!grid) return;
  removeLegacyMottoUi(root);
  if (root.querySelector(`#${EDIT_ID}`)) return;
  const field = makeEditField();
  const birthdayLabel = findLabel(grid, '西元生日');
  const birthdayBlock = birthdayLabel?.closest('.sm\\:col-span-2');
  if (birthdayBlock?.parentElement === grid) grid.insertBefore(field, birthdayBlock);
  else grid.appendChild(field);
}

function styleNativeActions(root: HTMLElement) {
  const save = findNativeAction(root, '儲存');
  const cancel = findNativeAction(root, '取消');
  if (save) {
    save.type = 'button';
    save.dataset.profileNativeSave = '1';
    save.style.background = '#facc15';
    save.style.color = '#111827';
    save.style.fontWeight = '900';
    save.style.fontSize = '14px';
    save.style.padding = '10px 16px';
    save.style.borderRadius = '12px';
    save.style.boxShadow = '0 8px 24px rgba(250, 204, 21, 0.35)';
    save.style.border = '2px solid rgba(255,255,255,.88)';
    save.title = '儲存所有個人資料與座右銘';
  }
  if (cancel) {
    cancel.type = 'button';
    cancel.dataset.profileNativeCancel = '1';
    cancel.style.fontWeight = '800';
    cancel.style.padding = '10px 12px';
    cancel.style.borderRadius = '12px';
    cancel.style.border = '1px solid rgba(255,255,255,.5)';
  }
}

function ensureFloatingActions(root: HTMLElement) {
  const editGrid = profileEditGrid(root);
  const existing = document.getElementById(FLOATING_ACTIONS_ID);
  if (!editGrid) {
    existing?.remove();
    root.style.paddingBottom = '';
    return;
  }

  styleNativeActions(root);
  root.style.paddingBottom = '104px';

  const nativeSave = findNativeAction(root, '儲存');
  const nativeCancel = findNativeAction(root, '取消');
  if (!nativeSave || !nativeCancel) return;

  if (existing) return;

  const bar = document.createElement('div');
  bar.id = FLOATING_ACTIONS_ID;
  bar.className = 'fixed left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom)+14px)] z-[160] w-[min(94vw,560px)] flex items-stretch gap-3 rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-2.5';

  const save = document.createElement('button');
  save.type = 'button';
  save.dataset.profileFloatingSave = '1';
  save.className = 'flex-[1.35] min-h-[68px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xl sm:text-2xl font-black shadow-xl active:scale-[0.98] transition-all';
  save.textContent = '💾 儲存';
  save.addEventListener('click', () => {
    const target = findNativeAction(root, '儲存');
    if (target && !target.disabled) target.click();
  });

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.dataset.profileFloatingCancel = '1';
  cancel.className = 'flex-1 min-h-[68px] rounded-2xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-white text-xl sm:text-2xl font-black shadow-lg active:scale-[0.98] transition-all';
  cancel.textContent = '取消';
  cancel.addEventListener('click', () => {
    const target = findNativeAction(root, '取消');
    if (target && !target.disabled) target.click();
  });

  bar.append(save, cancel);
  document.body.appendChild(bar);
}

async function persistMotto(motto: string) {
  if (savingMotto) return;
  const user = readCurrentUser();
  const userId = String(user?.id || '').trim();
  if (!userId) return;
  savingMotto = true;
  try {
    const response = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ motto: motto.trim(), email: String(user?.email || '') })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || '座右銘儲存失敗');
    writeLocalMotto(motto.trim());
    window.dispatchEvent(new CustomEvent('echostars:profile-motto-updated', {
      detail: { motto: motto.trim(), source: 'quotes.starry.phd' }
    }));
    showSaveToast('✅ 個人資料與座右銘已儲存');
  } catch (error) {
    const message = error instanceof Error ? error.message : '座右銘儲存失敗，請再試一次。';
    showSaveToast(message, 'error');
    window.alert(message);
  } finally {
    savingMotto = false;
    pendingMotto = null;
    saveArmed = false;
  }
}

function render() {
  const root = document.querySelector<HTMLElement>(PROFILE_ROOT_SELECTOR);
  if (!root) {
    document.getElementById(FLOATING_ACTIONS_ID)?.remove();
    saveArmed = false;
    pendingMotto = null;
    return;
  }

  removeLegacyMottoUi(root);
  const editGrid = profileEditGrid(root);
  if (editGrid) {
    ensureEdit(root);
    ensureFloatingActions(root);
    return;
  }

  document.getElementById(FLOATING_ACTIONS_ID)?.remove();
  root.style.paddingBottom = '';
  if (saveArmed && pendingMotto !== null) {
    const motto = pendingMotto;
    saveArmed = false;
    void persistMotto(motto);
  }
}

document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
  if (!target) return;
  const root = target.closest<HTMLElement>(PROFILE_ROOT_SELECTOR);
  if (!root) return;

  if (target.dataset.profileNativeSave === '1') {
    const input = root.querySelector<HTMLTextAreaElement>(`#${INPUT_ID}`);
    if (input) {
      pendingMotto = input.value;
      saveArmed = true;
    }
  } else if (target.dataset.profileNativeCancel === '1') {
    pendingMotto = null;
    saveArmed = false;
  }
});

let observer: MutationObserver | null = null;
let renderScheduled = false;

function observeProfileDom() {
  observer?.observe(document.documentElement, { childList: true, subtree: true });
}

function renderWithoutFeedbackLoop() {
  observer?.disconnect();
  try {
    render();
  } finally {
    observeProfileDom();
  }
}

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  window.requestAnimationFrame(() => {
    renderScheduled = false;
    renderWithoutFeedbackLoop();
  });
}

observer = new MutationObserver(scheduleRender);
observeProfileDom();
window.addEventListener('echostars:profile-motto-updated', scheduleRender);
renderWithoutFeedbackLoop();
