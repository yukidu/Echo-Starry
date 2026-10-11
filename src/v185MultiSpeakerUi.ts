import { MAX_TRACK_SPEAKERS, parseSpeakerInput, speakerDisplay } from '../shared/speakers';

type SpeakerFormState = {
  initialized: boolean;
  extras: string[];
};

const states = new WeakMap<HTMLFormElement, SpeakerFormState>();
const PRIMARY_PLACEHOLDER = '例：陳志豪';

function installStyles() {
  if (document.getElementById('v185-multi-speaker-style')) return;
  const style = document.createElement('style');
  style.id = 'v185-multi-speaker-style';
  style.textContent = `
    .v185-speaker-tools { margin-top: .55rem; display: grid; gap: .5rem; }
    .v185-speaker-row { display: flex; align-items: center; gap: .5rem; }
    .v185-speaker-row input {
      min-width: 0; flex: 1; padding: .42rem .75rem; border-radius: .75rem;
      border: 1px solid rgb(226 232 240); background: rgb(248 250 252);
      color: rgb(30 41 59); outline: none;
    }
    .v185-speaker-row input:focus { border-color: var(--color-primary,#c06c84); }
    .v185-speaker-remove, .v185-speaker-add {
      min-height: 2rem; border-radius: .7rem; font-weight: 800; cursor: pointer;
    }
    .v185-speaker-remove {
      flex: none; padding: .35rem .65rem; border: 1px solid rgb(254 205 211);
      background: rgb(255 241 242); color: rgb(190 24 93);
    }
    .v185-speaker-add {
      justify-self: start; padding: .42rem .8rem; border: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 55%,transparent);
      background: color-mix(in srgb,var(--color-primary,#c06c84) 10%,white); color: var(--color-primary,#c06c84);
    }
    .v185-speaker-add:disabled { opacity: .45; cursor: not-allowed; }
    .v185-speaker-help { margin: 0; font-size: .7rem; line-height: 1.35; color: rgb(100 116 139); }
    html.dark .v185-speaker-row input { border-color: rgb(51 65 85); background: rgb(30 41 59); color: rgb(241 245 249); }
    html.dark .v185-speaker-remove { border-color: rgb(136 19 55); background: rgb(76 5 25); color: rgb(253 164 175); }
    html.dark .v185-speaker-add { background: color-mix(in srgb,var(--color-primary,#c06c84) 16%,rgb(15 23 42)); }
    html.dark .v185-speaker-help { color: rgb(148 163 184); }
  `;
  document.head.appendChild(style);
}

function nativeSetInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function primarySpeakerInput(form: HTMLFormElement) {
  return Array.from(form.querySelectorAll<HTMLInputElement>('input[type="text"]'))
    .find(input => input.placeholder === PRIMARY_PLACEHOLDER) || null;
}

function formState(form: HTMLFormElement) {
  let state = states.get(form);
  if (!state) {
    state = { initialized: false, extras: [] };
    states.set(form, state);
  }
  return state;
}

function normalizeCurrentForm(form: HTMLFormElement) {
  const primary = primarySpeakerInput(form);
  if (!primary) return [];
  const state = formState(form);
  return parseSpeakerInput([primary.value, ...state.extras]);
}

function initializeExistingCombinedName(form: HTMLFormElement, primary: HTMLInputElement) {
  const state = formState(form);
  if (state.initialized) return;
  state.initialized = true;
  const names = parseSpeakerInput(primary.value);
  if (names.length > 1) {
    state.extras = names.slice(1, MAX_TRACK_SPEAKERS);
    nativeSetInputValue(primary, names[0]);
  }
}

function splitPrimaryIfNeeded(form: HTMLFormElement) {
  const primary = primarySpeakerInput(form);
  if (!primary) return;
  const state = formState(form);
  const names = parseSpeakerInput(primary.value);
  if (names.length <= 1) return;
  const combined = parseSpeakerInput([names[0], ...state.extras, ...names.slice(1)]).slice(0, MAX_TRACK_SPEAKERS);
  nativeSetInputValue(primary, combined[0] || '');
  state.extras = combined.slice(1);
  renderSpeakerTools(form);
}

function renderSpeakerTools(form: HTMLFormElement) {
  const primary = primarySpeakerInput(form);
  if (!primary) return;
  initializeExistingCombinedName(form, primary);
  const state = formState(form);
  const anchor = primary.parentElement;
  if (!anchor) return;

  let tools = anchor.querySelector<HTMLElement>('[data-v185-speaker-tools]');
  if (!tools) {
    tools = document.createElement('div');
    tools.className = 'v185-speaker-tools';
    tools.dataset.v185SpeakerTools = 'true';
    anchor.append(tools);
  }
  tools.replaceChildren();

  state.extras.forEach((speakerName, index) => {
    const row = document.createElement('div');
    row.className = 'v185-speaker-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = speakerName;
    input.placeholder = `共同演講者 ${index + 2}`;
    input.setAttribute('aria-label', `共同演講者 ${index + 2}`);
    input.addEventListener('input', () => {
      state.extras[index] = input.value;
    });
    input.addEventListener('blur', () => {
      const all = parseSpeakerInput([input.value]);
      if (all.length > 1) {
        const before = state.extras.slice(0, index);
        const after = state.extras.slice(index + 1);
        state.extras = parseSpeakerInput([...before, ...all, ...after]).slice(0, MAX_TRACK_SPEAKERS - 1);
        renderSpeakerTools(form);
      }
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'v185-speaker-remove';
    remove.textContent = '移除';
    remove.addEventListener('click', () => {
      state.extras.splice(index, 1);
      renderSpeakerTools(form);
    });
    row.append(input, remove);
    tools!.append(row);
  });

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'v185-speaker-add';
  add.textContent = '＋ 增加共同演講者';
  add.disabled = state.extras.length >= MAX_TRACK_SPEAKERS - 1;
  add.addEventListener('click', () => {
    if (state.extras.length >= MAX_TRACK_SPEAKERS - 1) return;
    state.extras.push('');
    renderSpeakerTools(form);
    tools?.querySelectorAll<HTMLInputElement>('.v185-speaker-row input')[state.extras.length - 1]?.focus();
  });

  const help = document.createElement('p');
  help.className = 'v185-speaker-help';
  help.textContent = `一部音檔最多 ${MAX_TRACK_SPEAKERS} 位演講者；前台會自動以「&」連結姓名。`;
  tools.append(add, help);

  if (!primary.dataset.v185SpeakerBound) {
    primary.dataset.v185SpeakerBound = 'true';
    primary.addEventListener('blur', () => splitPrimaryIfNeeded(form));
  }
}

function validateForm(form: HTMLFormElement) {
  const primary = primarySpeakerInput(form);
  if (!primary) return true;
  const names = normalizeCurrentForm(form);
  const rawNames = parseSpeakerInput([primary.value, ...formState(form).extras]);
  primary.setCustomValidity('');
  if (rawNames.length > MAX_TRACK_SPEAKERS) {
    primary.setCustomValidity(`一部音檔最多只能設定 ${MAX_TRACK_SPEAKERS} 位演講者`);
    primary.reportValidity();
    return false;
  }
  if (!names.length && primary.value.trim()) {
    primary.setCustomValidity('請確認演講者姓名');
    primary.reportValidity();
    return false;
  }
  return true;
}

function enhanceForms() {
  document.querySelectorAll<HTMLFormElement>('form#track-upload-form').forEach(form => {
    renderSpeakerTools(form);
    if (form.dataset.v185SpeakerSubmitBound) return;
    form.dataset.v185SpeakerSubmitBound = 'true';
    form.addEventListener('submit', event => {
      if (!validateForm(form)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  });
}

function findActiveUploadForm() {
  return document.querySelector<HTMLFormElement>('form#track-upload-form');
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  try {
    const url = typeof input === 'string' ? new URL(input, window.location.origin) :
      input instanceof URL ? input : new URL(input.url, window.location.origin);
    const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const isTrackWrite = url.origin === window.location.origin &&
      ((url.pathname === '/api/tracks' && method === 'POST') || (/^\/api\/tracks\/[^/]+$/.test(url.pathname) && method === 'PUT'));
    const form = isTrackWrite ? findActiveUploadForm() : null;
    if (form && typeof init?.body === 'string') {
      const body = JSON.parse(init.body);
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        const names = normalizeCurrentForm(form);
        if (names.length) {
          body.speakers = names;
          body.speaker = speakerDisplay(names);
          init = { ...init, body: JSON.stringify(body) };
        }
      }
    }
  } catch {
    // Preserve the original request if it is not one of the JSON track writes.
  }
  return originalFetch(input, init);
};

installStyles();
enhanceForms();
const observer = new MutationObserver(enhanceForms);
observer.observe(document.documentElement, { childList: true, subtree: true });
