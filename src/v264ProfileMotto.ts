const PROFILE_ROOT_SELECTOR = '.profile-page';
const CURRENT_USER_STORAGE = 'sq_current_user_v1';
const DISPLAY_ID = 'v264-profile-motto-display';
const EDIT_ID = 'v264-profile-motto-edit';
const INPUT_ID = 'v264-profile-motto-input';
const DICE_ID = 'v264-profile-motto-dice';

type StoredUser = {
  id?: string;
  email?: string;
  motto?: string;
  [key: string]: unknown;
};

let pendingMotto: string | null = null;
let saveArmed = false;
let savingMotto = false;

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

function profileDetailsGrid(root: HTMLElement) {
  return findLabel(root, 'Email')?.closest('.grid') as HTMLElement | null;
}

function profileEditGrid(root: HTMLElement) {
  return findLabel(root, '姓名或暱稱')?.closest('.grid') as HTMLElement | null;
}

function makeDisplayCard(motto: string) {
  const card = document.createElement('div');
  card.id = DISPLAY_ID;
  card.className = 'col-span-2 bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700';

  const label = document.createElement('span');
  label.className = 'text-[10px] text-slate-500 dark:text-slate-400 block font-semibold';
  label.textContent = '座右銘';

  const value = document.createElement('span');
  value.className = 'font-semibold text-slate-800 dark:text-slate-200 block mt-0.5 leading-relaxed whitespace-pre-wrap';
  value.dataset.v264MottoValue = '1';
  value.textContent = motto || '未填寫';

  card.append(label, value);
  return card;
}

function ensureDisplay(root: HTMLElement) {
  if (root.querySelector(`#${EDIT_ID}`)) return;
  const grid = profileDetailsGrid(root);
  if (!grid) return;
  const motto = readMotto();
  let card = root.querySelector<HTMLElement>(`#${DISPLAY_ID}`);
  if (!card) {
    card = makeDisplayCard(motto);
    grid.appendChild(card);
  }
  const value = card.querySelector<HTMLElement>('[data-v264-motto-value="1"]');
  const nextText = motto || '未填寫';
  if (value && value.textContent !== nextText) value.textContent = nextText;
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
  wrapper.className = 'sm:col-span-2 bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700';

  const header = document.createElement('div');
  header.className = 'flex items-center justify-between gap-2 mb-1';

  const label = document.createElement('label');
  label.htmlFor = INPUT_ID;
  label.className = 'font-bold text-slate-700 dark:text-slate-300';
  label.textContent = '座右銘';

  const dice = document.createElement('button');
  dice.id = DICE_ID;
  dice.type = 'button';
  dice.className = 'shrink-0 px-2.5 py-1.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-[11px] font-bold hover:brightness-95 active:scale-95 disabled:opacity-50';
  dice.title = '從繁星雞湯隨機帶入一句話';
  dice.textContent = '🎲 隨機一句';

  const input = document.createElement('textarea');
  input.id = INPUT_ID;
  input.rows = 2;
  input.maxLength = 500;
  input.value = pendingMotto ?? readMotto();
  input.placeholder = '寫下你的座右銘，或按骰子從繁星雞湯隨機抽一句';
  input.className = 'w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-hidden resize-y leading-relaxed';
  input.addEventListener('input', () => { pendingMotto = input.value; });
  dice.addEventListener('click', () => void randomMotto(input, dice));

  const hint = document.createElement('p');
  hint.className = 'mt-1 text-[10px] text-slate-400 dark:text-slate-500';
  hint.textContent = '骰子內容來自繁星雞湯 Quotes Starry；儲存後會同步到 Starry ID。';

  header.append(label, dice);
  wrapper.append(header, input, hint);
  return wrapper;
}

function ensureEdit(root: HTMLElement) {
  const grid = profileEditGrid(root);
  if (!grid) return;
  root.querySelector(`#${DISPLAY_ID}`)?.remove();
  if (root.querySelector(`#${EDIT_ID}`)) return;
  const field = makeEditField();
  const birthdayLabel = findLabel(grid, '西元生日');
  const birthdayBlock = birthdayLabel?.closest('.sm\\:col-span-2');
  if (birthdayBlock?.parentElement === grid) grid.insertBefore(field, birthdayBlock);
  else grid.appendChild(field);
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
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '座右銘儲存失敗，請再試一次。');
  } finally {
    savingMotto = false;
    pendingMotto = null;
    saveArmed = false;
    render();
  }
}

function render() {
  const root = document.querySelector<HTMLElement>(PROFILE_ROOT_SELECTOR);
  if (!root) {
    saveArmed = false;
    pendingMotto = null;
    return;
  }

  const editGrid = profileEditGrid(root);
  if (editGrid) {
    ensureEdit(root);
    return;
  }

  if (saveArmed && pendingMotto !== null) {
    const motto = pendingMotto;
    saveArmed = false;
    void persistMotto(motto);
  }
  ensureDisplay(root);
}

document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target.closest('button') : null;
  if (!target) return;
  const root = target.closest(PROFILE_ROOT_SELECTOR);
  if (!root) return;
  const label = (target.textContent || '').trim();
  if (label === '儲存') {
    const input = root.querySelector<HTMLTextAreaElement>(`#${INPUT_ID}`);
    if (input) {
      pendingMotto = input.value;
      saveArmed = true;
    }
  } else if (label === '取消') {
    pendingMotto = null;
    saveArmed = false;
  }
});

const observer = new MutationObserver(render);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener('echostars:profile-motto-updated', render);
render();