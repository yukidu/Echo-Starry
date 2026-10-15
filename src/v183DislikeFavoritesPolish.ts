import { isCombinedSpeakerName, speakerMatchesHiddenEntry, speakerMatchesAnyHiddenEntry } from './v184SpeakerRelationship';

const PRODUCTION_HOST = 'echostars.yukidu.workers.dev';
const PREVIEW_STORAGE_PREFIX = 'preview-disliked-speakers-v2';
const REOPEN_FAVORITES_KEY = 'v183-reopen-favorites';
const hiddenSpeakers = new Set<string>();
const trackSpeakersById = new Map<string, string>();
let loadToken = 0;
let renderQueued = false;
let trackLoad: Promise<void> | null = null;
let trackSpeakersLoaded = false;

function isPreviewHost() {
  const host = window.location.hostname;
  return host !== PRODUCTION_HOST && host.endsWith('-echostars.yukidu.workers.dev');
}

function readMemberIdentity() {
  try {
    const raw = localStorage.getItem('sq_current_user_v1');
    if (!raw) return '';
    const user = JSON.parse(raw);
    return String(user?.id || user?.email || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

function previewStorageKey() {
  return `${PREVIEW_STORAGE_PREFIX}:${readMemberIdentity() || 'preview-guest'}`;
}

function readPreviewSpeakers() {
  try {
    const parsed = JSON.parse(localStorage.getItem(previewStorageKey()) || '[]');
    return Array.isArray(parsed)
      ? parsed.map(String).map(name => name.trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function writePreviewSpeakers(names: string[]) {
  try { localStorage.setItem(previewStorageKey(), JSON.stringify(names)); } catch {}
}

function installStyles() {
  if (document.getElementById('v183-dislike-favorites-style')) return;
  const style = document.createElement('style');
  style.id = 'v183-dislike-favorites-style';
  style.textContent = `
    .v181-confirm-title { display: none !important; }
    .v181-confirm-card { width: min(27rem, calc(100vw - 1rem)) !important; }
    .v181-confirm-message {
      margin: .15rem 0 0 !important;
      font-size: 1.12rem !important;
      line-height: 1.65rem !important;
      font-weight: 750 !important;
    }
    .v181-confirm-actions {
      margin-top: 1rem !important;
      justify-content: center !important;
      gap: .85rem !important;
    }
    .v181-confirm-button {
      min-width: 7rem !important;
      min-height: 3rem !important;
      padding: .65rem 1.15rem !important;
      border-radius: 1rem !important;
      font-size: 1rem !important;
      font-weight: 900 !important;
    }
    .v183-hidden-speakers-section {
      margin-top: .15rem;
      padding-top: .8rem;
      border-top: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 22%,transparent);
    }
    .v183-hidden-speakers-heading,
    .v184-hidden-speaker-group-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .75rem;
      color: var(--theme-text-primary,#0f172a);
      font-weight: 950;
    }
    .v183-hidden-speakers-heading {
      margin-bottom: .65rem;
      font-size: .96rem;
    }
    .v184-hidden-speaker-group-heading {
      margin: .68rem 0 .42rem;
      padding-top: .15rem;
      font-size: .82rem;
      color: var(--theme-text-secondary,#64748b);
    }
    .v183-hidden-speakers-count,
    .v184-hidden-speaker-group-count {
      color: var(--color-primary,#c06c84);
      font-size: .8rem;
      font-weight: 900;
      white-space: nowrap;
    }
    .v183-hidden-speakers-empty,
    .v184-hidden-speaker-group-empty {
      margin: 0;
      color: var(--theme-text-secondary,#64748b);
      text-align: center;
      font-size: .84rem;
      line-height: 1.5;
      padding: .4rem 0 .15rem;
    }
    .v183-hidden-speakers-list {
      display: flex;
      flex-direction: column;
      gap: .45rem;
    }
    .v183-hidden-speaker-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .75rem;
      padding: .55rem .6rem;
      border-radius: 13px;
      background: color-mix(in srgb,var(--theme-card-bg,#fff) 88%,var(--color-primary,#c06c84) 12%);
    }
    .v183-hidden-speaker-name-wrap {
      min-width: 0;
      display: flex;
      align-items: baseline;
      gap: .22rem;
      overflow: hidden;
    }
    .v183-hidden-speaker-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--theme-text-primary,#0f172a);
      font-size: .9rem;
      font-weight: 850;
    }
    .v184-hidden-track-count {
      flex: none;
      color: var(--color-primary,#c06c84);
      font-size: .84rem;
      font-weight: 950;
      white-space: nowrap;
    }
    .v183-unhide-button {
      flex: none;
      min-height: 2.25rem;
      padding: .45rem .75rem;
      border: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 55%,transparent);
      border-radius: 11px;
      background: var(--color-primary,#c06c84);
      color: #fff;
      font-size: .78rem;
      font-weight: 900;
      cursor: pointer;
    }
    .v183-unhide-button:disabled { opacity: .55; cursor: wait; }
    html.dark .v183-hidden-speaker-row {
      background: color-mix(in srgb,#111827 88%,var(--color-primary,#c06c84) 12%);
    }
  `;
  document.head.appendChild(style);
}

async function loadTrackSpeakers(force = false) {
  if (trackSpeakersLoaded && !force) return;
  if (trackLoad && !force) return trackLoad;
  trackLoad = (async () => {
    const response = await fetch('/api/tracks', {
      credentials: 'same-origin',
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`tracks: ${response.status}`);
    const tracks = await response.json().catch(() => []);
    if (!Array.isArray(tracks)) throw new Error('tracks response is not an array');
    trackSpeakersById.clear();
    tracks.forEach((track: any) => {
      const id = String(track?.id || '').trim();
      const speaker = String(track?.speaker || '').trim();
      if (id && speaker) trackSpeakersById.set(id, speaker);
    });
    trackSpeakersLoaded = true;
  })();
  try {
    await trackLoad;
  } finally {
    trackLoad = null;
  }
}

async function fetchHiddenSpeakerNames(): Promise<string[]> {
  if (isPreviewHost()) return readPreviewSpeakers();
  if (!readMemberIdentity()) return [];
  try {
    const response = await fetch('/api/member-hidden-speakers', {
      credentials: 'same-origin',
      cache: 'no-store'
    });
    if (!response.ok) return [];
    const data = await response.json().catch(() => ({}));
    return Array.isArray(data?.speakers)
      ? data.speakers.map(String).map((name: string) => name.trim()).filter(Boolean)
      : [];
  } catch (error) {
    console.warn('Failed to load hidden speakers for favorites page:', error);
    return [];
  }
}

async function loadHiddenSpeakers() {
  const token = ++loadToken;
  const names = await fetchHiddenSpeakerNames();
  if (token !== loadToken) return;
  hiddenSpeakers.clear();
  names.forEach(name => hiddenSpeakers.add(name));
  renderHiddenSpeakerSection();
}

async function removeHiddenSpeaker(speakerName: string) {
  if (isPreviewHost()) {
    const next = readPreviewSpeakers().filter(name => name !== speakerName);
    writePreviewSpeakers(next);
    hiddenSpeakers.delete(speakerName);
    return;
  }
  const response = await fetch(`/api/member-hidden-speakers/${encodeURIComponent(speakerName)}`, {
    method: 'DELETE',
    credentials: 'same-origin'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || '取消隱藏失敗，請稍後再試。');
  hiddenSpeakers.delete(speakerName);
}

function hiddenTrackCount(speakerName: string) {
  let count = 0;
  trackSpeakersById.forEach(trackSpeaker => {
    if (speakerMatchesHiddenEntry(trackSpeaker, speakerName)) count += 1;
  });
  return count;
}

function totalHiddenTrackCount() {
  let count = 0;
  trackSpeakersById.forEach(trackSpeaker => {
    if (speakerMatchesAnyHiddenEntry(trackSpeaker, hiddenSpeakers)) count += 1;
  });
  return count;
}

function createSpeakerRow(speakerName: string) {
  const row = document.createElement('div');
  row.className = 'v183-hidden-speaker-row';

  const nameWrap = document.createElement('div');
  nameWrap.className = 'v183-hidden-speaker-name-wrap';
  const name = document.createElement('span');
  name.className = 'v183-hidden-speaker-name';
  name.textContent = speakerName;
  const hiddenCount = document.createElement('span');
  hiddenCount.className = 'v184-hidden-track-count';
  hiddenCount.textContent = `（${hiddenTrackCount(speakerName)}）`;
  hiddenCount.title = `此項目目前共隱藏 ${hiddenTrackCount(speakerName)} 部音檔`;
  nameWrap.append(name, hiddenCount);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'v183-unhide-button';
  button.textContent = '取消隱藏';
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = '處理中…';
    try {
      await removeHiddenSpeaker(speakerName);
      sessionStorage.setItem(REOPEN_FAVORITES_KEY, '1');
      window.location.reload();
    } catch (error) {
      button.disabled = false;
      button.textContent = '取消隱藏';
      window.alert(error instanceof Error ? error.message : '取消隱藏失敗，請稍後再試。');
    }
  });

  row.append(nameWrap, button);
  return row;
}

function appendSpeakerGroup(section: HTMLElement, titleText: string, names: string[], countLabel: string) {
  const heading = document.createElement('div');
  heading.className = 'v184-hidden-speaker-group-heading';
  const title = document.createElement('span');
  title.textContent = titleText;
  const count = document.createElement('span');
  count.className = 'v184-hidden-speaker-group-count';
  count.textContent = `${names.length} ${countLabel}`;
  heading.append(title, count);
  section.append(heading);

  if (!names.length) {
    const empty = document.createElement('p');
    empty.className = 'v184-hidden-speaker-group-empty';
    empty.textContent = '目前沒有項目';
    section.append(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'v183-hidden-speakers-list';
  names.forEach(speakerName => list.append(createSpeakerRow(speakerName)));
  section.append(list);
}

function renderHiddenSpeakerSection() {
  const header = document.querySelector<HTMLElement>('.v142-favorites-header');
  if (!header) return;

  const names = Array.from(hiddenSpeakers).sort((a, b) => a.localeCompare(b, 'zh-Hant'));

  // The full track list is only needed for hidden-track counts. Do not fetch it
  // during normal homepage startup; load it lazily when the Favorites panel is open.
  if (names.length && !trackSpeakersLoaded) {
    void loadTrackSpeakers().then(renderHiddenSpeakerSection).catch(error => {
      console.warn('Failed to load speakers for hidden-track counts:', error);
    });
    return;
  }

  const combinedNames = names.filter(isCombinedSpeakerName);
  const singleNames = names.filter(name => !isCombinedSpeakerName(name));
  const countSignature = names.map(name => `${name}:${hiddenTrackCount(name)}`).join('\u0001');
  const signature = `${countSignature}\u0002${totalHiddenTrackCount()}`;
  let section = header.querySelector<HTMLElement>('[data-v183-hidden-speakers]');
  if (section?.dataset.signature === signature) return;
  section?.remove();

  section = document.createElement('section');
  section.className = 'v183-hidden-speakers-section';
  section.dataset.v183HiddenSpeakers = 'true';
  section.dataset.signature = signature;

  const heading = document.createElement('div');
  heading.className = 'v183-hidden-speakers-heading';
  const title = document.createElement('span');
  title.textContent = '不喜歡的演講者';
  const count = document.createElement('span');
  count.className = 'v183-hidden-speakers-count';
  count.textContent = `${names.length} 項・${totalHiddenTrackCount()} 部音檔`;
  heading.append(title, count);
  section.append(heading);

  if (!names.length) {
    const empty = document.createElement('p');
    empty.className = 'v183-hidden-speakers-empty';
    empty.textContent = '目前沒有隱藏的演講者';
    section.append(empty);
  } else {
    appendSpeakerGroup(section, '夫妻／合併姓名', combinedNames, '組');
    appendSpeakerGroup(section, '單人姓名', singleNames, '位');
  }

  header.append(section);
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  window.requestAnimationFrame(() => {
    renderQueued = false;
    renderHiddenSpeakerSection();
  });
}

function reopenFavoritesAfterRestore() {
  if (sessionStorage.getItem(REOPEN_FAVORITES_KEY) !== '1') return;
  let attempt = 0;
  const open = () => {
    const favoriteRow = document.querySelector<HTMLElement>('[data-v142-favorites-menu]');
    if (favoriteRow) {
      sessionStorage.removeItem(REOPEN_FAVORITES_KEY);
      const button = favoriteRow.querySelector<HTMLButtonElement>('button');
      (button || favoriteRow).click();
      return;
    }
    const hamburger = document.querySelector<HTMLButtonElement>('button[data-main-menu="hamburger"]');
    if (hamburger && hamburger.getAttribute('aria-expanded') !== 'true') hamburger.click();
    attempt += 1;
    if (attempt < 20) window.setTimeout(open, 80);
  };
  window.setTimeout(open, 80);
}

installStyles();
void loadHiddenSpeakers();
reopenFavoritesAfterRestore();

window.addEventListener('echostars:member-hidden-speakers-changed', event => {
  const speakerName = String((event as CustomEvent<{ speakerName?: string }>).detail?.speakerName || '').trim();
  if (speakerName) hiddenSpeakers.add(speakerName);
  renderHiddenSpeakerSection();
});
window.addEventListener('storage', event => {
  if (event.key?.startsWith(PREVIEW_STORAGE_PREFIX) || event.key === 'sq_current_user_v1') {
    void loadHiddenSpeakers();
  }
});
window.addEventListener('focus', () => void loadHiddenSpeakers());

const observer = new MutationObserver(queueRender);
observer.observe(document.body, { childList: true, subtree: true });
