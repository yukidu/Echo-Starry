import './v176CrownStoryInPage.css';

const CROWN_PAGE_ID = 'taiwan-crown-integrated-page';
const STORY_VIEW_ATTR = 'data-v176-crown-story-view';
const AMWAY_STORY_RE = /^https:\/\/www\.amway\.com\.tw\/wechat\/aep\/member\/member\d+\.html(?:[?#].*)?$/i;

type StoryItem = {
  name: string;
  url: string;
};

let listScrollY = 0;
let currentStoryIndex = -1;
let storyItems: StoryItem[] = [];

function crownPage() {
  return document.getElementById(CROWN_PAGE_ID);
}

function crownListShell() {
  return crownPage()?.querySelector<HTMLElement>('.taiwan-crown-page-shell') || null;
}

function readStories(): StoryItem[] {
  const shell = crownListShell();
  if (!shell) return [];
  return Array.from(shell.querySelectorAll<HTMLAnchorElement>('a.taiwan-crown-card[href]'))
    .map(anchor => ({
      name: anchor.querySelector<HTMLElement>('.taiwan-crown-card-name')?.textContent?.trim() || anchor.getAttribute('aria-label')?.replace(/^開啟|皇冠大使成功故事$/g, '').trim() || '皇冠大使',
      url: anchor.href
    }))
    .filter(item => AMWAY_STORY_RE.test(item.url));
}

function removeStoryView() {
  crownPage()?.querySelector<HTMLElement>(`[${STORY_VIEW_ATTR}]`)?.remove();
}

function closeStoryView({ restoreScroll = true }: { restoreScroll?: boolean } = {}) {
  const shell = crownListShell();
  removeStoryView();
  if (shell) shell.hidden = false;
  currentStoryIndex = -1;
  storyItems = [];
  document.body.removeAttribute('data-taiwan-crown-story-open');
  if (restoreScroll) {
    window.requestAnimationFrame(() => window.scrollTo({ top: listScrollY, behavior: 'auto' }));
  }
}

function makeButton(label: string, className: string, onClick: () => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function showStoryAt(index: number) {
  if (!storyItems.length) return;
  const normalized = Math.max(0, Math.min(storyItems.length - 1, index));
  const item = storyItems[normalized];
  const page = crownPage();
  const shell = crownListShell();
  if (!page || !shell || !item) return;

  currentStoryIndex = normalized;
  shell.hidden = true;
  removeStoryView();
  document.body.setAttribute('data-taiwan-crown-story-open', 'true');

  const view = document.createElement('section');
  view.setAttribute(STORY_VIEW_ATTR, 'true');
  view.className = 'v176-crown-story-view';
  view.setAttribute('aria-label', `${item.name} 皇冠大使成功故事`);

  const toolbar = document.createElement('div');
  toolbar.className = 'v176-crown-story-toolbar';

  const back = makeButton('← 返回皇冠大使', 'v176-crown-story-back', () => closeStoryView());
  back.setAttribute('aria-label', '返回臺灣皇冠大使清單');

  const heading = document.createElement('div');
  heading.className = 'v176-crown-story-heading';
  const title = document.createElement('strong');
  title.textContent = item.name;
  const counter = document.createElement('span');
  counter.textContent = `${normalized + 1} / ${storyItems.length}`;
  heading.append(title, counter);

  const paging = document.createElement('div');
  paging.className = 'v176-crown-story-paging';
  const previous = makeButton('‹', 'v176-crown-story-page-button', () => showStoryAt(currentStoryIndex - 1));
  previous.setAttribute('aria-label', '上一位皇冠大使');
  previous.disabled = normalized <= 0;
  const next = makeButton('›', 'v176-crown-story-page-button', () => showStoryAt(currentStoryIndex + 1));
  next.setAttribute('aria-label', '下一位皇冠大使');
  next.disabled = normalized >= storyItems.length - 1;
  paging.append(previous, next);
  toolbar.append(back, heading, paging);

  const frameWrap = document.createElement('div');
  frameWrap.className = 'v176-crown-story-frame-wrap';
  const loading = document.createElement('div');
  loading.className = 'v176-crown-story-loading';
  loading.textContent = '成功故事載入中…';

  const frame = document.createElement('iframe');
  frame.className = 'v176-crown-story-frame';
  frame.src = item.url;
  frame.title = `${item.name}｜安麗官方成功故事`;
  frame.loading = 'eager';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
  frame.setAttribute('data-v176-crown-story-frame', 'true');
  frame.addEventListener('load', () => loading.remove(), { once: true });
  frameWrap.append(loading, frame);

  view.append(toolbar, frameWrap);
  const modal = page.querySelector('[data-crown-motto-modal]');
  page.insertBefore(view, modal || null);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function openStoryFromAnchor(anchor: HTMLAnchorElement) {
  if (!AMWAY_STORY_RE.test(anchor.href)) return;
  storyItems = readStories();
  const index = storyItems.findIndex(item => item.url === anchor.href);
  if (index < 0) return;
  listScrollY = window.scrollY;
  showStoryAt(index);
}

document.addEventListener('click', event => {
  const target = event.target as Element | null;
  const anchor = target?.closest<HTMLAnchorElement>(`#${CROWN_PAGE_ID} a.taiwan-crown-card[href]`);
  if (!anchor || !AMWAY_STORY_RE.test(anchor.href)) return;
  event.preventDefault();
  event.stopPropagation();
  openStoryFromAnchor(anchor);
}, true);

// v175 intentionally removed the page-level "return to playlist" button. v176
// only adds a local back control while a story is open, so list/story switching
// never remounts the React app or the shared audio element.
const bodyObserver = new MutationObserver(() => {
  if (document.body.dataset.taiwanCrownOpen !== 'true' && document.body.hasAttribute('data-taiwan-crown-story-open')) {
    closeStoryView({ restoreScroll: false });
  }
});
bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['data-taiwan-crown-open'] });
